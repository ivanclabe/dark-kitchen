// Quanela — the WhatsApp webhook (ADR 0055). One URL for every account.
//
//   GET  Meta's subscription check: hub.verify_token must be one of the accounts' tokens.
//   POST Meta's notifications: the signature (X-Hub-Signature-256) is checked with the
//        app secret of the account that owns the phone_number_id; then
//        - delivery receipts update the outbox;
//        - inbound messages go to their conversation (dk_wa_receive); when the account
//          uses Quanela's assistant, it answers after the 200 (EdgeRuntime.waitUntil).
//   Always 200 quickly; idempotent by wamid.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { PlaceError, runTurn, type Context } from "../_whatsapp/agent.ts";
import { interpretWithAnthropic } from "../_whatsapp/llm.ts";
import { parseWebhook, verifySignature } from "../_whatsapp/meta.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Bursts («hola», «quiero 2 sopas», «para recoger»): wait a moment and answer them together. */
const DEBOUNCE_MS = Number(Deno.env.get("DK_WA_DEBOUNCE_MS") ?? 1500);

async function assistantTurn(db: SupabaseClient, kitchenId: string, conversationId: string, messageId: string, wamid: string) {
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
  const { data: ctx } = await db.rpc("dk_wa_ai_context", { p_conversation: conversationId });
  const context = ctx as (Context & { history: { direction: string; body: string | null }[] }) | null;
  if (!context || context.conversation.status !== "bot") return;

  // Only the latest unanswered message runs; it reads all the customer's messages since our last answer.
  const { data: latest } = await db.from("dk_wa_messages").select("id").eq("conversation_id", conversationId).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest && latest.id !== messageId) return;
  const lastOut = context.history.map((h) => h.direction).lastIndexOf("out");
  const text = context.history.slice(lastOut + 1).filter((h) => h.direction === "in").map((h) => h.body ?? "").join("\n").trim();
  if (!text) return;

  const handoff = async (reply: string, reason: string) => {
    await db.rpc("dk_wa_reply_internal", { p_conversation: conversationId, p_text: reply, p_author: "assistant" });
    await db.rpc("dk_wa_save_state", { p_conversation: conversationId, p_state: null, p_status: "human", p_attention: reason });
  };

  const apiKey = Deno.env.get("DK_ANTHROPIC_API_KEY");
  if (!apiKey) return void (await handoff("Hola, en un momento te atiende una persona del equipo. 🙌", "La IA no está configurada en la plataforma"));
  const { data: quota } = await db.rpc("dk_ai_run_reserve_system", { p_kitchen: kitchenId, p_conversation: conversationId, p_input: { messageId } });
  if (!quota?.allowed) {
    return void (await handoff("Hola, en un momento te atiende una persona del equipo. 🙌",
      quota?.reason === "daily" ? "Se acabó el cupo diario del asistente" : quota?.reason === "conversation" ? "Conversación muy activa: la atiende una persona" : "El asistente no está activo"));
  }

  const started = Date.now();
  let tokens = { input: null as number | null, output: null as number | null };
  try {
    const result = await runTurn(context, text, {
      appUrl: (Deno.env.get("QUANELA_APP_URL") ?? "https://quanela.com").replace(/\/+$/, ""),
      interpret: async (input) => {
        const r = await interpretWithAnthropic({ apiKey, model: quota.model, baseUrl: Deno.env.get("DK_ANTHROPIC_BASE_URL") }, input);
        tokens = { input: r.inputTokens, output: r.outputTokens };
        return r.raw;
      },
      placeOrder: async (order) => {
        const { data, error } = await db.rpc("dk_wa_place_order", { p_conversation: conversationId, p_order: order, p_idempotency: wamid });
        if (error) throw new PlaceError(error.message, error.hint ?? null, error.details ?? null);
        return data;
      },
    });
    await db.rpc("dk_wa_reply_internal", { p_conversation: conversationId, p_text: result.reply, p_author: "assistant" });
    await db.rpc("dk_wa_save_state", {
      p_conversation: conversationId, p_state: result.state, p_status: result.handoff ? "human" : null, p_attention: result.handoff,
    });
    await db.rpc("dk_ai_run_finish_system", {
      p_run_id: quota.runId, p_status: "ok", p_latency_ms: Date.now() - started, p_input_tokens: tokens.input, p_output_tokens: tokens.output,
      p_output: { intents: result.intents.map((i) => i.type), placed: result.placed?.orderNumber ?? null, handoff: result.handoff },
    });
  } catch (err) {
    console.error("dk-whatsapp-webhook assistant", err);
    await db.rpc("dk_ai_run_finish_system", { p_run_id: quota.runId, p_status: "error", p_latency_ms: Date.now() - started, p_error: err instanceof Error ? err.message : String(err) });
    await handoff("Tuvimos un problema para responderte. En un momento te atiende una persona. 🙏", "El asistente falló; revisa el mensaje");
  }
}

Deno.serve(async (req: Request) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode !== "subscribe" || !token) return new Response("Forbidden", { status: 403 });
    const { data: ok } = await db.rpc("dk_wa_webhook_verify", { p_token: token });
    return ok ? new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } }) : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const parsed = parseWebhook(body);
  const signature = req.headers.get("x-hub-signature-256");

  // Every business number in the notification must be ours and the signature must match its app secret.
  const verified = new Set<string>();
  for (const id of parsed.phoneNumberIds) {
    const { data: account } = await db.rpc("dk_wa_webhook_account", { p_phone_number_id: id });
    if (account?.appSecret && (await verifySignature(raw, signature, account.appSecret))) verified.add(id);
    else console.warn("dk-whatsapp-webhook: unverified notification for", id);
  }
  if (parsed.phoneNumberIds.length > 0 && verified.size === 0) return new Response("Forbidden", { status: 403 });

  for (const s of parsed.statuses) {
    if (!verified.has(s.phoneNumberId)) continue;
    await db.rpc("dk_wa_apply_status", {
      p_phone_number_id: s.phoneNumberId, p_wamid: s.wamid, p_status: s.status, p_at: s.at, p_error_code: s.errorCode, p_error: s.error,
    });
  }

  const turns: Promise<unknown>[] = [];
  for (const m of parsed.messages) {
    if (!verified.has(m.phoneNumberId)) continue;
    const { data: r, error } = await db.rpc("dk_wa_receive", {
      p_phone_number_id: m.phoneNumberId, p_wamid: m.wamid, p_from: m.from, p_name: m.name, p_at: m.at, p_type: m.type, p_text: m.text,
    });
    if (error) {
      console.error("dk-whatsapp-webhook receive", error.message);
      continue;
    }
    if (r?.mode === "ai" && r.conversationStatus !== "human" && !r.handled && r.aiEnabled && m.type === "text") {
      turns.push(assistantTurn(db, r.kitchenId, r.conversationId, r.messageId, m.wamid).catch((err) => console.error("assistant", err)));
    }
  }
  if (turns.length) {
    const all = Promise.all(turns);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(all);
    else await all;
  }
  return new Response("ok", { status: 200 });
});
