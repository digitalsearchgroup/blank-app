# DSG Campaign Manager

## Project Overview
**Digital Search Group — Organic Digital Marketing Campaign Management System**

A full-cycle client relationship management platform built specifically for Digital Search Group, covering the complete organic digital marketing workflow from initial proposal to active campaign monitoring and client reporting.

---

## 🌐 Live URL
**Sandbox:** https://3000-iaa4h2gcqpeo5dftp228u-d0b9e1e2.sandbox.novita.ai

---

## ✅ Features Implemented

### 📋 Client Relationship Management
- Full client database (company, contact, website, industry, location, budget)
- Client status tracking: Prospect → Active → Paused → Churned
- Client detail view with campaign history, proposals, and activity log

### 📄 Proposal Generation & Approval Workflow
- **AI-powered proposal auto-generation** — enter client + keywords → get full proposal scope, deliverables, and goals
- Proposal types: Organic SEO, Local SEO, Content, Technical SEO, Full Service
- One-click "Send to Client" with **unique tokenized approval link**
- Client-facing approval page (no login required) — client can approve or decline with reason
- Auto-creates campaign when proposal is approved

### 🚀 Campaign Management
- Multi-client campaign tracking
- Campaign types, status, investment, and goals
- Direct campaign → keyword → LLM prompt association

### 📈 Rank Tracking (DataForSEO)
- Keyword rank monitoring with position history
- Current vs previous position comparison with ↑/↓ indicators
- Top 3 / Top 10 / Top 30 breakdown
- SERP feature detection (AI Overview, Featured Snippet, Local Pack, PAA)
- Keyword groups, difficulty, search volume, CPC data
- **Live mode**: DataForSEO SERP API · **Demo mode**: simulated data

### 🤖 AI/LLM Visibility Tracking
- Track brand mentions across ChatGPT, Gemini, Claude, Perplexity
- Custom prompt management per campaign
- Mention rate tracking (mentioned / not mentioned)
- Sentiment analysis (positive / neutral / negative)
- Mention rank tracking (position within LLM response)
- Historical trend data per prompt
- **Live mode**: DataForSEO AI Optimization API · **Demo mode**: simulated

### ✍️ Content Management
- Full content calendar with pipeline stages: Planned → Briefed → In Progress → Review → Approved → Published
- Content types: Blog Post, Landing Page, FAQ Page, Meta Optimization, Guest Post, Press Release
- **AI brief generator** — enter keyword + type → get structured SEO content brief
- Target keyword, word count, due date tracking
- One-click status updates

### 📊 Service Delivery Reports
- Monthly/Quarterly/Weekly report generation
- AI-generated executive summary
- Keyword improvement/decline summary
- Top 10 / Top 3 keyword count
- LLM mention statistics
- Content published count
- **Shareable tokenized report URL** — send to client without login
- Report status tracking (Generated → Sent → Viewed)

### 🔬 DataForSEO Tools Panel
- **Keyword Research** — seed keyword suggestions with volume, KD, CPC
- **SERP Analysis** — live top 10 results + SERP features
- **Competitor Analysis** — organic traffic, keywords, top competitors
- **Backlink Checker** — backlink count, referring domains, domain rank
- Connection status indicator (Live/Demo mode)

---

## 🗺️ Navigation Structure

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | MRR, pending proposals, upcoming content, activity |
| Clients | `/` → Clients | Client list, add client |
| Client Detail | (click client) | Full profile, campaigns, proposals |
| Campaigns | `/` → Campaigns | All campaigns |
| Campaign Detail | (click campaign) | Keywords, LLM, track + report |
| Proposals | `/` → Proposals | List, send, copy approval link |
| New Proposal | (button) | AI-generated proposal builder |
| Rank Tracking | `/` → Rank Tracking | All keywords across all campaigns |
| AI Visibility | `/` → AI Visibility | All LLM prompts |
| Content | `/` → Content | Content calendar |
| Reports | `/` → Reports | Generate, view, send reports |
| DataForSEO | `/` → DataForSEO | Research tools |

---

## 🔑 API Endpoints

### Clients
- `GET /api/clients` — List all clients
- `POST /api/clients` — Create client
- `GET /api/clients/:id` — Client detail with campaigns & proposals
- `PUT /api/clients/:id` — Update client

