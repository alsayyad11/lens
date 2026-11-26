import { classifyLexicon, type Sentiment } from './lexicon'
import { llm, type AiCfg } from './llm'

export interface Classified { sentiment: Sentiment; urgent: boolean; topics: string[]; summary: string }

const SYS = `You classify social posts and news items for a social listening product. Posts may be Arabic (Egyptian, Gulf, Levantine, Maghrebi, Franco-Arabic) or English, and may use sarcasm.
For each item return the sentiment toward the monitored subject ("positive", "neutral" or "negative"), "urgent" (true only for negative items that need a reply fast: legal threats, fraud claims, safety, viral complaints, unanswered support), up to 3 short "topics", and a one-sentence "summary" in the same language as the item.
Reply with JSON only: an array of {"i": number, "sentiment": string, "urgent": boolean, "topics": string[], "summary": string}.`

export function parseJsonArray(s: string): any[] {
  const m = s.match(/\[[\s\S]*\]/)
  if (!m) throw new Error('no JSON array in AI reply')
  return JSON.parse(m[0])
}

/** Classify texts with the configured AI in batches. Falls back to the lexicon per batch on any failure. */
export async function classifyBatch(cfg: AiCfg | undefined, subject: string, texts: string[], fetchImpl: typeof fetch = fetch): Promise<{ out: Classified[]; usedAI: boolean }> {
  const out: Classified[] = texts.map((t) => ({ ...classifyLexicon(t), topics: [], summary: '' }))
  if (!cfg || cfg.provider === 'keyless' || !cfg.key) return { out, usedAI: false }
  let usedAI = false
  for (let s = 0; s < texts.length; s += 15) {
    const slice = texts.slice(s, s + 15)
    try {
      const reply = await llm(cfg, SYS, `Monitored subject: ${subject}\nItems:\n` + slice.map((t, i) => `${i}. ${t.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n'), 2500, fetchImpl)
      for (const r of parseJsonArray(reply)) {
        const idx = s + Number(r.i)
        if (!(idx >= s && idx < s + slice.length)) continue
        if (!['positive', 'neutral', 'negative'].includes(r.sentiment)) continue
        out[idx] = { sentiment: r.sentiment, urgent: r.sentiment === 'negative' && !!r.urgent, topics: Array.isArray(r.topics) ? r.topics.slice(0, 3).map(String) : [], summary: String(r.summary || '').slice(0, 240) }
        usedAI = true
      }
    } catch (e) { console.warn('classify batch failed, using lexicon:', (e as Error).message) }
  }
  return { out, usedAI }
}
