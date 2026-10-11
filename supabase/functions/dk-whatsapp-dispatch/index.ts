// Quanela — the WhatsApp dispatcher (ADR 0055).
//
// Woken by pg_net right after something is queued (and by pg_cron every minute
// for retries). It only drains the outbox: takes due rows (locked, never twice)
// and delivers them — WhatsApp messages with the account's own credentials, n8n
// events signed with the account's secret — then records the result. The body
// of the request is ignored, so being public (verify_jwt = false) gives nothing
// away: calling it can only make queued messages go out sooner.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { errorHint, graphBase, rawTemplateMessage, sendOutcome, signEvent, templateMessage, textMessage, type TemplatePayload } from "../_whatsapp/meta.ts";

interface Claimed {
  id: string;
  kind: "template" | "text" | "webhook";
  event: string;
  recipient: string;
  payload: TemplatePayload & { text?: string; raw?: string[]; body?: unknown };
  mode: string;
  phoneNumberId: string | null;
  accessToken: string | null;
  url: string | null;
  secret: string | null;
}

const BUDGET_MS = 25_000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const appUrl = (Deno.env.get("QUANELA_APP_URL") ?? "https://quanela.com").replace(/\/+$/, "");
  const started = Date.now();
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await db.rpc("dk_wa_claim", { p_limit: 20 });
    if (error) {
      console.error("dk-whatsapp-dispatch claim", error.message);
      return Response.json({ error: "CLAIM" }, { status: 500 });
    }
    const batch = (data ?? []) as Claimed[];
    if (batch.length === 0) break;

    await Promise.all(batch.map(async (m) => {
      const mark = (ok: boolean, wamid: string | null, error: string | null, code: string | null, retryable: boolean) =>
        db.rpc("dk_wa_mark", { p_id: m.id, p_ok: ok, p_wamid: wamid, p_error: error, p_error_code: code, p_retryable: retryable });
      try {
        // An event for the account's n8n.
        if (m.kind === "webhook") {
          if (!m.url || !m.secret) return void (await mark(false, null, "La integración ya no existe", null, false), failed++);
          const raw = JSON.stringify(m.payload.body ?? {});
          const res = await fetch(m.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "Quanela-Webhooks/1",
              "x-quanela-event": String((m.payload.body as { event?: string })?.event ?? m.event),
              "x-quanela-delivery": m.id,
              "x-quanela-signature": await signEvent(raw, m.secret),
            },
            body: raw,
            signal: AbortSignal.timeout(10_000),
          });
          const ok = res.status >= 200 && res.status < 300;
          await mark(ok, null, ok ? null : `HTTP ${res.status}`, String(res.status), !ok && (res.status === 429 || res.status >= 500));
          if (ok) sent++; else failed++;
          return;
        }
        // A WhatsApp message.
        const base = graphBase(m.mode, (k) => Deno.env.get(k));
        if (!m.phoneNumberId || !m.accessToken) return void (await mark(false, null, "La cuenta ya no tiene WhatsApp conectado", null, false), failed++);
        if (!base) return void (await mark(false, null, "El simulador de Meta no está configurado en la plataforma", null, false), failed++);
        const message = m.kind === "text"
          ? textMessage(m.recipient, m.payload.text ?? "")
          : m.payload.raw
            ? rawTemplateMessage(m.recipient, m.payload.template, m.payload.language, m.payload.raw)
            : templateMessage(m.recipient, m.payload, appUrl);
        const res = await fetch(`${base}/${m.phoneNumberId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: `Bearer ${m.accessToken}` },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(15_000),
        });
        const outcome = sendOutcome(res.status, await res.json().catch(() => null));
        const hint = errorHint(outcome.code);
        await mark(outcome.ok, outcome.wamid, outcome.error && hint ? `${hint} ${outcome.error}` : outcome.error, outcome.code, outcome.retryable);
        if (outcome.ok) sent++; else failed++;
      } catch (err) {
        // Network or timeout: always worth another try.
        await mark(false, null, err instanceof Error ? err.message : String(err), null, true);
        failed++;
      }
    }));
  }
  return Response.json({ sent, failed });
});
