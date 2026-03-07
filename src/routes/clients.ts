import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const clientsRoutes = new Hono<{ Bindings: Bindings }>()

// GET all clients
clientsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clients = await db.prepare(`
    SELECT c.*, 
      COUNT(DISTINCT ca.id) as campaign_count,
      COUNT(DISTINCT k.id) as keyword_count
    FROM clients c
    LEFT JOIN campaigns ca ON ca.client_id = c.id AND ca.status = 'active'
    LEFT JOIN keywords k ON k.client_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all()
  return c.json(clients.results)
})

// GET single client with campaigns
clientsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  if (!client) return c.json({ error: 'Client not found' }, 404)
  
  const campaigns = await db.prepare('SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC').bind(id).all()
  const proposals = await db.prepare('SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC').bind(id).all()
  const recentActivity = await db.prepare(
    'SELECT * FROM activity_log WHERE client_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(id).all()
  
  return c.json({ ...client as any, campaigns: campaigns.results, proposals: proposals.results, activity: recentActivity.results })
})

// POST create client
clientsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { company_name, contact_name, contact_email, contact_phone, website, industry, location, timezone, monthly_budget, notes } = body

  if (!company_name || !contact_email || !website) {
    return c.json({ error: 'company_name, contact_email, and website are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO clients (company_name, contact_name, contact_email, contact_phone, website, industry, location, timezone, monthly_budget, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(company_name, contact_name, contact_email, contact_phone || '', website, industry || '', location || '', timezone || 'UTC', monthly_budget || 0, notes || '').run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'client_created', ?)"
  ).bind(result.meta.last_row_id, `New client created: ${company_name}`).run()

  return c.json({ id: result.meta.last_row_id, message: 'Client created' }, 201)
})

// PUT update client
clientsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { company_name, contact_name, contact_email, contact_phone, website, industry, location, status, monthly_budget, notes } = body

  await db.prepare(`
    UPDATE clients SET company_name=?, contact_name=?, contact_email=?, contact_phone=?, website=?, industry=?, location=?, status=?, monthly_budget=?, notes=?, updated_at=?
    WHERE id=?
  `).bind(company_name, contact_name, contact_email, contact_phone, website, industry, location, status, monthly_budget, notes, new Date().toISOString(), id).run()

  return c.json({ message: 'Client updated' })
})

// DELETE client
clientsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM clients WHERE id = ?').bind(id).run()
  return c.json({ message: 'Client deleted' })
})
