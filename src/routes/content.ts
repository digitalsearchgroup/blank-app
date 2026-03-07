import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const contentRoutes = new Hono<{ Bindings: Bindings }>()

contentRoutes.get('/', async (c) => {
  const db = c.env.DB
  const campaignId = c.req.query('campaign_id')
  const clientId = c.req.query('client_id')
  const status = c.req.query('status')

  let q = 'SELECT ci.*, cl.company_name, ca.name as campaign_name FROM content_items ci JOIN clients cl ON ci.client_id = cl.id JOIN campaigns ca ON ci.campaign_id = ca.id WHERE 1=1'
  const params: any[] = []
  if (campaignId) { q += ' AND ci.campaign_id = ?'; params.push(campaignId) }
  if (clientId) { q += ' AND ci.client_id = ?'; params.push(clientId) }
  if (status) { q += ' AND ci.status = ?'; params.push(status) }
  q += ' ORDER BY ci.due_date ASC, ci.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  const content = await stmt.all()
  return c.json(content.results)
})

contentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const item = await db.prepare(`
    SELECT ci.*, cl.company_name, ca.name as campaign_name
    FROM content_items ci
    JOIN clients cl ON ci.client_id = cl.id
    JOIN campaigns ca ON ci.campaign_id = ca.id
    WHERE ci.id = ?
  `).bind(id).first()
  if (!item) return c.json({ error: 'Content item not found' }, 404)
  return c.json(item)
})

contentRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { campaign_id, client_id, title, content_type, target_keyword, target_url, word_count_target, brief, due_date, assigned_to } = body

  if (!campaign_id || !client_id || !title) {
    return c.json({ error: 'campaign_id, client_id, and title are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO content_items (campaign_id, client_id, title, content_type, target_keyword, target_url, word_count_target, brief, due_date, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(campaign_id, client_id, title, content_type || 'blog_post', target_keyword || '', target_url || '', word_count_target || 1500, brief || '', due_date || null, assigned_to || '').run()

  return c.json({ id: result.meta.last_row_id, message: 'Content item created' }, 201)
})

contentRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { title, content_type, status, target_keyword, target_url, word_count_target, brief, content_body, published_url, due_date, assigned_to, notes } = body

  const now = new Date().toISOString()
  const publishedAt = status === 'published' ? now : null

  await db.prepare(`
    UPDATE content_items SET title=?, content_type=?, status=?, target_keyword=?, target_url=?, word_count_target=?, brief=?, content_body=?, published_url=?, due_date=?, assigned_to=?, notes=?, ${publishedAt ? 'published_at=?,' : ''} updated_at=?
    WHERE id=?
  `).bind(
    title, content_type, status, target_keyword, target_url, word_count_target,
    brief, content_body || '', published_url || '', due_date, assigned_to || '', notes || '',
    ...(publishedAt ? [publishedAt] : []),
    now, id
  ).run()

  return c.json({ message: 'Content item updated' })
})

contentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM content_items WHERE id = ?').bind(id).run()
  return c.json({ message: 'Content item deleted' })
})

// GET content calendar - upcoming items grouped by month
contentRoutes.get('/calendar/upcoming', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  
  let q = `SELECT ci.*, cl.company_name, ca.name as campaign_name
    FROM content_items ci
    JOIN clients cl ON ci.client_id = cl.id
    JOIN campaigns ca ON ci.campaign_id = ca.id
    WHERE ci.status NOT IN ('published', 'cancelled')`
  
  if (clientId) q += ` AND ci.client_id = ${clientId}`
  q += ' ORDER BY ci.due_date ASC'
  
  const items = await db.prepare(q).all()
  
  // Group by due month
  const grouped: Record<string, any[]> = {}
  for (const item of items.results as any[]) {
    const month = item.due_date ? item.due_date.slice(0, 7) : 'Unscheduled'
    if (!grouped[month]) grouped[month] = []
    grouped[month].push(item)
  }
  
  return c.json(grouped)
})

// POST generate content brief using AI
contentRoutes.post('/generate-brief', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { keyword, content_type, client_id, word_count } = body

  const client = client_id ? await db.prepare('SELECT * FROM clients WHERE id = ?').bind(client_id).first() as any : null
  
  const typeGuides: Record<string, string> = {
    blog_post: 'informative, engaging blog post targeting the keyword naturally throughout',
    landing_page: 'conversion-focused landing page with clear CTA and service details',
    faq_page: 'FAQ page addressing common questions related to the keyword',
    meta_optimization: 'on-page SEO meta title and description optimisation',
    guestpost: 'expert guest post for external publication with natural backlink opportunity',
  }

  const guide = typeGuides[content_type] || 'SEO-optimised content piece'
  const industry = client?.industry || 'the industry'
  const location = client?.location || ''

  const title = generateTitle(keyword, content_type)
  const brief = `# Content Brief: ${title}

## Target Keyword
Primary: ${keyword}
${location ? `Location Modifier: ${location}` : ''}

## Content Type
${guide}

## Word Count Target
${word_count || 1500} words

## Content Objectives
- Rank on page 1 of Google for "${keyword}"
- Provide genuinely useful information to the reader
- Build topical authority for ${client?.company_name || 'the client'} in ${industry}
- Include natural keyword variations and LSI terms

## Suggested Structure
1. **Introduction** (150 words) - Hook with pain point or question, introduce topic
2. **H2: Main Topic Overview** (300 words) - Core information about ${keyword}
3. **H2: Key Points / Services** (400 words) - Detail sub-topics, use H3 for each point
4. **H2: Why Choose ${client?.company_name || 'Us'}** (200 words) - Trust signals, expertise, local presence
5. **H2: FAQs** (200 words) - 3-4 common questions targeting featured snippet opportunities
6. **Conclusion + CTA** (150 words) - Summary and clear call-to-action

## SEO Requirements
- Include primary keyword in: H1, first 100 words, at least one H2, meta title
- Use keyword naturally 2-3 times per 500 words (avoid stuffing)
- Internal links: 2-3 links to relevant service/location pages
- Add schema markup recommendation: FAQ Schema, LocalBusiness Schema

## Target Audience
${client ? `${client.company_name}'s target customers in ${client.location || 'their service area'}` : 'The target customer for this service/product'}

## Tone & Style
Professional yet approachable. Use active voice. Break up text with bullet points and short paragraphs.`

  return c.json({ title, brief, target_keyword: keyword, content_type, word_count_target: word_count || 1500 })
})

function generateTitle(keyword: string, type: string): string {
  const titleTemplates: Record<string, string[]> = {
    blog_post: [
      `The Complete Guide to ${capitalize(keyword)}`,
      `${capitalize(keyword)}: Everything You Need to Know`,
      `How to Choose the Best ${capitalize(keyword)} in 2025`,
    ],
    landing_page: [
      `${capitalize(keyword)} | Professional Services`,
      `Expert ${capitalize(keyword)} – Fast, Reliable & Affordable`,
    ],
    faq_page: [
      `${capitalize(keyword)}: Frequently Asked Questions`,
      `Your Questions About ${capitalize(keyword)} Answered`,
    ],
  }
  const templates = titleTemplates[type] || titleTemplates.blog_post
  return templates[Math.floor(Math.random() * templates.length)]
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
