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

  const reportData = {
    keyword_highlights: keywordHighlights,
    total_keywords: kws.length,
    llm_data: {
      total_prompts: llmSummary?.total_prompts || 0,
      mentions: llmSummary?.mentions || 0,
      mention_rate: llmSummary?.total_prompts > 0 ? Math.round(((llmSummary?.mentions || 0) / llmSummary.total_prompts) * 100) : 0,
    },
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

  const summaries = [
    `${name}'s organic search campaign continues ${positive ? 'to show strong momentum' : 'to progress'}. This reporting period saw ${improved} keyword${improved !== 1 ? 's' : ''} improve in rankings${improved > 0 ? `, including ${top3} now ranking in the top 3 positions` : ''}. ${top10} keyword${top10 !== 1 ? 's' : ''} are now ranking in the top 10 on Google, representing key visibility for your target audience.`,
  ]

  if (declined > 0) {
    summaries.push(` ${declined} keyword${declined !== 1 ? 's' : ''} experienced minor fluctuations — this is normal in competitive markets and we are actively addressing these with content and technical optimisations.`)
  }

  if (contentPublished > 0) {
    summaries.push(` We published ${contentPublished} piece${contentPublished !== 1 ? 's' : ''} of SEO-optimised content this month, building topical authority and creating new entry points for organic traffic.`)
  }

  summaries.push(` Our focus for the next period will be on converting near-page-1 keywords to page 1 rankings, expanding content depth for high-priority topics, and continuing to monitor AI search visibility across ChatGPT, Google AI Overviews, and Perplexity.`)

  return summaries.join('')
}
