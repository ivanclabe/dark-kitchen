// ADR 0042: Quanela Consumer's assistant. One conversational turn per call:
//   { message, state, location? } → { reply, results, state }.
// The caller's own JWT is forwarded (usually an anonymous Supabase session), so
// the database decides what it may read: only dk_public_search_dishes and the
// caller's own profile. No service role. The model is optional and only reads
// intent (llmIntent.ts); without DK_ANTHROPIC_API_KEY the rules answer alone.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildIntentRequest, readIntentResponse } from "../_consumer/llmIntent.ts";
import { runTurn, type SearchParams } from "../_consumer/pipeline.ts";
import type { ConsumerLocation, ConsumerProfile, ConversationState, PublicDish } from "../_consumer/types.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const MAX_MESSAGE = 500;
const MODEL_TIMEOUT_MS = 6_000;

function readLocation(value: unknown): ConsumerLocation | null {
  const v = value as { lat?: unknown; lng?: unknown } | null;
  if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") return null;
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180) return null;
  // ~100 m is enough to rank by distance; nothing more precise is used or kept.
  return { lat: Math.round(v.lat * 1000) / 1000, lng: Math.round(v.lng * 1000) / 1000 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Falta la sesión" }, 401);

  let body: { action?: unknown; message?: unknown; state?: unknown; location?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }
  if (body.action === "warm") return new Response(null, { status: 204, headers: cors });

  const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
  if (!message) return json({ error: "Escribe qué quieres comer" }, 400);

  const started = Date.now();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const search = async (params: SearchParams | { ids: string[] }): Promise<PublicDish[]> => {
    const { data, error } = await db.rpc("dk_public_search_dishes", { p_params: params });
    if (error) throw new Error(error.message);
    return ((data as { items?: PublicDish[] } | null)?.items ?? []) as PublicDish[];
  };

  // The profile exists only for a signed-in consumer who consented; any error means "no profile".
  const profilePromise: Promise<ConsumerProfile | null> = db.rpc("dk_consumer_profile_get").then(
    ({ data, error }) => {
      if (error || !data) return null;
      const p = data as { profile_consent?: boolean; preferences?: ConsumerProfile["preferences"] };
      return { profileConsent: p.profile_consent === true, preferences: p.preferences ?? [] };
    },
    () => null,
  );

  const apiKey = Deno.env.get("DK_ANTHROPIC_API_KEY");
  let modelMs = 0;
  // ADR 0063: the platform switches the assistant on or off and chooses its model (Global Admin → IA);
  // every call is reserved first and recorded with its tokens.
  const llmIntent = apiKey
    ? async (text: string, state: ConversationState) => {
      const { data: reserved } = await db.rpc("dk_consumer_ai_reserve");
      const r = (reserved ?? {}) as { allowed?: boolean; model?: string; runId?: number };
      if (!r.allowed || !r.model || !r.runId) return null;
      const t0 = Date.now();
      let ok = false;
      let usage: { input_tokens?: number; output_tokens?: number } = {};
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify(buildIntentRequest(text, state, r.model)),
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = await res.json();
        usage = data?.usage ?? {};
        ok = true;
        return readIntentResponse(data);
      } catch {
        return null;
      } finally {
        modelMs = Date.now() - t0;
        await db.rpc("dk_consumer_ai_finish", {
          p_run_id: r.runId, p_ok: ok, p_input_tokens: usage.input_tokens ?? null, p_output_tokens: usage.output_tokens ?? null, p_latency_ms: modelMs,
        });
      }
    }
    : undefined;

  try {
    const result = await runTurn(message, body.state, {
      search,
      llmIntent,
      profile: await profilePromise,
      location: readLocation(body.location),
    });
    return json({ ...result, timings: { totalMs: Date.now() - started, modelMs } });
  } catch (e) {
    console.error("dk-consumer-assistant", e instanceof Error ? e.message : e);
    return json({ error: "No pude buscar en este momento. Intenta de nuevo." }, 502);
  }
});
