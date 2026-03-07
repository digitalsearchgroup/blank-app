import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  DATAFORSEO_LOGIN: string
  DATAFORSEO_PASSWORD: string
}

export const llmRoutes = new Hono<{ Bindings: Bindings }>()

async function callDataForSEO(login: string, password: string, endpoint: string, payload: any[]): Promise<any> {
  const auth = btoa(`${login}:${password}`)
  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return response.json()
}

// GET all LLM prompts for a campaign
llmRoutes.get('/prompts', async (c) => {
  const db = c.env.DB
  const campaignId = c.req.query('campaign_id')
  const clientId = c.req.query('client_id')
  
  let q = `SELECT p.*, 
    (SELECT h.is_mentioned FROM llm_mention_history h WHERE h.prompt_id = p.id ORDER BY h.tracked_at DESC LIMIT 1) as latest_mentioned,
    (SELECT h.sentiment FROM llm_mention_history h WHERE h.prompt_id = p.id ORDER BY h.tracked_at DESC LIMIT 1) as latest_sentiment,
    (SELECT h.mention_rank FROM llm_mention_history h WHERE h.prompt_id = p.id ORDER BY h.tracked_at DESC LIMIT 1) as latest_rank,
    (SELECT COUNT(*) FROM llm_mention_history h WHERE h.prompt_id = p.id) as total_checks,
    (SELECT COUNT(*) FROM llm_mention_history h WHERE h.prompt_id = p.id AND h.is_mentioned = 1) as total_mentions
    FROM llm_prompts p`
  
  const params: any[] = []
  if (campaignId) { q += ' WHERE p.campaign_id = ?'; params.push(campaignId) }
  else if (clientId) { q += ' WHERE p.client_id = ?'; params.push(clientId) }
  q += ' ORDER BY p.created_at DESC'
  
  const stmt = params.length ? db.prepare(q).bind(...params) : db.prepare(q)
  const prompts = await stmt.all()
  return c.json(prompts.results)
})

// GET LLM mention history for a prompt
llmRoutes.get('/prompts/:id/history', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const history = await db.prepare(
    'SELECT * FROM llm_mention_history WHERE prompt_id = ? ORDER BY tracked_at DESC LIMIT 30'
  ).bind(id).all()
  return c.json(history.results)
})

// POST create LLM prompt
llmRoutes.post('/prompts', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { campaign_id, client_id, prompt_text, prompt_category, target_brand, llm_model, location_code, language_code } = body

  if (!campaign_id || !client_id || !prompt_text) {
    return c.json({ error: 'campaign_id, client_id, and prompt_text are required' }, 400)
  }

  const result = await db.prepare(`
    INSERT INTO llm_prompts (campaign_id, client_id, prompt_text, prompt_category, target_brand, llm_model, location_code, language_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(campaign_id, client_id, prompt_text, prompt_category || 'brand_mention', target_brand || '', llm_model || 'chatgpt', location_code || 2840, language_code || 'en').run()

  return c.json({ id: result.meta.last_row_id, message: 'LLM prompt created' }, 201)
})

// POST track LLM mentions for a campaign using DataForSEO LLM Mentions API
llmRoutes.post('/track/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId')
  const db = c.env.DB
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD

  const prompts = await db.prepare(
    'SELECT * FROM llm_prompts WHERE campaign_id = ? AND is_tracking = 1'
  ).bind(campaignId).all()

  if (!prompts.results.length) {
    return c.json({ error: 'No LLM prompts to track', tracked: 0 })
  }

  const pts = prompts.results as any[]

  if (!login || !password) {
    // Demo mode
    return await simulateLLMTracking(db, campaignId, pts)
  }

  const tracked = []
  const errors: string[] = []

  for (const prompt of pts) {
    try {
      // Use DataForSEO AI Optimization API - LLM Mentions
      const result = await callDataForSEO(login, password, 'ai_optimization/llm_mentions/live', [{
        keyword: prompt.target_brand || '',
        prompt: prompt.prompt_text,
        location_code: prompt.location_code || 2840,
        language_code: prompt.language_code || 'en',
        se_name: mapLLMModel(prompt.llm_model),
      }])

      const task = result.tasks?.[0]
      if (task?.status_code === 20000 && task.result?.length) {
        const r = task.result[0]
        const isMentioned = r.items?.some((item: any) =>
          item.type === 'mention' || item.is_mentioned
        ) ? 1 : 0

        const mentionItem = r.items?.find((item: any) => item.type === 'mention')
        const mentionRank = mentionItem?.rank_position || null
        const responseSnippet = r.items?.find((item: any) => item.type === 'response')?.content?.slice(0, 500) || ''
        
        let sentiment: 'positive' | 'neutral' | 'negative' | 'not_mentioned' = 'not_mentioned'
        if (isMentioned) {
          sentiment = mentionItem?.sentiment || 'neutral'
        }

        const prevCheck = await db.prepare(
          'SELECT is_mentioned FROM llm_mention_history WHERE prompt_id = ? ORDER BY tracked_at DESC LIMIT 1'
        ).bind(prompt.id).first() as any

        await db.prepare(`
          INSERT INTO llm_mention_history (prompt_id, campaign_id, client_id, is_mentioned, mention_rank, sentiment, response_snippet)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(prompt.id, campaignId, prompt.client_id, isMentioned, mentionRank, sentiment, responseSnippet).run()

        tracked.push({
          prompt: prompt.prompt_text,
          model: prompt.llm_model,
          is_mentioned: !!isMentioned,
          mention_rank: mentionRank,
          sentiment,
          previous_mentioned: prevCheck ? !!prevCheck.is_mentioned : null,
        })
      }
    } catch (err: any) {
      errors.push(`Prompt "${prompt.prompt_text.slice(0, 50)}...": ${err.message}`)
    }
  }

  return c.json({ tracked: tracked.length, results: tracked, errors })
})

