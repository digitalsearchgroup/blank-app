import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const clientsRoutes = new Hono<{ Bindings: Bindings }>()

// GET all clients
clientsRoutes.get('/', async (c) => {
  const db = c.env.DB
  // include_archived=1 shows archived clients; default hides them
  const includeArchived = c.req.query('include_archived') === '1'
  const archivedOnly = c.req.query('archived_only') === '1'

  let whereClause = ''
  if (archivedOnly) {
    whereClause = 'WHERE c.is_archived = 1'
  } else if (!includeArchived) {
    whereClause = 'WHERE c.is_archived = 0'
  }

  const clients = await db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT ca.id) as campaign_count,
      COUNT(DISTINCT k.id) as keyword_count,
      COUNT(DISTINCT p.id) as proposal_count,
      (SELECT SUM(amount) FROM payments WHERE client_id = c.id AND status = 'succeeded') as total_paid
    FROM clients c
    LEFT JOIN campaigns ca ON ca.client_id = c.id AND ca.status = 'active' AND ca.is_archived = 0
    LEFT JOIN keywords k ON k.client_id = c.id
    LEFT JOIN proposals p ON p.client_id = c.id
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.is_archived ASC, c.company_name ASC
  `).all()
  return c.json(clients.results)
})

// GET single client with all related data
clientsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  if (!client) return c.json({ error: 'Client not found' }, 404)

  const [campaigns, proposals, payments, activity, wpProjects, socialStats, keywords] = await Promise.all([
    db.prepare('SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare('SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC LIMIT 10').bind(id).all(),
    db.prepare('SELECT * FROM activity_log WHERE client_id = ? ORDER BY created_at DESC LIMIT 20').bind(id).all(),
    db.prepare('SELECT * FROM wordpress_projects WHERE client_id = ? ORDER BY created_at DESC').bind(id).all(),
    db.prepare(`
      SELECT 
        COUNT(*) as total_posts,
        COUNT(CASE WHEN status='published' THEN 1 END) as published,
        COUNT(CASE WHEN status='scheduled' THEN 1 END) as scheduled
      FROM social_posts WHERE client_id = ?
    `).bind(id).first(),
    db.prepare('SELECT * FROM keywords WHERE client_id = ? ORDER BY created_at DESC').bind(id).all(),
  ])

  return c.json({
    ...client as any,
    campaigns: campaigns.results,
    proposals: proposals.results,
    payments: payments.results,
    activity: activity.results,
    wordpress_projects: wpProjects.results,
    social_stats: socialStats,
    keywords: keywords.results,
  })
})

// POST create client
clientsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.company_name || !body.contact_email || !body.website) {
    return c.json({ error: 'company_name, contact_email, and website are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO clients (
      company_name, contact_name, contact_email, contact_phone, website,
      industry, location, timezone, monthly_budget, notes, status,
      abn, address, city, state, postcode, country, account_manager,
      referral_source, contract_start, contract_end,
      linkedin_url, facebook_url, instagram_handle,
      google_business_id, ga4_property_id, gsc_property,
      cms_platform, hosting_provider,
      secondary_contact_name, secondary_contact_email
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?
    )
  `).bind(
    body.company_name, body.contact_name || '', body.contact_email,
    body.contact_phone || '', body.website,
    body.industry || '', body.location || '', body.timezone || 'Australia/Sydney',
    body.monthly_budget || 0, body.notes || '', body.status || 'prospect',
    body.abn || '', body.address || '', body.city || '',
    body.state || '', body.postcode || '', body.country || 'Australia',
    body.account_manager || '', body.referral_source || '',
    body.contract_start || null, body.contract_end || null,
    body.linkedin_url || '', body.facebook_url || '', body.instagram_handle || '',
    body.google_business_id || '', body.ga4_property_id || '', body.gsc_property || '',
    body.cms_platform || 'wordpress', body.hosting_provider || '',
    body.secondary_contact_name || '', body.secondary_contact_email || ''
  ).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'client_created', ?)"
  ).bind(result.meta.last_row_id, `New client created: ${body.company_name}`).run()

  return c.json({ id: result.meta.last_row_id, message: 'Client created' }, 201)
})

