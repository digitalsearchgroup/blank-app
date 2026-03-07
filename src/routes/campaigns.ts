import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const campaignsRoutes = new Hono<{ Bindings: Bindings }>()

campaignsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const includeArchived = c.req.query('include_archived') === '1'
  const archivedClause = includeArchived ? '' : 'AND ca.is_archived = 0'

  const q = clientId
    ? `SELECT ca.*, cl.company_name, cl.website, COUNT(DISTINCT k.id) as keyword_count, COUNT(DISTINCT ci.id) as content_count
       FROM campaigns ca
       JOIN clients cl ON ca.client_id = cl.id
       LEFT JOIN keywords k ON k.campaign_id = ca.id
       LEFT JOIN content_items ci ON ci.campaign_id = ca.id
       WHERE ca.client_id = ? ${archivedClause}
       GROUP BY ca.id ORDER BY ca.created_at DESC`
    : `SELECT ca.*, cl.company_name, cl.website, COUNT(DISTINCT k.id) as keyword_count, COUNT(DISTINCT ci.id) as content_count
       FROM campaigns ca
       JOIN clients cl ON ca.client_id = cl.id
       LEFT JOIN keywords k ON k.campaign_id = ca.id
       LEFT JOIN content_items ci ON ci.campaign_id = ca.id
       WHERE 1=1 ${archivedClause}
       GROUP BY ca.id ORDER BY ca.created_at DESC`
  
  const campaigns = clientId
    ? await db.prepare(q).bind(clientId).all()
    : await db.prepare(q).all()
  
  return c.json(campaigns.results)
})

campaignsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const campaign = await db.prepare(`
    SELECT ca.*, cl.company_name, cl.website, cl.contact_email
    FROM campaigns ca
    JOIN clients cl ON ca.client_id = cl.id
    WHERE ca.id = ?
  `).bind(id).first()
  if (!campaign) return c.json({ error: 'Campaign not found' }, 404)
  
  const keywords = await db.prepare('SELECT * FROM keywords WHERE campaign_id = ? ORDER BY priority DESC, keyword').bind(id).all()
  const competitors = await db.prepare('SELECT * FROM competitors WHERE campaign_id = ?').bind(id).all()
  const llmPrompts = await db.prepare('SELECT * FROM llm_prompts WHERE campaign_id = ?').bind(id).all()
  
  return c.json({
    ...(campaign as any),
    keywords: keywords.results,
    competitors: competitors.results,
    llm_prompts: llmPrompts.results
  })
})

campaignsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { client_id, name, campaign_type, start_date, monthly_investment, target_locations, goals, notes } = body

  if (!client_id || !name || !start_date) {
    return c.json({ error: 'client_id, name, and start_date are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO campaigns (client_id, name, campaign_type, start_date, monthly_investment, target_locations, goals, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(client_id, name, campaign_type || 'organic_seo', start_date, monthly_investment || 0, target_locations || '', goals || '', notes || '').run()

  return c.json({ id: result.meta.last_row_id, message: 'Campaign created' }, 201)
})

campaignsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { name, campaign_type, status, start_date, end_date, monthly_investment, target_locations, goals, notes } = body

  await db.prepare(`
    UPDATE campaigns SET name=?, campaign_type=?, status=?, start_date=?, end_date=?, monthly_investment=?, target_locations=?, goals=?, notes=?, updated_at=?
    WHERE id=?
  `).bind(name, campaign_type, status, start_date, end_date || null, monthly_investment, target_locations, goals, notes, new Date().toISOString(), id).run()

  return c.json({ message: 'Campaign updated' })
})

campaignsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM campaigns WHERE id = ?').bind(id).run()
  return c.json({ message: 'Campaign deleted' })
})