### Proposals
- `GET /api/proposals` — All proposals
- `POST /api/proposals/generate` — AI generate proposal content
- `POST /api/proposals` — Save proposal
- `POST /api/proposals/:id/send` — Send to client
- `GET /proposals/approve/:token` — Client approval page
- `POST /proposals/approve/:token` — Submit approval/decline

### Campaigns
- `GET /api/campaigns` — All campaigns
- `POST /api/campaigns` — Create campaign
- `GET /api/campaigns/:id` — Campaign detail

### Keywords & Rank Tracking
- `GET /api/keywords?campaign_id=` — Keywords with current ranks
- `POST /api/keywords/bulk` — Add multiple keywords
- `POST /api/rank-tracking/track/:campaignId` — Track rankings (DataForSEO/demo)
- `GET /api/rank-tracking/campaign/:campaignId` — Ranking summary
- `GET /api/rank-tracking/serp-analysis?keyword=` — SERP analysis

### LLM Tracking
- `GET /api/llm/prompts?campaign_id=` — LLM prompts
- `POST /api/llm/prompts` — Add prompt
- `POST /api/llm/track/:campaignId` — Check mentions (DataForSEO/demo)
- `GET /api/llm/summary/:campaignId` — Mention rate summary

### Content
- `GET /api/content` — All content items
- `POST /api/content` — Create content item
- `PUT /api/content/:id` — Update (status, brief, body)
- `POST /api/content/generate-brief` — AI SEO content brief

### Reports
- `GET /api/reports` — All reports
- `POST /api/reports/generate` — Generate report
- `POST /api/reports/:id/send` — Mark as sent
- `GET /reports/view/:token` — Public report view

### DataForSEO Tools
- `GET /api/dataforseo/status` — Connection status
- `POST /api/dataforseo/keyword-research` — Keyword suggestions
- `POST /api/dataforseo/competitor-analysis` — Competitor data
- `POST /api/dataforseo/backlinks` — Backlink summary

---

## 🗄️ Data Models

| Table | Description |
|-------|-------------|
| `clients` | Client profiles |
| `proposals` | Proposals with approval tokens |
| `campaigns` | Active SEO campaigns |
| `keywords` | Tracked keywords per campaign |
| `rank_history` | Historical rank positions |
| `llm_prompts` | LLM visibility prompts |
| `llm_mention_history` | Historical mention data |
| `content_items` | Content calendar items |
| `reports` | Generated performance reports |
| `competitors` | Competitor domains per campaign |
| `activity_log` | System activity trail |

**Storage:** Cloudflare D1 (SQLite)

---

## ⚙️ Configuration

### DataForSEO (Optional — app runs in demo mode without it)
```bash
# Add to .dev.vars for local dev
DATAFORSEO_LOGIN=your_login
DATAFORSEO_PASSWORD=your_password

# For production Cloudflare deployment:
npx wrangler pages secret put DATAFORSEO_LOGIN --project-name dsg-campaign-manager
npx wrangler pages secret put DATAFORSEO_PASSWORD --project-name dsg-campaign-manager
```

### Demo Mode
Without DataForSEO credentials:
- Rank tracking uses **simulated position data** (realistic random movements)
- LLM tracking uses **simulated mention data**
- All other features work fully

---

## 🚀 Deployment

### Local Dev (Sandbox)
```bash
npm run db:migrate:local
npm run db:seed
npm run build
pm2 start ecosystem.config.cjs
```

### Cloudflare Pages Production
```bash
npx wrangler d1 create dsg-production
# Update database_id in wrangler.jsonc
npm run db:migrate:local  # for local, remove --local for prod
npm run deploy
```

---

## 💻 Tech Stack
- **Backend:** Hono (TypeScript) on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** Vanilla JS SPA + Tailwind CSS (CDN) + Chart.js + Axios
- **Data:** DataForSEO API (SERP, Keywords, Backlinks, AI Optimization/LLM Mentions)
- **Build:** Vite + @hono/vite-build
- **Process:** PM2 (dev), Wrangler (deploy)

---

## 📅 Status
- ✅ All core modules implemented
- ✅ DataForSEO API integration (live + demo mode)
- ✅ Demo data seeded (4 clients, 3 campaigns, 10 keywords, 4 LLM prompts, 5 content items)
- ✅ Proposal approval workflow (tokenized public links)
- ✅ Report generation with public shareable links
- **Last Updated:** March 2026
