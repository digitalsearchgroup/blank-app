import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const reportsRoutes = new Hono<{ Bindings: Bindings }>()

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length))
  return token
}

// GET all reports
reportsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const campaignId = c.req.query('campaign_id')
  const clientId = c.req.query('client_id')

  let q = `SELECT r.*, cl.company_name, ca.name as campaign_name
    FROM reports r
    JOIN clients cl ON r.client_id = cl.id
    JOIN campaigns ca ON r.campaign_id = ca.id
    WHERE 1=1`
  const params: any[] = []
  if (campaignId) { q += ' AND r.campaign_id = ?'; params.push(campaignId) }
  if (clientId) { q += ' AND r.client_id = ?'; params.push(clientId) }
  q += ' ORDER BY r.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  const reports = await stmt.all()
  return c.json(reports.results)
})

// GET single report
reportsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const report = await db.prepare(`
    SELECT r.*, cl.company_name, cl.website, ca.name as campaign_name
    FROM reports r JOIN clients cl ON r.client_id = cl.id JOIN campaigns ca ON r.campaign_id = ca.id
    WHERE r.id = ?
  `).bind(id).first()
  if (!report) return c.json({ error: 'Report not found' }, 404)
  return c.json(report)
})

// POST generate a monthly report
reportsRoutes.post('/generate', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { campaign_id, report_period, report_type } = body

  if (!campaign_id || !report_period) {
    return c.json({ error: 'campaign_id and report_period are required' }, 400)
  }

  const campaign = await db.prepare(`
    SELECT ca.*, cl.company_name, cl.website, cl.contact_email
    FROM campaigns ca JOIN clients cl ON ca.client_id = cl.id
    WHERE ca.id = ?
  `).bind(campaign_id).first() as any

  if (!campaign) return c.json({ error: 'Campaign not found' }, 404)

  // Gather rank data
  const keywords = await db.prepare(`
    SELECT k.*,
      (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1) as current_rank,
      (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1 OFFSET 1) as previous_rank
    FROM keywords k
    WHERE k.campaign_id = ? AND k.is_tracking = 1
  `).bind(campaign_id).all()

  const kws = keywords.results as any[]
  const improved = kws.filter(k => k.current_rank && k.previous_rank && k.current_rank < k.previous_rank)
  const declined = kws.filter(k => k.current_rank && k.previous_rank && k.current_rank > k.previous_rank)
  const top3 = kws.filter(k => k.current_rank && k.current_rank <= 3)
  const top10 = kws.filter(k => k.current_rank && k.current_rank <= 10)

  // Gather LLM data
  const llmSummary = await db.prepare(`
    SELECT COUNT(*) as total_prompts,
      SUM(CASE WHEN h.is_mentioned = 1 THEN 1 ELSE 0 END) as mentions
    FROM llm_prompts p
    LEFT JOIN llm_mention_history h ON h.prompt_id = p.id
    WHERE p.campaign_id = ?
  `).bind(campaign_id).first() as any

  // Gather content data
  const contentPublished = await db.prepare(
    "SELECT COUNT(*) as count FROM content_items WHERE campaign_id = ? AND status = 'published'"
  ).bind(campaign_id).first() as any

  // Average position
  const ranked = kws.filter(k => k.current_rank && k.current_rank <= 100)
  const avgPosition = ranked.length > 0 ? Math.round(ranked.reduce((s, k) => s + k.current_rank, 0) / ranked.length) : null

  // Keyword highlights for report
  const keywordHighlights = kws
    .filter(k => k.current_rank && k.current_rank <= 30)
    .sort((a, b) => (a.current_rank || 999) - (b.current_rank || 999))
    .slice(0, 15)
    .map(k => ({
      keyword: k.keyword,
      previous: k.previous_rank,
      current: k.current_rank,
      change: k.previous_rank && k.current_rank ? k.previous_rank - k.current_rank : 0,
      group: k.keyword_group,
    }))

  // Gather campaign plan phase data (if exists)
  const planData = await db.prepare(`
    SELECT cp.*, pt.client_name AS tier_client_name, pt.tier_key,
           pt.phase1_outcome, pt.phase2_outcome, pt.phase3_outcome, pt.phase4_outcome
    FROM campaign_plans cp
    JOIN plan_tiers pt ON cp.tier_id = pt.id
    WHERE cp.campaign_id = ?
  `).bind(campaign_id).first() as any

  let phaseProgress: any[] = []
  let completedTasks = 0
  let totalTasks = 0

  if (planData) {
    const allTasks = await db.prepare(
      'SELECT month_number, status FROM campaign_tasks WHERE plan_id = ?'
    ).bind(planData.id).all()
    const taskList = allTasks.results as any[]
    totalTasks = taskList.length
    completedTasks = taskList.filter(t => t.status === 'completed').length
    phaseProgress = [1, 2, 3, 4].map(ph => {
      const months = [1, 2, 3].map(m => (ph - 1) * 3 + m)
      const pTasks = taskList.filter(t => months.includes(t.month_number))
      const done = pTasks.filter(t => t.status === 'completed').length
      return { phase: ph, total: pTasks.length, completed: done, pct: pTasks.length ? Math.round((done / pTasks.length) * 100) : 0 }
    })
  }

  const reportData = {
    keyword_highlights: keywordHighlights,
    total_keywords: kws.length,
    llm_data: {
      total_prompts: llmSummary?.total_prompts || 0,
      mentions: llmSummary?.mentions || 0,
      mention_rate: llmSummary?.total_prompts > 0 ? Math.round(((llmSummary?.mentions || 0) / llmSummary.total_prompts) * 100) : 0,
    },
    plan_data: planData ? {
      tier: planData.tier_client_name,
      tier_key: planData.tier_key,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      phase_progress: phaseProgress,
    } : null,
  }

  // Generate AI summary
  const summary = generateReportSummary(campaign, improved.length, declined.length, top10.length, top3.length, contentPublished?.count || 0)

  const token = generateToken()

  const result = await db.prepare(`
    INSERT INTO reports (campaign_id, client_id, report_period, report_type, status, summary, keywords_improved, keywords_declined, keywords_new, avg_position, top10_keywords, top3_keywords, llm_mentions, content_published, report_data, report_token)
    VALUES (?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    campaign_id, campaign.client_id, report_period, report_type || 'monthly',
    summary, improved.length, declined.length, 0, avgPosition,
    top10.length, top3.length, llmSummary?.mentions || 0,
    contentPublished?.count || 0, JSON.stringify(reportData), token
  ).run()

  return c.json({
    id: result.meta.last_row_id,
    report_token: token,
    view_url: `/reports/view/${token}`,
    summary,
    keywords_improved: improved.length,
    keywords_declined: declined.length,
    top10_keywords: top10.length,
    top3_keywords: top3.length,
    avg_position: avgPosition,
    content_published: contentPublished?.count || 0,
    llm_mentions: llmSummary?.mentions || 0,
  })
})

// POST send report
reportsRoutes.post('/:id/send', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const now = new Date().toISOString()

  await db.prepare("UPDATE reports SET status='sent', sent_at=? WHERE id=?").bind(now, id).run()

  const report = await db.prepare(`
    SELECT r.*, cl.contact_email, cl.company_name
    FROM reports r JOIN clients cl ON r.client_id = cl.id
    WHERE r.id = ?
  `).bind(id).first() as any

  return c.json({
    message: 'Report marked as sent',
    view_url: `/reports/view/${report?.report_token}`,
    sent_to: report?.contact_email,
  })
})

// DELETE report
reportsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM reports WHERE id = ?').bind(id).run()
  return c.json({ message: 'Report deleted' })
})

function generateReportSummary(campaign: any, improved: number, declined: number, top10: number, top3: number, contentPublished: number): string {
  const name = campaign.company_name
  const positive = improved > declined

  const phrases = positive
    ? ['strong authority momentum', 'continued upward velocity', 'positive authority signals']
    : ['steady progress', 'consistent development', 'progressive growth']
  const phrase = phrases[Math.floor(Math.random() * phrases.length)]

  let summary = `${name}'s digital authority campaign is demonstrating ${phrase}. `
  summary += `This reporting period recorded ${improved} keyword${improved !== 1 ? 's' : ''} improving in organic visibility`
  if (top3 > 0) summary += `, with ${top3} now occupying Top 3 positions`
  summary += `. Currently ${top10} keyword${top10 !== 1 ? 's' : ''} rank within the Top 10 on Google, delivering consistent qualified visibility.`

  if (declined > 0) {
    summary += ` ${declined} keyword${declined !== 1 ? 's' : ''} experienced minor ranking fluctuations — standard in competitive verticals. We are addressing these through targeted content authority signals and entity reinforcement.`
  }

  if (contentPublished > 0) {
    summary += ` ${contentPublished} piece${contentPublished !== 1 ? 's' : ''} of authority-engineered content were published this period, strengthening topical depth and creating new organic entry points.`
  }

  summary += ` Next period focus: elevating near-page-1 keywords to page 1, expanding entity coverage for high-priority topics, and continuing AI search visibility monitoring across ChatGPT, Google AI Overviews, and Perplexity.`

  return summary
}
