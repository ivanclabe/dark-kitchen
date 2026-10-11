// Quanela — the only place that knows WhatsApp Business Platform (Meta Cloud API), ADR 0055.
// Pure: no Deno globals, no network (callers pass fetch results in), so Vitest checks it.
// Changing provider or Graph version touches this file only.

export type Mode = "test" | "live" | "simulator";

/** Where Graph is: Meta, or the platform's simulator (only for accounts in «simulator» mode). */
export function graphBase(mode: Mode | string, env: (key: string) => string | undefined): string | null {
  if (mode === "simulator") return env("DK_META_GRAPH_TEST_URL")?.replace(/\/+$/, "") || null;
  return `https://graph.facebook.com/${env("DK_META_GRAPH_VERSION") || "v23.0"}`;
}

export type VarKey = "customer_name" | "business_name" | "order_number" | "tracking_url" | "reason";

/** Meta rejects parameters with new lines, tabs or more than 4 spaces in a row, and empty ones. */
export function cleanParam(value: unknown, max = 200): string {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, max);
  return text || "-";
}

export interface TemplatePayload {
  template: string;
  language: string;
  params: VarKey[];
  vars: Partial<Record<Exclude<VarKey, "tracking_url"> | "tracking_path", string | null>>;
}

/** An E.164 number as Meta wants it (digits only). */
export const waNumber = (e164: string) => e164.replace(/[^0-9]/g, "");

export function templateMessage(to: string, payload: TemplatePayload, appUrl: string) {
  const base = appUrl.replace(/\/+$/, "");
  const value = (key: VarKey) =>
    key === "tracking_url" ? `${base}${payload.vars.tracking_path ?? ""}` : (payload.vars as Record<string, string | null | undefined>)[key];
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waNumber(to),
    type: "template",
    template: {
      name: payload.template,
      language: { code: payload.language || "es" },
      components: payload.params.length
        ? [{ type: "body", parameters: payload.params.map((key) => ({ type: "text", text: cleanParam(value(key)) })) }]
        : [],
    },
  };
}

/** A free-form text (only inside the 24 h customer service window). */
export function textMessage(to: string, body: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: waNumber(to), type: "text", text: { body: body.slice(0, 4096), preview_url: true } };
}

export interface SendOutcome {
  ok: boolean;
  wamid: string | null;
  code: string | null;
  error: string | null;
  /** Worth trying again later (rate limits, Meta hiccups, network). */
  retryable: boolean;
}

// Meta error codes that pass with time: throttling, temporary, spam rate, pair rate.
const RETRYABLE = new Set(["1", "2", "4", "80007", "130429", "131048", "131056", "133004"]);

