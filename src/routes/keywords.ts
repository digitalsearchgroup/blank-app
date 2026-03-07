import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const keywordsRoutes = new Hono<{ Bindings: Bindings }>()

keywordsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const campaignId = c.req.query('campaign_id')
  const clientId = c.req.query('client_id')
  
  let q = `SELECT k.*, 
    (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1) as current_rank,
    (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1 OFFSET 1) as previous_rank,
    (SELECT rh.tracked_at FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1) as last_tracked
    FROM keywords k`
  
  const params: any[] = []
  if (campaignId) { q += ' WHERE k.campaign_id = ?'; params.push(campaignId) }
  else if (clientId) { q += ' WHERE k.client_id = ?'; params.push(clientId) }
  q += ' ORDER BY k.priority DESC, k.monthly_search_volume DESC'
  
  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  const keywords = await stmt.all()
  return c.json(keywords.results)
})

keywordsRoutes.get('/:id/history', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const history = await db.prepare(
    'SELECT * FROM rank_history WHERE keyword_id = ? ORDER BY tracked_at DESC LIMIT 30'
  ).bind(id).all()
  return c.json(history.results)
})

keywordsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { campaign_id, client_id, keyword, target_url, location_code, language_code, keyword_group, priority, monthly_search_volume, keyword_difficulty, cpc } = body

  if (!campaign_id || !client_id || !keyword) {
    return c.json({ error: 'campaign_id, client_id, and keyword are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO keywords (campaign_id, client_id, keyword, target_url, location_code, language_code, keyword_group, priority, monthly_search_volume, keyword_difficulty, cpc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(campaign_id, client_id, keyword, target_url || '', location_code || 2840, language_code || 'en', keyword_group || '', priority || 'medium', monthly_search_volume || null, keyword_difficulty || null, cpc || null).run()

  return c.json({ id: result.meta.last_row_id, message: 'Keyword added' }, 201)
})

keywordsRoutes.post('/bulk', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { campaign_id, client_id, keywords } = body

  if (!Array.isArray(keywords) || !campaign_id || !client_id) {
    return c.json({ error: 'campaign_id, client_id, and keywords array are required' }, 400)
  }

  const stmts = keywords.map((kw: any) =>
    db.prepare(`
      INSERT OR IGNORE INTO keywords (campaign_id, client_id, keyword, target_url, location_code, language_code, keyword_group, priority, monthly_search_volume, keyword_difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(campaign_id, client_id, kw.keyword, kw.target_url || '', kw.location_code || 2840, kw.language_code || 'en', kw.keyword_group || '', kw.priority || 'medium', kw.monthly_search_volume || null, kw.keyword_difficulty || null)
  )

  await db.batch(stmts)
  return c.json({ message: `${keywords.length} keywords added` }, 201)
})

keywordsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { keyword, target_url, keyword_group, priority, is_tracking } = body

  await db.prepare(`
    UPDATE keywords SET keyword=?, target_url=?, keyword_group=?, priority=?, is_tracking=?
    WHERE id=?
  `).bind(keyword, target_url, keyword_group, priority, is_tracking ?? 1, id).run()

  return c.json({ message: 'Keyword updated' })
})

keywordsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM keywords WHERE id = ?').bind(id).run()
  return c.json({ message: 'Keyword deleted' })
})
