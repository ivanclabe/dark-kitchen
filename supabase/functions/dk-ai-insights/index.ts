// Dark Kitchen — capa de IA para Abastecimiento, Inventario y Cocina.
//
// Contrato (ver migración dk_ai_layer):
//   - Entra: la función de IA a analizar. Nada más: los datos NO los manda el
//     navegador. Se leen aquí con la sesión del usuario (RLS y rol aplican)
//     desde las señales determinísticas dk_inventory_signals / dk_kitchen_signals.
//   - Sale: prioridad, título, explicación y una acción SUGERIDA de una lista
//     cerrada, por cada insumo/pedido. Nunca cantidades ni importes: las
//     cifras que ve el usuario salen de las señales, no del modelo.
//   - Toda referencia devuelta se valida contra los datos enviados; lo que no
//     valide se descarta. La IA no ejecuta nada.
//   - Cada análisis queda en dk_ai_insights (input + output) para auditoría.
//   - Respeta la frecuencia configurada: si hay un análisis reciente, lo
//     devuelve sin llamar al modelo (salvo force).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MODEL_SUPPLY = "claude-sonnet-5";
const MODEL_KITCHEN = "claude-haiku-4-5-20251001"; // cocina en vivo: rápido y barato
const MAX_ITEMS = 12;

type FeatureKey = "supply_reorder" | "supply_perishables" | "supply_slow_movers" | "kitchen_insights";
type Priority = "alta" | "media" | "baja";

interface Candidate {
  id: string;
  [key: string]: unknown;
}

interface InsightItem {
  ref_id: string | null;
  priority: Priority;
  title: string;
  explanation: string;
  action: string;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

/** Acciones sugeribles por función: el modelo solo puede elegir de aquí. */
const ACTIONS: Record<FeatureKey, readonly string[]> = {
  supply_reorder: ["crear_borrador_compra", "revisar_minimos", "revisar_proveedor"],
  supply_perishables: ["usar_primero", "no_recomprar", "ajustar_minimo", "registrar_merma"],
  supply_slow_movers: ["no_recomprar", "ajustar_minimo", "usar_en_menu", "revisar_receta"],
  kitchen_insights: ["priorizar_pedido", "revisar_plato", "despachar", "agrupar_preparacion", "reforzar_estacion", "informativo"],
};

const FEATURE_CONTEXT: Record<FeatureKey, string> = {
  supply_reorder:
    "Insumos que necesitan reposición (bajo mínimo o con pocos días de cobertura al ritmo de consumo actual). " +
    "Prioriza qué comprar primero y explica por qué. Compara consumo_diario_7d con consumo_diario_30d para detectar si el ritmo subió o bajó. " +
    "Si un insumo no tiene mínimo/máximo o proveedor, sugiere revisarlo.",
  supply_perishables:
    "Insumos perecederos cuyo lote más antiguo (estimado por FIFO sobre las compras, no hay fechas de vencimiento reales) vence pronto " +
    "o no se alcanza a consumir antes de vencer al ritmo actual. Recomienda cómo evitar la merma. Aclara que la fecha es estimada.",
  supply_slow_movers:
    "Insumos con poco movimiento (llevan días sin consumirse) o con stock excesivo para su ritmo de consumo: dinero inmovilizado. " +
    "Recomienda qué hacer con cada uno.",
  kitchen_insights:
    "Foto en vivo de la cocina: pedidos en cola (CONFIRMADO), en preparación (EN_PREPARACION) y listos esperando despacho (LISTO), " +
    "con minutos transcurridos, umbrales SLA, platos detenidos y domiciliarios activos. Da sugerencias operativas breves y accionables " +
    "para el equipo AHORA: qué priorizar, qué platos agrupar si se repiten, qué despachar, dónde hay un cuello de botella. " +
    "ref_id es el order_id del pedido al que se refiere, o null si la sugerencia es general.",
};

function systemPrompt(feature: FeatureKey): string {
  return [
    "Eres el asistente operativo de una dark kitchen (cocina de domicilios) en Colombia.",
    "Analizas datos REALES ya calculados por el sistema y das recomendaciones a una persona, que decide y ejecuta.",
    "",
    `Contexto: ${FEATURE_CONTEXT[feature]}`,
    "",
    "Reglas:",
    "1. Usa SOLO los datos recibidos. No inventes insumos, pedidos, proveedores, cifras ni fechas.",
    "2. Solo cita cifras que aparezcan tal cual en los datos. No calcules cantidades a comprar ni importes nuevos.",
    "3. Cada ítem debe referirse a un id recibido (ref_id). Nunca inventes ids.",
    "4. No digas que ejecutaste nada: tú recomiendas; la persona actúa.",
    "5. Si los datos no alcanzan para concluir algo, dilo en vez de suponer.",
    `6. Máximo ${MAX_ITEMS} ítems, los más importantes primero. Español neutro, frases cortas, tuteo.`,
    "7. summary: 1 o 2 frases con lo más importante.",
  ].join("\n");
}

function tool(feature: FeatureKey) {
  return {
    name: "registrar_recomendaciones",
    description: "Registra las recomendaciones priorizadas sobre los datos recibidos.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1 o 2 frases con lo más importante." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ref_id: {
                type: feature === "kitchen_insights" ? ["string", "null"] : "string",
                description: "id del insumo/pedido tal cual se recibió.",
              },
              priority: { type: "string", enum: ["alta", "media", "baja"] },
              title: { type: "string", description: "Máximo 10 palabras." },
              explanation: { type: "string", description: "Máximo 40 palabras: por qué, citando solo datos recibidos." },
              action: { type: "string", enum: ACTIONS[feature] },
            },
            required: ["ref_id", "priority", "title", "explanation", "action"],
          },
        },
      },
      required: ["summary", "items"],
    },
  };
}

