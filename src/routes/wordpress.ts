import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const wordpressRoutes = new Hono<{ Bindings: Bindings }>()

// GET all WordPress projects
wordpressRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')

  let q = `SELECT wp.*, cl.company_name, cl.website,
    COUNT(wb.id) as block_count,
    COUNT(CASE WHEN wb.status = 'completed' THEN 1 END) as blocks_completed
    FROM wordpress_projects wp
    JOIN clients cl ON wp.client_id = cl.id
    LEFT JOIN wordpress_blocks wb ON wb.project_id = wp.id
    WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND wp.client_id = ?'; params.push(clientId) }
  q += ' GROUP BY wp.id ORDER BY wp.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

// GET single WordPress project with blocks
wordpressRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const [project, blocks] = await Promise.all([
    db.prepare(`
      SELECT wp.*, cl.company_name, cl.website, cl.contact_name, cl.contact_email
      FROM wordpress_projects wp
      JOIN clients cl ON wp.client_id = cl.id
      WHERE wp.id = ?
    `).bind(id).first(),
    db.prepare('SELECT * FROM wordpress_blocks WHERE project_id = ? ORDER BY sort_order, id').bind(id).all(),
  ])
  if (!project) return c.json({ error: 'Project not found' }, 404)
  return c.json({ ...project as any, blocks: blocks.results })
})

// POST create WordPress project
wordpressRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.client_id || !body.project_name) {
    return c.json({ error: 'client_id and project_name are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO wordpress_projects (
      client_id, campaign_id, project_name, project_type, status,
      site_url, staging_url, wordpress_version, theme_used, page_builder,
      hosting_provider, monthly_maintenance, project_budget, hourly_rate,
      hours_quoted, go_live_date, start_date, brief, notes, login_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.client_id, body.campaign_id || null, body.project_name,
    body.project_type || 'new_site', body.status || 'scoping',
    body.site_url || '', body.staging_url || '',
    body.wordpress_version || '', body.theme_used || '',
    body.page_builder || 'elementor', body.hosting_provider || '',
    body.monthly_maintenance || 0, body.project_budget || 0,
    body.hourly_rate || 150, body.hours_quoted || 0,
    body.go_live_date || null, body.start_date || null,
    body.brief || '', body.notes || '', body.login_url || ''
  ).run()

  const projectId = result.meta.last_row_id as number

  // Add default implementation blocks if requested
  if (body.include_default_blocks) {
    await addDefaultBlocks(db, projectId, body.project_type || 'new_site')
  }

  // Add custom blocks if provided
  if (body.blocks && Array.isArray(body.blocks)) {
    for (let i = 0; i < body.blocks.length; i++) {
      const blk = body.blocks[i]
      await db.prepare(`
        INSERT INTO wordpress_blocks (project_id, block_type, block_name, description, hours_estimated, price, included_in_quote, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(projectId, blk.block_type || 'custom', blk.block_name, blk.description || '', blk.hours_estimated || 0, blk.price || 0, 1, i).run()
    }
  }

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'wp_project_created', ?)"
  ).bind(body.client_id, `WordPress project created: ${body.project_name}`).run()

  return c.json({ id: projectId, message: 'WordPress project created' }, 201)
})

