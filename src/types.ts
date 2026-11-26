export type AccountType = 'company' | 'individual'
export type Sentiment = 'positive' | 'neutral' | 'negative'
export type Lens = 'name' | 'field' | 'peer'
export type Source = 'X' | 'Facebook' | 'Instagram' | 'LinkedIn' | 'News' | 'Blogs' | 'Reddit' | 'Mastodon' | 'Web'
export const SOURCES: Source[] = ['X', 'Facebook', 'Instagram', 'LinkedIn', 'News', 'Blogs', 'Reddit', 'Mastodon', 'Web']

export interface Profile {
  accountType: AccountType
  fullName: string
  orgName: string // company name, or the person's public name
  role: string
  handles: string[] // brand/person names and handles to listen for
  topics: string[] // field lens: keywords and hashtags
  setupDone: boolean
  lang: 'en' | 'ar'
}
export interface Post {
  id: string
  lens: Lens
  author: string
  source: Source
  text: string
  sentiment: Sentiment
  reach: number
  reactions: number
  ts: number
  peerId?: string
  urgent?: boolean
  url?: string
  externalId?: string
  handled?: boolean
  topics?: string[]
  summary?: string
}
export type Role = 'owner' | 'admin' | 'analyst' | 'viewer'
export const ROLES: Role[] = ['owner', 'admin', 'analyst', 'viewer']
export interface Member { id: string; email: string; name: string; role: Role; status: 'active' | 'invited' }
export interface OwnPage { id: string; platform: Source; name: string; url: string }
export interface SourceStatus { state: 'ok' | 'failed' | 'idle'; last?: number; message?: string; count?: number }
export interface SourcesConfig {
  news: { enabled: boolean }
  bing: { enabled: boolean }
  reddit: { enabled: boolean }
  mastodon: { enabled: boolean }
  gdelt: { enabled: boolean }
  hackernews: { enabled: boolean }
  blogs: { enabled: boolean; feeds: string[] }
  x: { enabled: boolean; bearer: string }
  facebook: { enabled: boolean; pageId: string; token: string }
  instagram: { enabled: boolean; userId: string; token: string }
  status: Record<string, SourceStatus>
}
export const EMPTY_SOURCES: SourcesConfig = {
  news: { enabled: true }, bing: { enabled: true }, reddit: { enabled: true }, mastodon: { enabled: true }, gdelt: { enabled: false }, hackernews: { enabled: false }, blogs: { enabled: false, feeds: [] }, x: { enabled: false, bearer: '' },
  facebook: { enabled: false, pageId: '', token: '' }, instagram: { enabled: false, userId: '', token: '' }, status: {},
}
export interface Peer { id: string; name: string; links: Partial<Record<Source, string>> }
export type AlertType = 'negative_spike' | 'keyword' | 'volume'
export interface AlertRule { id: string; name: string; type: AlertType; threshold: number; keyword: string; active: boolean }

export type AiProvider = 'none' | 'gemini' | 'groq' | 'openrouter' | 'anthropic' | 'keyless'
export interface AiSettings { provider: AiProvider; key: string; model: string }
export const EMPTY_AI: AiSettings = { provider: 'none', key: '', model: '' }