const round = (n: unknown, d = 1) => (n === null || n === undefined ? null : Math.round(Number(n) * 10 ** d) / 10 ** d);

// ---------------------------------------------------------------------------
// Señales → candidatos (solo lo que la función necesita, compacto)
// ---------------------------------------------------------------------------

async function supplyCandidates(db: SupabaseClient, feature: FeatureKey, settings: Record<string, Record<string, number>>) {
  const { data, error } = await db.rpc("dk_inventory_signals", {
    p_coverage_days: settings.supply_reorder?.coverage_days ?? 7,
    p_warning_days: settings.supply_perishables?.warning_days ?? 2,
    p_slow_days: settings.supply_slow_movers?.slow_days ?? 21,
    p_overstock_days: settings.supply_slow_movers?.overstock_days ?? 60,
  });
  if (error) throw Object.assign(new Error(error.message), { status: 403 });
  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];

  if (feature === "supply_reorder") {
    return rows.filter((r) => r.needs_reorder).map((r): Candidate => ({
      id: r.ingredient_id,
      nombre: r.name,
      unidad: r.base_unit_code,
      stock_disponible: round(r.stock_available, 2),
      minimo: r.min_stock,
      maximo: r.max_stock,
      bajo_minimo: r.below_min,
      consumo_diario_30d: round(r.daily_burn, 2),
      consumo_diario_7d: round(r.daily_burn_7d, 2),
      cobertura_dias: round(r.coverage_days),
      cantidad_sugerida_por_sistema: round(r.suggested_quantity, 2),
      proveedor: r.supplier_name ?? null,
    }));
  }
  if (feature === "supply_perishables") {
    return rows.filter((r) => r.perishable_risk).map((r): Candidate => ({
      id: r.ingredient_id,
      nombre: r.name,
      unidad: r.base_unit_code,
      stock: round(r.stock_on_hand, 2),
      vida_util_dias: r.shelf_life_days,
      dias_restantes_estimados: round(r.est_days_to_expiry),
      cantidad_lote_mas_antiguo: round(r.oldest_stock_qty, 2),
      merma_proyectada: round(r.projected_waste_qty, 2),
      consumo_diario_30d: round(r.daily_burn, 2),
    }));
  }
  return rows.filter((r) => r.slow_mover || r.overstock).map((r): Candidate => ({
    id: r.ingredient_id,
    nombre: r.name,
    unidad: r.base_unit_code,
    stock: round(r.stock_on_hand, 2),
    valor_stock: round(r.stock_value, 0),
    dias_sin_consumo: r.days_since_consumption,
    sin_consumo_registrado: r.last_consumed_at === null,
    cobertura_dias: round(r.coverage_days),
    poco_movimiento: r.slow_mover,
    stock_excesivo: r.overstock,
  }));
}

