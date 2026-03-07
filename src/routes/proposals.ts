import { Hono } from 'hono'

type Bindings = { DB: D1Database }
export const proposalsRoutes = new Hono<{ Bindings: Bindings }>()

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length))
  return token
}

// GET all proposals
proposalsRoutes.get('/', async (c) => {
  const db = c.env.DB
  const clientId = c.req.query('client_id')
  const query = clientId
    ? 'SELECT p.*, cl.company_name, cl.contact_email FROM proposals p JOIN clients cl ON p.client_id = cl.id WHERE p.client_id = ? ORDER BY p.created_at DESC'
    : 'SELECT p.*, cl.company_name, cl.contact_email FROM proposals p JOIN clients cl ON p.client_id = cl.id ORDER BY p.created_at DESC'
  
  const proposals = clientId
    ? await db.prepare(query).bind(clientId).all()
    : await db.prepare(query).all()
  
  return c.json(proposals.results)
})

// GET single proposal
proposalsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const proposal = await db.prepare(`
    SELECT p.*, cl.company_name, cl.contact_name, cl.contact_email, cl.website, cl.industry, cl.location
    FROM proposals p
    JOIN clients cl ON p.client_id = cl.id
    WHERE p.id = ?
  `).bind(id).first()
  if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
  return c.json(proposal)
})

// POST create proposal
proposalsRoutes.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const {
    client_id, title, proposal_type, monthly_investment, contract_length,
    scope_summary, deliverables, target_keywords, competitor_domains,
    target_locations, goals, baseline_data
  } = body

  if (!client_id || !title || !monthly_investment) {
    return c.json({ error: 'client_id, title, and monthly_investment are required' }, 400)
  }

  const token = generateToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  const result = await db.prepare(`
    INSERT INTO proposals (client_id, title, proposal_type, monthly_investment, contract_length, scope_summary, deliverables, target_keywords, competitor_domains, target_locations, goals, baseline_data, approval_token, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    client_id, title, proposal_type || 'organic_seo', monthly_investment,
    contract_length || 6, scope_summary || '', deliverables || '',
    target_keywords || '', competitor_domains || '', target_locations || '',
    goals || '', baseline_data || '', token, expiresAt.toISOString()
  ).run()

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'proposal_created', ?)"
  ).bind(client_id, `Proposal created: ${title}`).run()

  return c.json({ id: result.meta.last_row_id, approval_token: token, message: 'Proposal created' }, 201)
})

// PUT update proposal
proposalsRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const {
    title, proposal_type, monthly_investment, contract_length,
    scope_summary, deliverables, target_keywords, competitor_domains,
    target_locations, goals, baseline_data
  } = body

  await db.prepare(`
    UPDATE proposals SET title=?, proposal_type=?, monthly_investment=?, contract_length=?,
    scope_summary=?, deliverables=?, target_keywords=?, competitor_domains=?,
    target_locations=?, goals=?, baseline_data=?, updated_at=?
    WHERE id=?
  `).bind(
    title, proposal_type, monthly_investment, contract_length,
    scope_summary, deliverables, target_keywords, competitor_domains,
    target_locations, goals, baseline_data, new Date().toISOString(), id
  ).run()

  return c.json({ message: 'Proposal updated' })
})

// POST send proposal (mark as sent)
proposalsRoutes.post('/:id/send', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const now = new Date().toISOString()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await db.prepare(`
    UPDATE proposals SET status='sent', sent_at=?, expires_at=?, updated_at=? WHERE id=?
  `).bind(now, expiresAt.toISOString(), now, id).run()

  const proposal = await db.prepare(
    'SELECT p.*, cl.contact_email FROM proposals p JOIN clients cl ON p.client_id = cl.id WHERE p.id = ?'
  ).bind(id).first() as any

  await db.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'proposal_sent', ?)"
  ).bind(proposal?.client_id, `Proposal sent: ${proposal?.title}`).run()

  const approvalUrl = `/proposals/approve/${proposal?.approval_token}`
  return c.json({ message: 'Proposal marked as sent', approval_url: approvalUrl, approval_token: proposal?.approval_token })
})

// POST generate AI proposal content
proposalsRoutes.post('/generate', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { client_id, proposal_type, monthly_investment, target_keywords, competitor_domains, goals } = body

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(client_id).first() as any
  if (!client) return c.json({ error: 'Client not found' }, 404)

  const proposalTypes: Record<string, string> = {
    organic_seo: 'Organic Search Engine Optimisation',
    local_seo: 'Local SEO & Google Business Profile',
    content: 'Content Marketing & SEO',
    technical_seo: 'Technical SEO Audit & Optimisation',
    full_service: 'Full-Service Organic Digital Marketing'
  }

  const type = proposalTypes[proposal_type] || 'Organic SEO'
  const keywords = target_keywords ? target_keywords.split(',').map((k: string) => k.trim()).slice(0, 5) : []
  const competitors = competitor_domains ? competitor_domains.split(',').map((d: string) => d.trim()).slice(0, 3) : []

  const title = `${type} Proposal – ${client.company_name}`
  const monthlyInv = Number(monthly_investment)
  const contractLength = monthlyInv < 2000 ? 6 : monthlyInv < 4000 ? 12 : 12

  const deliverablesList = [
    '✓ Comprehensive technical SEO audit & fixes',
    '✓ On-page optimisation (title tags, meta descriptions, headers, schema)',
    '✓ Monthly keyword rank tracking across all target keywords',
    '✓ AI/LLM visibility tracking (ChatGPT, Google AI Overviews, Perplexity)',
    '✓ Competitor performance analysis & benchmarking',
    `✓ ${Math.floor(monthlyInv / 500)} x SEO-optimised content pieces per month`,
    '✓ Technical site health monitoring & issue resolution',
    '✓ Monthly performance report with insights & next steps',
    '✓ Quarterly strategy review call',
  ]

  const scope = `Digital Search Group will implement a data-driven ${type} strategy for ${client.company_name} (${client.website}), targeting growth in organic search visibility across ${client.location || 'your target markets'}.

Our approach combines advanced technical SEO, high-quality content creation, and comprehensive tracking of both traditional search rankings and AI-generated responses to ensure ${client.company_name} achieves and maintains visibility where it matters most — in Google Search, Google AI Overviews, ChatGPT, Perplexity, and other AI-powered search interfaces.

${keywords.length ? `We will prioritise performance for key terms including: ${keywords.join(', ')}.` : ''}
${competitors.length ? `We will continuously monitor competitor performance from: ${competitors.join(', ')}.` : ''}`

  const goalsText = goals || `• Achieve Page 1 Google rankings for ${keywords.slice(0, 3).join(', ') || 'core target keywords'}\n• Establish brand presence in AI-generated search responses\n• Grow organic traffic by 50–150% within 12 months\n• Generate consistent, qualified leads from organic search`

  return c.json({
    title,
    proposal_type,
    monthly_investment: monthlyInv,
    contract_length: contractLength,
    scope_summary: scope,
    deliverables: deliverablesList.join('\n'),
    target_keywords,
    competitor_domains,
    goals: goalsText,
    baseline_data: `Initial audit to be completed within 5 business days of campaign launch. Baseline rankings will be established for all target keywords.`
  })
})

// DELETE proposal
proposalsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM proposals WHERE id = ?').bind(id).run()
  return c.json({ message: 'Proposal deleted' })
})
