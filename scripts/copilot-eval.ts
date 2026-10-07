// ADR 0033, phase 4: measures Quanela Copilot — precision (intent, scope and
// figures), clarity and response time — over supabase/tests/copilot_eval/questions.json.
//
//   QUANELA_EVAL_TOKEN=<access token> QUANELA_EVAL_KITCHEN=<account id> node scripts/copilot-eval.ts
//     [--only s1,s2] [--limit 10] [--dry] [--channel voice]
//
// * --channel voice asks every question as if said to «Oye Quanela» (ADR 0041):
//   it measures the model chosen for voice in the platform («Modelo para
//   preguntas por voz»). Run it once with that model empty and once with the
//   candidate, and compare the two reports.
// * Runs as YOU (your session token, from the browser: Application → Local
//   storage → sb-…-auth-token → access_token) in the account you pass, so it
//   uses the real data and RLS. Roles: as the account's owner you can act as a
//   system role (x-dk-role-id), so «not allowed» is measured too.
// * The right figure of each question is computed with the same data function
//   and your session, and must appear in the answer.
// * Each question is one Copilot question (it counts against the daily limit),
//   and Copilot waits 5 s between questions of one person: about 10 minutes.
// * Clarity: a heuristic score; with ANTHROPIC_API_KEY also a judge model
//   (QUANELA_EVAL_JUDGE, default claude-haiku-4-5-20251001).
// * Writes supabase/tests/copilot_eval/results/<date>.json and .md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clarityHeuristic, inventsMoney, mentionsFigure, percentile, pick, type EvalAnswer, type Expect } from '../supabase/tests/copilot_eval/score.ts'

interface Question {
  id: string
  role: string
  q: string
  expect: Expect
  truth?: { rpc: string; args: Record<string, unknown>; path: string; kind: 'money' | 'count' }
  mustMention?: string[]
  noNumbers?: boolean
  channel?: 'voice' | 'text'
}

interface Result {
  id: string
  role: string
  question: string
  ms: number
  status: 'ok' | 'error'
  error?: string
  answer?: EvalAnswer & { followUp?: string[]; steps?: { tool: string }[] }
  intentOk: boolean | null
  scopeOk: boolean
  figureOk: boolean | null
  invented: boolean
  mentionOk: boolean | null
  linkOk: boolean | null
  clarity: number | null
  judge: number | null
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function env(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(join(ROOT, file), 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    } catch {
      // Optional file.
    }
  }
  return { ...out, ...(process.env as Record<string, string>) }
}

const E = env()
const URL_ = E.VITE_SUPABASE_URL
const KEY = E.VITE_SUPABASE_PUBLISHABLE_KEY
const TOKEN = E.QUANELA_EVAL_TOKEN
const KITCHEN = E.QUANELA_EVAL_KITCHEN
const TZ = E.QUANELA_EVAL_TZ ?? 'America/Bogota'
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const CHANNEL = option('--channel')
if (CHANNEL !== undefined && CHANNEL !== 'voice' && CHANNEL !== 'text') {
  console.error('--channel acepta voice o text.')
  process.exit(1)
}
const models = new Set<string>()

if (!URL_ || !KEY || !TOKEN || !KITCHEN) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (en .env.local), QUANELA_EVAL_TOKEN o QUANELA_EVAL_KITCHEN.')
  process.exit(1)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function headers(roleId: string | null): Record<string, string> {
  return {
    apikey: KEY,
    Authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    'x-dk-kitchen-id': KITCHEN,
    ...(roleId ? { 'x-dk-role-id': roleId } : {}),
  }
}

async function rpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(null), body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

