# LENS

## Run it now (no install)
Open **`LENS.html`** by double-click. It is the whole app in one file and runs in demo mode (data stays in your browser).
`index.html` in the project root is only the *source* entry of the Vite app. It cannot be opened directly; use `LENS.html`, or:

```
npm install
npm run dev          # http://localhost:5173
npm run build:single # rebuilds LENS.html
```

Live demo (GitHub Pages): see the repository's About link.


Arabic-first social listening: **Name Lens** (what is said about you), **Field Lens** (what moves in your field),
**Peer Lens** (what competitors publish), plus Alerts, Reports and Ask LENS.
React + Vite web app, Firebase Auth / Firestore / Hosting, and Cloud Functions that collect and analyze posts.
The UI follows the "LENS — UI Design v2" Figma file.

## What is in it
| Area | What it does |
|---|---|
| Accounts | Company (B2B) and Individual (B2C) sign-up, email verification, sign in, password reset, English and Arabic (RTL) |
| Setup | Names and handles, topics and hashtags, peers with a link per platform |
| Lenses | Overview with "what matters today", Name Lens (filters, sentiment by day, top sources, CSV), Field Lens (topics, trends), Peer Lens (share of voice), Your pages |
| Mention detail | Full post, AI summary and topics, **Draft a reply** (Claude), mark as handled |
| Alerts and reports | Rules (negative spike, keyword, volume) evaluated live; printable report and CSV |
| Ask LENS | Claude answers from your own data (falls back to simple rules without AI) |
| Team | Roles owner / admin / analyst / viewer, invite by email, enforced by Firestore rules |
| Sources | News (Google News), blog RSS/Atom, X API, Facebook Page, Instagram Business, with status and failure messages |
| Collection | Cloud Function every 30 minutes and on demand ("Collect now"), de-duplicates, classifies with Claude (lexicon fallback) |

LinkedIn has no public API for mentions: use **Paste posts**. Facebook and Instagram only expose your own page/account
(posts, comments, tags), not the whole network.

## Deploy (about 20 minutes)
Cloud Functions and the 30-minute schedule need the **Blaze (pay as you go)** plan. Cost at MVP scale is cents per month
plus Claude API usage.

1. Firebase Console: create a project, upgrade to **Blaze**.
2. Build > Authentication > enable **Email/Password**. Build > Firestore Database > create (production mode).
3. Project settings > Your apps > add a **Web app**, copy the config.
4. `cp .env.example .env` and paste the 6 values.
5. Get an Anthropic API key from https://console.anthropic.com
6. Run:
   ```
   npm install
   npx firebase-tools login
   npx firebase-tools use --add                       # choose your project
   (skipped: AI keys are now set in the app, Settings > AI)   # paste the key when asked
   npm run deploy                                     # web app + rules + functions
   ```
7. Open `https://<project-id>.web.app`, create your account, verify the email, finish setup,
   then Settings > Sources and press **Collect now**.

Optional sources: an X API bearer token (needs a paid X API tier with recent search), a Facebook Page access token + Page ID,
an Instagram Business user ID + token. Paste them in Settings > Sources. They are saved in
`users/<workspace>/private/sources`, which Firestore rules allow only the owner and admins to read.

## Without Firebase keys
`npm run dev` works with no `.env`: demo mode stores data in the browser, with demo data, team roles and all screens.
Cloud collection and AI replies need the deployed functions.

## Project layout
```
src/            web app (pages, data layer, Arabic strings in i18n.ts, lexicon fallback in nlp.ts)
functions/src/  collect.ts (orchestration), sources.ts (RSS, X, Facebook, Instagram), ai.ts (Claude), index.ts (functions)
firestore.rules role-based access  |  firebase.json hosting + functions config
```
Tests for the collectors: `cd functions && npm install && npm test`.


## Free AI and free sources (no paid keys needed)

**Chatbot / AI (Settings > AI).** Pick a provider and paste its key; no CLI step and no secret to deploy.
| Provider | Cost | Key from |
|---|---|---|
| Google Gemini | free tier | https://aistudio.google.com/apikey |
| Groq (Llama) | free tier | https://console.groq.com/keys |
| OpenRouter (free models) | free | https://openrouter.ai/keys |
| No key (best effort) | free, may be slow; your mentions are sent to a public endpoint | none |
| Claude | paid | https://console.anthropic.com |

The key powers Ask LENS, reply drafts and sentiment of collected posts. If the provider fails, LENS tries the no-key endpoint, then the built-in rules. AI is off until you choose a provider. In demo mode the browser calls the provider directly; with Firebase the Cloud Functions do.

**Free sources (Settings > Sources):** Google News, Bing News, Reddit, Mastodon (hashtags), GDELT, Hacker News. No keys. Reddit can block some cloud IPs; the status line shows it.

**Report:** Reports > Download PDF (also CSV and Print). **Logo:** replace `public/logo-mark.svg` (app mark), `public/logo.svg` (PDF header) and `public/favicon.svg`; the PNG icons are `public/icon-*.png`.

The old `ANTHROPIC_API_KEY` secret is no longer needed: skip the `functions:secrets:set` step.
