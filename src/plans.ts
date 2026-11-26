import type { Plan } from './types'

export const PLAN_ORDER: Plan[] = ['basic', 'pro', 'business']
export interface PlanDef { id: Plan; peers: number; topics: number; features: string[] }
/** What each plan includes. Limits and gates below are enforced in the app. */
export const PLANS: PlanDef[] = [
  { id: 'basic', peers: 3, topics: 5, features: ['Name Lens: everything said about you, good and bad', 'Field Lens: news and talk in up to 5 topics', 'Peer Lens: follow up to 3 rivals', 'Alerts and CSV export'] },
  { id: 'pro', peers: 10, topics: 15, features: ['Everything in Basic', 'Competitor suggestions picked for your field', 'Follow up to 10 rivals and 15 topics', 'PDF reports and Ask LENS'] },
  { id: 'business', peers: 999, topics: 999, features: ['Everything in Pro', 'Growth actions: what to do next, with the data behind each one', 'Unlimited rivals and topics', 'Team roles for your colleagues'] },
]
export const planOf = (p?: Plan): PlanDef => PLANS.find((x) => x.id === p) || PLANS[0]
export const atLeast = (have: Plan | undefined, need: Plan) => PLAN_ORDER.indexOf(have || 'basic') >= PLAN_ORDER.indexOf(need)
export const can = {
  suggestPeers: (p?: Plan) => atLeast(p, 'pro'),
  pdf: (p?: Plan) => atLeast(p, 'pro'),
  growth: (p?: Plan) => atLeast(p, 'business'),
}
