import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  DATAFORSEO_LOGIN: string
  DATAFORSEO_PASSWORD: string
}

export const dataforseoRoutes = new Hono<{ Bindings: Bindings }>()

async function callDataForSEO(login: string, password: string, endpoint: string, payload: any[]): Promise<any> {
  const auth = btoa(`${login}:${password}`)
  const res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

// GET - check DataForSEO connection status
dataforseoRoutes.get('/status', async (c) => {
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD
  
  if (!login || !password) {
    return c.json({ connected: false, mode: 'demo', message: 'No DataForSEO credentials configured. Running in demo mode.' })
  }

  try {
    const auth = btoa(`${login}:${password}`)
    const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      headers: { 'Authorization': `Basic ${auth}` }
    })
    const data = await res.json() as any
    
    if (data.status_code === 20000) {
      return c.json({
        connected: true,
        mode: 'live',
        credits: data.tasks?.[0]?.result?.[0]?.money?.balance || 'N/A',
        login: data.tasks?.[0]?.result?.[0]?.login || login,
      })
    }
    return c.json({ connected: false, mode: 'error', message: data.status_message || 'Authentication failed' })
  } catch (err: any) {
    return c.json({ connected: false, mode: 'error', message: err.message })
  }
})

// POST - keyword research
dataforseoRoutes.post('/keyword-research', async (c) => {
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD
  const body = await c.req.json()
  const { keyword, location_code, language_code, limit } = body

  if (!keyword) return c.json({ error: 'keyword required' }, 400)

  if (!login || !password) {
    return c.json(getMockKeywordData(keyword, limit || 20))
  }

  try {
    const result = await callDataForSEO(login, password, 'dataforseo_labs/google/keyword_suggestions/live', [{
      keyword,
      location_code: location_code || 2840,
      language_code: language_code || 'en',
      limit: limit || 20,
      include_serp_info: true,
    }])

    const items = result.tasks?.[0]?.result?.[0]?.items || []
    return c.json({
      keyword,
      suggestions: items.map((item: any) => ({
        keyword: item.keyword,
        search_volume: item.keyword_info?.search_volume,
        keyword_difficulty: item.keyword_properties?.keyword_difficulty,
        cpc: item.keyword_info?.cpc,
        competition: item.keyword_info?.competition,
        intent: item.search_intent_info?.main_intent,
      }))
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST - competitor analysis
dataforseoRoutes.post('/competitor-analysis', async (c) => {
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD
  const body = await c.req.json()
  const { domain, location_code, language_code } = body

  if (!domain) return c.json({ error: 'domain required' }, 400)

  if (!login || !password) {
    return c.json(getMockCompetitorData(domain))
  }

  try {
    const [rankOverview, competitors] = await Promise.all([
      callDataForSEO(login, password, 'dataforseo_labs/google/domain_rank_overview/live', [{
        target: domain,
        location_code: location_code || 2840,
        language_code: language_code || 'en',
      }]),
      callDataForSEO(login, password, 'dataforseo_labs/google/competitors_domain/live', [{
        target: domain,
        location_code: location_code || 2840,
        language_code: language_code || 'en',
        limit: 10,
      }]),
    ])

    const overview = rankOverview.tasks?.[0]?.result?.[0]?.items?.[0]
    const competitorList = competitors.tasks?.[0]?.result?.[0]?.items || []

    return c.json({
      domain,
      rank_overview: {
        organic_traffic: overview?.metrics?.organic?.etv,
        organic_keywords: overview?.metrics?.organic?.count,
        domain_rank: overview?.rank,
      },
      competitors: competitorList.slice(0, 10).map((c: any) => ({
        domain: c.domain,
        organic_traffic: c.metrics?.organic?.etv,
        organic_keywords: c.metrics?.organic?.count,
        common_keywords: c.avg_position,
      })),
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST - backlink summary
dataforseoRoutes.post('/backlinks', async (c) => {
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD
  const body = await c.req.json()
  const { target } = body

  if (!target) return c.json({ error: 'target domain required' }, 400)

  if (!login || !password) {
    return c.json({
      target,
      backlinks_count: Math.floor(Math.random() * 5000 + 200),
      referring_domains: Math.floor(Math.random() * 300 + 50),
      domain_rank: Math.floor(Math.random() * 60 + 10),
    })
  }

  try {
    const result = await callDataForSEO(login, password, 'backlinks/summary/live', [{
      target,
      include_subdomains: true,
    }])

    const data = result.tasks?.[0]?.result?.[0]
    return c.json({
      target,
      backlinks_count: data?.backlinks,
      referring_domains: data?.referring_domains,
      domain_rank: data?.rank,
      spam_score: data?.spam_score,
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// POST - on-page audit
dataforseoRoutes.post('/onpage-audit', async (c) => {
  const login = c.env.DATAFORSEO_LOGIN
  const password = c.env.DATAFORSEO_PASSWORD
  const body = await c.req.json()
  const { target } = body

  if (!target) return c.json({ error: 'target URL required' }, 400)

  if (!login || !password) {
    return c.json(getMockOnPageData(target))
  }

  try {
    // Initiate crawl task
    const taskResult = await callDataForSEO(login, password, 'on_page/task_post', [{
      target,
      max_crawl_pages: 20,
      check_spell: true,
      check_broken_links: true,
    }])
    
    const taskId = taskResult.tasks?.[0]?.id
    return c.json({ task_id: taskId, message: 'Audit task created. Check results with task_id.' })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// Mock data helpers
function getMockKeywordData(seed: string, limit: number) {
  const suffixes = ['guide', 'services', 'near me', 'cost', 'best', 'professional', 'how to', 'tips', 'review', 'vs']
  return {
    keyword: seed,
    suggestions: Array.from({ length: limit }, (_, i) => ({
      keyword: `${seed} ${suffixes[i % suffixes.length]}`,
      search_volume: Math.floor(Math.random() * 3000 + 50),
      keyword_difficulty: Math.floor(Math.random() * 80 + 10),
      cpc: parseFloat((Math.random() * 8 + 0.3).toFixed(2)),
      competition: ['LOW', 'MEDIUM', 'HIGH'][Math.floor(Math.random() * 3)],
      intent: ['informational', 'navigational', 'commercial', 'transactional'][Math.floor(Math.random() * 4)],
    }))
  }
}

function getMockCompetitorData(domain: string) {
  const names = ['competitor1.com', 'rival-brand.com', 'topservices.com', 'bestlocal.com', 'expertpro.com']
  return {
    domain,
    rank_overview: {
      organic_traffic: Math.floor(Math.random() * 20000 + 500),
      organic_keywords: Math.floor(Math.random() * 500 + 50),
      domain_rank: Math.floor(Math.random() * 60 + 10),
    },
    competitors: names.map(name => ({
      domain: name,
      organic_traffic: Math.floor(Math.random() * 15000 + 200),
      organic_keywords: Math.floor(Math.random() * 400 + 30),
      common_keywords: Math.floor(Math.random() * 100 + 5),
    }))
  }
}

function getMockOnPageData(target: string) {
  return {
    target,
    pages_crawled: 15,
    issues: {
      critical: Math.floor(Math.random() * 5),
      warnings: Math.floor(Math.random() * 15 + 3),
      notices: Math.floor(Math.random() * 20 + 5),
    },
    performance: {
      page_speed_score: Math.floor(Math.random() * 40 + 50),
      mobile_friendly: Math.random() > 0.3,
    },
    seo: {
      missing_meta_descriptions: Math.floor(Math.random() * 5),
      duplicate_titles: Math.floor(Math.random() * 3),
      broken_links: Math.floor(Math.random() * 4),
      missing_h1: Math.floor(Math.random() * 2),
    }
  }
}