// PUT update client - full update
clientsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE clients SET
      company_name=?, contact_name=?, contact_email=?, contact_phone=?,
      website=?, industry=?, location=?, timezone=?, monthly_budget=?,
      notes=?, status=?,
      abn=?, address=?, city=?, state=?, postcode=?, country=?,
      account_manager=?, referral_source=?, contract_start=?, contract_end=?,
      linkedin_url=?, facebook_url=?, instagram_handle=?,
      google_business_id=?, ga4_property_id=?, gsc_property=?,
      cms_platform=?, hosting_provider=?,
      secondary_contact_name=?, secondary_contact_email=?,
      updated_at=?
    WHERE id=?
  `).bind(
    body.company_name, body.contact_name, body.contact_email, body.contact_phone || '',
    body.website, body.industry || '', body.location || '', body.timezone || 'Australia/Sydney',
    body.monthly_budget || 0, body.notes || '', body.status || 'prospect',
    body.abn || '', body.address || '', body.city || '', body.state || '',
    body.postcode || '', body.country || 'Australia',
    body.account_manager || '', body.referral_source || '',
    body.contract_start || null, body.contract_end || null,
    body.linkedin_url || '', body.facebook_url || '', body.instagram_handle || '',
    body.google_business_id || '', body.ga4_property_id || '', body.gsc_property || '',
    body.cms_platform || 'wordpress', body.hosting_provider || '',
    body.secondary_contact_name || '', body.secondary_contact_email || '',
    now, id
  ).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'client_updated', ?)"
  ).bind(id, `Client profile updated: ${body.company_name}`).run()

  return c.json({ message: 'Client updated' })
})

// PATCH sync campaign start dates from contract_start
clientsRoutes.patch('/:id/sync-campaign-dates', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { start_date } = body
  if (!start_date) return c.json({ error: 'start_date required' }, 400)

  // Update all active campaigns for this client
  const result = await db.prepare(`
    UPDATE campaigns SET start_date = ?, updated_at = ?
    WHERE client_id = ? AND status = 'active'
  `).bind(start_date, new Date().toISOString(), id).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'campaign_dates_synced', ?)"
  ).bind(id, `Campaign start dates synced to ${start_date}`).run()

  return c.json({ message: 'Campaign start dates synced', updated: result.meta.changes })
})

// ── POST /api/clients/:id/archive ───────────────────────────
// Archive a client: soft-hides client + all their campaigns + pauses plan tasks
clientsRoutes.post('/:id/archive', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json() as any
  const { reason, note, performed_by } = body
  const now = new Date().toISOString()

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first() as any
  if (!client) return c.json({ error: 'Client not found' }, 404)
  if (client.is_archived) return c.json({ error: 'Client is already archived' }, 409)

  // Archive the client
  await db.prepare(`
    UPDATE clients SET is_archived=1, archived_at=?, archived_reason=?, archived_by=?, archive_note=?, updated_at=?
    WHERE id=?
  `).bind(now, reason || 'other', performed_by || '', note || '', now, id).run()

  // Archive all campaigns for this client
  const campResult = await db.prepare(`
    UPDATE campaigns SET is_archived=1, archived_at=?, archived_reason=?, archived_by=?, updated_at=?
    WHERE client_id=? AND is_archived=0
  `).bind(now, reason || 'other', performed_by || '', now, id).run()
  const campaignsAffected = campResult.meta.changes as number

  // Count how many plan tasks exist for this client (for reporting)
  const planCount = await db.prepare(
    'SELECT COUNT(*) as cnt FROM campaign_plans WHERE client_id=?'
  ).bind(id).first() as any

  // Log the archive action
  await db.prepare(`
    INSERT INTO client_archive_log (client_id, action, reason, note, performed_by, campaigns_affected, plans_affected)
    VALUES (?, 'archived', ?, ?, ?, ?, ?)
  `).bind(id, reason || 'other', note || '', performed_by || '', campaignsAffected, planCount?.cnt || 0).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'client_archived', ?)"
  ).bind(id, `Client archived – reason: ${reason || 'other'}. ${campaignsAffected} campaign(s) also archived.`).run()

  return c.json({
    message: 'Client archived successfully',
    campaigns_archived: campaignsAffected,
    plans_count: planCount?.cnt || 0,
  })
})

// ── POST /api/clients/:id/restore ───────────────────────────
// Restore a previously archived client and optionally their campaigns
clientsRoutes.post('/:id/restore', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json() as any
  const { restore_campaigns = true, performed_by } = body
  const now = new Date().toISOString()

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first() as any
  if (!client) return c.json({ error: 'Client not found' }, 404)
  if (!client.is_archived) return c.json({ error: 'Client is not archived' }, 409)

  // Restore client
  await db.prepare(`
    UPDATE clients SET is_archived=0, archived_at=NULL, archived_reason=NULL, archived_by=NULL, archive_note=NULL, updated_at=?
    WHERE id=?
  `).bind(now, id).run()

  let campaignsRestored = 0
  if (restore_campaigns) {
    const campResult = await db.prepare(`
      UPDATE campaigns SET is_archived=0, archived_at=NULL, archived_reason=NULL, archived_by=NULL, updated_at=?
      WHERE client_id=? AND is_archived=1
    `).bind(now, id).run()
    campaignsRestored = campResult.meta.changes as number
  }

  // Log the restore action
  await db.prepare(`
    INSERT INTO client_archive_log (client_id, action, reason, note, performed_by, campaigns_affected, plans_affected)
    VALUES (?, 'restored', 'manual_restore', ?, ?, ?, 0)
  `).bind(id, `Restored by ${performed_by || 'team'}`, performed_by || '', campaignsRestored).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'client_restored', ?)"
  ).bind(id, `Client restored from archive. ${campaignsRestored} campaign(s) also restored.`).run()

  return c.json({
    message: 'Client restored successfully',
    campaigns_restored: campaignsRestored,
  })
})

// ── GET /api/clients/:id/archive-log ────────────────────────
clientsRoutes.get('/:id/archive-log', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const log = await db.prepare(
    'SELECT * FROM client_archive_log WHERE client_id=? ORDER BY performed_at DESC'
  ).bind(id).all()
  return c.json(log.results)
})

// DELETE client
clientsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  // Get client name for log
  const client = await db.prepare('SELECT company_name FROM clients WHERE id = ?').bind(id).first() as any
  await db.prepare('DELETE FROM clients WHERE id = ?').bind(id).run()
  await db.prepare(
    "INSERT INTO activity_log (activity_type, description) VALUES ('client_deleted', ?)"
  ).bind(`Client deleted: ${client?.company_name || id}`).run()
  return c.json({ message: 'Client deleted' })
})

// GET client stats summary
clientsRoutes.get('/:id/stats', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB

  const [rankStats, contentStats, billingStats, llmStats] = await Promise.all([
    db.prepare(`
      SELECT 
        COUNT(*) as total_keywords,
        COUNT(CASE WHEN rh.rank_position <= 3 THEN 1 END) as top3,
        COUNT(CASE WHEN rh.rank_position <= 10 THEN 1 END) as top10,
        AVG(rh.rank_position) as avg_position
      FROM keywords k
      LEFT JOIN rank_history rh ON rh.keyword_id = k.id
      WHERE k.client_id = ?
      AND (rh.tracked_at = (SELECT MAX(tracked_at) FROM rank_history rh2 WHERE rh2.keyword_id = k.id) OR rh.id IS NULL)
    `).bind(id).first(),
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='published' THEN 1 END) as published,
        COUNT(CASE WHEN status IN ('planned','briefed','in_progress','review') THEN 1 END) as in_pipeline
      FROM content_items WHERE client_id = ?
    `).bind(id).first(),
    db.prepare(`
      SELECT 
        SUM(CASE WHEN status='succeeded' THEN amount ELSE 0 END) as total_paid,
        COUNT(CASE WHEN status='succeeded' THEN 1 END) as payment_count
      FROM payments WHERE client_id = ?
    `).bind(id).first(),
    db.prepare(`
      SELECT COUNT(*) as total_prompts,
        COUNT(CASE WHEN lmh.is_mentioned = 1 THEN 1 END) as mentioned
      FROM llm_prompts lp
      LEFT JOIN llm_mention_history lmh ON lmh.prompt_id = lp.id
      WHERE lp.client_id = ?
    `).bind(id).first(),
  ])

  return c.json({ rankStats, contentStats, billingStats, llmStats })
})
