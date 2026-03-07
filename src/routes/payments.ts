import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  APP_URL: string
}

export const paymentsRoutes = new Hono<{ Bindings: Bindings }>()

// ---- Stripe helper ----
async function stripeRequest(secretKey: string, method: string, path: string, body?: Record<string, any>): Promise<any> {
  const encoded = body
    ? Object.entries(body).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? Object.entries(v).map(([sk, sv]) => `${encodeURIComponent(`${k}[${sk}]`)}=${encodeURIComponent(String(sv))}`)
          : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`]
      ).join('&')
    : undefined

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encoded,
  })
  return res.json()
}

function invoiceNumber(clientId: number, cycleNum: number) {
  const date = new Date()
  return `DSG-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}-${String(clientId).padStart(4,'0')}-${String(cycleNum).padStart(3,'0')}`
}

// ---- GET all payments ----
paymentsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const campaignId = c.req.query('campaign_id')

  let q = `SELECT p.*, cl.company_name, cl.contact_email
    FROM payments p JOIN clients cl ON p.client_id = cl.id WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND p.client_id = ?'; params.push(clientId) }
  if (campaignId) { q += ' AND p.campaign_id = ?'; params.push(campaignId) }
  q += ' ORDER BY p.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

// ---- GET billing schedules ----
paymentsRoutes.get('/billing', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')

  let q = `SELECT bs.*, cl.company_name, ca.name as campaign_name
    FROM billing_schedules bs
    JOIN clients cl ON bs.client_id = cl.id
    JOIN campaigns ca ON bs.campaign_id = ca.id
    WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND bs.client_id = ?'; params.push(clientId) }
  q += " AND bs.status = 'active' ORDER BY bs.next_billing_date ASC"

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

// ---- GET billing overview (dashboard) ----
paymentsRoutes.get('/billing/overview', async (c) => {
  const db = c.env.DB

  const [stats, upcoming, recent] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(DISTINCT bs.client_id) as active_clients,
        SUM(bs.amount) as monthly_recurring,
        COUNT(*) as active_schedules,
        (SELECT SUM(amount) FROM payments WHERE status='succeeded') as total_collected
      FROM billing_schedules bs WHERE bs.status = 'active'
    `).first(),
    db.prepare(`
      SELECT bs.*, cl.company_name, ca.name as campaign_name
      FROM billing_schedules bs
      JOIN clients cl ON bs.client_id = cl.id
      JOIN campaigns ca ON bs.campaign_id = ca.id
      WHERE bs.status = 'active'
      ORDER BY bs.next_billing_date ASC LIMIT 10
    `).all(),
    db.prepare(`
      SELECT p.*, cl.company_name
      FROM payments p JOIN clients cl ON p.client_id = cl.id
      ORDER BY p.created_at DESC LIMIT 10
    `).all(),
  ])

  // Overdue
  const today = new Date().toISOString().slice(0, 10)
  const overdue = await db.prepare(`
    SELECT COUNT(*) as count, SUM(amount) as total
    FROM billing_schedules
    WHERE status = 'active' AND next_billing_date < ?
  `).bind(today).first()

  return c.json({
    stats,
    overdue,
    upcoming_billing: upcoming.results,
    recent_payments: recent.results,
  })
})

