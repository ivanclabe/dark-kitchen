// Quanela Global Admin (ADR 0019): create an organization and invite its admin.
//
//   * Authorization is the database's: every action runs as the caller (their
//     JWT) through dk_ga_* functions, which require the Global Admin role AND a
//     second factor (aal2). This function adds nothing to that check.
//   * The service role key never leaves this function; it is used only to send
//     the invitation e-mail through Supabase Auth.
//   * The admin never gets or sets a password: new people receive Supabase's
//     invitation and create their own password when activating; people who
//     already have a login receive a sign-in link. Both land on
//     {APP_URL}/activar/{token}.
//   * If the e-mail cannot be sent (no SMTP yet, rate limit…), Supabase
//     generates a one-time access link WITHOUT sending anything; the portal
//     shows it to share by hand. It signs the person in and lands on
//     /activar/{token}, where they create their password. A bare /activar link
//     would not work: without a session it needs yet another e-mail. Only the
//     Global Admin (role + MFA) gets it, and the failure is recorded.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP_URL = (Deno.env.get("QUANELA_APP_URL") ?? "https://quanela.com").replace(/\/+$/, "");
const ALLOWED_ORIGINS = (Deno.env.get("GLOBAL_ADMIN_ORIGINS") ?? "https://admin.quanela.com,http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

interface CreatePayload {
  name: string;
  sector: string;
  category: string;
  adminName: string;
  adminEmail: string;
  plan: string;
  country?: string;
  city?: string | null;
  phone?: string | null;
  taxId?: string | null;
  confirmSimilar?: boolean;
}

type Body =
  | { action: "create_organization"; payload: CreatePayload }
  | { action: "resend_invitation"; organizationId: string }
  | { action: "password_link"; userId: string };

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Inicia sesión" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  // As the caller: the database decides (role + MFA).
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  if (body.action === "password_link") {
    // "Enlace para crear contraseña": nothing is e-mailed; the portal shares it by hand.
    const { data, error } = await asCaller.rpc("dk_ga_password_link_target", { p_user_id: body.userId });
    if (error) return json({ error: error.message, code: error.code }, error.code === "42501" ? 403 : 400);
    const t = data as { email: string; name: string; mode: "activation" | "reset"; token: string | null };
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const link = t.mode === "activation" ? await accessLink(admin, t.email, t.name, `${APP_URL}/activar/${t.token}`) : await recoveryLink(admin, t.email);
    if (!link) return json({ error: "No se pudo generar el enlace" }, 500);
    return json({ email: t.email, name: t.name, mode: t.mode, link });
  }

  let organizationId: string;
  let email: string;
  let name: string;
  let token: string;
  let hasLogin: boolean;
  let summary: Record<string, unknown> = {};

  if (body.action === "create_organization") {
    const p = body.payload;
    const { data, error } = await asCaller.rpc("dk_ga_create_organization", {
      p_name: p.name,
      p_sector: p.sector,
      p_category: p.category,
      p_admin_name: p.adminName,
      p_admin_email: p.adminEmail,
      p_plan: p.plan,
      p_country: p.country ?? "CO",
      p_city: p.city ?? null,
      p_phone: p.phone ?? null,
      p_tax_id: p.taxId ?? null,
      p_confirm_similar: p.confirmSimilar ?? false,
    });
    if (error) return json({ error: error.message, code: error.code }, error.code === "42501" ? 403 : 400);
    const { token: t, ...rest } = data as Record<string, unknown> & { token: string };
    summary = rest;
    organizationId = rest.organizationId as string;
    email = rest.adminEmail as string;
    name = rest.adminName as string;
    hasLogin = Boolean(rest.adminHasLogin);
    token = t;
  } else if (body.action === "resend_invitation") {
    const { data, error } = await asCaller.rpc("dk_ga_resend_invitation", { p_organization_id: body.organizationId });
    if (error) return json({ error: error.message, code: error.code }, error.code === "42501" ? 403 : 400);
    const r = data as { token: string; email: string; name: string };
    organizationId = body.organizationId;
    email = r.email;
    name = r.name;
    token = r.token;
    const { data: hasAuth } = await asCaller.rpc("dk_ga_organization_detail", { p_organization_id: organizationId });
    hasLogin = Boolean((hasAuth as { admin?: { activated?: boolean } } | null)?.admin?.activated);
  } else {
    return json({ error: "Acción desconocida" }, 400);
  }

  // Send the invitation (service role only here).
  const activationUrl = `${APP_URL}/activar/${token}`;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let sent = false;
  let detail: string | null = null;
  try {
    if (!hasLogin) {
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: activationUrl, data: { full_name: name } });
      if (error && /already been registered|already registered|exists/i.test(error.message)) {
        // They signed up in the meantime: a sign-in link instead.
        const { error: otpError } = await createClient(url, anonKey).auth.signInWithOtp({ email, options: { emailRedirectTo: activationUrl, shouldCreateUser: false } });
        if (otpError) throw otpError;
      } else if (error) {
        throw error;
      }
    } else {
      const { error } = await createClient(url, anonKey).auth.signInWithOtp({ email, options: { emailRedirectTo: activationUrl, shouldCreateUser: false } });
      if (error) throw error;
    }
    sent = true;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  let manualLink: string | null = null;
  if (!sent) {
    manualLink = await accessLink(admin, email, name, activationUrl);
  }

  await asCaller.rpc("dk_ga_log_invitation", { p_organization_id: organizationId, p_email: email, p_sent: sent, p_detail: detail });

  return json({
    ...summary,
    organizationId,
    adminEmail: email,
    invitation: { sent, detail, method: hasLogin ? "sign_in_link" : "invite", activationUrl: sent ? null : (manualLink ?? activationUrl) },
  });
});

/**
 * One-time access link that lands on the activation page; nothing is e-mailed.
 * It points straight at Quanela (/activar/{token}?token_hash=…) and the page
 * opens the session itself, so it does not depend on Supabase's redirect list.
 */
// deno-lint-ignore no-explicit-any
async function accessLink(admin: any, email: string, name: string, activationUrl: string): Promise<string | null> {
  const withHash = (hash: string | undefined, type: string) => (hash ? `${activationUrl}?token_hash=${encodeURIComponent(hash)}&type=${type}` : null);
  const invite = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: activationUrl, data: { full_name: name } } });
  if (!invite.error) return withHash(invite.data?.properties?.hashed_token, "invite");
  // They already have a login (invited before, or signed up): a sign-in link instead.
  const magic = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: activationUrl } });
  return magic.error ? null : withHash(magic.data?.properties?.hashed_token, "magiclink");
}

/** Set-a-new-password link for someone who already has a login; nothing is e-mailed. */
// deno-lint-ignore no-explicit-any
async function recoveryLink(admin: any, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const hash = data?.properties?.hashed_token;
  return error || !hash ? null : `${APP_URL}/set-password?token_hash=${encodeURIComponent(hash)}&type=recovery`;
}
