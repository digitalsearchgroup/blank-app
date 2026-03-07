import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// Routes
import { clientsRoutes } from './routes/clients'
import { proposalsRoutes } from './routes/proposals'
import { campaignsRoutes } from './routes/campaigns'
import { keywordsRoutes } from './routes/keywords'
import { rankTrackingRoutes } from './routes/rank-tracking'
import { llmRoutes } from './routes/llm-tracking'
import { contentRoutes } from './routes/content'
import { reportsRoutes } from './routes/reports'
import { dashboardRoutes } from './routes/dashboard'
import { dataforseoRoutes } from './routes/dataforseo'
import { paymentsRoutes } from './routes/payments'
import { wordpressRoutes } from './routes/wordpress'
import { socialRoutes, pressReleaseRoutes } from './routes/social-press'
import { onboardingRoutes } from './routes/onboarding'
import { campaignPlansRoutes } from './routes/campaign-plans'
import { authRoutes, getSessionUser, getTokenFromRequest, hasPermission } from './routes/auth'

type Bindings = {
  DB: D1Database
  DATAFORSEO_LOGIN: string
  DATAFORSEO_PASSWORD: string
  OPENAI_API_KEY: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  APP_URL: string
  SENDGRID_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors())

// -------------------------------------------------------
// Auth routes (public – no session required)
// -------------------------------------------------------
app.route('/api/auth', authRoutes)

// -------------------------------------------------------
// Global session middleware – protects all /api/* routes
// except /api/auth/* which are public
// -------------------------------------------------------
app.use('/api/*', async (c, next) => {
  // Auth routes are exempt
  if (c.req.path.startsWith('/api/auth')) return next()
  const token = getTokenFromRequest(c.req.raw)
  const user = await getSessionUser(c.env.DB, token)
  if (!user) return c.json({ error: 'Unauthorised – please log in', code: 'UNAUTHENTICATED' }, 401)
  // Attach user to context variable for downstream routes
  c.set('currentUser' as any, user)
  return next()
})

// -------------------------------------------------------
// Role enforcement helpers (used by route handlers)
// -------------------------------------------------------
// PM-only routes: payments, user management, billing
const pmOnly = async (c: any, next: any) => {
  const user = c.get('currentUser' as any) as any
  if (!user || user.role !== 'project_manager') {
    return c.json({ error: 'This action requires Project Manager access', code: 'FORBIDDEN' }, 403)
  }
  return next()
}

// API routes
app.route('/api/clients', clientsRoutes)
app.route('/api/proposals', proposalsRoutes)
app.route('/api/campaigns', campaignsRoutes)
app.route('/api/keywords', keywordsRoutes)
app.route('/api/rank-tracking', rankTrackingRoutes)
app.route('/api/llm', llmRoutes)
app.route('/api/content', contentRoutes)
app.route('/api/reports', reportsRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/dataforseo', dataforseoRoutes)
app.use('/api/payments/*', pmOnly)
app.route('/api/payments', paymentsRoutes)
app.route('/api/wordpress', wordpressRoutes)
app.route('/api/social', socialRoutes)
app.route('/api/press-releases', pressReleaseRoutes)
app.route('/api/onboarding', onboardingRoutes)
app.route('/api/campaign-plans', campaignPlansRoutes)

// -------------------------------------------------------
// GET /login – login page (always public)
// GET / – SPA (protected; redirects to /login if no session)
// -------------------------------------------------------
app.get('/login', (c) => c.html(getLoginPageHTML()))
app.post('/login', async (c) => {
  // Handled by frontend JS posting to /api/auth/login
  return c.redirect('/login')
})

// Public proposal approval page
app.get('/proposals/approve/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB
  
  const proposal = await db.prepare(`
    SELECT p.*, cl.company_name, cl.contact_name, cl.website
    FROM proposals p
    JOIN clients cl ON p.client_id = cl.id
    WHERE p.approval_token = ? AND p.status = 'sent'
  `).bind(token).first() as any

  if (!proposal) {
    return c.html(getApprovalPageHTML(null, 'invalid', token))
  }

  const isExpired = proposal.expires_at && new Date(proposal.expires_at) < new Date()
  if (isExpired) {
    return c.html(getApprovalPageHTML(proposal, 'expired', token))
  }

  return c.html(getApprovalPageHTML(proposal, 'pending', token))
})