// ---- POST create Stripe checkout for proposal ----
paymentsRoutes.post('/create-checkout/:proposalId', async (c) => {
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  const stripeKey = c.env.STRIPE_SECRET_KEY
  const appUrl = c.env.APP_URL || 'http://localhost:3000'

  const proposal = await db.prepare(`
    SELECT p.*, cl.company_name, cl.contact_email, cl.contact_name, cl.stripe_customer_id
    FROM proposals p JOIN clients cl ON p.client_id = cl.id
    WHERE p.id = ?
  `).bind(proposalId).first() as any

  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  if (proposal.status !== 'approved') return c.json({ error: 'Proposal must be approved first' }, 400)

  // Demo mode without Stripe key
  if (!stripeKey) {
    const mockPaymentLink = `/payments/demo-success?proposal_id=${proposalId}&amount=${proposal.monthly_investment}`
    await db.prepare(`UPDATE proposals SET payment_link = ? WHERE id = ?`).bind(mockPaymentLink, proposalId).run()
    return c.json({
      mode: 'demo',
      payment_url: mockPaymentLink,
      message: 'Demo mode: no Stripe key configured. Use /payments/demo-activate/:proposalId to simulate payment.'
    })
  }

  // Create/get Stripe customer
  let customerId = proposal.stripe_customer_id
  if (!customerId) {
    const customer = await stripeRequest(stripeKey, 'POST', '/customers', {
      email: proposal.contact_email,
      name: proposal.company_name,
      metadata: { client_id: proposal.client_id, proposal_id: proposalId },
    })
    customerId = customer.id
    await db.prepare('UPDATE clients SET stripe_customer_id = ? WHERE id = ?').bind(customerId, proposal.client_id).run()
  }

  const amountCents = Math.round(proposal.monthly_investment * 100)
  const setupFeeCents = Math.round((proposal.setup_fee || 0) * 100)
  const firstPaymentCents = setupFeeCents + amountCents

  // Create Stripe Checkout Session
  const session = await stripeRequest(stripeKey, 'POST', '/checkout/sessions', {
    customer: customerId,
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'aud',
    'line_items[0][price_data][product_data][name]': proposal.title,
    'line_items[0][price_data][product_data][description]': `${proposal.contract_length || 12} month SEO campaign · $${proposal.monthly_investment}/month`,
    'line_items[0][price_data][unit_amount]': firstPaymentCents,
    'line_items[0][quantity]': 1,
    'success_url': `${appUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}&proposal_id=${proposalId}`,
    'cancel_url': `${appUrl}/proposals/approve/${proposal.approval_token}`,
    'metadata[proposal_id]': proposalId,
    'metadata[client_id]': proposal.client_id,
  })

  if (session.error) return c.json({ error: session.error.message }, 400)

  await db.prepare('UPDATE proposals SET payment_link = ? WHERE id = ?').bind(session.url, proposalId).run()

  return c.json({ payment_url: session.url, session_id: session.id })
})

// ---- GET payment success handler ----
paymentsRoutes.get('/success', async (c) => {
  const sessionId = c.req.query('session_id')
  const proposalId = c.req.query('proposal_id')
  const db = c.env.DB
  const stripeKey = c.env.STRIPE_SECRET_KEY

  if (!proposalId) return c.html('<h1>Invalid request</h1>', 400)

  let session: any = null
  if (stripeKey && sessionId) {
    session = await stripeRequest(stripeKey, 'GET', `/checkout/sessions/${sessionId}`)
  }

  await activateProposalPayment(db, Number(proposalId), session)

  return c.html(getPaymentSuccessHTML())
})

// ---- POST demo activate (no Stripe) ----
paymentsRoutes.post('/demo-activate/:proposalId', async (c) => {
  const proposalId = c.req.param('proposalId')
  const db = c.env.DB
  await activateProposalPayment(db, Number(proposalId), null)
  return c.json({ success: true, message: 'Demo payment activated' })
})

