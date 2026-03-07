import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const socialRoutes = new Hono<{ Bindings: Bindings }>()
export const pressReleaseRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// SOCIAL POSTS
// ============================================================

socialRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const platform = c.req.query('platform')
  const status = c.req.query('status')

  let q = `SELECT sp.*, cl.company_name FROM social_posts sp
    JOIN clients cl ON sp.client_id = cl.id WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND sp.client_id = ?'; params.push(clientId) }
  if (platform) { q += ' AND sp.platform = ?'; params.push(platform) }
  if (status) { q += ' AND sp.status = ?'; params.push(status) }
  q += ' ORDER BY sp.scheduled_at DESC, sp.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

socialRoutes.get('/calendar', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const month = c.req.query('month') // YYYY-MM format

  let q = `SELECT sp.*, cl.company_name FROM social_posts sp
    JOIN clients cl ON sp.client_id = cl.id WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND sp.client_id = ?'; params.push(clientId) }
  if (month) { q += ` AND strftime('%Y-%m', sp.scheduled_at) = ?`; params.push(month) }
  q += ' ORDER BY sp.scheduled_at ASC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

socialRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.client_id || !body.platform) {
    return c.json({ error: 'client_id and platform are required' }, 400)
  }

  // Support bulk creation across platforms
  const platforms = Array.isArray(body.platform) ? body.platform : [body.platform]
  const ids = []

  for (const platform of platforms) {
    const result = await db.prepare(`
      INSERT INTO social_posts (
        client_id, campaign_id, content_item_id, platform, post_type,
        caption, hashtags, image_url, video_url, link_url,
        scheduled_at, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.client_id, body.campaign_id || null, body.content_item_id || null,
      platform, body.post_type || 'organic',
      body.caption || '', body.hashtags || '',
      body.image_url || '', body.video_url || '', body.link_url || '',
      body.scheduled_at || null,
      body.status || (body.scheduled_at ? 'scheduled' : 'draft'),
      body.notes || ''
    ).run()
    ids.push(result.meta.last_row_id)
  }

  return c.json({ ids, message: `${ids.length} social post(s) created` }, 201)
})

socialRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()

  await db.prepare(`
    UPDATE social_posts SET
      platform=?, post_type=?, caption=?, hashtags=?,
      image_url=?, video_url=?, link_url=?,
      scheduled_at=?, status=?, notes=?,
      ${body.status === 'published' ? 'published_at=?,' : ''}
      likes=?, comments=?, shares=?, reach=?, impressions=?
    WHERE id=?
  `).bind(
    body.platform, body.post_type || 'organic',
    body.caption || '', body.hashtags || '',
    body.image_url || '', body.video_url || '', body.link_url || '',
    body.scheduled_at || null,
    body.status || 'draft',
    body.notes || '',
    ...(body.status === 'published' ? [new Date().toISOString()] : []),
    body.likes || 0, body.comments || 0, body.shares || 0,
    body.reach || 0, body.impressions || 0, id
  ).run()

  return c.json({ message: 'Social post updated' })
})

socialRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM social_posts WHERE id = ?').bind(id).run()
  return c.json({ message: 'Social post deleted' })
})

socialRoutes.get('/stats', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')

  let q = `SELECT
    platform,
    COUNT(*) as total_posts,
    COUNT(CASE WHEN status='published' THEN 1 END) as published,
    SUM(likes) as total_likes,
    SUM(comments) as total_comments,
    SUM(shares) as total_shares,
    SUM(reach) as total_reach,
    SUM(impressions) as total_impressions
    FROM social_posts WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND client_id = ?'; params.push(clientId) }
  q += ' GROUP BY platform'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

// ============================================================
// PRESS RELEASES
// ============================================================

pressReleaseRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')

  let q = `SELECT pr.*, cl.company_name FROM press_releases pr
    JOIN clients cl ON pr.client_id = cl.id WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND pr.client_id = ?'; params.push(clientId) }
  q += ' ORDER BY pr.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

pressReleaseRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const pr = await db.prepare(`
    SELECT pr.*, cl.company_name, cl.website, cl.contact_name, cl.contact_email, cl.contact_phone
    FROM press_releases pr JOIN clients cl ON pr.client_id = cl.id
    WHERE pr.id = ?
  `).bind(id).first()
  if (!pr) return c.json({ error: 'Not found' }, 404)
  return c.json(pr)
})

pressReleaseRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.client_id || !body.headline) {
    return c.json({ error: 'client_id and headline are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO press_releases (
      client_id, campaign_id, headline, subheadline, body_text,
      quote, quote_attribution, boilerplate, contact_info,
      distribution_list, distribution_date, embargo_date,
      target_publications, status, seo_keywords
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.client_id, body.campaign_id || null,
    body.headline, body.subheadline || '',
    body.body_text || '', body.quote || '',
    body.quote_attribution || '', body.boilerplate || '',
    body.contact_info || '', body.distribution_list || '',
    body.distribution_date || null, body.embargo_date || null,
    body.target_publications || '',
    body.status || 'draft', body.seo_keywords || ''
  ).run()

  return c.json({ id: result.meta.last_row_id, message: 'Press release created' }, 201)
})

pressReleaseRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE press_releases SET
      headline=?, subheadline=?, body_text=?,
      quote=?, quote_attribution=?, boilerplate=?, contact_info=?,
      distribution_list=?, distribution_date=?, embargo_date=?,
      target_publications=?, status=?, seo_keywords=?,
      published_urls=?, media_coverage=?, updated_at=?
    WHERE id=?
  `).bind(
    body.headline, body.subheadline || '', body.body_text || '',
    body.quote || '', body.quote_attribution || '',
    body.boilerplate || '', body.contact_info || '',
    body.distribution_list || '', body.distribution_date || null,
    body.embargo_date || null, body.target_publications || '',
    body.status || 'draft', body.seo_keywords || '',
    body.published_urls || '', body.media_coverage || '',
    now, id
  ).run()

  return c.json({ message: 'Press release updated' })
})

pressReleaseRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM press_releases WHERE id = ?').bind(id).run()
  return c.json({ message: 'Press release deleted' })
})

// POST generate press release template
pressReleaseRoutes.post('/generate', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { client_id, topic, key_message, quote_person } = body

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(client_id).first() as any
  if (!client) return c.json({ error: 'Client not found' }, 404)

  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const city = client.city || (client.location?.split(',')[0]) || 'Sydney'

  const headline = topic || `${client.company_name} Announces Major Update to ${client.industry || 'Industry'} Services`
  const subheadline = `Leading ${client.industry || 'industry'} provider delivers innovative solutions for Australian ${client.industry || 'businesses'}`

  const body_text = `${city.toUpperCase()}, ${today} – ${client.company_name}, a leading ${client.industry || 'business'} based in ${client.location || city}, today announced ${key_message || 'a significant development that will benefit its clients and the wider industry'}.

The announcement comes as ${client.company_name} continues to expand its presence in the ${client.industry || 'industry'} sector, building on a strong track record of delivering exceptional results for Australian businesses.

[ADD BODY PARAGRAPH 2 HERE - Include specific details, statistics, or background information]

[ADD BODY PARAGRAPH 3 HERE - Include market context, future plans, or additional relevant details]`

  const quote = `We are excited to share this news with our clients and industry peers. [ADD SPECIFIC QUOTE CONTENT HERE]`

  const boilerplate = `About ${client.company_name}
${client.company_name} is a ${client.industry || 'leading'} business based in ${client.location || 'Australia'}, providing [services/products] to clients across Australia. With a focus on [key value proposition], ${client.company_name} has established itself as a trusted partner for [target clients].

For more information, visit ${client.website}`

  const contact_info = `Media Contact:
${client.contact_name}
${client.company_name}
Email: ${client.contact_email}
Phone: ${client.contact_phone || '[PHONE]'}
Website: ${client.website}`

  return c.json({
    client_id,
    headline,
    subheadline,
    body_text,
    quote,
    quote_attribution: quote_person || client.contact_name,
    boilerplate,
    contact_info,
    status: 'draft',
    distribution_date: null,
    target_publications: 'Sydney Morning Herald, The Australian, Yahoo News, SBS News, ABC News, industry-specific publications',
    seo_keywords: `${client.company_name}, ${client.industry || ''}, ${client.location || 'Australia'}`,
  })
})
