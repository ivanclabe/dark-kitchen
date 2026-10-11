// Quanela — WhatsApp connection tasks for the account owner (ADR 0055).
//
//   { action: "check" }            reads the number in Graph (name, quality) and marks the connection
//   { action: "create_templates" } submits the suggested templates to the account's WABA for review
//   { action: "sync_templates" }   reads the review status of the templates
//
// The user's session proves the permission (dk_wa_admin_context, integrations.manage);
// only then the credentials are read with the service role. Tokens never reach the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { graphBase, templateCreateRequest, type VarKey } from "../_whatsapp/meta.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dk-kitchen-id, x-dk-role-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

interface Credentials {
  kitchenId: string;
  phoneNumberId: string;
  wabaId: string;
  mode: string;
  accessToken: string | null;
}

async function graph(base: string, path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${base}/${path}`, {
    ...init,
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  const error = (body as { error?: { message?: string; code?: number; error_user_msg?: string } }).error;
  return { ok: res.ok, status: res.status, body, error: error ? `${error.code ? `(#${error.code}) ` : ""}${error.error_user_msg ?? error.message ?? ""}` : null, code: error?.code ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "No autenticado." }, 401);
  const kitchenHeader = req.headers.get("x-dk-kitchen-id");
  const roleHeader = req.headers.get("x-dk-role-id");
  const userDb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization, ...(kitchenHeader ? { "x-dk-kitchen-id": kitchenHeader } : {}), ...(roleHeader ? { "x-dk-role-id": roleHeader } : {}) } },
    auth: { persistSession: false },
  });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const { data: context, error: contextError } = await userDb.rpc("dk_wa_admin_context");
  if (contextError) return json({ error: "FORBIDDEN", message: contextError.message }, 403);
  const { data: credentials } = await service.rpc("dk_wa_credentials", { p_kitchen: context.kitchenId });
  const c = credentials as Credentials | null;
  if (!c?.accessToken) return json({ error: "NOT_CONNECTED", message: "Primero conecta tu número." }, 400);
  const base = graphBase(c.mode, (k) => Deno.env.get(k));
  if (!base) return json({ error: "NO_SIMULATOR", message: "El simulador de Meta no está configurado en la plataforma." }, 400);

  const body = (await req.json().catch(() => ({}))) as { action?: string };

  if (body.action === "check") {
    const r = await graph(base, `${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, c.accessToken);
    const info = r.body as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
    await service.rpc("dk_wa_record_check", {
      p_kitchen: c.kitchenId, p_ok: r.ok,
      p_info: { displayPhone: info.display_phone_number ?? null, verifiedName: info.verified_name ?? null, qualityRating: info.quality_rating ?? null },
      p_error: r.ok ? null : r.code === 190 ? `El token no es válido o venció. ${r.error}` : r.error,
    });
    return r.ok
      ? json({ ok: true, displayPhone: info.display_phone_number ?? null, verifiedName: info.verified_name ?? null, qualityRating: info.quality_rating ?? null })
      : json({ ok: false, message: r.error ?? "Meta no respondió" }, 422);
  }

  if (body.action === "sync_templates" || body.action === "create_templates") {
    const created: string[] = [];
    const problems: string[] = [];
    if (body.action === "create_templates") {
      const templates = (context.templates ?? []) as { name: string; language: string; body: string | null; params: VarKey[] }[];
      for (const t of templates.filter((x) => x.body)) {
        const r = await graph(base, `${c.wabaId}/message_templates`, c.accessToken, { method: "POST", body: JSON.stringify(templateCreateRequest({ ...t, body: t.body! })) });
        // Already there (same name and language): fine, the sync below reads its status.
        if (r.ok || /already exists|ya existe/i.test(r.error ?? "")) created.push(t.name);
        else problems.push(`${t.name}: ${r.error}`);
      }
    }
    const list = await graph(base, `${c.wabaId}/message_templates?fields=name,language,status,id,rejected_reason&limit=200`, c.accessToken);
    if (!list.ok) return json({ ok: false, message: list.error ?? "Meta no respondió", created, problems }, 422);
    const data = ((list.body as { data?: unknown[] }).data ?? []) as { name: string; language: string; status: string; id: string; rejected_reason?: string }[];
    await service.rpc("dk_wa_record_templates", {
      p_kitchen: c.kitchenId,
      p_templates: data.map((t) => ({ name: t.name, language: t.language, status: t.status, id: t.id, reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null })),
    });
    return json({ ok: problems.length === 0, created, problems, templates: data.length });
  }

  return json({ error: "BAD_REQUEST", message: "Acción desconocida." }, 400);
});
