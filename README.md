# DSG Campaign Manager v3.0

**Digital Search Group – Internal Campaign & Authority Engineering Platform**

---

## Project Overview

A full-stack campaign management system built for Digital Search Group (DSG) to manage client SEO campaigns, authority engineering plans, proposals, onboarding, and reporting. Built on Hono + Cloudflare Pages + D1 SQLite.

---

## Live URLs

- **Application**: http://localhost:3000 (sandbox) or your Cloudflare Pages URL
- **Login**: `admin@digitalsearchgroup.com.au` / `DSGadmin2025!`

---

## Completed Features

### 🔐 Authentication & Role-Based Access
- Team login with session tokens (cookie + Bearer)
- Two roles: **Project Manager** (full access) and **Project Executor** (limited)
- Audit log for all user actions, force password change on first login

### 👥 Client Management
- Full CRUD for clients with contact info, ABN, CMS, GA4/GSC/GBP IDs
- Client status: active, prospect, paused, churned
- Onboarding status banner in client detail view
- Client-scoped data isolation throughout

### 📋 Campaign Plans & Authority Task Board *(New in v3.0)*
- **4-tier Authority Framework**: AI Authority Foundation ($1,497), AI Authority Growth ($2,497), AI Authority Accelerator ($3,997), AI Market Domination ($5,997)
- **Auto-generated 12-month task boards** from deliverable catalogue (72 deliverables, 108–180 tasks per tier)
- **4 Strategic Phases**: Authority Foundation → Authority Expansion → Authority Acceleration → Authority Compounding
- Phase progress tracking with visual progress bars and percentage indicators
- Task status management: pending → in_progress → review → completed → blocked/skipped
- **Bulk operations**: "Assign All to Me" and "Complete Month" buttons
- Task edit modal: status, assignee, deliverable URL, reference URL, notes, client visibility toggle
- Quick-complete button with hover animation
- Filter by status and phase

### 📊 Campaign Proposals
- Authority tier selector with auto-fill pricing and scope
- Premium proposal generator with tier-aware deliverables and authority language
- Client-facing approval page with gradient hero, 4-phase framework, line items breakdown
- Investment summary with total engagement value calculation
- Proposal states: draft → sent → approved/rejected → active & billing

### 📈 Authority Velocity Reporting *(Enhanced in v3.0)*
- Authority-branded report view with phase progress section
- Campaign plan phase completion embedded in reports
- Auto-generated summary with authority language
- Report states: generated → sent → viewed

### 🔍 SEO & Keyword Tracking
- Keywords per campaign with DataForSEO rank tracking integration
- Rank history and change indicators (↑/↓)
- Demo data: 8 keywords for BlueSky Legal, 6 for Coastal Dental

### 🤖 AI/LLM Visibility Tracking
- Track brand mentions across ChatGPT, Gemini, Perplexity, Google AI Overviews
- Per-campaign prompt management with mention history

### 📝 Content Management
- Content items pipeline with status tracking
- Content types: Blog Post, Guide, White Paper, Press Release, etc.

### 📱 Social Media & Press Releases
- Social post scheduling with platform selection
- Press release management with distribution links

### 🌐 WordPress Project Management
- WP project tracking with milestone management
- Plugin/theme management integration

### 👤 Team Management (PM only)
- Create/edit team users, role assignment
- Password change enforcement
- Audit log viewer

### 🔗 Client Onboarding
- Auto-created when proposal is approved
- Client-facing form with token-based access
- Status tracking: pending → in_progress → submitted → approved

---

## Architecture