function localDate(offsetDays = 0): Date {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  now.setDate(now.getDate() + offsetDays)
  return now
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function placeholders(lastOrder: string): Record<string, string> {
  const today = localDate()
  const monday = localDate(-((today.getDay() + 6) % 7))
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  return {
    '{today}': iso(today),
    '{yesterday}': iso(localDate(-1)),
    '{monday}': iso(monday),
    '{month_start}': iso(monthStart),
    '{last_month_start}': iso(lastMonthStart),
    '{last_month_end}': iso(lastMonthEnd),
    '{d-30}': iso(localDate(-30)),
    '{last_order}': lastOrder,
  }
}

function fill<T>(value: T, map: Record<string, string>): T {
  return JSON.parse(Object.entries(map).reduce((s, [k, v]) => s.replaceAll(k, v), JSON.stringify(value))) as T
}

async function ask(question: string, roleId: string | null, channel: 'voice' | 'text'): Promise<{ ms: number; status: number; body: Record<string, unknown> }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now()
    const res = await fetch(`${URL_}/functions/v1/dk-copilot`, {
      method: 'POST',
      headers: headers(roleId),
      body: JSON.stringify({ question, history: [], screen: null, channel, requestId: crypto.randomUUID() }),
    })
    const ms = Date.now() - t0
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof body.model === 'string') models.add(body.model)
    // The 5 s between questions of one person: wait and ask again.
    if (res.status === 429 && body.reason === 'interval') {
      await sleep(((body.retryAfterSeconds as number) ?? 5) * 1000 + 300)
      continue
    }
    return { ms, status: res.status, body }
  }
  return { ms: 0, status: 429, body: { message: 'interval' } }
}

async function judge(question: string, answer: EvalAnswer): Promise<number | null> {
  const key = E.ANTHROPIC_API_KEY
  if (!key) return null
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: E.QUANELA_EVAL_JUDGE ?? 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [
        {
          role: 'user',
          content: `Califica de 1 a 5 la CLARIDAD de esta respuesta de un asistente de un negocio de comida (no su exactitud): responde primero lo preguntado, es breve, español natural, buen formato, y el resumen hablado se entiende al oírlo. Devuelve solo el número.\n\nPregunta: ${question}\n\nRespuesta:\n${answer.answer}\n\nResumen hablado: ${answer.spoken}`,
        },
      ],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { content?: { text?: string }[] }
  const n = Number.parseInt(data.content?.[0]?.text ?? '', 10)
  return n >= 1 && n <= 5 ? n : null
}

async function main() {
  const set = JSON.parse(readFileSync(join(ROOT, 'supabase/tests/copilot_eval/questions.json'), 'utf8')) as { questions: Question[] }
  const only = option('--only')?.split(',')
  const limit = Number(option('--limit') ?? 0)
  let questions = set.questions.filter((q) => !only || only.includes(q.id))
  if (limit > 0) questions = questions.slice(0, limit)

  const rolesRes = await fetch(`${URL_}/rest/v1/dk_roles?is_system=eq.true&select=id,key`, { headers: headers(null) })
  const roles = new Map(((await rolesRes.json()) as { id: string; key: string }[]).map((r) => [r.key, r.id]))
  const latest = (await rpc('dk_copilot_orders', { p_limit: 1 })) as { orders?: { number: number }[] }
  const map = placeholders(String(latest.orders?.[0]?.number ?? '1000'))

  console.log(`${questions.length} preguntas · cuenta ${KITCHEN} · ${flag('--dry') ? 'sin preguntar (--dry)' : 'preguntando a Copilot…'}`)
  if (flag('--dry')) {
    for (const q of questions) console.log(`  ${q.id} [${q.role}] ${fill(q.q, map)}`)
    return
  }

  const results: Result[] = []
  for (const q of questions) {
    const question = fill(q.q, map)
    const roleId = q.role === 'self' ? null : (roles.get(q.role) ?? null)
    const { ms, status, body } = await ask(question, roleId, (CHANNEL as 'voice' | 'text' | undefined) ?? q.channel ?? 'text')
    const base = { id: q.id, role: q.role, question, ms }
    if (status !== 200) {
      results.push({ ...base, status: 'error', error: String(body.message ?? body.error ?? status), intentOk: null, scopeOk: false, figureOk: null, invented: false, mentionOk: null, linkOk: null, clarity: null, judge: null })
      console.log(`  ✗ ${q.id} (${status}) ${body.message ?? ''}`)
      continue
    }
    const a = body as unknown as Result['answer'] & EvalAnswer
    let figureOk: boolean | null = null
    if (q.truth) {
      const truth = Number(pick(await rpc(q.truth.rpc, fill(q.truth.args, map)), q.truth.path) ?? 0)
      figureOk = a.scope === 'no_data' && truth === 0 ? true : mentionsFigure(a.answer, truth, q.truth.kind)
    }
    const r: Result = {
      ...base,
      status: 'ok',
      answer: a,
      intentOk: q.expect.intent ? q.expect.intent.includes(a.intent) : null,
      scopeOk: q.expect.scope.includes(a.scope),
      figureOk,
      invented: Boolean(q.noNumbers && inventsMoney(a.answer)),
      mentionOk: q.mustMention ? q.mustMention.every((m) => a.answer.toLowerCase().includes(m.toLowerCase())) : null,
      linkOk: q.expect.link ? Boolean(a.links?.some((l) => l.id === q.expect.link)) : null,
      clarity: clarityHeuristic(a),
      judge: await judge(question, a),
    }
    results.push(r)
    const ok = r.scopeOk && r.intentOk !== false && r.figureOk !== false && !r.invented && r.mentionOk !== false && r.linkOk !== false
    console.log(`  ${ok ? '✓' : '✗'} ${q.id} ${a.intent}/${a.scope} · ${(ms / 1000).toFixed(1)} s`)
  }

  writeReport(results)
}

