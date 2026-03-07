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

type Bindings = {
  DB: D1Database
  DATAFORSEO_LOGIN: string
  DATAFORSEO_PASSWORD: string
  OPENAI_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors())

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
    return c.html(getApprovalPageHTML(null, 'invalid'))
  }

  const isExpired = proposal.expires_at && new Date(proposal.expires_at) < new Date()
  if (isExpired) {
    return c.html(getApprovalPageHTML(proposal, 'expired'))
  }

  return c.html(getApprovalPageHTML(proposal, 'pending'))
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

    // Log activity
    await db.prepare(`
      INSERT INTO activity_log (client_id, activity_type, description)
      VALUES (?, 'proposal_approved', 'Proposal approved by client')
    `).bind(proposal.client_id).run()
  }

  return c.json({ success: true, status: newStatus })
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

// Main app - serve SPA
app.get('*', (c) => {
  return c.html(getAppHTML())
})

function getApprovalPageHTML(proposal: any, state: string): string {
  const stateMessages: Record<string, { title: string; message: string; icon: string; color: string }> = {
    invalid: { title: 'Invalid Link', message: 'This proposal link is invalid or has already been actioned.', icon: '❌', color: 'red' },
    expired: { title: 'Proposal Expired', message: 'This proposal has expired. Please contact Digital Search Group for a new proposal.', icon: '⏰', color: 'yellow' },
    pending: { title: 'Proposal Ready for Review', message: '', icon: '📋', color: 'blue' }
  }
  
  const s = stateMessages[state] || stateMessages.invalid

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DSG Proposal - ${proposal?.title || 'Review'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <div class="max-w-3xl mx-auto py-12 px-4">
    <div class="text-center mb-8">
      <div class="text-5xl mb-4">${s.icon}</div>
      <h1 class="text-3xl font-bold text-gray-900">Digital Search Group</h1>
      <p class="text-gray-500 mt-1">Organic Digital Marketing Proposal</p>
    </div>
    ${state === 'pending' && proposal ? `
    <div class="bg-white rounded-2xl shadow-lg p-8 mb-6">
      <div class="flex justify-between items-start mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">${proposal.title}</h2>
          <p class="text-gray-500 mt-1">Prepared for ${proposal.company_name}</p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold text-blue-600">$${Number(proposal.monthly_investment).toLocaleString()}</div>
          <div class="text-gray-500 text-sm">per month × ${proposal.contract_length} months</div>
        </div>
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-blue-50 rounded-xl">
        <div><span class="text-sm text-gray-500">Client</span><p class="font-semibold">${proposal.contact_name}</p></div>
        <div><span class="text-sm text-gray-500">Website</span><p class="font-semibold">${proposal.website}</p></div>
        <div><span class="text-sm text-gray-500">Service Type</span><p class="font-semibold capitalize">${(proposal.proposal_type || '').replace(/_/g,' ')}</p></div>
        <div><span class="text-sm text-gray-500">Contract Length</span><p class="font-semibold">${proposal.contract_length} months</p></div>
      </div>

      ${proposal.scope_summary ? `<div class="mb-6"><h3 class="font-semibold text-gray-700 mb-2">Scope of Work</h3><p class="text-gray-600 leading-relaxed">${proposal.scope_summary}</p></div>` : ''}
      ${proposal.goals ? `<div class="mb-6"><h3 class="font-semibold text-gray-700 mb-2">Campaign Goals</h3><p class="text-gray-600">${proposal.goals}</p></div>` : ''}
      ${proposal.target_keywords ? `<div class="mb-6"><h3 class="font-semibold text-gray-700 mb-2">Target Keywords</h3><p class="text-gray-600">${proposal.target_keywords}</p></div>` : ''}
      
      <div class="border-t pt-6">
        <p class="text-sm text-gray-500 mb-4">By approving this proposal, you agree to engage Digital Search Group for the services outlined above.</p>
        <div class="flex gap-4">
          <button onclick="handleDecision('approve')" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition">
            ✓ Approve Proposal
          </button>
          <button onclick="showRejectForm()" class="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-3 px-6 rounded-xl transition">
            ✗ Decline
          </button>
        </div>
        <div id="rejectForm" class="hidden mt-4">
          <textarea id="rejectReason" class="w-full border rounded-xl p-3 text-gray-700" rows="3" placeholder="Please let us know why you're declining (optional)..."></textarea>
          <button onclick="handleDecision('reject')" class="mt-2 bg-red-600 text-white font-semibold py-2 px-6 rounded-xl">Confirm Decline</button>
        </div>
      </div>
    </div>
    ` : `
    <div class="bg-white rounded-2xl shadow-lg p-8 text-center">
      <p class="text-gray-700">${s.message}</p>
      <a href="mailto:hello@digitalsearchgroup.com.au" class="mt-4 inline-block text-blue-600 hover:underline">Contact DSG →</a>
    </div>
    `}
  </div>
  <script>
    const token = window.location.pathname.split('/').pop();
    function showRejectForm() { document.getElementById('rejectForm').classList.remove('hidden'); }
    async function handleDecision(action) {
      const reason = document.getElementById('rejectReason')?.value || '';
      const res = await fetch('/proposals/approve/' + token, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ action, rejection_reason: reason })
      });
      const data = await res.json();
      if (data.success) {
        document.body.innerHTML = '<div class="min-h-screen flex items-center justify-center bg-gray-50"><div class="text-center p-8 bg-white rounded-2xl shadow-lg"><div class="text-6xl mb-4">' + (action==='approve'?'🎉':'👋') + '</div><h2 class="text-2xl font-bold text-gray-900">' + (action==='approve'?'Proposal Approved!':'Proposal Declined') + '</h2><p class="text-gray-500 mt-2">' + (action==='approve'?'Thank you! Our team will be in touch within 24 hours.':'We\'ve received your response. Feel free to reach out if you change your mind.') + '</p></div></div>';
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
  <title>SEO Report - ${report.company_name} - ${report.report_period}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-100">
  <div class="max-w-4xl mx-auto py-8 px-4">
    <div class="bg-gradient-to-r from-blue-900 to-blue-700 text-white rounded-2xl p-8 mb-6">
      <p class="text-blue-200 text-sm">Digital Search Group</p>
      <h1 class="text-3xl font-bold mt-1">${report.company_name}</h1>
      <p class="text-blue-200 mt-1">SEO Performance Report · ${report.report_period}</p>
    </div>
    
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${[
        ['Keywords Improved', report.keywords_improved, '↑', 'green'],
        ['Keywords in Top 10', report.top10_keywords, '★', 'blue'],
        ['Keywords in Top 3', report.top3_keywords, '🏆', 'yellow'],
        ['Content Published', report.content_published, '📝', 'purple'],
      ].map(([label, val, icon, color]) => `
      <div class="bg-white rounded-xl p-4 shadow text-center">
        <div class="text-2xl font-bold text-${color}-600">${val}</div>
        <div class="text-gray-500 text-sm mt-1">${label}</div>
      </div>`).join('')}
    </div>

    ${report.summary ? `
    <div class="bg-white rounded-xl shadow p-6 mb-6">
      <h2 class="text-lg font-bold text-gray-800 mb-3">Campaign Summary</h2>
      <p class="text-gray-600 leading-relaxed">${report.summary}</p>
    </div>` : ''}

    ${data.keyword_highlights && data.keyword_highlights.length ? `
    <div class="bg-white rounded-xl shadow p-6 mb-6">
      <h2 class="text-lg font-bold text-gray-800 mb-4">Keyword Performance Highlights</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="bg-gray-50"><th class="text-left p-3">Keyword</th><th class="p-3">Previous</th><th class="p-3">Current</th><th class="p-3">Change</th></tr></thead>
          <tbody>
            ${data.keyword_highlights.map((k: any) => `
            <tr class="border-t">
              <td class="p-3 font-medium">${k.keyword}</td>
              <td class="p-3 text-center text-gray-500">${k.previous || '-'}</td>
              <td class="p-3 text-center font-semibold">${k.current || '-'}</td>
              <td class="p-3 text-center ${Number(k.change) < 0 ? 'text-green-600' : Number(k.change) > 0 ? 'text-red-500' : 'text-gray-400'}">
                ${Number(k.change) < 0 ? '↑' + Math.abs(k.change) : Number(k.change) > 0 ? '↓' + k.change : '–'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="text-center text-gray-400 text-sm py-4">
      Prepared by Digital Search Group · ${new Date().getFullYear()}
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
  <title>DSG Campaign Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <style>
    .sidebar-link { @apply flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer; }
    .sidebar-link.active { @apply text-white bg-white/20; }
    .card { @apply bg-white rounded-2xl shadow-sm border border-gray-100 p-6; }
    .btn-primary { @apply bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm; }
    .btn-secondary { @apply bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl transition text-sm; }
    .btn-success { @apply bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm; }
    .btn-danger { @apply bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm; }
    .badge { @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium; }
    .input-field { @apply w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500; }
    .section-title { @apply text-xl font-bold text-gray-900 mb-1; }
    .section-sub { @apply text-sm text-gray-500 mb-6; }
    [x-cloak] { display: none; }
    .modal-overlay { @apply fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4; }
    .modal-box { @apply bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto; }
    .status-active { @apply badge bg-green-100 text-green-700; }
    .status-prospect { @apply badge bg-yellow-100 text-yellow-700; }
    .status-paused { @apply badge bg-gray-100 text-gray-600; }
    .status-churned { @apply badge bg-red-100 text-red-600; }
    .status-draft { @apply badge bg-gray-100 text-gray-600; }
    .status-sent { @apply badge bg-blue-100 text-blue-600; }
    .status-approved { @apply badge bg-green-100 text-green-700; }
    .status-rejected { @apply badge bg-red-100 text-red-600; }
    .status-planned { @apply badge bg-gray-100 text-gray-600; }
    .status-in_progress { @apply badge bg-yellow-100 text-yellow-700; }
    .status-published { @apply badge bg-green-100 text-green-700; }
    .rank-improved { color: #16a34a; }
    .rank-declined { color: #dc2626; }
    .rank-new { color: #2563eb; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #f8fafc; }
    .shimmer { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .toast { position: fixed; bottom: 24px; right: 24px; z-index: 9999; transform: translateY(100px); opacity: 0; transition: all 0.3s; }
    .toast.show { transform: translateY(0); opacity: 1; }
  </style>
</head>
<body class="bg-gray-50">
  <div id="app"></div>
  <div id="toast" class="toast bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm"></div>
  <script src="/static/app.js"></script>
</body>
</html>`
}

export default app
