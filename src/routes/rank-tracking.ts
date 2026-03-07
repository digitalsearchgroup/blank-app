import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  DATAFORSEO_LOGIN: string
  DATAFORSEO_PASSWORD: string
}

export const rankTrackingRoutes = new Hono<{ Bindings: Bindings }>()

async function callDataForSEO(
  login: string,
  password: string,
  endpoint: string,
  payload: any[]
): Promise<any> {
  const auth = btoa(`${login}:${password}`)
  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`DataForSEO API error: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

// GET ranking summary for a campaign
rankTrackingRoutes.get('/campaign/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId')
  const db = c.env.DB

  const keywords = await db.prepare(`
    SELECT k.*,
      (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1) as current_rank,
      (SELECT rh.rank_position FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1 OFFSET 1) as previous_rank,
      (SELECT rh.tracked_at FROM rank_history rh WHERE rh.keyword_id = k.id ORDER BY rh.tracked_at DESC LIMIT 1) as last_tracked
    FROM keywords k
    WHERE k.campaign_id = ? AND k.is_tracking = 1
    ORDER BY k.priority DESC, k.monthly_search_volume DESC
  `).bind(campaignId).all()

  const kws = keywords.results as any[]
  const summary = {
    total: kws.length,
    tracked: kws.filter(k => k.current_rank !== null).length,
    top3: kws.filter(k => k.current_rank && k.current_rank <= 3).length,
    top10: kws.filter(k => k.current_rank && k.current_rank <= 10).length,
    top30: kws.filter(k => k.current_rank && k.current_rank <= 30).length,
    improved: kws.filter(k => k.current_rank && k.previous_rank && k.current_rank < k.previous_rank).length,
    declined: kws.filter(k => k.current_rank && k.previous_rank && k.current_rank > k.previous_rank).length,
    not_ranked: kws.filter(k => k.current_rank === null || k.current_rank > 100).length,
    keywords: kws,
  }

  return c.json(summary)
})

// POST track rankings for a campaign using DataForSEO
rankTrackingRoutes.post('/track/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId')
  const db = c.env.DB
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD

  if (!login || !password) {
    // Demo mode: simulate rank tracking with mock data
    return await simulateRankTracking(db, campaignId)
  }

  const keywords = await db.prepare(
    'SELECT * FROM keywords WHERE campaign_id = ? AND is_tracking = 1'
  ).bind(campaignId).all()

  if (!keywords.results.length) {
    return c.json({ error: 'No keywords to track', tracked: 0 })
  }

  const kws = keywords.results as any[]
  const tracked: any[] = []
  const errors: string[] = []

  // Process in batches of 10 to stay within API limits
  const batches = []
  for (let i = 0; i < kws.length; i += 10) {
    batches.push(kws.slice(i, i + 10))
  }

  for (const batch of batches) {
    try {
      const tasks = batch.map((kw: any) => ({
        keyword: kw.keyword,
        location_code: kw.location_code || 2840,
        language_code: kw.language_code || 'en',
        se_domain: 'google.com',
        depth: 100,
      }))

      const result = await callDataForSEO(login, password, 'serp/google/organic/live/regular', tasks)

      if (result.tasks) {
        for (let i = 0; i < result.tasks.length; i++) {
          const task = result.tasks[i]
          const kw = batch[i]

          if (task.status_code === 20000 && task.result?.length) {
            const serpResult = task.result[0]
            const items = serpResult.items || []
            
            // Find the client's URL in results
            const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').bind(campaignId).first() as any
            const client = campaign ? await db.prepare('SELECT website FROM clients WHERE id = ?').bind(campaign.client_id).first() as any : null
            const targetDomain = client?.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

            let rankPos: number | null = null
            let rankedUrl: string | null = null
            const serpFeatures: string[] = []

            // Detect SERP features
            for (const item of items) {
              if (item.type === 'ai_overview') serpFeatures.push('AI Overview')
              if (item.type === 'featured_snippet') serpFeatures.push('Featured Snippet')
              if (item.type === 'local_pack') serpFeatures.push('Local Pack')
              if (item.type === 'people_also_ask') serpFeatures.push('People Also Ask')
              
              if (item.type === 'organic' && targetDomain) {
                const itemDomain = item.url?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
                if (itemDomain === targetDomain) {
                  rankPos = item.rank_absolute
                  rankedUrl = item.url
                }
              }
            }

            // Get previous rank
            const prevRank = await db.prepare(
              'SELECT rank_position FROM rank_history WHERE keyword_id = ? ORDER BY tracked_at DESC LIMIT 1'
            ).bind(kw.id).first() as any

            await db.prepare(`
              INSERT INTO rank_history (keyword_id, campaign_id, client_id, rank_position, previous_position, url_ranked, serp_features)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(kw.id, campaignId, kw.client_id, rankPos, prevRank?.rank_position || null, rankedUrl, JSON.stringify(serpFeatures)).run()

            tracked.push({
              keyword: kw.keyword,
              rank: rankPos,
              previous: prevRank?.rank_position,
              change: rankPos && prevRank?.rank_position ? prevRank.rank_position - rankPos : null,
              serp_features: serpFeatures,
            })
          }
        }
      }
    } catch (err: any) {
      errors.push(err.message)
    }
  }

  return c.json({ tracked: tracked.length, results: tracked, errors })
})

