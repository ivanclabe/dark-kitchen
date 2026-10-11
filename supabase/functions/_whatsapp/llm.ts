// Quanela — the model call of the WhatsApp assistant (ADR 0055). Anthropic, as the rest of
// Quanela's AI (ADR 0014): the model comes from the catalog; tool_choice auto (Sonnet/Haiku 5.5
// refuse a forced tool) and an answer without the tool counts as «unclear».
export interface LlmConfig {
  apiKey: string;
  model: string;
  /** Platform override for tests (a local model simulator); default Anthropic. */
  baseUrl?: string;
}

export async function interpretWithAnthropic(
  config: LlmConfig,
  input: { system: string; user: string; tool: { name: string } & Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<{ raw: unknown; inputTokens: number | null; outputTokens: number | null }> {
  const base = (config.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  const request = () =>
    fetchImpl(`${base}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 800,
        system: input.system,
        tools: [input.tool],
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: input.user }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  let res = await request();
  if (res.status === 429 || res.status === 529) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await request();
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content ?? []).find((c: { type: string; name?: string }) => c.type === "tool_use" && c.name === input.tool.name);
  return {
    raw: block?.input ?? { intents: [{ type: "unclear" }] },
    inputTokens: typeof data.usage?.input_tokens === "number" ? data.usage.input_tokens : null,
    outputTokens: typeof data.usage?.output_tokens === "number" ? data.usage.output_tokens : null,
  };
}