// ---- Shared activation logic ----
async function activateProposalPayment(db: D1Database, proposalId: number, stripeSession: any) {
  const proposal = await db.prepare('SELECT * FROM proposals WHERE id = ?').bind(proposalId).first() as any
  if (!proposal) return

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const nextBilling = new Date()
  nextBilling.setDate(nextBilling.getDate() + 28)
  const nextBillingStr = nextBilling.toISOString().slice(0, 10)

  // Create payment record
  const invNum = invoiceNumber(proposal.client_id, 1)
  const paymentIntentId = stripeSession?.payment_intent || `demo_${Date.now()}`
  const receiptUrl = stripeSession?.url || null

  await db.prepare(`
    INSERT OR IGNORE INTO payments (client_id, proposal_id, stripe_payment_intent_id, amount, status, payment_type, description, billing_cycle_number, invoice_number, receipt_url, paid_at)
    VALUES (?, ?, ?, ?, 'succeeded', 'first_payment', ?, 1, ?, ?, ?)
  `).bind(proposal.client_id, proposalId, paymentIntentId, proposal.monthly_investment + (proposal.setup_fee || 0), `First payment — ${proposal.title}`, invNum, receiptUrl, now).run()

  // Get or create campaign
  let campaignId: number
  const existingCampaign = await db.prepare('SELECT id FROM campaigns WHERE proposal_id = ?').bind(proposalId).first() as any
  if (existingCampaign) {
    campaignId = existingCampaign.id
    await db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").bind(campaignId).run()
  } else {
    const ca = await db.prepare(`
      INSERT INTO campaigns (client_id, proposal_id, name, campaign_type, status, start_date, monthly_investment, target_locations, goals)
      SELECT client_id, id, title, proposal_type, 'active', ?, monthly_investment, target_locations, goals
      FROM proposals WHERE id = ?
    `).bind(today, proposalId).run()
    campaignId = ca.meta.last_row_id as number
  }

  // Create billing schedule
  await db.prepare(`
    INSERT OR IGNORE INTO billing_schedules (client_id, campaign_id, proposal_id, amount, status, billing_interval_days, cycle_number, total_cycles, next_billing_date, last_billed_date, start_date)
    VALUES (?, ?, ?, ?, 'active', 28, 2, ?, ?, ?, ?)
  `).bind(proposal.client_id, campaignId, proposalId, proposal.monthly_investment, proposal.contract_length || null, nextBillingStr, today, today).run()

  // Update proposal & client
  await db.prepare("UPDATE proposals SET status = 'approved', paid_at = ?, approved_at = ? WHERE id = ?").bind(now, now, proposalId).run()
  await db.prepare("UPDATE clients SET status = 'active', monthly_budget = ? WHERE id = ?").bind(proposal.monthly_investment, proposal.client_id).run()

  // Activity log
  await db.prepare(`INSERT INTO activity_log (client_id, campaign_id, activity_type, description) VALUES (?, ?, 'payment_received', ?)`)
    .bind(proposal.client_id, campaignId, `First payment received — $${proposal.monthly_investment} — ${proposal.title}`).run()
}

