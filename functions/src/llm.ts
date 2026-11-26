// One tiny client for several LLM providers. Plain fetch, no SDKs.
// The same file is used by the Cloud Functions and by the browser (src/llm.ts is a copy).
export type Provider = 'gemini' | 'groq' | 'openrouter' | 'anthropic' | 'keyless'
export interface AiCfg { provider: Provider; key?: string; model?: string }

export const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: 'gemini-flash-latest',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  anthropic: 'claude-haiku-5-5',
  keyless: 'openai',
}
type F = typeof fetch

async function fail(who: string, r: Response): Promise<never> {
  throw new Error(`${who} answered ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`)
}
const openAiStyle = async (f: F, url: string, key: string | undefined, model: string, system: string, user: string, max: number, who: string, extra: Record<string, string> = {}) => {
  const r = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra },
    body: JSON.stringify({ model, max_tokens: max, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })
  if (!r.ok) await fail(who, r)
  const j: any = await r.json()
  const out = j.choices?.[0]?.message?.content
  if (!out) throw new Error(`${who} returned an empty answer`)
  return String(out)
}

/** Ask one provider. Throws on any failure. */
export async function llm(cfg: AiCfg, system: string, user: string, maxTokens = 800, f: F = fetch): Promise<string> {
  const model = cfg.model?.trim() || DEFAULT_MODEL[cfg.provider]
  if (cfg.provider !== 'keyless' && !cfg.key) throw new Error('No API key set for ' + cfg.provider)
  switch (cfg.provider) {
    case 'gemini': {
      const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.key! },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
      })
      if (!r.ok) await fail('Gemini', r)
      const j: any = await r.json()
      const out = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('')
      if (!out) throw new Error('Gemini returned an empty answer' + (j.promptFeedback?.blockReason ? ` (${j.promptFeedback.blockReason})` : ''))
      return out
    }
    case 'groq': return openAiStyle(f, 'https://api.groq.com/openai/v1/chat/completions', cfg.key, model, system, user, maxTokens, 'Groq')
    case 'openrouter': return openAiStyle(f, 'https://openrouter.ai/api/v1/chat/completions', cfg.key, model, system, user, maxTokens, 'OpenRouter', { 'x-title': 'Scoop360' })
    case 'keyless': return openAiStyle(f, 'https://text.pollinations.ai/openai', undefined, model, system, user, maxTokens, 'Pollinations')
    case 'anthropic': {
      const r = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      })
      if (!r.ok) await fail('Claude', r)
      const j: any = await r.json()
      return (j.content || []).map((c: any) => c.text || '').join('')
    }
  }
}

/** Use the provider the admin chose; if it fails, fall back to the keyless free endpoint. */
export async function llmWithFallback(cfg: AiCfg | undefined, system: string, user: string, maxTokens = 800, f: F = fetch): Promise<{ text: string; provider: Provider }> {
  // AI is opt-in: with no provider chosen in Settings, nothing is sent anywhere.
  if (!cfg || (cfg.provider !== 'keyless' && !cfg.key)) throw new Error('AI is off. Choose a provider in Settings > AI.')
  let firstErr: Error | null = null
  try { return { text: await llm(cfg, system, user, maxTokens, f), provider: cfg.provider } } catch (e) { firstErr = e as Error }
  try { return { text: await llm({ provider: 'keyless' }, system, user, maxTokens, f), provider: 'keyless' } }
  catch (e) { throw firstErr || (e as Error) }
}