// PUT update WordPress project
wordpressRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE wordpress_projects SET
      project_name=?, project_type=?, status=?,
      site_url=?, staging_url=?, wordpress_version=?, theme_used=?,
      page_builder=?, hosting_provider=?, monthly_maintenance=?,
      project_budget=?, hourly_rate=?, hours_quoted=?, hours_used=?,
      go_live_date=?, start_date=?, end_date=?,
      brief=?, notes=?, login_url=?, updated_at=?
    WHERE id=?
  `).bind(
    body.project_name, body.project_type, body.status,
    body.site_url || '', body.staging_url || '',
    body.wordpress_version || '', body.theme_used || '',
    body.page_builder || '', body.hosting_provider || '',
    body.monthly_maintenance || 0, body.project_budget || 0,
    body.hourly_rate || 150, body.hours_quoted || 0, body.hours_used || 0,
    body.go_live_date || null, body.start_date || null, body.end_date || null,
    body.brief || '', body.notes || '', body.login_url || '', now, id
  ).run()

  return c.json({ message: 'WordPress project updated' })
})

// DELETE WordPress project
wordpressRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM wordpress_blocks WHERE project_id = ?').bind(id).run()
  await db.prepare('DELETE FROM wordpress_projects WHERE id = ?').bind(id).run()
  return c.json({ message: 'WordPress project deleted' })
})

// ---- Blocks ----

// POST add block to project
wordpressRoutes.post('/:id/blocks', async (c) => {
  const projectId = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()

  const result = await db.prepare(`
    INSERT INTO wordpress_blocks (project_id, block_type, block_name, description, hours_estimated, price, included_in_quote, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM wordpress_blocks WHERE project_id = ?))
  `).bind(
    projectId, body.block_type || 'custom', body.block_name,
    body.description || '', body.hours_estimated || 0, body.price || 0,
    body.included_in_quote !== false ? 1 : 0, body.notes || '', projectId
  ).run()

  return c.json({ id: result.meta.last_row_id, message: 'Block added' }, 201)
})

// PUT update block status
wordpressRoutes.put('/:id/blocks/:blockId', async (c) => {
  const blockId = c.req.param('blockId')
  const db = c.env.DB
  const body = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE wordpress_blocks SET
      block_name=?, block_type=?, description=?,
      hours_estimated=?, hours_actual=?, price=?,
      status=?, included_in_quote=?, notes=?,
      ${body.status === 'completed' ? 'completed_at=?,' : ''}
      sort_order=?
    WHERE id=?
  `).bind(
    body.block_name, body.block_type || 'custom', body.description || '',
    body.hours_estimated || 0, body.hours_actual || 0, body.price || 0,
    body.status || 'pending', body.included_in_quote !== false ? 1 : 0,
    body.notes || '',
    ...(body.status === 'completed' ? [now] : []),
    body.sort_order || 0, blockId
  ).run()

  return c.json({ message: 'Block updated' })
})

// DELETE block
wordpressRoutes.delete('/:id/blocks/:blockId', async (c) => {
  const blockId = c.req.param('blockId')
  const db = c.env.DB
  await db.prepare('DELETE FROM wordpress_blocks WHERE id = ?').bind(blockId).run()
  return c.json({ message: 'Block deleted' })
})

// GET available block types catalog
wordpressRoutes.get('/blocks/catalog', async (c) => {
  const catalog = [
    { type: 'homepage', name: 'Homepage', description: 'Hero, features, CTA sections', hours: 6, category: 'Pages' },
    { type: 'about_page', name: 'About Page', description: 'Team, history, values, mission', hours: 3, category: 'Pages' },
    { type: 'service_page', name: 'Service Page', description: 'Service detail, benefits, CTA', hours: 3, category: 'Pages' },
    { type: 'contact_page', name: 'Contact Page', description: 'Contact form, map, details', hours: 2, category: 'Pages' },
    { type: 'landing_page', name: 'Landing Page', description: 'Conversion-focused single page', hours: 5, category: 'Pages' },
    { type: 'product_page', name: 'Product/Service Detail Page', description: 'Detailed product/service showcase', hours: 4, category: 'Pages' },
    { type: 'team_page', name: 'Team Page', description: 'Staff profiles, credentials', hours: 3, category: 'Pages' },
    { type: 'blog_setup', name: 'Blog Setup', description: 'Blog listing, single post, categories', hours: 4, category: 'Pages' },
    { type: 'testimonials', name: 'Testimonials Section', description: 'Reviews widget, carousel, schema', hours: 2, category: 'Components' },
    { type: 'gallery', name: 'Gallery/Portfolio', description: 'Image/video gallery or portfolio', hours: 3, category: 'Components' },
    { type: 'faq_section', name: 'FAQ Section', description: 'Accordion FAQ with FAQ schema markup', hours: 2, category: 'Components' },
    { type: 'pricing_table', name: 'Pricing Table', description: 'Service/product pricing comparison', hours: 3, category: 'Components' },
    { type: 'calculator_tool', name: 'Interactive Calculator', description: 'Custom JS calculator tool', hours: 8, category: 'Tools' },
    { type: 'lead_form', name: 'Lead Capture Form', description: 'Multi-step form with CRM integration', hours: 4, category: 'Tools' },
    { type: 'booking_system', name: 'Booking/Appointment System', description: 'Online booking integration', hours: 6, category: 'Tools' },
    { type: 'woocommerce_setup', name: 'WooCommerce Setup', description: 'eCommerce setup, products, checkout', hours: 12, category: 'eCommerce' },
    { type: 'payment_gateway', name: 'Payment Gateway', description: 'Stripe/PayPal integration', hours: 4, category: 'eCommerce' },
    { type: 'seo_setup', name: 'SEO Foundation Setup', description: 'RankMath/Yoast, sitemaps, redirects', hours: 4, category: 'SEO & Performance' },
    { type: 'speed_optimisation', name: 'Speed Optimisation', description: 'Caching, image compression, CDN, Core Web Vitals', hours: 6, category: 'SEO & Performance' },
    { type: 'security_hardening', name: 'Security Hardening', description: 'Wordfence, file permissions, login protection', hours: 3, category: 'Security & Maintenance' },
    { type: 'backup_setup', name: 'Backup System Setup', description: 'UpdraftPlus, automated backups, off-site storage', hours: 2, category: 'Security & Maintenance' },
    { type: 'cdn_setup', name: 'CDN Setup', description: 'Cloudflare or BunnyCDN integration', hours: 2, category: 'SEO & Performance' },
    { type: 'google_analytics', name: 'Google Analytics 4 + GSC', description: 'GA4, Search Console, event tracking setup', hours: 3, category: 'SEO & Performance' },
    { type: 'schema_markup', name: 'Advanced Schema Markup', description: 'Organization, LocalBusiness, Product, Review schema', hours: 3, category: 'SEO & Performance' },
    { type: 'local_seo_schema', name: 'Local SEO Setup', description: 'Local schema, GBP integration, map embed', hours: 3, category: 'SEO & Performance' },
    { type: 'custom', name: 'Custom Development', description: 'Custom feature or functionality', hours: 0, category: 'Custom' },
  ]
  return c.json(catalog)
})

