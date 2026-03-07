import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const proposalsRoutes = new Hono<{ Bindings: Bindings }>()

function generateToken(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let t = ''
  for (let i = 0; i < len; i++) t += chars.charAt(Math.floor(Math.random() * chars.length))
  return t
}

// All valid proposal / service types
const PROPOSAL_TYPES: Record<string, string> = {
  organic_seo: 'Organic Search Engine Optimisation',
  local_seo: 'Local SEO & Google Business Profile',
  content_marketing: 'Content Marketing & SEO',
  technical_seo: 'Technical SEO Audit & Optimisation',
  full_service: 'Full-Service Organic Digital Marketing',
  wordpress_dev: 'WordPress Website Development',
  wordpress_maintenance: 'WordPress Maintenance & Support',
  press_release: 'Press Release Distribution Package',
  social_media: 'Social Media Management',
  ai_seo_content: 'AI-Optimised SEO Content Package',
  link_building: 'Link Building & Digital PR',
  ecommerce_seo: 'eCommerce SEO (WooCommerce/Shopify)',
  reputation_management: 'Online Reputation Management',
  custom: 'Custom Digital Marketing Package',
}

// GET all proposals
proposalsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const status = c.req.query('status')

  let q = `SELECT p.*, cl.company_name, cl.contact_email, cl.contact_name
    FROM proposals p JOIN clients cl ON p.client_id = cl.id WHERE 1=1`
  const params: any[] = []
  if (clientId) { q += ' AND p.client_id = ?'; params.push(clientId) }
  if (status) { q += ' AND p.status = ?'; params.push(status) }
  q += ' ORDER BY p.created_at DESC'

  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  return c.json((await stmt.all()).results)
})

// GET single proposal with line items
proposalsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const [proposal, lineItems] = await Promise.all([
    db.prepare(`
      SELECT p.*, cl.company_name, cl.contact_name, cl.contact_email, cl.website,
        cl.industry, cl.location, cl.abn, cl.address, cl.city, cl.state,
        cl.postcode, cl.country, cl.contact_phone
      FROM proposals p JOIN clients cl ON p.client_id = cl.id
      WHERE p.id = ?
    `).bind(id).first(),
    db.prepare('SELECT * FROM proposal_line_items WHERE proposal_id = ? ORDER BY sort_order, id').bind(id).all(),
  ])
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  return c.json({ ...proposal as any, line_items: lineItems.results })
})