async function kitchenCandidates(db: SupabaseClient, settings: Record<string, Record<string, number>>) {
  const { data, error } = await db.rpc("dk_kitchen_signals", {
    p_dish_stall_min: settings.kitchen_stall_alerts?.dish_stall_min ?? 12,
  });
  if (error) throw Object.assign(new Error(error.message), { status: 403 });
  // deno-lint-ignore no-explicit-any
  const snapshot = data as any;
  // deno-lint-ignore no-explicit-any
  const orders: Candidate[] = (snapshot?.orders ?? []).slice(0, 40).map((o: any) => ({
    id: o.order_id,
    pedido: o.order_number,
    estado: o.status,
    prioritario: o.priority > 0,
    minutos_desde_creado: o.minutes_since_created,
    minutos_en_estado: o.minutes_in_status,
    umbral_sla_min: o.alert_min,
    atrasado: o.late,
    detenido: o.stalled,
    // deno-lint-ignore no-explicit-any
    platos: (o.items ?? []).map((i: any) => ({
      plato: i.product,
      cantidad: i.quantity,
      estado: i.kitchen_status,
      minutos_en_estado: i.minutes_in_status,
      detenido: i.stalled,
      con_observacion: i.has_observation,
    })),
  }));
  return { orders, context: { domiciliarios_activos: snapshot?.riders_active ?? 0, sla: snapshot?.sla ?? null } };
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

async function askModel(apiKey: string, model: string, feature: FeatureKey, payload: unknown) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      system: systemPrompt(feature),
      tools: [tool(feature)],
      tool_choice: { type: "tool", name: "registrar_recomendaciones" },
      messages: [{ role: "user", content: `Datos (JSON):\n${JSON.stringify(payload)}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === "registrar_recomendaciones");
  return (block?.input ?? { summary: "", items: [] }) as { summary?: unknown; items?: unknown[] };
}

/** Verificación determinística de la salida: ids reales, acción y prioridad válidas, textos acotados. */
function validate(feature: FeatureKey, raw: { summary?: unknown; items?: unknown[] }, validIds: Set<string>) {
  const seen = new Set<string>();
  const items: InsightItem[] = [];
  for (const entry of raw.items ?? []) {
    // deno-lint-ignore no-explicit-any
    const it = entry as any;
    const refId = it?.ref_id ?? null;
    if (refId === null ? feature !== "kitchen_insights" : !validIds.has(String(refId))) continue;
    if (!ACTIONS[feature].includes(it.action)) continue;
    if (!["alta", "media", "baja"].includes(it.priority)) continue;
    const key = `${refId}:${it.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      ref_id: refId === null ? null : String(refId),
      priority: it.priority,
      title: String(it.title ?? "").slice(0, 120),
      explanation: String(it.explanation ?? "").slice(0, 400),
      action: it.action,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { summary: String(raw.summary ?? "").slice(0, 400), items };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const apiKey = Deno.env.get("DK_ANTHROPIC_API_KEY");
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "No autenticado." }, 401);

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; feature?: FeatureKey; force?: boolean };

    // Estado de la conexión para la pantalla de Configuración. No expone la clave.
    if (body.action === "status") return json({ configured: Boolean(apiKey) });

    const feature = body.feature;
    if (!feature || !(feature in ACTIONS)) return json({ error: "Función de IA inválida." }, 400);

    // Cliente con la sesión del usuario: RLS y rol de Postgres aplican a todo lo que se lee y escribe.
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: featureRows, error: featuresError } = await db.from("dk_ai_features").select("feature_key, enabled, settings");
    if (featuresError) return json({ error: featuresError.message }, 403);
    const settings = Object.fromEntries((featureRows ?? []).map((f) => [f.feature_key, (f.settings ?? {}) as Record<string, number>]));
    const current = (featureRows ?? []).find((f) => f.feature_key === feature);
    if (!current?.enabled) return json({ error: "FEATURE_DISABLED", message: "Esta función de IA está desactivada." }, 409);

    // Frecuencia: reutiliza el último análisis si todavía es vigente.
    const frequencyMin = Number(settings[feature]?.frequency_min ?? 0);
    if (!body.force && frequencyMin > 0) {
      const { data: last } = await db
        .from("dk_ai_insights")
        .select("*")
        .eq("feature_key", feature)
        .in("status", ["ok", "empty"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && Date.now() - new Date(last.created_at).getTime() < frequencyMin * 60_000) {
        return json({ insight: last, cached: true });
      }
    }

    let candidates: Candidate[];
    let payload: unknown;
    if (feature === "kitchen_insights") {
      const kitchen = await kitchenCandidates(db, settings);
      candidates = kitchen.orders;
      payload = { contexto: kitchen.context, pedidos: kitchen.orders };
    } else {
      candidates = await supplyCandidates(db, feature, settings);
      payload = { insumos: candidates };
    }

    // Sin señales no hay nada que analizar: no se llama al modelo (ni se inventa nada).
    if (candidates.length === 0) {
      const { data: saved, error } = await db
        .from("dk_ai_insights")
        .insert({ feature_key: feature, status: "empty", input: payload as Record<string, unknown>, output: { summary: "", items: [] } })
        .select()
        .single();
      if (error) return json({ error: error.message }, 403);
      return json({ insight: saved, cached: false });
    }

    if (!apiKey) {
      return json({ error: "AI_NOT_CONFIGURED", message: "Falta el secreto DK_ANTHROPIC_API_KEY en Supabase > Edge Functions > Secrets." }, 503);
    }

    const model = feature === "kitchen_insights" ? MODEL_KITCHEN : MODEL_SUPPLY;
    try {
      const raw = await askModel(apiKey, model, feature, payload);
      const output = validate(feature, raw, new Set(candidates.map((c) => c.id)));
      const { data: saved, error } = await db
        .from("dk_ai_insights")
        .insert({ feature_key: feature, status: "ok", input: payload as Record<string, unknown>, output, model })
        .select()
        .single();
      if (error) return json({ error: error.message }, 403);
      return json({ insight: saved, cached: false });
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e).slice(0, 500);
      await db.from("dk_ai_insights").insert({ feature_key: feature, status: "error", input: payload as Record<string, unknown>, model, error: message });
      return json({ error: "AI_ERROR", message }, 502);
    }
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const status = (e as any)?.status ?? 500;
    return json({ error: String(e instanceof Error ? e.message : e) }, status);
  }
});
