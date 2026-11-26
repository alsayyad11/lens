// Rule-based fallback used when no AI key is set or the AI call fails.
export type Sentiment = 'positive' | 'neutral' | 'negative'
const POS = ['great','best','love','loved','excellent','amazing','good','happy','thanks','thank','recommend','perfect','fast','awesome','delicious','smooth','ممتاز','رائع','حلو','جميل','احسن','أحسن','افضل','أفضل','شكرا','شكراً','بحبه','احببت','أحببت','مذهل','سريع','تحفة','انصح','أنصح','يجنن','عظيم']
const NEG = ['bad','worst','late','slow','terrible','awful','hate','angry','refund','scam','broken','nobody answered','disappointed','poor','rude','complaint','never again','سيء','سيئ','وحش','أسوأ','اسوأ','تأخر','متأخر','بطيء','نصب','مشكلة','شكوى','زفت','ما ردوا','محدش رد','غالي','مقرف','خايب','فاشل','مستحيل','ردي']
const URGENT = ['scam','refund','legal','lawsuit','sue','nobody answered','fraud','نصب','محامي','قضية','محدش رد','ما ردوا','احتيال']
const NEGATORS = ['not ', 'no ', 'never ', 'مش ', 'ما ', 'لا ', 'مو ']
export const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
const NP = POS.map(norm), NN = NEG.map(norm), NU = URGENT.map(norm)
export function classifyLexicon(text: string): { sentiment: Sentiment; urgent: boolean } {
  const t = norm(text); let score = 0
  const hit = (w: string, sign: number) => { let i = t.indexOf(w); while (i >= 0) { const before = t.slice(Math.max(0, i - 6), i); score += NEGATORS.some((n) => before.endsWith(norm(n))) ? -sign * 0.8 : sign; i = t.indexOf(w, i + w.length) } }
  NP.forEach((w) => hit(w, 1)); NN.forEach((w) => hit(w, -1))
  const sentiment: Sentiment = score > 0.5 ? 'positive' : score < -0.5 ? 'negative' : 'neutral'
  return { sentiment, urgent: sentiment === 'negative' && NU.some((w) => t.includes(w)) }
}