// ---- POST process due billing (cron-style) ----
paymentsRoutes.post('/process-billing', async (c) => {
  const db = c.env.DB
  const stripeKey = c.env.STRIPE_SECRET_KEY
  const today = new Date().toISOString().slice(0, 10)

  const due = await db.prepare(`
    SELECT bs.*, cl.stripe_customer_id, cl.contact_email, cl.company_name, ca.name as campaign_name
    FROM billing_schedules bs
    JOIN clients cl ON bs.client_id = cl.id
    JOIN campaigns ca ON bs.campaign_id = ca.id
    WHERE bs.status = 'active' AND bs.next_billing_date <= ?
  `).bind(today).all()

  const results = []

  for (const schedule of due.results as any[]) {
    try {
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + 28)
      const nextDateStr = nextDate.toISOString().slice(0, 10)
      const cycleNum = (schedule.cycle_number || 1) + 1
      const invNum = invoiceNumber(schedule.client_id, cycleNum)
      const now = new Date().toISOString()

      let paymentStatus = 'succeeded'
      let paymentIntentId = `auto_${Date.now()}_${schedule.id}`

      if (stripeKey && schedule.stripe_customer_id) {
        // Real Stripe charge
        const pi = await stripeRequest(stripeKey, 'POST', '/payment_intents', {
          amount: Math.round(schedule.amount * 100),
          currency: 'aud',
          customer: schedule.stripe_customer_id,
          'payment_method_types[0]': 'card',
          confirm: true,
          description: `DSG Billing Cycle ${cycleNum} — ${schedule.campaign_name}`,
          'metadata[campaign_id]': schedule.campaign_id,
          'metadata[billing_schedule_id]': schedule.id,
          'metadata[cycle_number]': cycleNum,
        })
        paymentStatus = pi.status === 'succeeded' ? 'succeeded' : 'failed'
        paymentIntentId = pi.id
      }

      await db.prepare(`
        INSERT INTO payments (client_id, campaign_id, stripe_payment_intent_id, amount, status, payment_type, description, billing_cycle_number, invoice_number, paid_at)
        VALUES (?, ?, ?, ?, ?, 'recurring', ?, ?, ?, ?)
      `).bind(schedule.client_id, schedule.campaign_id, paymentIntentId, schedule.amount, paymentStatus, `Billing Cycle ${cycleNum} — ${schedule.campaign_name}`, cycleNum, invNum, paymentStatus === 'succeeded' ? now : null).run()

      // Check if contract complete
      const isComplete = schedule.total_cycles && cycleNum >= schedule.total_cycles
      const newStatus = isComplete ? 'completed' : 'active'

      await db.prepare(`
        UPDATE billing_schedules SET cycle_number = ?, next_billing_date = ?, last_billed_date = ?, status = ?, updated_at = ? WHERE id = ?
      `).bind(cycleNum, isComplete ? null : nextDateStr, today, newStatus, now, schedule.id).run()

      if (paymentStatus === 'succeeded') {
        await db.prepare(`INSERT INTO activity_log (client_id, campaign_id, activity_type, description) VALUES (?, ?, 'payment_received', ?)`)
          .bind(schedule.client_id, schedule.campaign_id, `Recurring payment cycle ${cycleNum} — $${schedule.amount}`).run()
      }

      results.push({ client: schedule.company_name, cycle: cycleNum, amount: schedule.amount, status: paymentStatus })
    } catch (err: any) {
      results.push({ client: (schedule as any).company_name, error: err.message })
    }
  }

  return c.json({ processed: results.length, results })
})

// ---- POST manually record a payment ----
paymentsRoutes.post('/manual', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { client_id, campaign_id, amount, description, payment_type, billing_cycle_number } = body

  const invNum = invoiceNumber(Number(client_id), billing_cycle_number || 1)
  const now = new Date().toISOString()

  const result = await db.prepare(`
    INSERT INTO payments (client_id, campaign_id, amount, status, payment_type, description, billing_cycle_number, invoice_number, paid_at)
    VALUES (?, ?, ?, 'succeeded', ?, ?, ?, ?, ?)
  `).bind(client_id, campaign_id || null, amount, payment_type || 'one_off', description || '', billing_cycle_number || 1, invNum, now).run()

  return c.json({ id: result.meta.last_row_id, invoice_number: invNum, message: 'Payment recorded' })
})

// ---- PUT pause/resume/cancel billing ----
paymentsRoutes.put('/billing/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const { status, next_billing_date } = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`UPDATE billing_schedules SET status = ?, ${next_billing_date ? 'next_billing_date = ?,' : ''} updated_at = ? WHERE id = ?`)
    .bind(status, ...(next_billing_date ? [next_billing_date] : []), now, id).run()

  return c.json({ message: `Billing schedule ${status}` })
})

function getPaymentSuccessHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful — DSG</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center">
  <div class="text-center bg-white rounded-2xl shadow-xl p-10 max-w-md mx-auto">
    <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
      <svg class="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
    <p class="text-gray-500 mb-2">Welcome aboard. Your campaign is now active.</p>
    <p class="text-gray-400 text-sm mb-6">You'll receive a confirmation email shortly. Recurring billing will occur every 28 days.</p>
    <a href="/" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition">
      Go to Dashboard →
    </a>
  </div>
</body>
</html>`
}
