// ADR 0033: the answer contract of Quanela Copilot and the pure helpers around
// it (no Deno or network here, so the app's tests can check them too).

export const INTENTS = [
  "sales", "orders", "order_detail", "kitchen", "products", "ingredients", "purchases",
  "customers", "payments", "deliveries", "staff", "app_help", "smalltalk", "other",
] as const;
export const SCOPES = ["answered", "partial", "no_data", "not_allowed", "unsupported", "out_of_scope", "action", "clarify"] as const;

type Json = Record<string, unknown>;

/** Every id a tool returned, so the answer can only link to real things. */
export function collectIds(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) value.forEach((v) => collectIds(v, into));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Json)) {
      if ((k === "id" || k.endsWith("Id")) && typeof v === "string") into.add(v);
      else collectIds(v, into);
    }
  }
}

export function sanitizeLinks(answer: string, ids: Set<string>): string {
  return answer.replace(/\[([^\]]+)\]\(quanela:\/\/(order|product|ingredient|customer)\/([0-9a-f-]{36})\)/gi, (m, label, _kind, id) => (ids.has(id) ? m : label));
}

/** The spoken version: plain, short (two sentences at most). */
export function cleanSpoken(text: string): string {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/#(\d+)/g, "número $1")
    .replace(/[*_`#|>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Sentences end at . ! ? followed by a space (not the dot of «1.250»).
  const sentences = plain.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return sentences.slice(0, 2).join(" ").slice(0, 320);
}

/** A help center article Copilot points to (ADR 0034). */
export interface HelpLink {
  id: string;
  title: string;
  url: string;
}

export interface Answer {
  intent: (typeof INTENTS)[number];
  scope: (typeof SCOPES)[number];
  answer: string;
  spoken: string;
  followUp: string[];
  /** Help center articles (only real ones: checked against the knowledge base). */
  links: HelpLink[];
}

/**
 * The closing contract. `article` resolves a help article id to its link,
 * or null if it does not exist (an invented id is dropped, ADR 0034).
 */
export function readAnswer(input: Json | undefined, article: (id: string) => HelpLink | null = () => null): Answer | null {
  if (!input || typeof input.answer !== "string" || !input.answer.trim()) return null;
  const intent = INTENTS.includes(input.intent as Answer["intent"]) ? (input.intent as Answer["intent"]) : "other";
  const scope = SCOPES.includes(input.scope as Answer["scope"]) ? (input.scope as Answer["scope"]) : "answered";
  const followUp = Array.isArray(input.follow_up) ? input.follow_up.filter((q): q is string => typeof q === "string").slice(0, 2).map((q) => q.slice(0, 120)) : [];
  const links = (Array.isArray(input.links) ? input.links : [])
    .filter((id): id is string => typeof id === "string")
    .map(article)
    .filter((l): l is HelpLink => l !== null)
    .filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i)
    .slice(0, 2);
  return {
    intent,
    scope,
    answer: input.answer.trim(),
    spoken: cleanSpoken(typeof input.spoken === "string" && input.spoken.trim() ? input.spoken : input.answer),
    followUp,
    links,
  };
}

export const PARTIAL: Answer = {
  intent: "other",
  scope: "partial",
  answer: "No alcancé a completar la consulta a tiempo. Intenta con una pregunta más concreta (por ejemplo, un día o un plato).",
  spoken: "No alcancé a completar la consulta a tiempo. Intenta con una pregunta más concreta.",
  followUp: [],
  links: [],
};

const TOOL_INTENT: Record<string, Answer["intent"]> = {
  sales: "sales", orders: "orders", order_detail: "order_detail", kitchen_performance: "kitchen", products: "products",
  ingredients: "ingredients", purchases: "purchases", customers: "customers", payments: "payments", deliveries: "deliveries",
  staff: "staff", help: "app_help",
};

/**
 * The model answered in plain text instead of the `answer` contract: the
 * intent is the one of the data it looked at (the last tool), so the run is
 * still measurable.
 */
export function answerFromText(text: string, tools: string[], cut: boolean): Answer {
  const last = [...tools].reverse().find((t) => TOOL_INTENT[t]);
  return { intent: last ? TOOL_INTENT[last] : "other", scope: cut ? "partial" : "answered", answer: text, spoken: cleanSpoken(text), followUp: [], links: [] };
}

/** One turn of the recent conversation as the app sends it (ADR 0038). */
export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURN_CHARS = 2000;
const INTENT_RE = /^[a-z_]{1,40}$/;

/** «sales {"from":"2026-10-05","to":"2026-10-05"}» → the same, short and without line breaks. */
function cleanTool(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim().slice(0, 120);
  return t || null;
}

/**
 * The recent conversation for the model (ADR 0038): only user/assistant turns
 * with text, the last `max`, each cut to 2.000 characters. An assistant turn
 * may say what it was about (intent) and what it consulted (tools, with their
 * period): that goes as a short note so a follow-up («¿y ayer?») can reuse
 * it. Nothing here grants access: the tools still check permissions.
 */
export function readHistory(raw: unknown, max = 8): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: HistoryTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const turn = t as Json;
    if ((turn.role !== "user" && turn.role !== "assistant") || typeof turn.content !== "string" || !turn.content.trim()) continue;
    let content = turn.content.trim().slice(0, MAX_TURN_CHARS);
    if (turn.role === "assistant") {
      const intent = typeof turn.intent === "string" && INTENT_RE.test(turn.intent) ? turn.intent : null;
      const tools = (Array.isArray(turn.tools) ? turn.tools : []).map(cleanTool).filter((x): x is string => !!x).slice(0, 6);
      if (intent || tools.length) content += `\n\n[Contexto de esta respuesta: ${[intent ? `intención ${intent}` : "", tools.length ? `consulté ${tools.join("; ")}` : ""].filter(Boolean).join(" · ")}]`;
    }
    turns.push({ role: turn.role, content });
  }
  // The model needs the conversation to alternate and to start with the person.
  const merged: HistoryTurn[] = [];
  for (const t of turns.slice(-max)) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content = `${last.content}\n\n${t.content}`.slice(0, MAX_TURN_CHARS * 2);
    else merged.push({ ...t });
  }
  while (merged[0]?.role === "assistant") merged.shift();
  // A question left without an answer (it failed) is not context: the new question follows the last answer.
  while (merged[merged.length - 1]?.role === "user") merged.pop();
  return merged;
}

/** «sales {"from":"2026-10-05"}»: a step with its arguments, compact, to send back as context. */
export function stepContext(tool: string, input: unknown): string {
  let args = "";
  try {
    args = input && typeof input === "object" && Object.keys(input as object).length ? ` ${JSON.stringify(input)}` : "";
  } catch {
    args = "";
  }
  return `${tool}${args}`.slice(0, 120);
}