/** Meta's answer to a send (status + JSON body) → what to record. */
export function sendOutcome(status: number, body: unknown): SendOutcome {
  const b = (body ?? {}) as { messages?: { id?: string }[]; error?: { code?: number | string; message?: string; error_user_msg?: string; error_data?: { details?: string } } };
  const wamid = b.messages?.[0]?.id ?? null;
  if (status >= 200 && status < 300 && wamid) return { ok: true, wamid, code: null, error: null, retryable: false };
  const code = b.error?.code != null ? String(b.error.code) : null;
  const detail = b.error?.error_data?.details || b.error?.error_user_msg || b.error?.message || `HTTP ${status}`;
  return {
    ok: false,
    wamid: null,
    code,
    error: `${code ? `(#${code}) ` : ""}${detail}`.slice(0, 500),
    retryable: status === 429 || status >= 500 || (code !== null && RETRYABLE.has(code)),
  };
}

/** What a person can do about common Meta errors (shown in the log). */
export function errorHint(code: string | null): string | null {
  switch (code) {
    case "131047": return "Pasaron más de 24 horas desde el último mensaje del cliente: solo se puede enviar una plantilla.";
    case "131026": return "El número no tiene WhatsApp o no puede recibir el mensaje.";
    case "132000":
    case "132001": return "La plantilla no existe en Meta o no está aprobada en ese idioma.";
    case "132012": return "La plantilla espera otras variables: revisa la configuración del aviso.";
    case "190": return "El token de acceso venció o fue revocado: actualízalo en Conexión.";
    case "131030": return "En la app de prueba de Meta, este número no está en la lista de destinatarios permitidos.";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). Constant-time compare. */
export async function verifySignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const given = header.slice(7).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

export async function signBody(rawBody: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)))}`;
}

export interface StatusEvent {
  phoneNumberId: string;
  wamid: string;
  status: string;
  at: string;
  errorCode: string | null;
  error: string | null;
}

export interface InboundMessage {
  phoneNumberId: string;
  wamid: string;
  from: string;
  name: string | null;
  at: string;
  type: string;
  text: string | null;
}

const isoFromUnix = (ts: unknown) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

/** Meta's notification → delivery receipts and inbound messages, grouped by the business number that got them. */
export function parseWebhook(body: unknown): { phoneNumberIds: string[]; statuses: StatusEvent[]; messages: InboundMessage[] } {
  const statuses: StatusEvent[] = [];
  const messages: InboundMessage[] = [];
  const ids = new Set<string>();
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    for (const change of ((entry as { changes?: unknown[] }).changes ?? []) as { field?: string; value?: Record<string, unknown> }[]) {
      if (change.field !== "messages" || !change.value) continue;
      const v = change.value as {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        statuses?: { id?: string; status?: string; timestamp?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
        messages?: { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
      };
      const phoneNumberId = v.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      ids.add(phoneNumberId);
      for (const s of v.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const e = s.errors?.[0];
        statuses.push({
          phoneNumberId, wamid: s.id, status: s.status, at: isoFromUnix(s.timestamp),
          errorCode: e?.code != null ? String(e.code) : null, error: e ? `${e.title ?? ""} ${e.message ?? ""}`.trim() || null : null,
        });
      }
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        const contact = (v.contacts ?? []).find((c) => c.wa_id === m.from) ?? v.contacts?.[0];
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        messages.push({
          phoneNumberId, wamid: m.id, from: `+${m.from.replace(/[^0-9]/g, "")}`, name: contact?.profile?.name ?? null,
          at: isoFromUnix(m.timestamp), type: m.type ?? "unknown", text,
        });
      }
    }
  }
  return { phoneNumberIds: [...ids], statuses, messages };
}

// ---------------------------------------------------------------------------
// Templates (Business Management API)
// ---------------------------------------------------------------------------
const SAMPLE: Record<VarKey, string> = {
  customer_name: "Laura",
  business_name: "Sopas Doña Ana",
  order_number: "123",
  tracking_url: "https://quanela.com/menu/sopas/pedido/abc",
  reason: "nos quedamos sin gas",
};

/** The request to create a suggested template in the account's WABA (utility category, with examples as Meta requires). */
export function templateCreateRequest(t: { name: string; language: string; body: string; params: VarKey[] }) {
  return {
    name: t.name,
    language: t.language || "es",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: t.body,
        ...(t.params.length ? { example: { body_text: [t.params.map((p) => SAMPLE[p] ?? "ejemplo")] } } : {}),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// n8n events (ADR 0055, fase B): signed like Meta signs ours
// ---------------------------------------------------------------------------
/** X-Quanela-Signature = "sha256=" + HMAC-SHA256(account secret, raw body). */
export async function signEvent(rawBody: string, secret: string): Promise<string> {
  return signBody(rawBody, secret);
}

/** A template from n8n with literal parameters (already approved in the account). */
export function rawTemplateMessage(to: string, template: string, language: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: waNumber(to),
    type: "template",
    template: {
      name: template,
      language: { code: language || "es" },
      components: params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: cleanParam(p) })) }] : [],
    },
  };
}
