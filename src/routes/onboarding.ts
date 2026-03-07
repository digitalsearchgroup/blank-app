import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  APP_URL: string
  SENDGRID_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
}

export const onboardingRoutes = new Hono<{ Bindings: Bindings }>()

// ---- helpers ----
function generateToken(len = 40): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let t = ''
  for (let i = 0; i < len; i++) t += chars[Math.floor(Math.random() * chars.length)]
  return t
}

function nextReminderDate(remindersAlreadySent: number): string {
  // 1st reminder: 48 h, 2nd: 72 h, 3rd: 5 days, 4th: 7 days, after that weekly
  const gaps = [2, 3, 5, 7, 7]
  const days = gaps[Math.min(remindersAlreadySent, gaps.length - 1)]
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<boolean> {
  if (!apiKey) return false
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'hello@digitalsearchgroup.com.au', name: 'Digital Search Group' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function sendSMS(sid: string, token: string, from: string, to: string, body: string): Promise<boolean> {
  if (!sid || !token || !from) return false
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })
    return res.ok
  } catch {
    return false
  }
}

function onboardingEmailHTML(client: any, formUrl: string, reminderNumber: number): string {
  const isFirst = reminderNumber === 0
  const greeting = isFirst
    ? `Welcome to Digital Search Group, ${client.contact_name || client.company_name}!`
    : `Friendly reminder – your onboarding form is waiting`

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:32px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">Digital Search Group</h1>
      <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">Campaign Onboarding</p>
    </div>
    <div style="padding:40px">
      <h2 style="color:#1e293b;font-size:20px;margin:0 0 16px">${greeting}</h2>
      ${isFirst ? `
      <p style="color:#475569;line-height:1.7">Your proposal has been approved and we're ready to kick off your campaign. Before we begin, we need to gather some important details about your brand so we can hit the ground running and deliver outstanding results.</p>
      <p style="color:#475569;line-height:1.7">This onboarding form covers your brand identity, target audience, content preferences, and campaign goals. The more detail you provide, the better your results will be — and we won't need to chase you for information later.</p>
      ` : `
      <p style="color:#475569;line-height:1.7">We noticed your onboarding form for <strong>${client.company_name}</strong> is still incomplete. We can't begin your campaign work until we receive this — our team is ready and waiting!</p>
      <p style="color:#f97316;font-weight:600">⚠️ Campaign tasks are on hold until onboarding is complete.</p>
      `}
      <div style="margin:32px 0;text-align:center">
        <a href="${formUrl}" style="background:#2563eb;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
          Complete Your Onboarding →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px">This link is unique to your account. Estimated time to complete: 15–25 minutes.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0">
      <p style="color:#64748b;font-size:13px">Questions? Reply to this email or call your account manager directly.</p>
      <p style="color:#94a3b8;font-size:12px;margin:8px 0 0">Digital Search Group · digitalsearchgroup.com.au</p>
    </div>
  </div>
</body>
</html>`
}

// -------------------------------------------------------
// GET /api/onboarding – list all onboarding records
// -------------------------------------------------------
onboardingRoutes.get('/', async (c) => {
  const db = c.env.DB
  const { status, client_id } = c.req.query() as Record<string, string>

  let sql = `
    SELECT o.*, cl.company_name, cl.contact_name, cl.contact_email, cl.contact_phone,
           cl.onboarding_status as client_onboarding_status
    FROM client_onboarding o
    JOIN clients cl ON o.client_id = cl.id
    WHERE 1=1
  `
  const params: any[] = []
  if (client_id) { sql += ' AND o.client_id = ?'; params.push(client_id) }
  if (status) { sql += ' AND o.status = ?'; params.push(status) }
  sql += ' ORDER BY o.created_at DESC'

  const rows = await db.prepare(sql).bind(...params).all()
  return c.json(rows.results)
})

// -------------------------------------------------------
// GET /api/onboarding/:id – full onboarding record with all sections
// -------------------------------------------------------
onboardingRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB

  const [base, brand, audience, content, seo, social, pr, website, reminders] = await Promise.all([
    db.prepare(`
      SELECT o.*, cl.company_name, cl.contact_name, cl.contact_email, cl.contact_phone,
             cl.website, cl.industry, cl.monthly_budget
      FROM client_onboarding o
      JOIN clients cl ON o.client_id = cl.id
      WHERE o.id = ?
    `).bind(id).first(),
    db.prepare('SELECT * FROM onboarding_brand WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_audience WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_content_guidelines WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_seo WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_social WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_pr WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_website WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_reminders WHERE onboarding_id = ? ORDER BY created_at DESC LIMIT 10').bind(id).all(),
  ])

  if (!base) return c.json({ error: 'Onboarding record not found' }, 404)

  return c.json({
    ...base as any,
    sections: {
      brand: brand || {},
      audience: audience || {},
      content: content || {},
      seo: seo || {},
      social: social || {},
      pr: pr || {},
      website: website || {},
    },
    reminders: reminders.results,
    completion: calculateCompletion(base, brand, audience, content, seo),
  })
})

// -------------------------------------------------------
// GET /api/onboarding/form/:token – public form access by token
// -------------------------------------------------------
onboardingRoutes.get('/form/:token', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB

  const base = await db.prepare(`
    SELECT o.*, cl.company_name, cl.contact_name, cl.contact_email, cl.contact_phone,
           cl.website, cl.industry, cl.monthly_budget, cl.location
    FROM client_onboarding o
    JOIN clients cl ON o.client_id = cl.id
    WHERE o.onboarding_token = ?
  `).bind(token).first() as any

  if (!base) return c.json({ error: 'Invalid or expired onboarding link' }, 404)
  if (base.status === 'approved') return c.json({ error: 'Onboarding already completed', status: 'approved' }, 200)

  const [brand, audience, content, seo, social, pr, website] = await Promise.all([
    db.prepare('SELECT * FROM onboarding_brand WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_audience WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_content_guidelines WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_seo WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_social WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_pr WHERE onboarding_id = ?').bind(base.id).first(),
    db.prepare('SELECT * FROM onboarding_website WHERE onboarding_id = ?').bind(base.id).first(),
  ])

  return c.json({
    onboarding: base,
    sections: { brand: brand || {}, audience: audience || {}, content: content || {}, seo: seo || {}, social: social || {}, pr: pr || {}, website: website || {} },
  })
})

// -------------------------------------------------------
// POST /api/onboarding – create new onboarding record
// -------------------------------------------------------
onboardingRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.client_id) return c.json({ error: 'client_id is required' }, 400)

  const token = generateToken()
  const nextReminder = nextReminderDate(0)

  const result = await db.prepare(`
    INSERT INTO client_onboarding (client_id, campaign_id, proposal_id, status, onboarding_token, next_reminder_at, reminder_channel)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)
  `).bind(
    body.client_id,
    body.campaign_id || null,
    body.proposal_id || null,
    token,
    nextReminder,
    body.reminder_channel || 'email'
  ).run()

  const onboardingId = result.meta.last_row_id

  // Update client's onboarding_status and onboarding_id
  await db.prepare(
    "UPDATE clients SET onboarding_status = 'sent', onboarding_id = ? WHERE id = ?"
  ).bind(onboardingId, body.client_id).run()

  // Log activity
  await db.prepare(`
    INSERT INTO activity_log (client_id, campaign_id, activity_type, description)
    VALUES (?, ?, 'onboarding_created', ?)
  `).bind(body.client_id, body.campaign_id || null, 'Onboarding record created and form link generated').run()

  const appUrl = c.env.APP_URL || 'https://dsg.pages.dev'
  const formUrl = `${appUrl}/onboarding/${token}`

  return c.json({ id: onboardingId, token, form_url: formUrl }, 201)
})

// -------------------------------------------------------
// POST /api/onboarding/:id/send – send/resend onboarding form link
// -------------------------------------------------------
onboardingRoutes.post('/:id/send', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB

  const onboarding = await db.prepare(`
    SELECT o.*, cl.company_name, cl.contact_name, cl.contact_email, cl.contact_phone
    FROM client_onboarding o JOIN clients cl ON o.client_id = cl.id
    WHERE o.id = ?
  `).bind(id).first() as any

  if (!onboarding) return c.json({ error: 'Onboarding not found' }, 404)

  const appUrl = c.env.APP_URL || 'https://dsg.pages.dev'
  const formUrl = `${appUrl}/onboarding/${onboarding.onboarding_token}`
  const reminderCount = onboarding.reminders_sent || 0

  let emailSent = false
  let smsSent = false
  const channel = onboarding.reminder_channel || 'email'

  // Email
  if ((channel === 'email' || channel === 'both') && onboarding.contact_email) {
    const subject = reminderCount === 0
      ? `Action required: Complete your onboarding – ${onboarding.company_name}`
      : `Reminder #${reminderCount}: Your onboarding form is still waiting – ${onboarding.company_name}`
    const html = onboardingEmailHTML(onboarding, formUrl, reminderCount)
    emailSent = await sendEmail(c.env.SENDGRID_API_KEY, onboarding.contact_email, subject, html)
  }

  // SMS
  if ((channel === 'sms' || channel === 'both') && onboarding.contact_phone) {
    const smsBody = reminderCount === 0
      ? `Hi ${onboarding.contact_name || 'there'}, your Digital Search Group onboarding form is ready. Please complete it so we can start your campaign: ${formUrl}`
      : `Reminder: Your DSG onboarding form is still incomplete. Campaign work is on hold until done: ${formUrl}`
    smsSent = await sendSMS(
      c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN,
      c.env.TWILIO_FROM_NUMBER, onboarding.contact_phone, smsBody
    )
  }

  const now = new Date().toISOString()
  const nextReminder = nextReminderDate(reminderCount + 1)

  // Record reminder
  await db.prepare(`
    INSERT INTO onboarding_reminders (onboarding_id, client_id, channel, recipient_email, recipient_phone, status, message_preview, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, onboarding.client_id, channel,
    onboarding.contact_email || '', onboarding.contact_phone || '',
    (emailSent || smsSent) ? 'sent' : 'failed',
    `Onboarding form link for ${onboarding.company_name}`,
    now
  ).run()

  // Update reminder count and status
  await db.prepare(`
    UPDATE client_onboarding SET
      reminders_sent = reminders_sent + 1,
      last_reminder_sent_at = ?,
      next_reminder_at = ?,
      status = CASE WHEN status = 'pending' THEN 'pending' ELSE status END
    WHERE id = ?
  `).bind(now, nextReminder, id).run()

  await db.prepare(`
    UPDATE clients SET onboarding_status = 'sent' WHERE id = ? AND onboarding_status = 'not_sent'
  `).bind(onboarding.client_id).run()

  await db.prepare(`
    INSERT INTO activity_log (client_id, activity_type, description)
    VALUES (?, 'onboarding_reminder_sent', ?)
  `).bind(onboarding.client_id, `Onboarding reminder #${reminderCount + 1} sent via ${channel}`).run()

  return c.json({
    message: 'Onboarding form sent',
    email_sent: emailSent,
    sms_sent: smsSent,
    form_url: formUrl,
    next_reminder: nextReminder,
  })
})