app.post('/proposals/approve/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB
  const { action, rejection_reason } = await c.req.json()

  const proposal = await db.prepare(
    "SELECT * FROM proposals WHERE approval_token = ? AND status = 'sent'"
  ).bind(token).first() as any

  if (!proposal) {
    return c.json({ error: 'Invalid or expired proposal' }, 404)
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected'
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE proposals SET status = ?, ${action === 'approve' ? 'approved_at' : ''} ${action === 'approve' ? '= ?,' : ''} ${action === 'reject' ? 'rejection_reason = ?,' : ''} updated_at = ?
    WHERE approval_token = ?
  `).bind(
    newStatus,
    ...(action === 'approve' ? [now] : [rejection_reason || '']),
    now,
    token
  ).run()

  if (action === 'approve') {
    // Auto-create campaign from approved proposal
    await db.prepare(`
      INSERT INTO campaigns (client_id, proposal_id, name, campaign_type, status, start_date, monthly_investment, target_locations, goals)
      SELECT client_id, id, title, proposal_type, 'active', date('now'), monthly_investment, target_locations, goals
      FROM proposals WHERE approval_token = ?
    `).bind(token).run()

    // Auto-create onboarding form when proposal is approved
    const existingOnboarding = await db.prepare(
      "SELECT id FROM client_onboarding WHERE client_id = ? AND status NOT IN ('approved','archived')"
    ).bind(proposal.client_id).first()

    if (!existingOnboarding) {
      // Generate unique onboarding token
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let obToken = ''
      for (let i = 0; i < 40; i++) obToken += chars[Math.floor(Math.random() * chars.length)]

      // Get campaign ID that was just created
      const campaign = await db.prepare(
        "SELECT id FROM campaigns WHERE proposal_id = ? ORDER BY id DESC LIMIT 1"
      ).bind(proposal.id).first() as any

      const d = new Date(); d.setDate(d.getDate() + 2)
      const nextReminder = d.toISOString()

      const obResult = await db.prepare(`
        INSERT INTO client_onboarding (client_id, campaign_id, proposal_id, status, onboarding_token, next_reminder_at, reminder_channel)
        VALUES (?, ?, ?, 'pending', ?, ?, 'email')
      `).bind(proposal.client_id, campaign?.id || null, proposal.id, obToken, nextReminder).run()

      await db.prepare(
        "UPDATE clients SET onboarding_status = 'sent', onboarding_id = ? WHERE id = ?"
      ).bind(obResult.meta.last_row_id, proposal.client_id).run()
    }

    // Log activity
    await db.prepare(`
      INSERT INTO activity_log (client_id, activity_type, description)
      VALUES (?, 'proposal_approved', 'Proposal approved by client – onboarding form sent automatically')
    `).bind(proposal.client_id).run()
  }

  return c.json({ success: true, status: newStatus })
})

// Public onboarding form page - served to clients
app.get('/onboarding/:token', async (c) => {
  const token = c.req.param('token')
  return c.html(getOnboardingFormHTML(token))
})

// Public report view page
app.get('/reports/view/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB

  const report = await db.prepare(`
    SELECT r.*, cl.company_name, cl.website, c.name as campaign_name
    FROM reports r
    JOIN clients cl ON r.client_id = cl.id
    JOIN campaigns c ON r.campaign_id = c.id
    WHERE r.report_token = ?
  `).bind(token).first() as any

  if (!report) {
    return c.html('<h1>Report not found</h1>', 404)
  }

  // Mark as viewed
  if (report.status === 'sent') {
    await db.prepare(
      "UPDATE reports SET status = 'viewed', viewed_at = ? WHERE report_token = ?"
    ).bind(new Date().toISOString(), token).run()
  }

  return c.html(getReportViewHTML(report))
})

// Main app - serve SPA (protected - redirect to login if no session)
app.get('*', async (c) => {
  // Public paths that don't need auth
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/proposals/') || path.startsWith('/onboarding/') || path.startsWith('/reports/') || path === '/login') {
    return c.html(getAppHTML())
  }
  // Check session
  const token = getTokenFromRequest(c.req.raw)
  const user = await getSessionUser(c.env.DB, token)
  if (!user) return c.redirect('/login')
  return c.html(getAppHTML())
})

function getApprovalPageHTML(proposal: any, pageState: string, token: string = ''): string {
  // Parse line items if available
  let lineItems: any[] = []
  if (proposal?.line_items) {
    try { lineItems = JSON.parse(proposal.line_items) } catch {}
  }

  const totalInv = Number(proposal?.monthly_investment || 0)
  const contractLen = Number(proposal?.contract_length || 12)
  const setupFee = Number(proposal?.setup_fee || 0)
  const totalValue = totalInv * contractLen + setupFee

  // Authority tier map for client-facing names
  const tierMap: Record<string,{name:string,color:string,tagline:string}> = {
    basic:   { name: 'AI Authority Foundation',   color: '#7C5CFC', tagline: 'Core authority placement with foundational media trust signals' },
    core:    { name: 'AI Authority Growth',        color: '#7c3aed', tagline: 'Multi-tier authority placements with quarterly media injections' },
    ultimate:{ name: 'AI Authority Accelerator',  color: '#ea580c', tagline: 'High-velocity placements, premium media injections & amplification' },
    xtreme:  { name: 'AI Market Domination',       color: '#16a34a', tagline: 'Maximum authority velocity across all channels with full AI optimisation' },
  }
  const tierKey = proposal?.tier_key || ''
  const tier = tierMap[tierKey]

  if (pageState !== 'pending' || !proposal) {
    const msgs: Record<string,{title:string,msg:string,icon:string}> = {
      invalid: { title: 'Invalid Proposal Link', msg: 'This proposal link is invalid or has already been actioned. Please contact us if you believe this is an error.', icon: '❌' },
      expired: { title: 'Proposal Expired', msg: 'This proposal has expired. Please contact Digital Search Group to request an updated proposal.', icon: '⏰' },
    }
    const m = msgs[pageState] || msgs.invalid
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>DSG Proposal</title><script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head><body class="bg-gradient-to-br from-slate-900 to-blue-900 min-h-screen flex items-center justify-center p-4">
<div class="text-center bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full">
  <div class="text-6xl mb-4">${m.icon}</div>
  <h1 class="text-2xl font-bold text-gray-900 mb-3">${m.title}</h1>
  <p class="text-gray-500 mb-6">${m.msg}</p>
  <a href="mailto:hello@digitalsearchgroup.com.au" class="inline-flex items-center gap-2 text-white font-semibold py-3 px-6 rounded-xl transition" style="background:#7C5CFC">
    <i class="fas fa-envelope"></i> Contact Our Team
  </a>
</div></body></html>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${proposal.title} — Digital Search Group</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    h1, h2, h3, h4, h5, .font-bold.text-xl, .font-bold.text-2xl, .font-bold.text-3xl { font-family: 'Maven Pro', 'Montserrat', sans-serif; }
    .gradient-hero { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%); }
    .tier-badge { background: ${tier?.color || '#7C5CFC'}22; color: ${tier?.color || '#7C5CFC'}; border: 1px solid ${tier?.color || '#7C5CFC'}44; }
    .approve-btn { background: linear-gradient(135deg, #16a34a, #15803d); transition: all 0.2s; }
    .approve-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(22,163,74,0.4); }
    .phase-card { border-left: 3px solid; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- Hero Header -->
  <div class="gradient-hero text-white">
    <div class="max-w-4xl mx-auto px-4 py-10">
      <div class="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
            <i class="fas fa-chart-line text-white text-xl"></i>
          </div>
          <div>
            <div class="text-blue-200 text-xs font-semibold uppercase tracking-widest">Digital Search Group</div>
            <div class="text-white font-bold text-lg">Authority Engineering Proposal</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-white">$${totalInv.toLocaleString()}<span class="text-blue-200 text-base font-normal">/mo</span></div>
          <div class="text-blue-200 text-sm">${contractLen} months · Total $${totalValue.toLocaleString()}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white/10 rounded-2xl p-4 backdrop-blur">
          <div class="text-blue-200 text-xs mb-1">Prepared For</div>
          <div class="font-semibold text-white">${proposal.company_name}</div>
          ${proposal.contact_name ? `<div class="text-blue-200 text-sm">${proposal.contact_name}</div>` : ''}
        </div>
        <div class="bg-white/10 rounded-2xl p-4 backdrop-blur">
          <div class="text-blue-200 text-xs mb-1">Service Package</div>
          <div class="font-semibold text-white capitalize">${(proposal.proposal_type || '').replace(/_/g,' ')}</div>
          ${tier ? `<div class="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tier-badge"><i class="fas fa-shield-halved"></i>${tier.name}</div>` : ''}
        </div>
        <div class="bg-white/10 rounded-2xl p-4 backdrop-blur">
          <div class="text-blue-200 text-xs mb-1">Engagement Period</div>
          <div class="font-semibold text-white">${contractLen} months</div>
          ${setupFee > 0 ? `<div class="text-blue-200 text-sm">+ $${setupFee.toLocaleString()} setup</div>` : '<div class="text-blue-200 text-sm">No setup fee</div>'}
        </div>
      </div>
    </div>
  </div>

  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">

    <!-- Scope of Work -->
    ${proposal.scope_summary ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><i class="fas fa-file-lines text-blue-500"></i> Scope of Work</h2>
      <p class="text-gray-600 leading-relaxed">${proposal.scope_summary}</p>
    </div>` : ''}

    <!-- 4-Phase Authority Framework -->
    ${tier ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2"><i class="fas fa-layer-group text-purple-500"></i> 12-Month Authority Framework</h2>
      <p class="text-sm text-gray-500 mb-5">Your engagement is structured in four strategic phases, each building on the last.</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${[
          { ph: 1, name: 'Authority Foundation',   months: 'Months 1–3',  color: '#2563eb', icon: 'fa-seedling',  desc: 'Establish technical infrastructure, entity alignment, and baseline authority signals.' },
          { ph: 2, name: 'Authority Expansion',    months: 'Months 4–6',  color: '#7c3aed', icon: 'fa-chart-line', desc: 'Scale authority placements, inject media trust signals, and expand entity coverage.' },
          { ph: 3, name: 'Authority Acceleration', months: 'Months 7–9',  color: '#ea580c', icon: 'fa-rocket',    desc: 'High-velocity authority amplification with AI optimisation and citation building.' },
          { ph: 4, name: 'Authority Compounding',  months: 'Months 10–12',color: '#16a34a', icon: 'fa-crown',    desc: 'Compound authority signals, dominate AI-generated search, and cement brand authority.' },
        ].map(p => `
          <div class="phase-card rounded-xl p-4 bg-gray-50" style="border-color:${p.color}">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold" style="background:${p.color}">
                <i class="fas ${p.icon}"></i>
              </div>
              <div>
                <div class="font-semibold text-gray-900 text-sm">Phase ${p.ph} – ${p.name}</div>
                <div class="text-xs" style="color:${p.color}">${p.months}</div>
              </div>
            </div>
            <p class="text-xs text-gray-500">${p.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Deliverables / Line Items -->
    ${lineItems.length > 0 ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><i class="fas fa-list-check text-green-500"></i> Included Deliverables</h2>
      <div class="divide-y divide-gray-50">
        ${lineItems.map((item: any) => `
        <div class="flex items-center justify-between py-3">
          <div class="flex items-start gap-3">
            <div class="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i class="fas fa-check text-green-600 text-xs"></i>
            </div>
            <div>
              <div class="font-medium text-gray-800 text-sm">${item.description || item.name || ''}</div>
              ${item.notes ? `<div class="text-xs text-gray-400">${item.notes}</div>` : ''}
            </div>
          </div>
          ${item.monthly_price ? `<div class="text-sm font-semibold text-gray-700 whitespace-nowrap ml-4">$${Number(item.monthly_price).toLocaleString()}/mo</div>` : ''}
        </div>`).join('')}
      </div>
    </div>` : (proposal.deliverables ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><i class="fas fa-list-check text-green-500"></i> Deliverables</h2>
      <div class="text-gray-600 text-sm leading-relaxed whitespace-pre-line">${proposal.deliverables}</div>
    </div>` : '')}

    <!-- Goals -->
    ${proposal.goals ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><i class="fas fa-bullseye text-red-500"></i> Campaign Goals</h2>
      <div class="text-gray-600 text-sm leading-relaxed whitespace-pre-line">${proposal.goals}</div>
    </div>` : ''}

    <!-- Target Keywords -->
    ${proposal.target_keywords ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><i class="fas fa-magnifying-glass text-blue-500"></i> Target Keywords</h2>
      <div class="flex flex-wrap gap-2">
        ${proposal.target_keywords.split(',').map((kw: string) => `<span class="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">${kw.trim()}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Investment Summary -->
    <div class="rounded-2xl border p-6" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-color:#c4b5fd">
      <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><i class="fas fa-receipt text-violet-600"></i> Investment Summary</h2>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between"><span class="text-gray-600">Monthly retainer</span><span class="font-semibold text-gray-900">$${totalInv.toLocaleString()}/month</span></div>
        <div class="flex justify-between"><span class="text-gray-600">Engagement period</span><span class="font-semibold text-gray-900">${contractLen} months</span></div>
        ${setupFee > 0 ? `<div class="flex justify-between"><span class="text-gray-600">Setup fee (once)</span><span class="font-semibold text-gray-900">$${setupFee.toLocaleString()}</span></div>` : ''}
        <div class="flex justify-between border-t border-violet-200 pt-2 mt-2">
          <span class="font-bold text-gray-900">Total engagement value</span>
          <span class="font-bold text-blue-700 text-lg">$${totalValue.toLocaleString()}</span>
        </div>
      </div>
    </div>

    <!-- Decision Buttons -->
    <div id="decisionSection" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <p class="text-sm text-gray-500 mb-5 text-center">By approving this proposal, you agree to engage Digital Search Group for the services outlined above under a ${contractLen}-month contract.</p>
      <div class="flex gap-4 flex-wrap">
        <button onclick="handleDecision('approve')" class="approve-btn flex-1 min-w-40 text-white font-bold py-4 px-6 rounded-xl text-base flex items-center justify-center gap-2">
          <i class="fas fa-check-circle"></i> Approve & Begin
        </button>
        <button onclick="showRejectForm()" class="flex-1 min-w-32 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-4 px-6 rounded-xl transition flex items-center justify-center gap-2">
          <i class="fas fa-times-circle"></i> Decline
        </button>
      </div>
      <div id="rejectForm" class="hidden mt-5 border-t pt-5">
        <label class="text-sm font-medium text-gray-700 mb-2 block">Reason for declining (optional)</label>
        <textarea id="rejectReason" class="w-full border border-gray-200 rounded-xl p-3 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" rows="3" placeholder="Please let us know why you're declining so we can improve..."></textarea>
        <button onclick="handleDecision('reject')" class="mt-3 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-6 rounded-xl transition">Confirm Decline</button>
      </div>
    </div>

    <div class="text-center text-gray-400 text-xs pb-8">
      <p>Digital Search Group · hello@digitalsearchgroup.com.au</p>
      <p class="mt-1">This proposal is confidential and prepared exclusively for ${proposal.company_name}</p>
    </div>
  </div>

  <script>
    const token = '${token}';
    function showRejectForm() {
      document.getElementById('rejectForm').classList.remove('hidden');
      document.getElementById('rejectForm').scrollIntoView({ behavior: 'smooth' });
    }
    async function handleDecision(action) {
      const btns = document.querySelectorAll('#decisionSection button');
      btns.forEach(b => b.disabled = true);
      const reason = document.getElementById('rejectReason')?.value || '';
      try {
        const res = await fetch('/proposals/approve/' + token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, rejection_reason: reason })
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById('decisionSection').innerHTML = action === 'approve' ? \`
            <div class="text-center py-6">
              <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-check text-green-600 text-2xl"></i>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Proposal Approved!</h3>
              <p class="text-gray-500">Thank you! Our team will be in touch within 24 hours to kick off your campaign.</p>
            </div>
          \` : \`
            <div class="text-center py-6">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-times text-gray-500 text-2xl"></i>
              </div>
              <h3 class="text-xl font-bold text-gray-900 mb-2">Proposal Declined</h3>
              <p class="text-gray-500">We've received your response. Feel free to reach out if you'd like to discuss a revised proposal.</p>
            </div>
          \`;
        }
      } catch (err) {
        btns.forEach(b => b.disabled = false);
        alert('Something went wrong. Please try again or contact us directly.');
      }
    }
  </script>
</body>
</html>`
}

function getReportViewHTML(report: any): string {
  const data = report.report_data ? JSON.parse(report.report_data) : {}
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authority Report – ${report.company_name} – ${report.report_period}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; }</style>
</head>
<body>
  <!-- Hero Header -->
  <div style="background: linear-gradient(135deg, #0f172a, #1e3a8a)" class="text-white">
    <div class="max-w-4xl mx-auto px-4 py-10">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
          <i class="fas fa-chart-line text-white text-xl"></i>
        </div>
        <div>
          <div class="text-blue-200 text-xs font-semibold uppercase tracking-widest">Digital Search Group</div>
          <div class="text-white font-bold text-lg">Authority Velocity Report</div>
        </div>
      </div>
      <h1 class="text-3xl font-bold">${report.company_name}</h1>
      <p class="text-blue-200 mt-1">${report.campaign_name} · ${report.report_type || 'Monthly'} Report · ${report.report_period}</p>
    </div>
  </div>

  <div class="max-w-4xl mx-auto px-4 py-8 space-y-6">

    <!-- Authority Velocity Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${[
        ['Keywords Improved', report.keywords_improved, 'fa-arrow-up', 'green'],
        ['In Top 10', report.top10_keywords, 'fa-star', 'blue'],
        ['In Top 3', report.top3_keywords || 0, 'fa-trophy', 'yellow'],
        ['Content Published', report.content_published, 'fa-pen-nib', 'purple'],
      ].map(([label, val, icon, color]) => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-center">
        <div class="w-10 h-10 rounded-xl bg-${color}-100 flex items-center justify-center mx-auto mb-3">
          <i class="fas ${icon} text-${color}-600"></i>
        </div>
        <div class="text-3xl font-bold text-gray-900">${val}</div>
        <div class="text-gray-500 text-xs mt-1">${label}</div>
      </div>`).join('')}
    </div>

    <!-- Summary -->
    ${report.summary ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
        <i class="fas fa-bolt text-yellow-500"></i> Authority Velocity Snapshot
      </h2>
      <p class="text-gray-600 leading-relaxed">${report.summary}</p>
    </div>` : ''}

    <!-- Keyword Performance -->
    ${data.keyword_highlights && data.keyword_highlights.length ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <i class="fas fa-magnifying-glass-chart text-blue-500"></i> Keyword Performance
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th class="text-left px-4 py-3 rounded-l-lg">Keyword</th>
              <th class="px-4 py-3 text-center">Previous</th>
              <th class="px-4 py-3 text-center">Current</th>
              <th class="px-4 py-3 text-center rounded-r-lg">Change</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${data.keyword_highlights.map((k: any) => `
            <tr class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-900">${k.keyword}</td>
              <td class="px-4 py-3 text-center text-gray-400">${k.previous || '–'}</td>
              <td class="px-4 py-3 text-center font-semibold">${k.current || '–'}</td>
              <td class="px-4 py-3 text-center font-semibold ${Number(k.change) < 0 ? 'text-green-600' : Number(k.change) > 0 ? 'text-red-500' : 'text-gray-400'}">
                ${Number(k.change) < 0 ? '<i class="fas fa-arrow-up mr-1"></i>' + Math.abs(Number(k.change)) : Number(k.change) > 0 ? '<i class="fas fa-arrow-down mr-1"></i>' + k.change : '–'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Authority Placements (if in data) -->
    ${data.authority_placements && data.authority_placements.length ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <i class="fas fa-newspaper text-violet-500"></i> Media & Authority Layer Update
      </h2>
      <div class="space-y-3">
        ${data.authority_placements.map((p: any) => `
        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
          <div class="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-external-link-alt text-violet-600 text-xs"></i>
          </div>
          <div>
            <div class="font-medium text-gray-800 text-sm">${p.title || p.url || 'Authority Placement'}</div>
            ${p.domain ? `<div class="text-xs text-gray-400">${p.domain}</div>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Campaign Plan Phase Progress (if available) -->
    ${data.plan_data ? `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
        <i class="fas fa-layer-group text-purple-500"></i> Authority Phase Progress
      </h2>
      <p class="text-sm text-gray-500 mb-5">${data.plan_data.tier} · ${data.plan_data.completed_tasks}/${data.plan_data.total_tasks} deliverables completed</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${(data.plan_data.phase_progress || []).map((ph: any, i: number) => {
          const colors = ['#7C5CFC','#7c3aed','#16a34a','#0ea5e9']
          const names = ['Authority Foundation','Authority Expansion','Authority Acceleration','Authority Compounding']
          const c = colors[i]
          return `
          <div class="rounded-xl p-4 bg-gray-50 border-l-4" style="border-color:${c}">
            <div class="text-xs font-semibold mb-1" style="color:${c}">Phase ${ph.phase}</div>
            <div class="font-bold text-gray-900 text-sm mb-2">${names[i]}</div>
            <div class="bg-gray-200 rounded-full h-2 mb-1">
              <div class="h-2 rounded-full" style="width:${ph.pct}%;background:${c}"></div>
            </div>
            <div class="text-xs text-gray-500">${ph.pct}% · ${ph.completed}/${ph.total} tasks</div>
          </div>`
        }).join('')}
      </div>
    </div>` : ''}

    <div class="text-center text-gray-400 text-xs pb-8 border-t border-gray-100 pt-6">
      <p>Prepared by <strong>Digital Search Group</strong> · hello@digitalsearchgroup.com.au</p>
      <p class="mt-1">© ${new Date().getFullYear()} Digital Search Group. Confidential.</p>
    </div>
  </div>
</body>
</html>`
}

function getAppHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DSG Campaign Manager – Digital Search Group</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%231a1a2e'/><text x='16' y='22' text-anchor='middle' font-size='16' font-weight='bold' font-family='Arial' fill='%237C5CFC'>D</text></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <style>
    /* DSG Brand Colors: --dsg-dark: #1a1a2e, --dsg-primary: #7C5CFC (violet), --dsg-charcoal: #313131 */
    :root {
      --dsg-dark: #1a1a2e;
      --dsg-dark-2: #16213e;
      --dsg-primary: #7C5CFC;
      --dsg-primary-hover: #6A4FE8;
      --dsg-charcoal: #313131;
    }

    /* Sidebar links */
    .sidebar-link {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem 1rem; border-radius: 0.75rem;
      color: #cbd5e1; /* slate-300 */
      background: transparent;
      border: none; transition: all 0.15s;
      cursor: pointer; width: 100%; text-align: left;
    }
    .sidebar-link:hover { color: #fff; background: rgba(255,255,255,0.1); }
    .sidebar-link.active { color: #fff; background: rgba(124,92,252,0.25); border-left: 3px solid #7C5CFC; }
    .sidebar-link i, .sidebar-link span { color: inherit; }

    /* Cards */
    .card { background: #fff; border-radius: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.07); border: 1px solid #f3f4f6; padding: 1.5rem; }

    /* Buttons — DSG Violet primary */
    .btn-primary { background: #7C5CFC; color: #fff; font-weight: 600; padding: 0.625rem 1.25rem; border-radius: 0.75rem; border: none; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; }
    .btn-primary:hover { background: #6A4FE8; }
    .btn-secondary { background: #f3f4f6; color: #374151; font-weight: 600; padding: 0.625rem 1.25rem; border-radius: 0.75rem; border: none; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-success { background: #16a34a; color: #fff; font-weight: 600; padding: 0.625rem 1.25rem; border-radius: 0.75rem; border: none; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; }
    .btn-success:hover { background: #15803d; }
    .btn-danger { background: #dc2626; color: #fff; font-weight: 600; padding: 0.625rem 1.25rem; border-radius: 0.75rem; border: none; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; }
    .btn-danger:hover { background: #b91c1c; }

    /* Inputs — DSG violet focus */
    .input-field { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.625rem 1rem; font-size: 0.875rem; outline: none; transition: box-shadow 0.15s; }
    .input-field:focus { box-shadow: 0 0 0 2px rgba(124,92,252,0.3); border-color: #7C5CFC; }
    /* Hide native browser spinners and clear buttons */
    input[type=number]::-webkit-inner-spin-button,
    input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; appearance: textfield; }
    input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
    input[type=search]::-webkit-search-cancel-button,
    input[type=search]::-webkit-search-decoration { -webkit-appearance: none; }

    /* Modals */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem; }
    .modal-overlay.hidden { display: none; }
    .modal-box { background: #fff; border-radius: 1rem; box-shadow: 0 25px 50px rgba(0,0,0,0.25); width: 100%; max-width: 42rem; max-height: 90vh; overflow-y: auto; }

    /* Misc */
    .rank-improved { color: #16a34a; }
    .rank-declined { color: #dc2626; }
    .rank-new { color: #7C5CFC; }
    body { font-family: 'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #313131; }
    h1, h2, h3, h4, h5, h6, .font-heading { font-family: 'Maven Pro', 'Montserrat', system-ui, sans-serif; font-weight: 700; }
    .text-lg.font-bold, .text-xl.font-bold, .text-2xl.font-bold, .text-3xl.font-bold { font-family: 'Maven Pro', 'Montserrat', system-ui, sans-serif; }
    .shimmer { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; transform: translateY(100px); opacity: 0; transition: all 0.3s; }
    .toast.show { transform: translateY(0); opacity: 1; }
    /* DSG Logo mark in sidebar */
    .dsg-logo-mark { width: 36px; height: 36px; background: #7C5CFC; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; color: #fff; letter-spacing: -1px; flex-shrink: 0; }
  </style>
</head>
<body class="bg-gray-50">
  <div id="app"></div>
  <div id="toast" class="toast bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm"></div>
  <script src="/static/app.js"></script>
</body>
</html>`
}

function getOnboardingFormHTML(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client Onboarding – Digital Search Group</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <style>
    .step { display: none; }
    .step.active { display: block; }
    .tab-btn.active { background: #7C5CFC; color: #fff; }
    input, textarea, select { transition: border-color 0.15s; }
    input:focus, textarea:focus, select:focus { outline: none; border-color: #7C5CFC; box-shadow: 0 0 0 3px rgba(124,92,252,0.1); }
    .progress-bar { transition: width 0.4s ease; }
    .section-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 16px; background: #fff; }
    .field-row { margin-bottom: 20px; }
    body, input, select, textarea { font-family: 'Montserrat', system-ui, sans-serif; }
    h1, h2, h3, h4, .section-title { font-family: 'Maven Pro', 'Montserrat', system-ui, sans-serif; }
    label { font-size: 14px; font-weight: 500; color: #374151; display: block; margin-bottom: 6px; }
    label .req { color: #ef4444; }
    input[type=text], input[type=email], input[type=url], input[type=tel], input[type=number], textarea, select {
      width: 100%; padding: 10px 14px; border: 1.5px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff; color: #1e293b;
    }
    textarea { min-height: 90px; resize: vertical; }
    .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .chip-group { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
    .chip { padding: 4px 12px; border-radius: 20px; border: 1.5px solid #cbd5e1; font-size: 13px; cursor: pointer; user-select: none; }
    .chip.selected { border-color: #7C5CFC; background: #f5f3ff; color: #7C5CFC; }
    .section-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .section-sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .save-indicator { font-size: 12px; color: #22c55e; display: none; }
    .save-indicator.show { display: inline; }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-violet-50 min-h-screen">

  <!-- Header -->
  <div class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
    <div class="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:#7C5CFC">
          <span style="font-size:14px;font-weight:900;color:#fff">DSG</span>
        </div>
        <div>
          <div class="font-bold text-slate-800 text-lg">Digital Search Group</div>
          <div class="text-xs text-slate-400" id="headerCompany">Client Onboarding</div>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div class="text-right hidden sm:block">
          <div class="text-xs text-slate-400">Form Completion</div>
          <div class="text-sm font-bold" style="color:#7C5CFC" id="headerPct">0%</div>
        </div>
        <div class="w-32 bg-slate-100 rounded-full h-2 hidden sm:block">
          <div class="progress-bar h-2 rounded-full" id="headerProgress" style="width:0%;background:#7C5CFC"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Intro -->
  <div id="introScreen" class="max-w-4xl mx-auto px-6 py-12 text-center">
    <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6" style="background:#f5f3ff">
      <i class="fas fa-clipboard-list text-3xl" style="color:#7C5CFC"></i>
    </div>
    <h1 class="text-3xl font-bold text-slate-800 mb-4">Welcome to Your Onboarding</h1>
    <p class="text-slate-500 text-lg mb-2 max-w-xl mx-auto" id="introText">We're excited to start working with you. This form collects everything we need to deliver outstanding results for your brand.</p>
    <p class="text-slate-400 text-sm mb-8">Estimated time: <strong>15–25 minutes</strong> &nbsp;|&nbsp; Your progress is saved automatically</p>
    <div id="loadingIntro" class="text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Loading your form...</div>
    <button id="startBtn" class="hidden text-white px-10 py-4 rounded-xl font-bold text-lg transition-colors shadow-lg" style="background:#7C5CFC" onmouseenter="this.style.background='#6A4FE8'" onmouseleave="this.style.background='#7C5CFC'">
      Start Onboarding <i class="fas fa-arrow-right ml-2"></i>
    </button>
    <p class="text-red-500 text-sm mt-4 hidden" id="introError"></p>
  </div>

  <!-- Main form (hidden until loaded) -->
  <div id="formContainer" class="hidden max-w-4xl mx-auto px-6 pb-20">

    <!-- Step nav pills -->
    <div class="flex gap-2 flex-wrap py-6" id="stepNav"></div>

    <!-- Steps -->
    <div id="steps"></div>

    <!-- Bottom nav -->
    <div class="flex justify-between items-center mt-8">
      <button id="prevBtn" onclick="prevStep()" class="hidden px-6 py-3 border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors">
        <i class="fas fa-arrow-left mr-2"></i> Previous
      </button>
      <div class="flex items-center gap-3 ml-auto">
        <span class="save-indicator" id="saveIndicator"><i class="fas fa-check-circle mr-1"></i>Saved</span>
        <button id="nextBtn" onclick="nextStep()" class="px-6 py-3 text-white rounded-xl font-semibold transition-colors shadow-sm" style="background:#7C5CFC">
          Save & Continue <i class="fas fa-arrow-right ml-2"></i>
        </button>
        <button id="submitBtn" onclick="submitForm()" class="hidden px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-sm">
          <i class="fas fa-paper-plane mr-2"></i>Submit Onboarding
        </button>
      </div>
    </div>
  </div>

  <!-- Submitted screen -->
  <div id="submittedScreen" class="hidden max-w-4xl mx-auto px-6 py-16 text-center">
    <div class="inline-flex items-center justify-center w-24 h-24 bg-green-100 rounded-full mb-6">
      <i class="fas fa-check-circle text-green-500 text-4xl"></i>
    </div>
    <h2 class="text-3xl font-bold text-slate-800 mb-4">Onboarding Complete!</h2>
    <p class="text-slate-500 text-lg max-w-lg mx-auto">Thank you! Your account manager will review your submission and be in touch within 1 business day to confirm your campaign kick-off.</p>
  </div>

<script>
const TOKEN = '${token}';
const API_BASE = '/api/onboarding';
let onboardingData = null;
let currentStep = 0;
const STEPS = [
  { key: 'brand', label: 'Brand & Business', icon: 'fa-building' },
  { key: 'audience', label: 'Target Audience', icon: 'fa-users' },
  { key: 'content', label: 'Brand Voice & Content', icon: 'fa-pen-nib' },
  { key: 'seo', label: 'SEO & Campaign Goals', icon: 'fa-search' },
  { key: 'social', label: 'Social Media', icon: 'fa-share-alt' },
  { key: 'website', label: 'Website', icon: 'fa-globe' },
];
let formData = {};
let saveTimer = null;

// ---- Load ----
async function loadForm() {
  try {
    const res = await axios.get(\`\${API_BASE}/form/\${TOKEN}\`);
    if (res.data.status === 'approved') {
      document.getElementById('introScreen').classList.add('hidden');
      document.getElementById('submittedScreen').classList.remove('hidden');
      return;
    }
    onboardingData = res.data;
    formData = res.data.sections || {};

    const company = res.data.onboarding?.company_name || '';
    if (company) {
      document.getElementById('headerCompany').textContent = company;
      document.getElementById('introText').textContent =
        \`We're excited to start working with \${company}. This form collects everything we need to deliver outstanding results for your brand.\`;
    }

    document.getElementById('loadingIntro').classList.add('hidden');
    document.getElementById('startBtn').classList.remove('hidden');
  } catch(e) {
    document.getElementById('loadingIntro').classList.add('hidden');
    const err = document.getElementById('introError');
    err.textContent = 'Unable to load your onboarding form. Please check your link or contact your account manager.';
    err.classList.remove('hidden');
  }
}

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('introScreen').classList.add('hidden');
  document.getElementById('formContainer').classList.remove('hidden');
  buildNav();
  renderStep(0);
});

// ---- Nav ----
function buildNav() {
  const nav = document.getElementById('stepNav');
  nav.innerHTML = STEPS.map((s,i) => \`
    <button onclick="gotoStep(\${i})" id="nav_\${i}"
      class="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm font-medium text-slate-500 hover:border-violet-300 hover:text-violet-600 transition-colors">
      <i class="fas \${s.icon} text-xs"></i>\${s.label}
    </button>
  \`).join('');
}

function updateNav(idx) {
  STEPS.forEach((_,i) => {
    const btn = document.getElementById(\`nav_\${i}\`);
    if (!btn) return;
    if (i === idx) {
      btn.className = 'flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-sm';btn.style.background='#7C5CFC';
    } else if (i < idx) {
      btn.className = 'flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-green-600 text-sm font-medium';
    } else {
      btn.className = 'flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm font-medium text-slate-500 hover:border-violet-300 hover:text-violet-600 transition-colors';btn.style.background='';
    }
  });
  const pct = Math.round((idx / STEPS.length) * 100);
  document.getElementById('headerPct').textContent = pct + '%';
  document.getElementById('headerProgress').style.width = pct + '%';
}

function gotoStep(idx) { saveCurrentSection(); renderStep(idx); }
function prevStep() { saveCurrentSection(); if (currentStep > 0) renderStep(currentStep - 1); }
function nextStep() { saveCurrentSection(); if (currentStep < STEPS.length - 1) renderStep(currentStep + 1); }

function renderStep(idx) {
  currentStep = idx;
  const stepsEl = document.getElementById('steps');
  const s = STEPS[idx];
  stepsEl.innerHTML = getStepHTML(s.key, formData[s.key] || {});
  updateNav(idx);
  document.getElementById('prevBtn').classList.toggle('hidden', idx === 0);
  document.getElementById('nextBtn').classList.toggle('hidden', idx === STEPS.length - 1);
  document.getElementById('submitBtn').classList.toggle('hidden', idx !== STEPS.length - 1);
  window.scrollTo(0, 0);
  attachAutoSave();
}

// ---- Auto-save ----
function attachAutoSave() {
  const inputs = document.querySelectorAll('#steps input, #steps textarea, #steps select');
  inputs.forEach(el => {
    el.addEventListener('change', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveCurrentSection(true), 800);
    });
  });
}

async function saveCurrentSection(silent = false) {
  const key = STEPS[currentStep].key;
  const data = collectSection(key);
  try {
    await axios.put(\`\${API_BASE}/form/\${TOKEN}/section/\${key}\`, data);
    formData[key] = { ...formData[key], ...data };
    if (silent) {
      const ind = document.getElementById('saveIndicator');
      ind.classList.add('show');
      setTimeout(() => ind.classList.remove('show'), 2000);
    }
  } catch(e) { /* silent fail */ }
}

function collectSection(key) {
  const data = {};
  const els = document.querySelectorAll(\`[data-field]\`);
  els.forEach(el => {
    const field = el.getAttribute('data-field');
    if (!field) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      data[field] = el.checked ? 1 : 0;
    } else {
      data[field] = el.value;
    }
  });
  // collect chip selections
  document.querySelectorAll('.chip-group').forEach(grp => {
    const field = grp.getAttribute('data-field');
    if (!field) return;
    const selected = [...grp.querySelectorAll('.chip.selected')].map(c => c.getAttribute('data-val'));
    data[field] = JSON.stringify(selected);
  });
  return data;
}

// ---- Submit ----
async function submitForm() {
  await saveCurrentSection();
  try {
    await axios.post(\`\${API_BASE}/form/\${TOKEN}/submit\`);
    document.getElementById('formContainer').classList.add('hidden');
    document.getElementById('submittedScreen').classList.remove('hidden');
    window.scrollTo(0, 0);
  } catch(e) {
    alert('Submission failed. Please try again or contact your account manager.');
  }
}

// ---- Chip toggle ----
function toggleChip(el) { el.classList.toggle('selected'); }

function prefill(grpField, savedJson) {
  if (!savedJson) return;
  try {
    const arr = typeof savedJson === 'string' ? JSON.parse(savedJson) : savedJson;
    const grp = document.querySelector(\`.chip-group[data-field="\${grpField}"]\`);
    if (!grp) return;
    grp.querySelectorAll('.chip').forEach(c => {
      if (arr.includes(c.getAttribute('data-val'))) c.classList.add('selected');
    });
  } catch {}
}

function val(obj, key, fallback = '') { return obj?.[key] ?? fallback; }

// ---- Step HTML generators ----
function field(label, key, type='text', hint='', req=false) {
  return \`<div class="field-row">
    <label>\${label}\${req?'<span class=\\"req\\"> *</span>':''}</label>
    <input type="\${type}" data-field="\${key}" placeholder="\${hint}" value="\${val(formData[STEPS[currentStep].key], key)}" />
  </div>\`;
}
function textarea(label, key, hint='', rows=3) {
  return \`<div class="field-row">
    <label>\${label}</label>
    <textarea data-field="\${key}" rows="\${rows}" placeholder="\${hint}">\${val(formData[STEPS[currentStep].key], key)}</textarea>
  </div>\`;
}
function select(label, key, options, hint='') {
  const cur = val(formData[STEPS[currentStep].key], key);
  return \`<div class="field-row">
    <label>\${label}</label>
    <select data-field="\${key}">
      <option value="">— Select —</option>
      \${options.map(o => \`<option value="\${o.v}" \${cur===o.v?'selected':''}>\${o.l}</option>\`).join('')}
    </select>
    \${hint?'<p class=\\"hint\\">'+hint+'</p>':''}
  </div>\`;
}
function chips(label, key, options, hint='') {
  return \`<div class="field-row">
    <label>\${label}</label>
    <div class="chip-group" data-field="\${key}">
      \${options.map(o => \`<span class="chip" data-val="\${o}" onclick="toggleChip(this)">\${o}</span>\`).join('')}
    </div>
    \${hint?'<p class=\\"hint\\">'+hint+'</p>':''}
  </div>\`;
}
function checkbox(label, key, hint='') {
  const checked = val(formData[STEPS[currentStep].key], key) == 1 || val(formData[STEPS[currentStep].key], key) === true;
  return \`<div class="field-row flex items-start gap-3">
    <input type="checkbox" data-field="\${key}" \${checked?'checked':''} class="mt-1 w-4 h-4 accent-blue-600" />
    <div><label style="margin:0">\${label}</label>\${hint?'<p class=\\"hint\\">'+hint+'</p>':''}</div>
  </div>\`;
}

function getStepHTML(key, d) {
  if (key === 'brand') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-building text-violet-600 mr-2"></i>Business & Brand Details</div>
      <div class="section-sub">Help us understand your business so we can create standout content that truly represents your brand.</div>
      \${field('Legal Business Name','legal_business_name','text','e.g. Acme Pty Ltd',true)}
      \${field('Trading / Brand Name','trading_name','text','Name your customers know you as')}
      \${field('ABN','abn','text','e.g. 12 345 678 901')}
      \${field('Year Founded','year_founded','text','e.g. 2018')}
      \${select('Business Structure','business_structure',[{v:'sole_trader',l:'Sole Trader'},{v:'partnership',l:'Partnership'},{v:'company',l:'Company / Pty Ltd'},{v:'trust',l:'Trust'}])}
      \${textarea('Business Description (Elevator Pitch)','business_description','What does your business do? Describe it in 2-3 sentences as you would to a new customer.',3)}
      \${textarea('About Your Business (Full)','long_description','A more detailed overview of your business, history, and what makes you special.',5)}
      \${textarea('Mission Statement','mission_statement','Your company mission in 1-2 sentences.')}
      \${textarea('Core Values','core_values','List your company values, one per line (e.g. Integrity, Innovation, Community)')}
      \${textarea('Unique Value Proposition (UVP)','uvp','In one clear sentence, what makes you the best choice over competitors?',2)}
      \${textarea('Key Differentiators','key_differentiators','What sets you apart? List them, one per line.',4)}
      \${field('Primary Service / Product','primary_service','text','Your #1 service or product',true)}
      \${textarea('Other Services / Products Offered','secondary_services','List additional services, one per line.')}
      \${select('Price Positioning','price_range',[{v:'budget',l:'Budget / Value'},{v:'mid',l:'Mid-Market'},{v:'premium',l:'Premium'},{v:'enterprise',l:'Enterprise'}])}
      \${select('Number of Staff','number_of_staff',[{v:'1-5',l:'1–5'},{v:'6-20',l:'6–20'},{v:'21-50',l:'21–50'},{v:'50+',l:'50+'}])}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-map-marker-alt text-violet-600 mr-2"></i>Service Areas</div>
      <div class="section-sub">Where do you operate? This guides our local SEO and content targeting.</div>
      \${textarea('Suburbs / Areas Served','service_areas','List suburbs or areas, one per line (or "National" if nationwide).')}
      \${checkbox('We serve customers nationally (Australia-wide)','national_service')}
      \${field('Service Radius (km, if applicable)','service_radius_km','number','e.g. 50')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-link text-violet-600 mr-2"></i>Digital Presence & Access</div>
      <div class="section-sub">Please provide your online profiles and any tool access we'll need to manage your campaign.</div>
      \${field('Website URL','website_url','url','https://yourwebsite.com.au',true)}
      \${field('Facebook Page URL','facebook_url','url','https://facebook.com/yourbusiness')}
      \${field('Instagram URL / Handle','instagram_url','text','@yourbusiness')}
      \${field('LinkedIn Company URL','linkedin_url','url')}
      \${field('Google Business Profile URL','google_business_url','url')}
      \${field('YouTube Channel URL','youtube_url','url')}
      \${field('WordPress Admin URL','wordpress_admin_url','url','https://yoursite.com/wp-admin')}
      \${field('WordPress Admin Username','wordpress_admin_user','text')}
      \${field('WordPress Admin Password','wordpress_admin_password','password','Your credentials are encrypted and stored securely')}
      \${select('Google Analytics 4 Access','google_analytics_access',[{v:'granted',l:'Access granted / will grant'},{v:'pending',l:'Will share access shortly'},{v:'na',l:'Not applicable'}])}
      \${select('Google Search Console Access','google_search_console_access',[{v:'granted',l:'Access granted / will grant'},{v:'pending',l:'Will share access shortly'},{v:'na',l:'Not applicable'}])}
    </div>
  \`;

  if (key === 'audience') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-user-circle text-violet-600 mr-2"></i>Primary Customer Persona</div>
      <div class="section-sub">Describe your ideal customer. The more detail you provide, the more targeted your content and campaigns will be.</div>
      \${field('Persona Name (give them a name)','primary_persona_name','text','e.g. "Busy Homeowner Helen"')}
      \${field('Age Range','primary_persona_age_range','text','e.g. 35–55')}
      \${select('Primary Gender','primary_persona_gender',[{v:'any',l:'Any / Mixed'},{v:'female',l:'Primarily Female'},{v:'male',l:'Primarily Male'}])}
      \${field('Typical Income Level','primary_persona_income','text','e.g. $80,000–$150,000/year')}
      \${field('Typical Occupation','primary_persona_occupation','text','e.g. Home Owner, Small Business Owner')}
      \${field('Typical Location','primary_persona_location','text','e.g. Inner suburbs, Sydney')}
      \${textarea('Their Main Pain Points','primary_persona_pain_points','What problems are they trying to solve? List them, one per line.',4)}
      \${textarea('Their Goals','primary_persona_goals','What outcomes do they want? List them, one per line.',3)}
      \${textarea('Common Objections to Buying','primary_persona_objections','Why do they hesitate? (e.g. price, trust, timing)',3)}
      \${textarea('What Triggers Them to Buy','primary_persona_buying_triggers','What finally makes them take action? (e.g. urgent need, recommendation)',3)}
      \${chips('Preferred Channels to Reach Them','primary_persona_preferred_channels',['Google Search','Facebook','Instagram','LinkedIn','YouTube','Email','Word of Mouth','Review Sites','TikTok','Direct Mail'],'Select all that apply')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-chart-line text-violet-600 mr-2"></i>Customer Journey & Value</div>
      \${select('Average Sales Cycle','avg_sales_cycle',[{v:'same_day',l:'Same day'},{v:'1-7_days',l:'1–7 days'},{v:'1-4_weeks',l:'1–4 weeks'},{v:'1-3_months',l:'1–3 months'},{v:'3_plus_months',l:'3+ months'}])}
      \${field('Average Transaction Value','avg_transaction_value','text','e.g. $2,500 or $50–$500')}
      \${field('Estimated Customer Lifetime Value','customer_lifetime_value','text','e.g. $10,000 over 3 years')}
      \${field('Repeat Purchase Rate (estimate)','repeat_purchase_rate','text','e.g. 40%')}
      \${field('Referral Rate (estimate)','referral_rate','text','e.g. 25%')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-trophy text-violet-600 mr-2"></i>Competitor Landscape</div>
      <div class="section-sub">Understanding your competitors helps us position your brand more effectively.</div>
      \${textarea('Main Competitors','main_competitors','List competitor names and websites, one per line. e.g. Competitor Name – www.competitor.com.au',5)}
      \${textarea('Their Strengths','competitor_strengths','What do competitors do well?',3)}
      \${textarea('Their Weaknesses','competitor_weaknesses','Where do competitors fall short?',3)}
      \${textarea('Your Advantage Over Them','our_advantage_over_competitors','Why should a customer choose you instead?',3)}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-map-pin text-violet-600 mr-2"></i>Geographic Targeting</div>
      \${textarea('Target Suburbs','target_suburbs','One per line – specific suburbs you want to rank / target in')}
      \${textarea('Target Cities','target_cities','One per line')}
      \${chips('Target States','target_states',['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'],'Select all that apply')}
    </div>
  \`;

  if (key === 'content') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-pen-nib text-violet-600 mr-2"></i>Brand Voice & Tone</div>
      <div class="section-sub">We use this to ensure every piece of content sounds authentically like your brand.</div>
      \${chips('Brand Tone (select all that apply)','brand_tone',['Professional','Friendly','Authoritative','Conversational','Bold','Empathetic','Playful','Educational','Inspiring','Trustworthy','Casual','Technical'])}
      \${chips('Brand Personality Traits','brand_personality',['Reliable','Innovative','Approachable','Premium','Fun','Caring','Expert','Local','Modern','Traditional'])}
      \${textarea('Describe Your Brand Voice in Your Own Words','voice_description','e.g. "We speak like a knowledgeable friend – expert advice without jargon, always supportive and never pushy."',3)}
      \${select('Writing Style','writing_style',[{v:'formal',l:'Formal'},{v:'semi-formal',l:'Semi-Formal'},{v:'conversational',l:'Conversational'},{v:'casual',l:'Casual'}])}
      \${checkbox('We use first person ("we", "our") in all content','use_first_person')}
      \${checkbox('We are happy to use industry terminology / jargon','use_industry_jargon')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-ban text-violet-600 mr-2"></i>Language Rules</div>
      \${field('Brand Tagline / Slogan','tagline','text','Your primary tagline')}
      \${textarea('Words / Phrases We ALWAYS Use','words_to_always_use','One per line – words central to your brand identity',3)}
      \${textarea('Words / Phrases We NEVER Use','words_to_never_use','One per line – words to strictly avoid',3)}
      \${textarea('Preferred Call-to-Action Phrases','call_to_action_phrases','e.g. "Get a free quote", "Book your consultation", one per line',3)}
      \${textarea('Topics to NEVER Write About','avoid_topics','e.g. political topics, competitor comparisons, one per line',3)}
      \${textarea('Legal Disclaimers or Restrictions','legal_restrictions','Any legal requirements, compliance notes, or content restrictions we must follow.',3)}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-palette text-violet-600 mr-2"></i>Visual Brand Identity</div>
      \${field('Primary Brand Colour (hex)','primary_colour','text','e.g. #7C5CFC')}
      \${field('Secondary Brand Colour (hex)','secondary_colour','text','e.g. #1e3a5f')}
      \${field('Logo URL (if hosted online)','logo_url','url','Link to your logo file')}
      \${chips('Imagery Style Preference','imagery_style',['Real Photos (no stock)','Lifestyle Photography','Professional Stock','Illustrated / Icons','Bold Graphics','Minimal / Clean','Behind the Scenes'])}
      \${textarea('Additional Imagery Notes','imagery_notes','Any specific rules about photos? (e.g. must show real team, no competitor branding visible)')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-file-alt text-violet-600 mr-2"></i>Content Preferences</div>
      \${select('Preferred Blog Post Length','blog_preferred_length',[{v:'800-1200',l:'800–1,200 words'},{v:'1200-2000',l:'1,200–2,000 words'},{v:'2000+',l:'2,000+ words (comprehensive)'}])}
      \${select('Blog Heading Style','blog_heading_style',[{v:'question-based',l:'Question-Based (e.g. "What is...?")'},{v:'keyword-rich',l:'Keyword-Rich'},{v:'benefit-led',l:'Benefit-Led (e.g. "How to get more...")'}])}
      \${field('Blog Author Name','blog_author_name','text','Name to display as blog author')}
      \${textarea('Blog Author Bio','blog_author_bio','Short author bio for blog posts',3)}
      \${select('Social Caption Length','social_caption_length',[{v:'short',l:'Short (1–2 sentences)'},{v:'medium',l:'Medium (3–5 sentences)'},{v:'long',l:'Long (storytelling style)'}])}
      \${select('Emoji Usage in Social','social_emoji_usage',[{v:'none',l:'None'},{v:'minimal',l:'Minimal (1–2 max)'},{v:'moderate',l:'Moderate'},{v:'heavy',l:'Heavy / Expressive'}])}
      \${textarea('Reference Content You LIKE','sample_content_liked','Paste URLs of content you admire (from any brand, not just competitors). One per line.',4)}
      \${textarea('Reference Content You DISLIKE','sample_content_disliked','Paste URLs of content styles to avoid. One per line.',3)}
    </div>
  \`;

  if (key === 'seo') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-search text-violet-600 mr-2"></i>SEO History & Baseline</div>
      \${checkbox('We have had SEO performed before','current_seo_performed')}
      \${field('Previous SEO Agency (if any)','previous_agency','text','Agency name')}
      \${textarea('Why did you leave / what was the outcome?','previous_agency_end_reason','',3)}
      \${checkbox('We have received a Google penalty in the past','penalty_history')}
      \${textarea('Penalty details (if yes)','penalty_details','Describe the penalty and when it occurred.')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-key text-violet-600 mr-2"></i>Target Keywords & Pages</div>
      <div class="section-sub">Your input here guides our keyword strategy. We'll also do our own research, but this gives us your business's perspective.</div>
      \${textarea('Seed Keywords (client-provided)','client_seed_keywords','Keywords your customers use to find you. One per line. e.g. "plumber sydney", "emergency plumbing",',6)}
      \${textarea('Priority Pages to Optimise','priority_pages','List page URLs to prioritise, one per line (e.g. /services/plumbing-sydney)',4)}
      \${textarea('Pages to Exclude from Optimisation','pages_to_exclude','Any pages we should NOT touch (e.g. /admin, /old-landing-page)',3)}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-map-marker text-violet-600 mr-2"></i>Local SEO Details</div>
      \${checkbox('This is a local / service-area business','is_local_seo')}
      \${field('Google Business Profile Name (exact)','gmb_name','text','Must exactly match your Google Business listing')}
      \${field('Google Business Primary Category','gmb_category','text','e.g. Plumber')}
      \${checkbox('Google Business Profile is claimed and verified','gmb_claimed')}
      \${checkbox('This is a Service Area Business (no physical shopfront)','service_area_business')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-chart-bar text-violet-600 mr-2"></i>Campaign Goals & Reporting</div>
      \${select('Reporting Frequency Preference','reporting_frequency',[{v:'weekly',l:'Weekly'},{v:'monthly',l:'Monthly'},{v:'quarterly',l:'Quarterly'}])}
      \${field('Reporting Contact Name','reporting_contact_name','text','Who receives reports?')}
      \${field('Reporting Contact Email','reporting_contact_email','email')}
      \${chips('KPIs You Care About Most','reporting_metrics',['Keyword Rankings','Organic Traffic','Lead Volume','Conversion Rate','Page Speed','Backlink Count','Domain Authority','Local Pack Rankings','AI Visibility'],'Select all relevant')}
      \${field('Organic Traffic Goal','kpi_organic_traffic_target','text','e.g. +40% in 6 months')}
      \${field('Keyword Ranking Goal','kpi_keyword_rank_target','text','e.g. Top 3 for 5 core keywords in 6 months')}
      \${field('Lead Generation Goal','kpi_lead_volume_target','text','e.g. 20 qualified enquiries per month')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-cog text-violet-600 mr-2"></i>Technical Details</div>
      \${field('Sitemap URL','sitemap_url','url','e.g. https://yoursite.com/sitemap.xml')}
      \${select('CMS Platform','cms_platform',[{v:'wordpress',l:'WordPress'},{v:'shopify',l:'Shopify'},{v:'wix',l:'Wix'},{v:'squarespace',l:'Squarespace'},{v:'webflow',l:'Webflow'},{v:'custom',l:'Custom Built'},{v:'other',l:'Other'}])}
      \${field('Hosting Provider','hosting_provider_seo','text','e.g. WP Engine, SiteGround, Kinsta')}
      \${checkbox('Site speed is a priority for us','site_speed_priority')}
      \${checkbox('Mobile-first experience is a priority','mobile_first_priority')}
    </div>
  \`;

  if (key === 'social') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-share-alt text-violet-600 mr-2"></i>Active Social Platforms</div>
      \${chips('Platforms Currently Active','platforms_active',['Facebook','Instagram','LinkedIn','Twitter / X','TikTok','YouTube','Pinterest','Google Business'])}
      \${chips('Platforms to Grow','platforms_to_grow',['Facebook','Instagram','LinkedIn','Twitter / X','TikTok','YouTube','Pinterest'],'Where should we focus growth efforts?')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-at text-violet-600 mr-2"></i>Account Handles & URLs</div>
      \${field('Facebook Page URL','facebook_page_url','url')}
      \${field('Instagram Handle','instagram_handle','text','@yourbusiness')}
      \${field('LinkedIn Company Page URL','linkedin_company_url','url')}
      \${field('Twitter / X Handle','twitter_handle','text','@yourbusiness')}
      \${field('TikTok Handle','tiktok_handle','text','@yourbusiness')}
      \${field('YouTube Channel URL','youtube_channel_url','url')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-calendar-alt text-violet-600 mr-2"></i>Content Strategy</div>
      \${chips('Content Pillars (main topics to post about)','content_pillars',['Educational Tips','Behind the Scenes','Client Success Stories','Product / Service Features','Industry News','Community & Local','Team & Culture','Promotions / Offers','FAQs','How-To Guides'],'Select 4–6 that best represent your brand')}
      \${select('Preferred Posting Frequency','posting_frequency',[{v:'daily',l:'Daily'},{v:'5x_week',l:'5x per week'},{v:'3-4x_week',l:'3–4x per week'},{v:'2-3x_week',l:'2–3x per week'},{v:'weekly',l:'Once per week'}])}
      \${select('Social Caption Length','social_caption_length_social',[{v:'short',l:'Short & punchy'},{v:'medium',l:'Medium (3–5 sentences)'},{v:'long',l:'Long-form storytelling'}])}
      \${select('Emoji Usage','social_emoji_usage_social',[{v:'none',l:'None'},{v:'minimal',l:'Minimal'},{v:'moderate',l:'Moderate'},{v:'heavy',l:'Heavy'}])}
      \${textarea('Brand Hashtag Sets','hashtag_sets','Your go-to hashtags, one group per line. e.g. #Sydney #SydneyBusiness #PlumberSydney',4)}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-comments text-blue-600 mr-2"></i>Community Management</div>
      \${select('Target Response Time for Comments/Messages','response_time_target',[{v:'within_1hr',l:'Within 1 hour'},{v:'same_day',l:'Same day'},{v:'24-48hrs',l:'24–48 hours'}])}
      \${field('Escalation Contact (urgent issues)','escalation_contact','text','Name and phone for urgent social media issues')}
      \${textarea('Crisis Keywords (flag these immediately)','crisis_keywords','Words or phrases that need immediate escalation – e.g. "scam", "fake", "lawsuit"',2)}
      \${textarea('How should negative comments be handled?','negative_comment_handling','e.g. "Always respond professionally, invite to DM, never argue publicly"',3)}
    </div>
  \`;

  if (key === 'website') return \`
    <div class="section-card">
      <div class="section-title"><i class="fas fa-globe text-blue-600 mr-2"></i>Website Goals</div>
      \${select('Primary Website Goal','website_goal',[{v:'lead_gen',l:'Lead Generation (enquiries, calls)'},{v:'ecommerce',l:'eCommerce (product sales)'},{v:'brochure',l:'Brochure / Brand Presence'},{v:'booking',l:'Bookings / Appointments'},{v:'membership',l:'Membership / Subscriptions'}])}
      \${field('Primary Conversion Action','primary_conversion_action','text','e.g. "Submit the contact form"')}
      \${textarea('Secondary Conversion Actions','secondary_conversion_actions','e.g. phone call, live chat, newsletter signup – one per line',3)}
      \${field('Current Monthly Website Visitors (estimate)','current_monthly_visitors','text','e.g. ~500/month')}
      \${field('Current Conversion Rate (estimate)','current_conversion_rate','text','e.g. 2%')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-paint-brush text-blue-600 mr-2"></i>Design Preferences</div>
      \${select('Design Style Preference','design_style',[{v:'modern',l:'Modern & Clean'},{v:'classic',l:'Classic & Corporate'},{v:'minimal',l:'Minimal / Whitespace-Heavy'},{v:'bold',l:'Bold & Colourful'},{v:'creative',l:'Creative / Unique'},{v:'premium',l:'Luxury / Premium'}])}
      \${select('Priority Device','responsive_priority',[{v:'mobile',l:'Mobile First'},{v:'desktop',l:'Desktop First'},{v:'equal',l:'Equal Focus'}])}
      \${textarea('Websites You LIKE (design reference)','design_references','Paste URLs you admire. One per line.',4)}
      \${textarea('Websites You DISLIKE (avoid these styles)','design_references_disliked','Paste URLs of styles to avoid. One per line.',3)}
      \${textarea('Must-Have Website Elements','must_have_elements','e.g. Live chat, video hero, trust badges, one per line.',3)}
      \${textarea('Must-NOT-Have Elements','must_not_have_elements','e.g. Pop-ups, flash, music autoplay, one per line.',2)}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-plug text-blue-600 mr-2"></i>Functional Requirements</div>
      \${checkbox('eCommerce / Online Shop Required','ecommerce_required')}
      \${field('eCommerce Platform (if applicable)','ecommerce_platform','text','e.g. WooCommerce, Shopify')}
      \${checkbox('Booking / Appointment System Required','booking_required')}
      \${field('Preferred Booking Platform','booking_platform','text','e.g. Calendly, Acuity, TimeTrade')}
      \${checkbox('Membership / Subscription Required','membership_required')}
      \${checkbox('Live Chat Required','live_chat_required')}
      \${checkbox('Multi-Language Support Required','multi_language_required')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-file-upload text-violet-600 mr-2"></i>Content & Assets</div>
      \${checkbox('Logo files will be provided by client','logo_files_provided')}
      \${checkbox('Brand guidelines / style guide will be provided','brand_guidelines_provided')}
      \${checkbox('Website copy will be written by client','copy_provided')}
      \${checkbox('Product / service photos will be provided by client','images_provided')}
      \${checkbox('Existing website content to migrate','existing_content_to_migrate')}
      \${field('Approximate number of pages to migrate','number_of_pages_to_migrate','text','e.g. 15')}
    </div>
    <div class="section-card">
      <div class="section-title"><i class="fas fa-server text-blue-600 mr-2"></i>Hosting & Integrations</div>
      \${field('Current Hosting Provider','current_host','text','e.g. GoDaddy, SiteGround, WP Engine')}
      \${field('Preferred Hosting Provider','preferred_host','text','Leave blank if no preference')}
      \${checkbox('Interested in managed WordPress hosting','wants_managed_hosting')}
      \${select('CRM Integration','crm_integration',[{v:'none',l:'None'},{v:'hubspot',l:'HubSpot'},{v:'salesforce',l:'Salesforce'},{v:'activecampaign',l:'ActiveCampaign'},{v:'other',l:'Other'}])}
      \${select('Email Marketing Platform','email_platform',[{v:'none',l:'None'},{v:'mailchimp',l:'Mailchimp'},{v:'klaviyo',l:'Klaviyo'},{v:'activecampaign',l:'ActiveCampaign'},{v:'other',l:'Other'}])}
    </div>
  \`;

  return '<p class="text-slate-400">Section coming soon.</p>';
}

// ---- Init ----
loadForm();
</script>
</body>
</html>`
}

export default app

function getLoginPageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In – Digital Search Group</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&family=Maven+Pro:wght@400;500;600;700;800&display=swap');
    @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
    body { font-family: 'Montserrat', system-ui, sans-serif; }
    h1, h2, h3 { font-family: 'Maven Pro', 'Montserrat', system-ui, sans-serif; }
    .fade-up { animation: fadeUp 0.4s ease both }
    input:focus { outline: none; border-color: #7C5CFC; box-shadow: 0 0 0 3px rgba(124,92,252,0.12) }
    .btn-login { transition: all 0.15s; }
    .btn-login:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(124,92,252,0.4) }
    .btn-login:active { transform: translateY(0) }
    .btn-login:disabled { opacity: 0.65; cursor: not-allowed }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)">

  <!-- DSG Background pattern -->
  <div class="fixed inset-0 pointer-events-none" style="background-image:radial-gradient(circle at 25% 25%, rgba(124,92,252,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(124,92,252,0.05) 0%, transparent 50%)"></div>

  <div class="w-full max-w-sm fade-up">

    <!-- Logo -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg" style="background:#7C5CFC; box-shadow: 0 8px 32px rgba(124,92,252,0.4)">
        <span style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-2px;font-family:system-ui">DSG</span>
      </div>
      <h1 class="text-white text-2xl font-bold tracking-tight">Digital Search Group</h1>
      <p class="text-sm mt-1" style="color: rgba(255,255,255,0.5)">Campaign Management System</p>
    </div>

    <!-- Card -->
    <div class="bg-white rounded-2xl shadow-2xl shadow-black/40 p-8">
      <h2 class="text-slate-800 text-xl font-bold mb-1">Welcome back</h2>
      <p class="text-slate-400 text-sm mb-6">Sign in to your account to continue</p>

      <div id="errorBox" class="hidden mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
        <i class="fas fa-triangle-exclamation flex-shrink-0"></i>
        <span id="errorMsg">Invalid email or password</span>
      </div>

      <form id="loginForm" onsubmit="handleLogin(event)">
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-700 mb-1.5" for="email">Email address</label>
          <div class="relative">
            <i class="fas fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input id="email" type="email" autocomplete="email" required
              class="w-full pl-10 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50"
              placeholder="you@digitalsearchgroup.com.au">
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-slate-700 mb-1.5" for="password">Password</label>
          <div class="relative">
            <i class="fas fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            <input id="password" type="password" autocomplete="current-password" required
              class="w-full pl-10 pr-10 py-2.5 border-2 border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50"
              placeholder="••••••••">
            <button type="button" onclick="togglePw()" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i id="pwToggleIcon" class="fas fa-eye text-sm"></i>
            </button>
          </div>
        </div>

        <button type="submit" id="loginBtn"
          class="btn-login w-full text-white font-bold py-3 rounded-xl text-sm shadow-md" style="background:#7C5CFC">
          <i class="fas fa-sign-in-alt mr-2"></i>Sign In
        </button>
      </form>
    </div>

    <!-- Footer -->
    <p class="text-center text-xs mt-6" style="color: rgba(255,255,255,0.3)">
      &copy; ${new Date().getFullYear()} Digital Search Group &middot; Internal System
    </p>
  </div>

  <script>
  function togglePw() {
    const pw = document.getElementById('password');
    const icon = document.getElementById('pwToggleIcon');
    if (pw.type === 'password') { pw.type = 'text'; icon.className = 'fas fa-eye-slash text-sm'; }
    else { pw.type = 'password'; icon.className = 'fas fa-eye text-sm'; }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errBox = document.getElementById('errorBox');
    const errMsg = document.getElementById('errorMsg');
    errBox.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing in...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await axios.post('/api/auth/login', { email, password });
      const { token, user } = res.data;

      // Store token in localStorage for SPA
      localStorage.setItem('dsg_token', token);
      localStorage.setItem('dsg_user', JSON.stringify(user));

      // Redirect – force password change if flagged
      if (user.force_password_change) {
        window.location.href = '/?change_password=1';
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Invalid email or password. Please try again.';
      errMsg.textContent = msg;
      errBox.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Sign In';
      // Shake animation
      const card = errBox.closest('.bg-white');
      card.style.animation = 'none';
      card.style.transform = 'translateX(-6px)';
      setTimeout(() => { card.style.transform = 'translateX(6px)'; }, 80);
      setTimeout(() => { card.style.transform = 'translateX(0)'; card.style.transition = 'transform 0.15s'; }, 160);
    }
  }

  // If already logged in, redirect to app
  const stored = localStorage.getItem('dsg_token');
  if (stored) {
    axios.get('/api/auth/me', { headers: { Authorization: 'Bearer ' + stored } })
      .then(() => { window.location.href = '/'; })
      .catch(() => { localStorage.removeItem('dsg_token'); localStorage.removeItem('dsg_user'); });
  }
  </script>
</body>
</html>`
}


