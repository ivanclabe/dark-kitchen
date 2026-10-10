// Quanela — leer una factura de compra con IA (ADR 0049).
//
// Contrato:
//   - Entra: la ruta del archivo YA subido al bucket privado dk-attachments
//     (kitchens/{cuenta}/invoice-imports/…), o el id de una importación para
//     volver a leerla. El archivo no viaja en la petición: se lee del bucket con
//     la sesión del usuario (RLS y permisos aplican).
//   - Sale: lo que dice la factura (formato fijo, ver contract.ts) y las
//     coincidencias que propone la base (dk_invoice_match). La IA no escribe
//     nada: la persona revisa y guarda con dk_create_purchase_from_import.
//   - Cada lectura cuenta en el cupo de IA y queda en dk_ai_insights; lo leído
//     queda en dk_invoice_imports para auditoría.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import {
  countPdfPages,
  fileBlock,
  INVOICE_TOOL,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_PAGES,
  MIME_TYPES,
  normalizeExtraction,
  SYSTEM_PROMPT,
} from "./contract.ts";

const FEATURE = "invoice_import";
const BUCKET = "dk-attachments";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dk-kitchen-id, x-dk-role-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

interface ReadBody {
  importId?: string;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  sha256?: string;
  force?: boolean;
}

async function askModel(apiKey: string, model: string, mimeType: string, base64: string) {
  const request = () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [INVOICE_TOOL],
        // Newer models (Sonnet 5.5) refuse a forced tool_choice: the model is told to always use
        // the tool (SYSTEM_PROMPT) and an answer without it is a failed read, never guessed from text.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: [fileBlock(mimeType, base64), { type: "text", text: "Lee esta factura de compra." }] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  let res = await request();
  if (res.status === 429 || res.status === 529) {
    await new Promise((r) => setTimeout(r, 2000));
    res = await request();
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === INVOICE_TOOL.name);
  if (!block) throw new Error("El modelo no devolvió la factura");
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

  const body = (await req.json().catch(() => ({}))) as ReadBody;

  // 1. The import: a new one for an uploaded file, or an existing one to read again.
  let importId = body.importId ?? null;
  let filePath: string;
  let mimeType: string;
  if (importId) {
    const { data: row, error } = await db.from("dk_invoice_imports").select("id, status, file_path, mime_type").eq("id", importId).maybeSingle();
    if (error) return json({ error: error.message }, 403);
    if (!row) return json({ error: "NOT_FOUND", message: "No encontramos esa factura." }, 404);
    if (!["LEYENDO", "ERROR", "LISTA"].includes(row.status)) return json({ error: "USED", message: "Esta factura ya se usó o se descartó." }, 409);
    filePath = row.file_path;
    mimeType = row.mime_type;
  } else {
    if (!body.filePath || !body.mimeType) return json({ error: "BAD_REQUEST", message: "Falta el archivo." }, 400);
    if (!(MIME_TYPES as readonly string[]).includes(body.mimeType)) {
      return json({ error: "BAD_FILE", message: "Sube una foto (JPG, PNG o WebP) o un PDF." }, 400);
    }
    if (body.size && body.size > MAX_FILE_BYTES) return json({ error: "BAD_FILE", message: "El archivo pesa más de 10 MB." }, 400);
    const { data: started, error } = await db.rpc("dk_invoice_import_start", {
      p_file_path: body.filePath,
      p_file_name: body.fileName ?? "factura",
      p_mime_type: body.mimeType,
      p_file_size: body.size ?? null,
      p_sha256: body.sha256 ?? null,
      p_force: Boolean(body.force),
    });
    if (error) return json({ error: "START", message: error.message }, 403);
    if (started?.duplicate) return json({ duplicate: started.duplicate });
    importId = started.importId as string;
    filePath = body.filePath;
    mimeType = body.mimeType;
  }

  // 2. The AI quota (and the model of this feature in the platform catalog).
  const { data: quota, error: quotaError } = await db.rpc("dk_ai_run_reserve", { p_feature_key: FEATURE, p_input: { importId } });
  if (quotaError) return json({ error: "QUOTA", message: quotaError.message }, 403);
  if (!quota?.allowed || !quota.runId) {
    const message = quota?.reason === "daily"
      ? "Llegaste al límite de lecturas con IA de hoy. Puedes crear la compra a mano."
      : quota?.reason === "interval"
        ? `Espera ${quota.retryAfterSeconds ?? 5} segundos para leer otra factura.`
        : "La lectura de facturas con IA no está disponible en tu plan o para tu rol.";
    return json({ error: "NOT_ALLOWED", reason: quota?.reason ?? "feature", retryAfterSeconds: quota?.retryAfterSeconds ?? null, message, importId }, 429);
  }
  const runId = quota.runId as string;
  const started = Date.now();

  // `detail` (the technical cause) stays in the AI run log for support; the person sees `message`.
  const fail = async (message: string, status = 422, detail?: string) => {
    await db.rpc("dk_invoice_import_save", { p_import_id: importId, p_status: "ERROR", p_extraction: null, p_ai_run_id: runId, p_error: message });
    await db.rpc("dk_ai_run_finish", { p_run_id: runId, p_status: "error", p_error: detail ?? message, p_latency_ms: Date.now() - started });
    return json({ error: "READ_FAILED", message, importId }, status);
  };

  try {
    // 3. The file, from the private bucket with the user's session.
    const { data: file, error: fileError } = await db.storage.from(BUCKET).download(filePath);
    if (fileError || !file) return await fail("No pudimos abrir el archivo. Súbelo de nuevo.", 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) return await fail("El archivo pesa más de 10 MB.", 400);
    if (mimeType !== "application/pdf" && bytes.byteLength > MAX_IMAGE_BYTES) return await fail("La foto pesa más de 5 MB. Tómala de nuevo o súbela como PDF.", 400);
    if (mimeType === "application/pdf" && countPdfPages(bytes) > MAX_PDF_PAGES) return await fail(`El PDF tiene más de ${MAX_PDF_PAGES} páginas.`, 400);

    // 4. The model reads it.
    const answer = await askModel(apiKey, quota.model as string, mimeType, encodeBase64(bytes));
    const extraction = normalizeExtraction(answer.raw);
    const latency = Date.now() - started;
    if (!extraction.isInvoice) {
      await db.rpc("dk_ai_run_finish", {
        p_run_id: runId, p_status: "empty", p_latency_ms: latency, p_input_tokens: answer.inputTokens, p_output_tokens: answer.outputTokens,
        p_output: { isInvoice: false },
      });
      await db.rpc("dk_invoice_import_save", { p_import_id: importId, p_status: "ERROR", p_extraction: extraction, p_ai_run_id: runId, p_error: "No parece una factura" });
      return json({ error: "NOT_INVOICE", message: "Esto no parece una factura de compra. Revisa el archivo.", importId }, 422);
    }

    const { error: saveError } = await db.rpc("dk_invoice_import_save", { p_import_id: importId, p_status: "LISTA", p_extraction: extraction, p_ai_run_id: runId });
    if (saveError) throw new Error(saveError.message);
    await db.rpc("dk_ai_run_finish", {
      p_run_id: runId, p_status: "ok", p_latency_ms: latency, p_input_tokens: answer.inputTokens, p_output_tokens: answer.outputTokens,
      p_output: { lines: extraction.lines.length, warnings: extraction.warnings.length },
    });

    // 5. What the database proposes.
    const { data: match, error: matchError } = await db.rpc("dk_invoice_match", { p_extraction: extraction });
    if (matchError) throw new Error(matchError.message);
    return json({ importId, extraction, match });
  } catch (err) {
    console.error("dk-invoice-import", err);
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    const detail = err instanceof Error ? err.message : String(err);
    return await fail(timeout ? "La lectura tardó demasiado. Intenta de nuevo." : "No pudimos leer la factura. Intenta de nuevo o crea la compra a mano.", 502, detail);
  }
});