// GET rank history for a keyword
rankTrackingRoutes.get('/history/:keywordId', async (c) => {
  const keywordId = c.req.param('keywordId')
  const db = c.env.DB
  const limit = parseInt(c.req.query('limit') || '30')
  
  const history = await db.prepare(
    'SELECT * FROM rank_history WHERE keyword_id = ? ORDER BY tracked_at DESC LIMIT ?'
  ).bind(keywordId, limit).all()
  
  return c.json(history.results)
})

// GET SERP analysis for a keyword using DataForSEO
rankTrackingRoutes.get('/serp-analysis', async (c) => {
  const keyword = c.req.query('keyword')
  const locationCode = c.req.query('location_code') || '2840'
  const languageCode = c.req.query('language_code') || 'en'
  const db = c.env.DB
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD

  if (!keyword) return c.json({ error: 'keyword query param required' }, 400)

  if (!login || !password) {
    return c.json(getMockSerpData(keyword))
  }

  try {
    const result = await callDataForSEO(login, password, 'serp/google/organic/live/regular', [{
      keyword,
      location_code: parseInt(locationCode),
      language_code: languageCode,
      depth: 10,
    }])

    const task = result.tasks?.[0]
    if (!task || task.status_code !== 20000) {
      return c.json({ error: 'API error', details: task?.status_message }, 500)
    }

    const serpItems = task.result?.[0]?.items || []
    const organic = serpItems.filter((i: any) => i.type === 'organic').slice(0, 10)
    const features = serpItems.filter((i: any) => i.type !== 'organic').map((i: any) => i.type)

    return c.json({
      keyword,
      location_code: locationCode,
      serp_features: [...new Set(features)],
      organic_results: organic.map((i: any) => ({
        position: i.rank_absolute,
        title: i.title,
        url: i.url,
        domain: i.domain,
        snippet: i.snippet,
      })),
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// GET keyword data from DataForSEO (search volume, difficulty, etc.)
rankTrackingRoutes.get('/keyword-data', async (c) => {
  const keyword = c.req.query('keyword')
  const locationCode = c.req.query('location_code') || '2840'
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD

  if (!keyword) return c.json({ error: 'keyword query param required' }, 400)

  if (!login || !password) {
    return c.json({
      keyword,
      search_volume: Math.floor(Math.random() * 5000 + 100),
      keyword_difficulty: Math.floor(Math.random() * 80 + 10),
      cpc: parseFloat((Math.random() * 10 + 0.5).toFixed(2)),
      competition: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
    })
  }

  try {
    const result = await callDataForSEO(login, password, 'keywords_data/google_ads/search_volume/live', [{
      keywords: [keyword],
      location_code: parseInt(locationCode),
      language_code: 'en',
    }])

    const item = result.tasks?.[0]?.result?.[0]
    return c.json({
      keyword,
      search_volume: item?.search_volume,
      keyword_difficulty: item?.keyword_difficulty,
      cpc: item?.cpc,
      competition: item?.competition,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Simulate rank tracking in demo mode
async function simulateRankTracking(db: D1Database, campaignId: string) {
  const keywords = await db.prepare(
    'SELECT * FROM keywords WHERE campaign_id = ? AND is_tracking = 1'
  ).bind(campaignId).all()

  const kws = keywords.results as any[]
  const tracked = []

  for (const kw of kws) {
    const prevRank = await db.prepare(
      'SELECT rank_position FROM rank_history WHERE keyword_id = ? ORDER BY tracked_at DESC LIMIT 1'
    ).bind(kw.id).first() as any

    // Generate realistic rank simulation
    const baseRank = prevRank?.rank_position || Math.floor(Math.random() * 50 + 10)
    const change = Math.floor(Math.random() * 11) - 5 // -5 to +5 positions
    const newRank = Math.max(1, Math.min(100, baseRank + change))
    
    const serpFeatures = []
    if (Math.random() > 0.7) serpFeatures.push('People Also Ask')
    if (Math.random() > 0.85) serpFeatures.push('Featured Snippet')
    if (Math.random() > 0.9) serpFeatures.push('AI Overview')

    await db.prepare(`
      INSERT INTO rank_history (keyword_id, campaign_id, client_id, rank_position, previous_position, serp_features)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(kw.id, campaignId, kw.client_id, newRank, prevRank?.rank_position || null, JSON.stringify(serpFeatures)).run()

    tracked.push({
      keyword: kw.keyword,
      rank: newRank,
      previous: prevRank?.rank_position,
      change: prevRank?.rank_position ? prevRank.rank_position - newRank : null,
      serp_features: serpFeatures,
    })
  }

  return Response.json({ tracked: tracked.length, results: tracked, mode: 'demo' })
}

function getMockSerpData(keyword: string) {
  return {
    keyword,
    serp_features: ['People Also Ask', 'Local Pack'],
    organic_results: [
      { position: 1, title: `${keyword} - Top Result`, url: 'https://example.com/page1', domain: 'example.com', snippet: 'Leading provider of...' },
      { position: 2, title: `Best ${keyword} Services`, url: 'https://competitor.com', domain: 'competitor.com', snippet: 'Professional services...' },
      { position: 3, title: `${keyword} Guide 2025`, url: 'https://guide.com/article', domain: 'guide.com', snippet: 'Complete guide to...' },
    ],
  }
}