// GET LLM visibility summary for a campaign
llmRoutes.get('/summary/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId')
  const db = c.env.DB

  const prompts = await db.prepare(`
    SELECT p.*,
      (SELECT h.is_mentioned FROM llm_mention_history h WHERE h.prompt_id = p.id ORDER BY h.tracked_at DESC LIMIT 1) as is_mentioned,
      (SELECT h.sentiment FROM llm_mention_history h WHERE h.prompt_id = p.id ORDER BY h.tracked_at DESC LIMIT 1) as sentiment,
      (SELECT COUNT(*) FROM llm_mention_history h WHERE h.prompt_id = p.id AND h.is_mentioned = 1) as mention_count,
      (SELECT COUNT(*) FROM llm_mention_history h WHERE h.prompt_id = p.id) as total_checks
    FROM llm_prompts p
    WHERE p.campaign_id = ? AND p.is_tracking = 1
  `).bind(campaignId).all()

  const pts = prompts.results as any[]
  const total = pts.length
  const mentioned = pts.filter(p => p.is_mentioned).length
  const notMentioned = total - mentioned
  const mentionRate = total > 0 ? Math.round((mentioned / total) * 100) : 0

  const byModel: Record<string, { total: number; mentioned: number }> = {}
  for (const p of pts) {
    if (!byModel[p.llm_model]) byModel[p.llm_model] = { total: 0, mentioned: 0 }
    byModel[p.llm_model].total++
    if (p.is_mentioned) byModel[p.llm_model].mentioned++
  }

  return c.json({
    total_prompts: total,
    mentioned,
    not_mentioned: notMentioned,
    mention_rate: mentionRate,
    by_model: byModel,
    prompts: pts,
  })
})

// PUT update prompt
llmRoutes.put('/prompts/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const { prompt_text, prompt_category, target_brand, llm_model, is_tracking } = body

  await db.prepare(`
    UPDATE llm_prompts SET prompt_text=?, prompt_category=?, target_brand=?, llm_model=?, is_tracking=?
    WHERE id=?
  `).bind(prompt_text, prompt_category, target_brand, llm_model, is_tracking ?? 1, id).run()

  return c.json({ message: 'Prompt updated' })
})

// DELETE prompt
llmRoutes.delete('/prompts/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM llm_prompts WHERE id = ?').bind(id).run()
  return c.json({ message: 'Prompt deleted' })
})

function mapLLMModel(model: string): string {
  const map: Record<string, string> = {
    chatgpt: 'chatgpt',
    claude: 'claude',
    gemini: 'gemini',
    perplexity: 'perplexity',
    copilot: 'copilot',
  }
  return map[model?.toLowerCase()] || 'chatgpt'
}

async function simulateLLMTracking(db: D1Database, campaignId: string, prompts: any[]) {
  const tracked = []
  const models = ['chatgpt', 'gemini', 'claude', 'perplexity']
  const sentiments: Array<'positive' | 'neutral' | 'negative' | 'not_mentioned'> = ['positive', 'neutral', 'negative', 'not_mentioned']

  for (const prompt of prompts) {
    const isMentioned = Math.random() > 0.35 ? 1 : 0
    const sentiment = isMentioned ? sentiments[Math.floor(Math.random() * 3)] : 'not_mentioned'
    const mentionRank = isMentioned ? Math.floor(Math.random() * 5) + 1 : null

    const prevCheck = await db.prepare(
      'SELECT is_mentioned FROM llm_mention_history WHERE prompt_id = ? ORDER BY tracked_at DESC LIMIT 1'
    ).bind(prompt.id).first() as any

    await db.prepare(`
      INSERT INTO llm_mention_history (prompt_id, campaign_id, client_id, is_mentioned, mention_rank, sentiment, response_snippet)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      prompt.id, campaignId, prompt.client_id, isMentioned, mentionRank, sentiment,
      isMentioned ? `...${prompt.target_brand || 'the brand'} is highly recommended for ${prompt.prompt_text.slice(0, 50)}...` : null
    ).run()

    tracked.push({
      prompt: prompt.prompt_text,
      model: prompt.llm_model,
      is_mentioned: !!isMentioned,
      mention_rank: mentionRank,
      sentiment,
      previous_mentioned: prevCheck ? !!prevCheck.is_mentioned : null,
    })
  }

  return Response.json({ tracked: tracked.length, results: tracked, mode: 'demo' })
}