async function addDefaultBlocks(db: D1Database, projectId: number, projectType: string) {
  const defaultsByType: Record<string, string[]> = {
    new_site: ['homepage', 'about_page', 'service_page', 'contact_page', 'blog_setup', 'seo_setup', 'speed_optimisation', 'google_analytics', 'security_hardening', 'backup_setup'],
    redesign: ['homepage', 'about_page', 'service_page', 'contact_page', 'seo_setup', 'speed_optimisation', 'google_analytics'],
    ecommerce: ['homepage', 'product_page', 'woocommerce_setup', 'payment_gateway', 'seo_setup', 'speed_optimisation', 'security_hardening'],
    consultancy: ['seo_setup', 'speed_optimisation', 'google_analytics', 'schema_markup', 'security_hardening'],
  }

  const blockCatalog: Record<string, any> = {
    homepage: { name: 'Homepage', hours: 6 },
    about_page: { name: 'About Page', hours: 3 },
    service_page: { name: 'Service Page', hours: 3 },
    contact_page: { name: 'Contact Page', hours: 2 },
    blog_setup: { name: 'Blog Setup', hours: 4 },
    seo_setup: { name: 'SEO Foundation Setup', hours: 4 },
    speed_optimisation: { name: 'Speed Optimisation', hours: 6 },
    google_analytics: { name: 'Google Analytics 4 + GSC', hours: 3 },
    security_hardening: { name: 'Security Hardening', hours: 3 },
    backup_setup: { name: 'Backup System Setup', hours: 2 },
    product_page: { name: 'Product Page', hours: 4 },
    woocommerce_setup: { name: 'WooCommerce Setup', hours: 12 },
    payment_gateway: { name: 'Payment Gateway', hours: 4 },
    schema_markup: { name: 'Advanced Schema Markup', hours: 3 },
  }

  const blocks = defaultsByType[projectType] || defaultsByType.new_site
  for (let i = 0; i < blocks.length; i++) {
    const bt = blocks[i]
    const info = blockCatalog[bt] || { name: bt, hours: 2 }
    await db.prepare(`
      INSERT INTO wordpress_blocks (project_id, block_type, block_name, hours_estimated, included_in_quote, sort_order)
      VALUES (?, ?, ?, ?, 1, ?)
    `).bind(projectId, bt, info.name, info.hours, i).run()
  }
}