function rate(values: (boolean | null)[]): string {
  const known = values.filter((v): v is boolean => v !== null)
  return known.length ? `${Math.round((known.filter(Boolean).length / known.length) * 100)} % (${known.filter(Boolean).length}/${known.length})` : '—'
}

function writeReport(results: Result[]) {
  const ok = results.filter((r) => r.status === 'ok')
  const times = ok.map((r) => r.ms)
  const clarity = ok.map((r) => r.judge ?? r.clarity ?? 0)
  const summary = {
    questions: results.length,
    errors: results.length - ok.length,
    intent: rate(results.map((r) => r.intentOk)),
    scope: rate(results.map((r) => r.scopeOk)),
    figures: rate(results.map((r) => r.figureOk)),
    invented: results.filter((r) => r.invented).length,
    mentions: rate(results.map((r) => r.mentionOk)),
    links: rate(results.map((r) => r.linkOk)),
    clarity: clarity.length ? Number((clarity.reduce((a, b) => a + b, 0) / clarity.length).toFixed(2)) : null,
    clarityBy: ok.some((r) => r.judge !== null) ? 'juez + heurística' : 'heurística',
    p50Ms: percentile(times, 50),
    p90Ms: percentile(times, 90),
    channel: CHANNEL ?? 'según cada pregunta',
    models: [...models],
  }
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}${CHANNEL ? `-${CHANNEL}` : ''}`
  const dir = join(ROOT, 'supabase/tests/copilot_eval/results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify({ summary, results }, null, 2))
  const md = [
    `# Evaluación de Copilot — ${stamp}`,
    '',
    `Canal: ${summary.channel} · Modelo: ${summary.models.join(', ') || '—'}`,
    '',
    '| Métrica | Resultado | Meta (ADR 0033) |',
    '|---|---|---|',
    `| Intención correcta | ${summary.intent} | ≥ 95 % |`,
    `| Alcance correcto | ${summary.scope} | ≥ 95 % |`,
    `| Cifras correctas | ${summary.figures} | ≥ 95 % |`,
    `| Cifras inventadas (sin dato) | ${summary.invented} | 0 |`,
    `| Menciona la pantalla correcta (ayuda) | ${summary.mentions} | — |`,
    `| Enlaza la guía correcta (ADR 0034) | ${summary.links} | ≥ 90 % |`,
    `| Claridad (1–5, ${summary.clarityBy}) | ${summary.clarity ?? '—'} | ≥ 4,2 |`,
    `| Tiempo p50 / p90 | ${summary.p50Ms != null ? (summary.p50Ms / 1000).toFixed(1) : '—'} s / ${summary.p90Ms != null ? (summary.p90Ms / 1000).toFixed(1) : '—'} s | ≤ 4 s / ≤ 8 s |`,
    `| Errores | ${summary.errors} de ${summary.questions} | 0 |`,
    '',
    '| # | Rol | Pregunta | Intención · alcance | Cifra | Claridad | Tiempo |',
    '|---|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.role} | ${r.question.replace(/\|/g, '/')} | ${r.answer ? `${r.answer.intent} · ${r.answer.scope}${r.scopeOk ? '' : ' ✗'}` : `error: ${r.error}`} | ${r.figureOk === null ? '—' : r.figureOk ? '✓' : '✗'}${r.invented ? ' inventada' : ''} | ${r.judge ?? r.clarity ?? '—'} | ${(r.ms / 1000).toFixed(1)} s |`,
    ),
  ].join('\n')
  writeFileSync(join(dir, `${stamp}.md`), `${md}\n`)
  console.log('\n', summary, `\nInforme: supabase/tests/copilot_eval/results/${stamp}.md`)
}

void main()