// -------------------------------------------------------
// PUT /api/onboarding/form/:token/section/:section – client saves a section
// -------------------------------------------------------
onboardingRoutes.put('/form/:token/section/:section', async (c) => {
  const token = c.req.param('token')
  const section = c.req.param('section')
  const db = c.env.DB
  const body = await c.req.json()

  const onboarding = await db.prepare(
    "SELECT * FROM client_onboarding WHERE onboarding_token = ?"
  ).bind(token).first() as any

  if (!onboarding) return c.json({ error: 'Invalid token' }, 404)
  if (onboarding.status === 'approved') return c.json({ error: 'Onboarding already approved' }, 400)

  const id = onboarding.id
  const now = new Date().toISOString()

  // Mark as in_progress if first save
  if (onboarding.status === 'pending') {
    await db.prepare("UPDATE client_onboarding SET status='in_progress', updated_at=? WHERE id=?").bind(now, id).run()
    await db.prepare("UPDATE clients SET onboarding_status='in_progress' WHERE id=?").bind(onboarding.client_id).run()
  }

  const tableMap: Record<string, string> = {
    brand: 'onboarding_brand',
    audience: 'onboarding_audience',
    content: 'onboarding_content_guidelines',
    seo: 'onboarding_seo',
    social: 'onboarding_social',
    pr: 'onboarding_pr',
    website: 'onboarding_website',
  }

  const table = tableMap[section]
  if (!table) return c.json({ error: 'Unknown section' }, 400)

  // Check if section row exists
  const existing = await db.prepare(`SELECT id FROM ${table} WHERE onboarding_id = ?`).bind(id).first()

  if (existing) {
    // Build dynamic UPDATE
    const keys = Object.keys(body).filter(k => k !== 'onboarding_id' && k !== 'id')
    const setClauses = keys.map(k => `${k} = ?`).join(', ')
    const values = keys.map(k => typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k])
    values.push(now)
    values.push(id)
    await db.prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE onboarding_id = ?`).bind(...values).run()
  } else {
    // INSERT
    const keys = Object.keys(body).filter(k => k !== 'onboarding_id' && k !== 'id')
    const cols = ['onboarding_id', ...keys].join(', ')
    const placeholders = Array(keys.length + 1).fill('?').join(', ')
    const values = [id, ...keys.map(k => typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k])]
    await db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`).bind(...values).run()
  }

  await db.prepare("UPDATE client_onboarding SET updated_at=? WHERE id=?").bind(now, id).run()

  return c.json({ message: `Section '${section}' saved`, section })
})

