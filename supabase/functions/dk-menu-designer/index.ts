// Quanela — the AI menu designer (ADR 0054).
//
// Contract:
//   - In: { action: "generate", prompt } → 2 proposals, or
//         { action: "refine", designId, prompt } → 1 new version of that design.
//   - The model only proposes a design through DESIGN_TOOL; this function cleans
//     it (contract.ts) and saves it in «Mis diseños» (dk_menu_design_save, with
//     the user's session: RLS, permission and validation apply). It never
//     touches the draft nor the published design, nor any order.
//   - Every call counts in the AI quota and is logged (dk_ai_run_reserve/finish).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { asDesign, buildUserMessage, DESIGN_TOOL, designForModel, MAX_PROMPT, normalizeProposals, SYSTEM_PROMPT, type Design } from "./contract.ts";

const FEATURE = "menu_designer";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dk-kitchen-id, x-dk-role-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

interface Body {
  action?: "generate" | "refine";
  prompt?: string;
  designId?: string;
}

async function askModel(apiKey: string, model: string, userMessage: string) {
  const request = () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        tools: [DESIGN_TOOL],
        // Newer models (Sonnet 5.5) refuse a forced tool_choice: the prompt says to always use the tool,
        // and an answer without it is a failure, never guessed from text.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  let res = await request();
  if (res.status === 429 || res.status === 529) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await request();
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === DESIGN_TOOL.name);
  if (!block) throw new Error("El modelo no devolvió propuestas");
  return {
    raw: block.input as unknown,
    inputTokens: typeof data.usage?.input_tokens === "number" ? data.usage.input_tokens : null,
    outputTokens: typeof data.usage?.output_tokens === "number" ? data.usage.output_tokens : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "No autenticado." }, 401);
  const apiKey = Deno.env.get("DK_ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "AI_NOT_CONFIGURED", message: "La IA no está configurada en esta plataforma." }, 503);

  const kitchenHeader = req.headers.get("x-dk-kitchen-id");
  const roleHeader = req.headers.get("x-dk-role-id");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: {
        Authorization: authorization,
        ...(kitchenHeader ? { "x-dk-kitchen-id": kitchenHeader } : {}),
        ...(roleHeader ? { "x-dk-role-id": roleHeader } : {}),
      },
    },
    auth: { persistSession: false },
  });

  const body = (await req.json().catch(() => ({}))) as Body;
  const action = body.action === "refine" ? "refine" : "generate";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) return json({ error: "BAD_REQUEST", message: "Cuéntale a la IA cómo quieres tu menú." }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: "BAD_REQUEST", message: `Escribe máximo ${MAX_PROMPT} caracteres.` }, 400);

  // 1. What the AI may know (presentation only) — also checks the permission and the account.
  const { data: context, error: contextError } = await db.rpc("dk_menu_design_ai_context");
  if (contextError) return json({ error: "FORBIDDEN", message: contextError.message }, 403);

  // 2. The design to start from: the chosen one (refine) or the current draft (keeps the brand photos).
  let base: Design | null = asDesign(context?.current);
  let parentId: string | null = null;
  if (action === "refine") {
    if (!body.designId) return json({ error: "BAD_REQUEST", message: "Elige el diseño que quieres cambiar." }, 400);
    const { data: row, error } = await db.from("dk_menu_designs").select("id, design").eq("id", body.designId).maybeSingle();
    if (error) return json({ error: "FORBIDDEN", message: error.message }, 403);
    if (!row) return json({ error: "NOT_FOUND", message: "Ese diseño ya no existe." }, 404);
    base = asDesign(row.design);
    parentId = row.id as string;
  }

  // 3. The AI quota (and the model of this feature in the platform catalog).
  const { data: quota, error: quotaError } = await db.rpc("dk_ai_run_reserve", { p_feature_key: FEATURE, p_input: { action, prompt, designId: parentId } });
  if (quotaError) return json({ error: "QUOTA", message: quotaError.message }, 403);
  if (!quota?.allowed || !quota.runId) {
    const message = quota?.reason === "daily"
      ? "Llegaste al límite de IA de hoy. Puedes seguir con el editor visual."
      : quota?.reason === "interval"
        ? `Espera ${quota.retryAfterSeconds ?? 5} segundos para pedir otro diseño.`
        : "El diseñador con IA no está disponible en tu plan o para tu rol.";
    return json({ error: "NOT_ALLOWED", reason: quota?.reason ?? "feature", retryAfterSeconds: quota?.retryAfterSeconds ?? null, message }, 429);
  }
  const runId = quota.runId as string;
  const started = Date.now();

  try {
    // 4. The model proposes; the contract cleans; the database validates and saves.
    const answer = await askModel(apiKey, quota.model as string, buildUserMessage(action === "refine" ? "refine" : "new", prompt, context ?? {}, designForModel(base)));
    const proposals = normalizeProposals(answer.raw, base, action === "refine" ? 1 : 2);
    if (proposals.length === 0) throw new Error("Sin propuestas");

    const saved: unknown[] = [];
    for (const p of proposals) {
      const { data, error } = await db.rpc("dk_menu_design_save", {
        p_name: p.name,
        p_design: p.design,
        p_source: "ai",
        p_prompt: prompt,
        p_summary: p.summary || null,
        p_parent_id: parentId,
        p_ai_run_id: runId,
      });
      if (error) throw new Error(`Guardar: ${error.message}`);
      saved.push({ ...(data as Record<string, unknown>), contrastFixed: p.contrastFixed });
    }
    await db.rpc("dk_ai_run_finish", {
      p_run_id: runId, p_status: "ok", p_latency_ms: Date.now() - started, p_input_tokens: answer.inputTokens, p_output_tokens: answer.outputTokens,
      p_output: { action, designs: saved.length },
    });
    return json({ designs: saved, remainingToday: typeof quota.remainingToday === "number" ? quota.remainingToday - 1 : null });
  } catch (err) {
    console.error("dk-menu-designer", err);
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    const detail = err instanceof Error ? err.message : String(err);
    await db.rpc("dk_ai_run_finish", { p_run_id: runId, p_status: "error", p_error: detail, p_latency_ms: Date.now() - started });
    return json({ error: "DESIGN_FAILED", message: timeout ? "La IA tardó demasiado. Intenta de nuevo." : "La IA no pudo diseñar esta vez. Intenta de nuevo o usa el editor visual." }, 502);
  }
});