```
webapp/
├── src/
│   ├── index.tsx                    # Main Hono app, public pages
│   └── routes/
│       ├── auth.ts                  # Login, logout, session management
│       ├── campaign-plans.ts        # Task board, tier management
│       ├── campaigns.ts             # Campaign CRUD
│       ├── clients.ts               # Client CRUD
│       ├── content.ts               # Content pipeline
│       ├── dashboard.ts             # Overview stats + MRR
│       ├── dataforseo.ts            # Rank tracking integration
│       ├── keywords.ts              # Keyword management
│       ├── llm-tracking.ts          # AI visibility tracking
│       ├── onboarding.ts            # Client onboarding
│       ├── payments.ts              # Billing & payments
│       ├── proposals.ts             # Proposal generation & management
│       ├── rank-tracking.ts         # Rank history
│       ├── reports.ts               # Authority velocity reports
│       ├── social-press.ts          # Social & PR management
│       └── wordpress.ts             # WordPress projects
├── public/static/
│   ├── app.js                       # Full SPA frontend (~4,500 lines)
│   └── styles.css                   # Custom styles
├── migrations/
│   ├── 0001_initial_schema.sql      # Clients, campaigns, keywords, LLM
│   ├── 0002_payments_billing.sql    # Billing, invoices
│   ├── 0003_wordpress_extended.sql  # WordPress projects
│   ├── 0004_onboarding.sql          # Client onboarding
│   ├── 0005_auth.sql                # Team users, sessions
│   ├── 0006_campaign_plans.sql      # Tiers, deliverables, tasks (72 deliverables)
│   └── 0007_demo_seed.sql           # Demo data for all campaigns
└── wrangler.jsonc
```

---

## Data Models

### Campaign Plans
- **plan_tiers**: 4 tiers with pricing, outcomes per phase
- **deliverable_catalogue**: 72 deliverables across 13 categories
- **tier_monthly_deliverables**: Month-by-month deliverable mappings
- **campaign_plans**: Active plans linked to campaigns
- **campaign_tasks**: Auto-generated tasks (108–180 per plan)

### Key Relationships
```
clients → campaigns → campaign_plans → campaign_tasks
                   ↘ proposals → (approval) → onboarding
                   ↘ keywords → rank_history
                   ↘ reports
```

---

## API Endpoints Summary

### Authentication
- `POST /api/auth/login` – Login with email/password
- `POST /api/auth/logout` – Logout
- `GET /api/auth/me` – Get current user

### Campaign Plans
- `GET /api/campaign-plans` – List all plans (with progress stats)
- `GET /api/campaign-plans/tiers` – List all 4 tiers
- `GET /api/campaign-plans/campaign/:id` – Full plan + tasks + phases for a campaign
- `POST /api/campaign-plans` – Create plan (auto-generates tasks)
- `PATCH /api/campaign-plans/tasks/:id` – Update single task
- `PATCH /api/campaign-plans/tasks/bulk` – Bulk update tasks
- `DELETE /api/campaign-plans/:id` – Delete plan + all tasks

### Proposals
- `GET /api/proposals` – List proposals
- `POST /api/proposals` – Create proposal
- `POST /api/proposals/generate` – AI-generate proposal content
- `POST /api/proposals/:id/send` – Send to client (creates approval link)
- `GET /proposals/approve/:token` – Client-facing approval page
- `POST /proposals/approve/:token` – Approve or decline

### Reports
- `POST /api/reports/generate` – Generate authority velocity report
- `GET /reports/view/:token` – Client-facing report view

---

## Demo Data (v3.0)

| Client | Campaign | Tier | Progress |
|--------|----------|------|----------|
| Apex Plumbing | Organic SEO | AI Authority Growth | Month 1 (7%) |
| BlueSky Legal | Brand Authority | AI Authority Accelerator | Month 6 (54%) |
| Coastal Dental | Local SEO | AI Authority Foundation | Month 1 (0%) |
| TechNova Solutions | — (prospect) | — | Draft proposal only |

---

## Deployment

### Local (Sandbox)
```bash
npm run build
pm2 start ecosystem.config.cjs
# Access: http://localhost:3000
```

### Cloudflare Pages (Production)
```bash
# Setup auth
setup_cloudflare_api_key  # tool

# Deploy
npm run build
npx wrangler pages deploy dist --project-name dsg-campaign-manager

# Apply migrations
npx wrangler d1 migrations apply dsg-production
```

---

## Technology Stack

- **Backend**: Hono v4 (TypeScript) on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS SPA (no framework) + Tailwind CSS (CDN)
- **Icons**: Font Awesome 6
- **Build**: Vite + @hono/vite-cloudflare-pages
- **Process Manager**: PM2 (sandbox)

---

## Status
- **Version**: 3.0
- **Last Updated**: March 2026
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active Development
