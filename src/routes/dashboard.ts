import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const dashboardRoutes = new Hono<{ Bindings: Bindings }>()

dashboardRoutes.get('/overview', async (c) => {
  const db = c.env.DB

  const [clientStats, campaignStats, keywordStats, contentStats, proposalStats] = await Promise.all([
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'prospect' THEN 1 ELSE 0 END) as prospects,
        SUM(CASE WHEN status = 'churned' THEN 1 ELSE 0 END) as churned,
        COALESCE(SUM(monthly_budget), 0) as total_mrr_clients
      FROM clients
    `).first(),
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM campaigns
    `).first(),
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) <= 3 THEN 1 ELSE 0 END) as top3,
        SUM(CASE WHEN (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) <= 10 THEN 1 ELSE 0 END) as top10
      FROM keywords k WHERE is_tracking = 1
    `).first(),
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN status IN ('planned','briefed','in_progress') THEN 1 ELSE 0 END) as in_pipeline
      FROM content_items
    `).first(),
    db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
      FROM proposals
    `).first(),
  ])

  const recentActivity = await db.prepare(
    'SELECT al.*, cl.company_name FROM activity_log al LEFT JOIN clients cl ON al.client_id = cl.id ORDER BY al.created_at DESC LIMIT 10'
  ).all()

  const upcomingContent = await db.prepare(`
    SELECT ci.title, ci.due_date, ci.status, ci.content_type, cl.company_name
    FROM content_items ci
    JOIN clients cl ON ci.client_id = cl.id
    WHERE ci.status NOT IN ('published','cancelled') AND ci.due_date IS NOT NULL
    ORDER BY ci.due_date ASC LIMIT 5
  `).all()

  const pendingProposals = await db.prepare(`
    SELECT p.title, p.monthly_investment, p.sent_at, p.expires_at, cl.company_name, cl.contact_email
    FROM proposals p JOIN clients cl ON p.client_id = cl.id
    WHERE p.status = 'sent'
    ORDER BY p.sent_at DESC LIMIT 5
  `).all()

  // MRR from active campaigns
  const mrrData = await db.prepare(
    "SELECT COALESCE(SUM(monthly_investment), 0) as total_mrr FROM campaigns WHERE status = 'active'"
  ).first() as any

  return c.json({
    clients: clientStats,
    campaigns: campaignStats,
    keywords: keywordStats,
    content: contentStats,
    proposals: proposalStats,
    total_mrr: mrrData?.total_mrr || 0,
    active_clients: (clientStats as any)?.active || 0,
    recent_activity: recentActivity.results,
    upcoming_content: upcomingContent.results,
    pending_proposals: pendingProposals.results,
  })
})

// GET per-client overview
dashboardRoutes.get('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId')
  const db = c.env.DB

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(clientId).first()
  if (!client) return c.json({ error: 'Client not found' }, 404)

  const campaigns = await db.prepare(
    "SELECT * FROM campaigns WHERE client_id = ? AND status = 'active'"
  ).bind(clientId).all()

  const keywordStats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) <= 3 THEN 1 ELSE 0 END) as top3,
      SUM(CASE WHEN (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) <= 10 THEN 1 ELSE 0 END) as top10,
      SUM(CASE WHEN (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) > 10 
           AND (SELECT rank_position FROM rank_history WHERE keyword_id = k.id ORDER BY tracked_at DESC LIMIT 1) <= 30 THEN 1 ELSE 0 END) as top30
    FROM keywords k WHERE k.client_id = ? AND k.is_tracking = 1
  `).bind(clientId).first()

  const llmStats = await db.prepare(`
    SELECT 
      COUNT(DISTINCT p.id) as total_prompts,
      SUM(CASE WHEN h.is_mentioned = 1 THEN 1 ELSE 0 END) as mentions
    FROM llm_prompts p
    LEFT JOIN llm_mention_history h ON h.prompt_id = p.id
      AND h.tracked_at = (SELECT MAX(tracked_at) FROM llm_mention_history WHERE prompt_id = p.id)
    WHERE p.client_id = ?
  `).bind(clientId).first()

  const contentStats = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END) as planned
    FROM content_items WHERE client_id = ?
  `).bind(clientId).first()

  const latestReport = await db.prepare(
    "SELECT * FROM reports WHERE client_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(clientId).first()

  return c.json({
    client,
    campaigns: campaigns.results,
    keyword_stats: keywordStats,
    llm_stats: llmStats,
    content_stats: contentStats,
    latest_report: latestReport,
  })
})