// -------------------------------------------------------
// POST /api/onboarding/form/:token/submit – client submits complete form
// -------------------------------------------------------
onboardingRoutes.post('/form/:token/submit', async (c) => {
  const token = c.req.param('token')
  const db = c.env.DB

  const onboarding = await db.prepare(
    "SELECT o.*, cl.contact_email, cl.company_name FROM client_onboarding o JOIN clients cl ON o.client_id = cl.id WHERE o.onboarding_token = ?"
  ).bind(token).first() as any

  if (!onboarding) return c.json({ error: 'Invalid token' }, 404)

  const now = new Date().toISOString()
  await db.prepare("UPDATE client_onboarding SET status='submitted', submitted_at=?, updated_at=? WHERE id=?").bind(now, now, onboarding.id).run()
  await db.prepare("UPDATE clients SET onboarding_status='submitted' WHERE id=?").bind(onboarding.client_id).run()

  await db.prepare(`
    INSERT INTO activity_log (client_id, activity_type, description)
    VALUES (?, 'onboarding_submitted', ?)
  `).bind(onboarding.client_id, `Onboarding form submitted by ${onboarding.company_name}`).run()

  return c.json({ message: 'Onboarding submitted successfully. Your account manager will review and get in touch.' })
})

// -------------------------------------------------------
// POST /api/onboarding/:id/approve – internal: approve submitted onboarding
// -------------------------------------------------------
onboardingRoutes.post('/:id/approve', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const { approved_by, notes } = await c.req.json() as any

  const onboarding = await db.prepare(
    "SELECT o.*, cl.id as cid FROM client_onboarding o JOIN clients cl ON o.client_id = cl.id WHERE o.id = ?"
  ).bind(id).first() as any
  if (!onboarding) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE client_onboarding SET status='approved', approved_at=?, approved_by=?, internal_notes=?, updated_at=? WHERE id=?
  `).bind(now, approved_by || 'system', notes || '', now, id).run()
  await db.prepare("UPDATE clients SET onboarding_status='approved' WHERE id=?").bind(onboarding.client_id).run()

  await db.prepare(`
    INSERT INTO activity_log (client_id, activity_type, description)
    VALUES (?, 'onboarding_approved', ?)
  `).bind(onboarding.client_id, `Onboarding approved by ${approved_by || 'system'}`).run()

  return c.json({ message: 'Onboarding approved. Campaign tasks are now unblocked.' })
})

// -------------------------------------------------------
// POST /api/onboarding/process-reminders – cron-style: send due reminders
// -------------------------------------------------------
onboardingRoutes.post('/process-reminders', async (c) => {
  const db = c.env.DB
  const now = new Date().toISOString()

  // Find all pending/in_progress onboardings past their next_reminder_at and < 5 reminders sent
  const due = await db.prepare(`
    SELECT o.*, cl.company_name, cl.contact_name, cl.contact_email, cl.contact_phone
    FROM client_onboarding o JOIN clients cl ON o.client_id = cl.id
    WHERE o.status IN ('pending','in_progress')
    AND o.next_reminder_at <= ?
    AND (o.reminders_sent < 5 OR o.reminders_sent IS NULL)
  `).bind(now).all()

  let sent = 0
  for (const row of due.results as any[]) {
    const appUrl = c.env.APP_URL || 'https://dsg.pages.dev'
    const formUrl = `${appUrl}/onboarding/${row.onboarding_token}`
    const reminderCount = row.reminders_sent || 0
    const channel = row.reminder_channel || 'email'

    let emailSent = false
    let smsSent = false

    if ((channel === 'email' || channel === 'both') && row.contact_email) {
      const subject = `Reminder #${reminderCount + 1}: Complete your DSG onboarding – ${row.company_name}`
      emailSent = await sendEmail(c.env.SENDGRID_API_KEY, row.contact_email, subject, onboardingEmailHTML(row, formUrl, reminderCount))
    }
    if ((channel === 'sms' || channel === 'both') && row.contact_phone) {
      smsSent = await sendSMS(c.env.TWILIO_ACCOUNT_SID, c.env.TWILIO_AUTH_TOKEN, c.env.TWILIO_FROM_NUMBER, row.contact_phone,
        `Reminder: Your DSG onboarding is still incomplete. Campaign work is paused. Complete it here: ${formUrl}`)
    }

    const nextReminder = nextReminderDate(reminderCount + 1)
    await db.prepare(`
      UPDATE client_onboarding SET reminders_sent = reminders_sent + 1, last_reminder_sent_at = ?, next_reminder_at = ? WHERE id = ?
    `).bind(now, nextReminder, row.id).run()

    await db.prepare(`
      INSERT INTO onboarding_reminders (onboarding_id, client_id, channel, recipient_email, recipient_phone, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(row.id, row.client_id, channel, row.contact_email || '', row.contact_phone || '', (emailSent || smsSent) ? 'sent' : 'failed', now).run()

    sent++
  }

  return c.json({ processed: due.results.length, sent })
})

// -------------------------------------------------------
// GET /api/onboarding/:id/completion – section completion status
// -------------------------------------------------------
onboardingRoutes.get('/:id/completion', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB

  const [base, brand, audience, content, seo, social, pr, website] = await Promise.all([
    db.prepare('SELECT * FROM client_onboarding WHERE id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_brand WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_audience WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_content_guidelines WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_seo WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_social WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_pr WHERE onboarding_id = ?').bind(id).first(),
    db.prepare('SELECT * FROM onboarding_website WHERE onboarding_id = ?').bind(id).first(),
  ])

  return c.json(calculateCompletion(base, brand, audience, content, seo))
})

// -------------------------------------------------------
// DELETE /api/onboarding/:id
// -------------------------------------------------------
onboardingRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM client_onboarding WHERE id = ?').bind(id).run()
  return c.json({ message: 'Onboarding record deleted' })
})

// -------------------------------------------------------
// Helper: calculate % completion across core sections
// -------------------------------------------------------
function calculateCompletion(base: any, brand: any, audience: any, content: any, seo: any) {
  function pct(obj: any, requiredKeys: string[]): number {
    if (!obj) return 0
    const filled = requiredKeys.filter(k => obj[k] && obj[k] !== '').length
    return Math.round((filled / requiredKeys.length) * 100)
  }

  const brandPct = pct(brand, ['legal_business_name', 'business_description', 'uvp', 'primary_service', 'primary_phone', 'website_url'])
  const audiencePct = pct(audience, ['primary_persona_name', 'primary_persona_pain_points', 'main_competitors', 'target_cities'])
  const contentPct = pct(content, ['brand_tone', 'writing_style', 'words_to_never_use', 'call_to_action_phrases'])
  const seoPct = pct(seo, ['client_seed_keywords', 'cms_platform', 'reporting_frequency'])
  const overall = Math.round((brandPct + audiencePct + contentPct + seoPct) / 4)

  return {
    overall,
    sections: {
      brand: brandPct,
      audience: audiencePct,
      content: contentPct,
      seo: seoPct,
    },
    status: base?.status || 'unknown',
    submitted: base?.status === 'submitted' || base?.status === 'approved',
    approved: base?.status === 'approved',
  }
}