// POST create proposal
proposalsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  const {
    client_id, title, proposal_type, monthly_investment, contract_length,
    scope_summary, deliverables, target_keywords, competitor_domains,
    target_locations, goals, baseline_data, setup_fee,
    content_items_count, press_releases_count, social_posts_count,
    tools_count, wordpress_hours, reporting_frequency, account_manager,
    line_items,
  } = body

  if (!client_id || !title || !monthly_investment) {
    return c.json({ error: 'client_id, title, and monthly_investment are required' }, 400)
  }

  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const result = await db.prepare(`
    INSERT INTO proposals (
      client_id, title, proposal_type, monthly_investment, contract_length,
      scope_summary, deliverables, target_keywords, competitor_domains,
      target_locations, goals, baseline_data, approval_token, expires_at,
      setup_fee, content_items_count, press_releases_count, social_posts_count,
      tools_count, wordpress_hours, reporting_frequency, account_manager
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `).bind(
    client_id, title, proposal_type || 'organic_seo', monthly_investment,
    contract_length || 12, scope_summary || '', deliverables || '',
    target_keywords || '', competitor_domains || '', target_locations || '',
    goals || '', baseline_data || '', token, expiresAt.toISOString(),
    setup_fee || 0, content_items_count || 0, press_releases_count || 0,
    social_posts_count || 0, tools_count || 0, wordpress_hours || 0,
    reporting_frequency || 'monthly', account_manager || ''
  ).run()

  const proposalId = result.meta.last_row_id as number

  // Insert line items if provided
  if (line_items && Array.isArray(line_items)) {
    for (let i = 0; i < line_items.length; i++) {
      const li = line_items[i]
      await db.prepare(`
        INSERT INTO proposal_line_items (proposal_id, category, item_name, description, quantity, unit_price, included, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(proposalId, li.category || 'general', li.item_name, li.description || '', li.quantity || 1, li.unit_price || 0, li.included !== false ? 1 : 0, i).run()
    }
  }

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'proposal_created', ?)"
  ).bind(client_id, `Proposal created: ${title}`).run()

  return c.json({ id: proposalId, approval_token: token, message: 'Proposal created' }, 201)
})

// PUT update proposal
proposalsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE proposals SET
      title=?, proposal_type=?, monthly_investment=?, contract_length=?,
      scope_summary=?, deliverables=?, target_keywords=?, competitor_domains=?,
      target_locations=?, goals=?, baseline_data=?, setup_fee=?,
      content_items_count=?, press_releases_count=?, social_posts_count=?,
      tools_count=?, wordpress_hours=?, reporting_frequency=?, account_manager=?,
      updated_at=?
    WHERE id=?
  `).bind(
    body.title, body.proposal_type, body.monthly_investment, body.contract_length,
    body.scope_summary || '', body.deliverables || '', body.target_keywords || '',
    body.competitor_domains || '', body.target_locations || '',
    body.goals || '', body.baseline_data || '', body.setup_fee || 0,
    body.content_items_count || 0, body.press_releases_count || 0,
    body.social_posts_count || 0, body.tools_count || 0,
    body.wordpress_hours || 0, body.reporting_frequency || 'monthly',
    body.account_manager || '', now, id
  ).run()

  // Update line items if provided
  if (body.line_items && Array.isArray(body.line_items)) {
    await db.prepare('DELETE FROM proposal_line_items WHERE proposal_id = ?').bind(id).run()
    for (let i = 0; i < body.line_items.length; i++) {
      const li = body.line_items[i]
      await db.prepare(`
        INSERT INTO proposal_line_items (proposal_id, category, item_name, description, quantity, unit_price, included, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, li.category || 'general', li.item_name, li.description || '', li.quantity || 1, li.unit_price || 0, li.included !== false ? 1 : 0, i).run()
    }
  }

  return c.json({ message: 'Proposal updated' })
})

// POST send proposal
proposalsRoutes.post('/:id/send', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const now = new Date().toISOString()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await db.prepare(
    "UPDATE proposals SET status='sent', sent_at=?, expires_at=?, updated_at=? WHERE id=?"
  ).bind(now, expiresAt.toISOString(), now, id).run()

  const proposal = await db.prepare(
    'SELECT p.*, cl.contact_email FROM proposals p JOIN clients cl ON p.client_id = cl.id WHERE p.id = ?'
  ).bind(id).first() as any

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'proposal_sent', ?)"
  ).bind(proposal?.client_id, `Proposal sent: ${proposal?.title}`).run()

  const approvalUrl = `/proposals/approve/${proposal?.approval_token}`
  return c.json({ message: 'Proposal sent', approval_url: approvalUrl, approval_token: proposal?.approval_token })
})

// POST generate proposal content
proposalsRoutes.post('/generate', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { client_id, proposal_type, monthly_investment, contract_length, target_keywords, competitor_domains, goals, setup_fee, tier_key } = body

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(client_id).first() as any
  if (!client) return c.json({ error: 'Client not found' }, 404)

  // Optionally load tier data for premium framing
  let tier: any = null
  if (tier_key) {
    tier = await db.prepare('SELECT * FROM plan_tiers WHERE tier_key = ?').bind(tier_key).first() as any
  }

  const type = PROPOSAL_TYPES[proposal_type] || 'Organic Digital Marketing'
  // Use tier price if a tier is selected, otherwise use provided value
  const monthlyInv = tier ? tier.monthly_price : Number(monthly_investment || 1500)
  const contractLen = Number(contract_length || 12)
  const keywords = target_keywords ? target_keywords.split(',').map((k: string) => k.trim()).filter(Boolean).slice(0, 8) : []
  const competitors = competitor_domains ? competitor_domains.split(',').map((d: string) => d.trim()).filter(Boolean).slice(0, 3) : []

  // Title uses premium authority framing if tier is selected
  const title = tier
    ? `${tier.client_name} – ${client.company_name} Authority Engineering Proposal`
    : `${type} Proposal – ${client.company_name}`

  // Build deliverables based on proposal type
  const deliverablesByType: Record<string, string[]> = {
    organic_seo: [
      '✓ Comprehensive technical SEO audit & fix implementation',
      '✓ On-page optimisation (title tags, meta descriptions, schema markup, headers)',
      '✓ Monthly keyword rank tracking (Google & Bing) via DataForSEO',
      '✓ AI/LLM visibility tracking (ChatGPT, Google AI Overviews, Perplexity, Gemini)',
      '✓ Competitor SERP analysis & benchmarking reports',
      `✓ ${Math.max(2, Math.floor(monthlyInv / 500))} x SEO-optimised content pieces per month`,
      '✓ Technical site health monitoring & issue resolution',
      '✓ Google Search Console management & optimisation',
      '✓ Monthly performance report with insights & strategy recommendations',
      '✓ Quarterly strategy review call',
    ],
    local_seo: [
      '✓ Google Business Profile setup, optimisation & ongoing management',
      '✓ Local citation building & NAP consistency audit',
      '✓ Local keyword rank tracking (suburb, city, region level)',
      '✓ Review generation strategy & response management',
      '✓ Local schema markup (LocalBusiness, Service, FAQPage)',
      '✓ Monthly local pack & map tracking',
      '✓ Competitor local SEO analysis',
      '✓ Monthly local SEO report',
    ],
    press_release: [
      '✓ Professional press release copywriting (up to 500 words)',
      '✓ SEO-optimised headline, subheadline & boilerplate',
      '✓ Distribution to 100+ Australian media outlets & news wires',
      '✓ AP/PR format compliance review',
      '✓ Coverage tracking & media mention report',
      '✓ Google News indexation monitoring',
      '✓ Social media amplification of release',
      '✓ Post-distribution analytics report',
    ],
    social_media: [
      `✓ ${Math.max(8, Math.floor(monthlyInv / 200))} social media posts per month`,
      '✓ Platform management: Facebook, Instagram, LinkedIn, Google Business',
      '✓ Original graphic design for each post',
      '✓ Caption copywriting with hashtag research',
      '✓ Content calendar planning & scheduling',
      '✓ Community management & comment responses',
      '✓ Monthly analytics report (reach, engagement, follower growth)',
      '✓ Story & Reel creation (2x per month)',
    ],
    wordpress_dev: [
      '✓ Custom WordPress website design & development',
      '✓ Mobile-first responsive design',
      '✓ Up to 10 custom pages (expandable)',
      '✓ SEO-ready architecture (clean URLs, sitemap, schema)',
      '✓ Contact forms, lead capture & CTA optimisation',
      '✓ Speed optimisation (Core Web Vitals compliant)',
      '✓ Security hardening & SSL setup',
      '✓ Google Analytics 4 & Search Console integration',
      '✓ 30-day post-launch support',
    ],
    ai_seo_content: [
      `✓ ${Math.max(4, Math.floor(monthlyInv / 375))} AI-optimised long-form content pieces per month`,
      '✓ Human-edited, Google-compliant content (no raw AI output)',
      '✓ E-E-A-T optimised with expert quotes & citations',
      '✓ Keyword-mapped content strategy',
      '✓ Internal linking architecture',
      '✓ Featured snippet optimisation',
      '✓ Schema markup for all content',
      '✓ AI/LLM optimisation for ChatGPT & Perplexity visibility',
      '✓ Monthly content performance tracking',
    ],
    full_service: [
      '✓ Full technical SEO audit & implementation',
      '✓ Monthly rank tracking (Google, AI Overviews, LLM mentions)',
      `✓ ${Math.max(4, Math.floor(monthlyInv / 375))} SEO content pieces per month`,
      '✓ 4x social media posts per week across key platforms',
      '✓ Google Business Profile management',
      '✓ Monthly press release',
      '✓ Link building & digital PR outreach',
      '✓ Competitor intelligence & gap analysis',
      '✓ Monthly performance report & strategy call',
      '✓ Quarterly business review',
    ],
  }

  const deliverables = (deliverablesByType[proposal_type] || deliverablesByType.organic_seo).join('\n')

  // Build tier-specific scope framing
  const tierScopeIntro = tier ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${tier.client_name.toUpperCase()} · ${fmtPrice(tier.monthly_price)}/month
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${tier.description}

STRATEGIC PHASES:
  Phase 1 – Authority Foundation (Months 1–3): ${tier.phase1_outcome}
  Phase 2 – Authority Expansion (Months 4–6): ${tier.phase2_outcome}
  Phase 3 – Authority Acceleration (Months 7–9): ${tier.phase3_outcome}
  Phase 4 – Authority Compounding (Months 10–12): ${tier.phase4_outcome}

` : ''

  const scope = `${tierScopeIntro}Digital Search Group will deliver a results-focused ${tier ? tier.client_name : type} strategy for ${client.company_name} (${client.website}).

${proposal_type === 'wordpress_dev'
  ? `We will design and develop a high-performance WordPress website that is built from the ground up to convert visitors into leads. Every page will be crafted with conversion-rate optimisation, mobile-first responsiveness, and technical SEO best practices baked in from day one.`
  : proposal_type === 'press_release'
  ? `Our team will craft and distribute professional press releases on behalf of ${client.company_name} to maximise media coverage, build brand authority, and create high-quality backlinks that strengthen organic search performance.`
  : proposal_type === 'social_media'
  ? `We will manage ${client.company_name}'s social media presence across all relevant platforms, creating engaging content that builds brand awareness, drives website traffic, and generates qualified leads.`
  : tier
  ? `Our ${tier.client_name} framework applies a systematic, phase-driven authority engineering approach. Rather than chasing rankings with isolated tactics, we build cumulative, compounding authority signals that position ${client.company_name} as the definitive entity in your market — in both traditional search and AI-generated responses (ChatGPT, Google AI Overviews, Perplexity, and Gemini).`
  : `Our approach combines ${proposal_type === 'ai_seo_content' ? 'AI-assisted, human-reviewed content creation' : 'advanced technical SEO, high-quality content creation,'} and comprehensive performance tracking — including both traditional search rankings and AI-generated search responses — to ensure ${client.company_name} achieves maximum organic visibility.`}

${keywords.length ? `Target keywords include: ${keywords.join(', ')}.` : ''}
${competitors.length ? `We will continuously monitor and benchmark against: ${competitors.join(', ')}.` : ''}
${client.location ? `Primary target location: ${client.location}.` : ''}`

  const goalsText = goals || (tier
    ? `• Phase 1: ${tier.phase1_outcome}\n• Phase 2: ${tier.phase2_outcome}\n• Phase 3: ${tier.phase3_outcome}\n• Phase 4: ${tier.phase4_outcome}\n• Establish brand as the dominant entity in AI-generated responses (ChatGPT, Gemini, Perplexity)\n• Build compounding authority that outperforms competitors across search and AI platforms`
    : proposal_type === 'wordpress_dev'
    ? `• Launch a fast, modern, conversion-focused WordPress website\n• Achieve Core Web Vitals "Good" scores\n• Generate qualified leads within 60 days of launch`
    : proposal_type === 'press_release'
    ? `• Secure media coverage in 5+ relevant Australian publications\n• Build high-quality backlinks to ${client.website}\n• Increase brand search volume`
    : `• Achieve Page 1 Google rankings for core target keywords\n• Establish brand presence in AI-generated search responses (ChatGPT, Gemini, Perplexity)\n• Grow organic traffic by 50–150% within 12 months\n• Generate consistent, qualified leads from organic search`)

  // Build default line items – use tier-aware deliverables if tier is selected
  const defaultLineItems = tier
    ? buildTierLineItems(tier, contractLen)
    : buildDefaultLineItems(proposal_type, monthlyInv, contractLen)

  return c.json({
    title,
    proposal_type,
    monthly_investment: monthlyInv,
    contract_length: contractLen,
    setup_fee: setup_fee || 0,
    scope_summary: scope,
    deliverables,
    target_keywords,
    competitor_domains,
    goals: goalsText,
    baseline_data: `Baseline audit to be completed within 5 business days of campaign launch.`,
    reporting_frequency: 'monthly',
    line_items: defaultLineItems,
  })
})

function buildDefaultLineItems(type: string, monthly: number, contractLen: number) {
  const items: any[] = []

  if (type === 'organic_seo' || type === 'full_service') {
    items.push(
      { category: 'SEO', item_name: 'Technical SEO Audit & Setup', description: 'Comprehensive site audit, fix implementation, Google Search Console setup', quantity: 1, unit_price: 0, included: true },
      { category: 'SEO', item_name: 'Monthly Rank Tracking', description: 'Keyword position monitoring via DataForSEO SERP API', quantity: contractLen, unit_price: 0, included: true },
      { category: 'SEO', item_name: 'On-Page Optimisation', description: 'Monthly on-page updates, meta optimisation, schema markup', quantity: contractLen, unit_price: 0, included: true },
    )
  }
  if (type === 'ai_seo_content' || type === 'full_service' || type === 'organic_seo') {
    const contentCount = Math.max(2, Math.floor(monthly / 500))
    items.push(
      { category: 'Content', item_name: `SEO Blog Posts (${contentCount}x/month)`, description: 'AI-assisted, human-edited, keyword-targeted blog content', quantity: contractLen, unit_price: 0, included: true },
    )
  }
  if (type === 'social_media' || type === 'full_service') {
    const postCount = Math.max(8, Math.floor(monthly / 200))
    items.push(
      { category: 'Social', item_name: `Social Posts (${postCount}x/month)`, description: 'Original posts across Facebook, Instagram, LinkedIn', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Social', item_name: 'Community Management', description: 'Comment responses, DM management, review replies', quantity: contractLen, unit_price: 0, included: true },
    )
  }
  if (type === 'press_release') {
    items.push(
      { category: 'PR', item_name: 'Press Release Copywriting', description: 'Professional AP-format press release', quantity: 1, unit_price: 0, included: true },
      { category: 'PR', item_name: 'National Distribution', description: '100+ Australian media outlets via PR Newswire/AAP', quantity: 1, unit_price: 0, included: true },
      { category: 'PR', item_name: 'Coverage Report', description: 'Post-distribution media pickup tracking', quantity: 1, unit_price: 0, included: true },
    )
  }
  if (type === 'wordpress_dev') {
    items.push(
      { category: 'Development', item_name: 'WordPress Theme Setup & Design', description: 'Custom design, Elementor/Divi setup, branding integration', quantity: 1, unit_price: 0, included: true },
      { category: 'Development', item_name: 'Core Pages (up to 10)', description: 'Home, About, Services, Contact + additional pages', quantity: 1, unit_price: 0, included: true },
      { category: 'Development', item_name: 'SEO Architecture Setup', description: 'Yoast/RankMath, sitemap, schema, page speed optimisation', quantity: 1, unit_price: 0, included: true },
      { category: 'Development', item_name: 'Security & Performance', description: 'SSL, caching, CDN, security plugin, backups', quantity: 1, unit_price: 0, included: true },
      { category: 'Development', item_name: '30-Day Post Launch Support', description: 'Bug fixes, training, minor updates', quantity: 1, unit_price: 0, included: true },
    )
  }

  // Always include reporting
  items.push(
    { category: 'Reporting', item_name: 'Monthly Performance Report', description: 'Rankings, traffic, content, LLM visibility report', quantity: contractLen, unit_price: 0, included: true },
  )

  return items
}

// Build premium line items from tier template
function buildTierLineItems(tier: any, contractLen: number) {
  const tierItems: Record<string, any[]> = {
    basic: [
      { category: 'Foundation', item_name: 'Authority Discovery Session', description: 'Strategic discovery session to map authority goals and baseline', quantity: 1, unit_price: 0, included: true },
      { category: 'Technical', item_name: 'Technical Authority Audit', description: 'Comprehensive technical authority barrier identification', quantity: 1, unit_price: 0, included: true },
      { category: 'On-Page', item_name: 'Entity Alignment & Intent Structuring', description: 'On-page optimisation for core URLs', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 1', description: 'Guest post on established domain (1k+ traffic)', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Media Authority', item_name: 'Media Authority Injection', description: 'Google News authority link placement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Entity Signals', item_name: 'Entity Signal Reinforcement – Level 1', description: 'Core entity signal reinforcement layer', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Signal Acceleration', item_name: 'Signal Acceleration & Discovery Layer', description: 'Accelerate indexation across all placements', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Content', item_name: 'Content Authority Publishing', description: 'Authority content creation for topical relevance expansion', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Reporting', item_name: 'Authority Intelligence Dashboard', description: 'Live authority intelligence dashboard setup', quantity: 1, unit_price: 0, included: true },
      { category: 'Reporting', item_name: 'Monthly Authority Velocity Report', description: 'Rankings, traffic, content, AI visibility authority velocity snapshot', quantity: contractLen, unit_price: 0, included: true },
    ],
    core: [
      { category: 'Foundation', item_name: 'Authority Discovery Session', description: 'Strategic discovery session', quantity: 1, unit_price: 0, included: true },
      { category: 'Technical', item_name: 'Technical Authority Audit', description: 'Comprehensive technical audit', quantity: 1, unit_price: 0, included: true },
      { category: 'On-Page', item_name: 'Entity Alignment & Intent Structuring', description: 'On-page optimisation for core URLs', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 1', description: '1k traffic site placement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 2', description: '3k traffic site placement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Media Authority', item_name: 'Media Authority Injection', description: 'Google News authority link', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Entity Signals', item_name: 'Entity Signal Reinforcement – Level 2', description: 'Enhanced entity signal reinforcement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Amplification', item_name: 'Authority Amplification Framework', description: 'Tiered link authority stack deployment', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Signal Acceleration', item_name: 'Signal Acceleration & Discovery Layer', description: 'Accelerate signal discovery', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Content', item_name: 'Content Authority Publishing', description: 'Authority content creation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Reporting', item_name: 'Monthly Authority Velocity Report', description: 'Authority performance reporting', quantity: contractLen, unit_price: 0, included: true },
    ],
    ultimate: [
      { category: 'Foundation', item_name: 'Authority Discovery Session', description: 'Strategic discovery session', quantity: 1, unit_price: 0, included: true },
      { category: 'Technical', item_name: 'Technical Authority Audit', description: 'Comprehensive technical audit', quantity: 1, unit_price: 0, included: true },
      { category: 'On-Page', item_name: 'Premium Entity Alignment & Intent Structuring', description: 'Premium on-page for all core URLs', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 1', description: '1k traffic site', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 2', description: '3k traffic site', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Authority Placement Layer – Tier 3', description: '7k traffic premium domain', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Media Authority', item_name: 'Media Authority Injection', description: 'Google News authority link', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Entity Signals', item_name: 'Entity Signal Reinforcement – Level 3', description: 'Advanced entity signal reinforcement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Amplification', item_name: 'Authority Amplification Framework', description: 'Tiered link stack', quantity: contractLen, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'AI Overview Content Engineering', description: 'Structure content for AI citation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'Generative Retrieval Optimisation', description: 'FAQ architecture for AI retrieval', quantity: 3, unit_price: 0, included: true },
      { category: 'Signal Acceleration', item_name: 'Signal Acceleration & Discovery Layer', description: 'Accelerate indexation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Content', item_name: 'Content Authority Publishing', description: 'Authority content creation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Reporting', item_name: 'Monthly Authority Velocity Report', description: 'Full authority performance reporting', quantity: contractLen, unit_price: 0, included: true },
    ],
    xtreme: [
      { category: 'Foundation', item_name: 'Authority Discovery Session', description: 'Strategic discovery session', quantity: 1, unit_price: 0, included: true },
      { category: 'Technical', item_name: 'Technical Authority Audit', description: 'Comprehensive technical audit', quantity: 1, unit_price: 0, included: true },
      { category: 'On-Page', item_name: 'Premium Entity Alignment & Intent Structuring', description: 'Premium on-page for all core URLs', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Dual Authority Placement – Tier 1', description: '2x 1k traffic placements', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Dual Authority Placement – Tier 2', description: '2x 3k traffic placements', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Authority Placement', item_name: 'Dual Authority Placement – Tier 3', description: '2x 7k traffic premium placements', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Media Authority', item_name: 'Dual Media Authority Injection', description: '2x Google News authority links', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Entity Signals', item_name: 'Entity Signal Reinforcement – Level 4', description: 'Maximum entity signal reinforcement', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Amplification', item_name: 'Dual Authority Amplification Framework', description: '2x tiered link stacks', quantity: contractLen, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'AI Overview Content Engineering', description: 'Structure content for AI citation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'Generative Retrieval Optimisation', description: 'FAQ architecture for AI retrieval', quantity: 4, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'Entity Relationship Architecture', description: 'Entity relationship mapping for LLM parsing', quantity: 3, unit_price: 0, included: true },
      { category: 'AI Visibility', item_name: 'Schema Authority Reinforcement', description: 'Advanced schema markup for AI trust', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Signal Acceleration', item_name: 'Signal Acceleration & Discovery Layer', description: 'Maximum velocity signal acceleration', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Content', item_name: 'Content Authority Publishing', description: 'Authority content creation', quantity: contractLen, unit_price: 0, included: true },
      { category: 'Reporting', item_name: 'Monthly Authority Velocity Report', description: 'Full authority performance reporting', quantity: contractLen, unit_price: 0, included: true },
    ],
  }
  return tierItems[tier.tier_key] || tierItems.core
}

// DELETE proposal
proposalsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM proposal_line_items WHERE proposal_id = ?').bind(id).run()
  await db.prepare('DELETE FROM proposals WHERE id = ?').bind(id).run()
  return c.json({ message: 'Proposal deleted' })
})

// GET proposal types list
proposalsRoutes.get('/types/list', async (c) => {
  return c.json(Object.entries(PROPOSAL_TYPES).map(([value, label]) => ({ value, label })))
})

// Helper for formatting currency in proposal text
function fmtPrice(n: number): string {
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// POST duplicate proposal
proposalsRoutes.post('/:id/duplicate', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const original = await db.prepare('SELECT * FROM proposals WHERE id = ?').bind(id).first() as any
  if (!original) return c.json({ error: 'Not found' }, 404)

  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  const now = new Date().toISOString()

  const result = await db.prepare(`
    INSERT INTO proposals (
      client_id, title, proposal_type, monthly_investment, contract_length,
      scope_summary, deliverables, target_keywords, competitor_domains,
      target_locations, goals, baseline_data, approval_token, expires_at,
      setup_fee, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).bind(
    original.client_id, `${original.title} (Copy)`, original.proposal_type,
    original.monthly_investment, original.contract_length,
    original.scope_summary, original.deliverables, original.target_keywords,
    original.competitor_domains, original.target_locations, original.goals,
    original.baseline_data, token, expiresAt.toISOString(), original.setup_fee || 0
  ).run()

  return c.json({ id: result.meta.last_row_id, message: 'Proposal duplicated' }, 201)
})
