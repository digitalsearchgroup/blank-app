import { Hono } from 'hono'

type Bindings = { DB: D1Database }

export const campaignPlansRoutes = new Hono<{ Bindings: Bindings }>()

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function phaseForMonth(month: number): number {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

const PHASE_NAMES: Record<number, string> = {
  1: 'Authority Foundation',
  2: 'Authority Expansion',
  3: 'Authority Acceleration',
  4: 'Authority Compounding',
};

// ──────────────────────────────────────────────
// GET /api/campaign-plans/tiers – list all plan tiers
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/tiers', async (c) => {
  const tiers = await c.env.DB.prepare(
    'SELECT * FROM plan_tiers WHERE is_active = 1 ORDER BY sort_order'
  ).all()
  return c.json(tiers.results)
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/tiers/:key – single tier with monthly schedule
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/tiers/:key', async (c) => {
  const key = c.req.param('key')
  const tier = await c.env.DB.prepare(
    'SELECT * FROM plan_tiers WHERE tier_key = ?'
  ).bind(key).first() as any
  if (!tier) return c.json({ error: 'Tier not found' }, 404)

  const schedule = await c.env.DB.prepare(`
    SELECT tmd.month_number, tmd.qty,
           dc.internal_name, dc.client_name, dc.category,
           dc.client_description, dc.task_type, dc.estimated_hours
    FROM tier_monthly_deliverables tmd
    JOIN deliverable_catalogue dc ON tmd.deliverable_id = dc.id
    WHERE tmd.tier_id = ?
    ORDER BY tmd.month_number, dc.sort_order
  `).bind(tier.id).all()

  // Group by month
  const byMonth: Record<number, any[]> = {}
  for (const row of schedule.results as any[]) {
    if (!byMonth[row.month_number]) byMonth[row.month_number] = []
    byMonth[row.month_number].push(row)
  }

  return c.json({ tier, schedule: byMonth })
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/deliverables – full catalogue
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/deliverables', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM deliverable_catalogue ORDER BY sort_order'
  ).all()
  return c.json(rows.results)
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans – list all campaign plans
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT cp.*, pt.client_name AS tier_client_name, pt.tier_key, pt.monthly_price,
           cl.company_name, ca.name AS campaign_name,
           (SELECT COUNT(*) FROM campaign_tasks WHERE plan_id = cp.id) AS total_tasks,
           (SELECT COUNT(*) FROM campaign_tasks WHERE plan_id = cp.id AND status = 'completed') AS completed_tasks,
           (SELECT COUNT(*) FROM campaign_tasks WHERE plan_id = cp.id AND status IN ('pending','in_progress') AND due_date < date('now')) AS overdue_tasks
    FROM campaign_plans cp
    JOIN plan_tiers pt ON cp.tier_id = pt.id
    JOIN clients cl ON cp.client_id = cl.id
    JOIN campaigns ca ON cp.campaign_id = ca.id
    ORDER BY cp.created_at DESC
  `).all()
  return c.json(rows.results)
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/campaign/:campaignId
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/campaign/:campaignId', async (c) => {
  const campaignId = c.req.param('campaignId')
  const plan = await c.env.DB.prepare(`
    SELECT cp.*, pt.client_name AS tier_client_name, pt.internal_name AS tier_internal_name,
           pt.tier_key, pt.monthly_price, pt.phase1_outcome, pt.phase2_outcome,
           pt.phase3_outcome, pt.phase4_outcome,
           cl.company_name, ca.name AS campaign_name, ca.start_date AS campaign_start
    FROM campaign_plans cp
    JOIN plan_tiers pt ON cp.tier_id = pt.id
    JOIN clients cl ON cp.client_id = cl.id
    JOIN campaigns ca ON cp.campaign_id = ca.id
    WHERE cp.campaign_id = ?
  `).bind(campaignId).first() as any

  if (!plan) return c.json({ plan: null, tasks: [], phases: [] })

  // Load tasks grouped by month
  const tasks = await c.env.DB.prepare(`
    SELECT ct.*, dc.client_name AS deliverable_client_name,
           dc.category, dc.task_type, dc.client_description
    FROM campaign_tasks ct
    JOIN deliverable_catalogue dc ON ct.deliverable_id = dc.id
    WHERE ct.plan_id = ?
    ORDER BY ct.month_number, dc.sort_order
  `).bind(plan.id).all()

  // Build phase summary
  const taskList = tasks.results as any[]
  const phases = [1, 2, 3, 4].map(ph => {
    const months = [1, 2, 3].map(m => (ph - 1) * 3 + m)
    const phaseTasks = taskList.filter(t => months.includes(t.month_number))
    const completed = phaseTasks.filter(t => t.status === 'completed').length
    return {
      phase: ph,
      name: PHASE_NAMES[ph],
      months,
      total: phaseTasks.length,
      completed,
      pct: phaseTasks.length ? Math.round((completed / phaseTasks.length) * 100) : 0,
    }
  })

  return c.json({ plan, tasks: taskList, phases })
})

// ──────────────────────────────────────────────
// POST /api/campaign-plans – create plan + auto-generate tasks
// ──────────────────────────────────────────────
campaignPlansRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { campaign_id, client_id, tier_key, start_date, notes } = body

  if (!campaign_id || !client_id || !tier_key || !start_date) {
    return c.json({ error: 'campaign_id, client_id, tier_key, start_date required' }, 400)
  }

  // Check tier exists
  const tier = await c.env.DB.prepare(
    'SELECT * FROM plan_tiers WHERE tier_key = ?'
  ).bind(tier_key).first() as any
  if (!tier) return c.json({ error: 'Invalid tier_key' }, 400)

  // Check no existing plan for this campaign
  const existing = await c.env.DB.prepare(
    'SELECT id FROM campaign_plans WHERE campaign_id = ?'
  ).bind(campaign_id).first()
  if (existing) return c.json({ error: 'Campaign already has a plan' }, 409)

  // Create plan
  const planResult = await c.env.DB.prepare(`
    INSERT INTO campaign_plans (campaign_id, client_id, tier_id, start_date, notes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(campaign_id, client_id, tier.id, start_date, notes || null).run()

  const planId = planResult.meta.last_row_id

  // Auto-generate tasks for all 12 months
  const deliverables = await c.env.DB.prepare(`
    SELECT tmd.month_number, tmd.qty, tmd.deliverable_id,
           dc.internal_name, dc.client_name, dc.task_type
    FROM tier_monthly_deliverables tmd
    JOIN deliverable_catalogue dc ON tmd.deliverable_id = dc.id
    WHERE tmd.tier_id = ?
    ORDER BY tmd.month_number, dc.sort_order
  `).bind(tier.id).all()

  const startDt = new Date(start_date)

  for (const d of deliverables.results as any[]) {
    // Calculate due date: last day of the month
    const dueDate = new Date(startDt)
    dueDate.setMonth(dueDate.getMonth() + d.month_number - 1)
    // Set to end of month
    dueDate.setMonth(dueDate.getMonth() + 1, 0)
    const dueDateStr = dueDate.toISOString().split('T')[0]

    const title = d.client_name
    const priority = d.task_type === 'milestone' ? 'high' : d.month_number <= 3 ? 'high' : 'medium'

    await c.env.DB.prepare(`
      INSERT INTO campaign_tasks
        (plan_id, campaign_id, client_id, deliverable_id, month_number, qty,
         title, status, priority, due_date, client_visible)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 0)
    `).bind(planId, campaign_id, client_id, d.deliverable_id, d.month_number,
            d.qty, title, priority, dueDateStr).run()
  }

  // Log activity
  await c.env.DB.prepare(`
    INSERT INTO activity_log (client_id, activity_type, description)
    VALUES (?, 'plan_created', ?)
  `).bind(client_id, `Campaign plan created – ${tier.client_name} tier (12 months, ${(deliverables.results as any[]).length} tasks generated)`).run()

  return c.json({ success: true, plan_id: planId, tasks_generated: (deliverables.results as any[]).length })
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/:id – plan details
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const plan = await c.env.DB.prepare(`
    SELECT cp.*, pt.client_name AS tier_client_name, pt.tier_key,
           pt.monthly_price, pt.phase1_outcome, pt.phase2_outcome,
           pt.phase3_outcome, pt.phase4_outcome,
           cl.company_name, ca.name AS campaign_name
    FROM campaign_plans cp
    JOIN plan_tiers pt ON cp.tier_id = pt.id
    JOIN clients cl ON cp.client_id = cl.id
    JOIN campaigns ca ON cp.campaign_id = ca.id
    WHERE cp.id = ?
  `).bind(id).first()
  if (!plan) return c.json({ error: 'Not found' }, 404)
  return c.json(plan)
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/:id/tasks – tasks for a plan
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/:id/tasks', async (c) => {
  const id = c.req.param('id')
  const month = c.req.query('month')

  let query = `
    SELECT ct.*, dc.client_name AS deliverable_client_name,
           dc.category, dc.task_type, dc.client_description, dc.internal_name
    FROM campaign_tasks ct
    JOIN deliverable_catalogue dc ON ct.deliverable_id = dc.id
    WHERE ct.plan_id = ?
  `
  const params: any[] = [id]

  if (month) {
    query += ' AND ct.month_number = ?'
    params.push(parseInt(month))
  }

  query += ' ORDER BY ct.month_number, dc.sort_order'

  const tasks = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(tasks.results)
})

// ──────────────────────────────────────────────
// PATCH /api/campaign-plans/tasks/:taskId – update a task
// ──────────────────────────────────────────────
campaignPlansRoutes.patch('/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  const body = await c.req.json()
  const { status, assigned_to, notes, deliverable_url, url_reference, client_visible, client_label, priority } = body

  const task = await c.env.DB.prepare(
    'SELECT * FROM campaign_tasks WHERE id = ?'
  ).bind(taskId).first() as any
  if (!task) return c.json({ error: 'Task not found' }, 404)

  const now = new Date().toISOString()
  const completedAt = status === 'completed' ? now : task.completed_at

  await c.env.DB.prepare(`
    UPDATE campaign_tasks SET
      status = COALESCE(?, status),
      assigned_to = COALESCE(?, assigned_to),
      notes = COALESCE(?, notes),
      deliverable_url = COALESCE(?, deliverable_url),
      url_reference = COALESCE(?, url_reference),
      client_visible = COALESCE(?, client_visible),
      client_label = COALESCE(?, client_label),
      priority = COALESCE(?, priority),
      completed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    status ?? null, assigned_to ?? null, notes ?? null,
    deliverable_url ?? null, url_reference ?? null,
    client_visible ?? null, client_label ?? null, priority ?? null,
    completedAt, now, taskId
  ).run()

  return c.json({ success: true })
})

// ──────────────────────────────────────────────
// PATCH /api/campaign-plans/tasks/bulk – bulk update tasks
// ──────────────────────────────────────────────
campaignPlansRoutes.patch('/tasks/bulk', async (c) => {
  const { task_ids, status, assigned_to } = await c.req.json()
  if (!Array.isArray(task_ids) || !task_ids.length) {
    return c.json({ error: 'task_ids array required' }, 400)
  }

  const now = new Date().toISOString()
  for (const id of task_ids) {
    await c.env.DB.prepare(`
      UPDATE campaign_tasks
      SET status = COALESCE(?, status),
          assigned_to = COALESCE(?, assigned_to),
          completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
          updated_at = ?
      WHERE id = ?
    `).bind(status ?? null, assigned_to ?? null, status, now, now, id).run()
  }

  return c.json({ success: true, updated: task_ids.length })
})

// ──────────────────────────────────────────────
// GET /api/campaign-plans/:id/report-data
// Returns client-visible tasks + phase progress for reporting
// ──────────────────────────────────────────────
campaignPlansRoutes.get('/:id/report-data', async (c) => {
  const id = c.req.param('id')
  const plan = await c.env.DB.prepare(`
    SELECT cp.*, pt.client_name AS tier_client_name, pt.tier_key,
           pt.phase1_outcome, pt.phase2_outcome, pt.phase3_outcome, pt.phase4_outcome,
           cl.company_name, ca.name AS campaign_name
    FROM campaign_plans cp
    JOIN plan_tiers pt ON cp.tier_id = pt.id
    JOIN clients cl ON cp.client_id = cl.id
    JOIN campaigns ca ON cp.campaign_id = ca.id
    WHERE cp.id = ?
  `).bind(id).first() as any
  if (!plan) return c.json({ error: 'Not found' }, 404)

  const tasks = await c.env.DB.prepare(`
    SELECT ct.*, dc.client_name AS deliverable_client_name, dc.category,
           dc.client_description
    FROM campaign_tasks ct
    JOIN deliverable_catalogue dc ON ct.deliverable_id = dc.id
    WHERE ct.plan_id = ? AND ct.client_visible = 1
    ORDER BY ct.month_number, dc.sort_order
  `).bind(id).all()

  // Compute phase progress
  const allTasks = (await c.env.DB.prepare(
    'SELECT month_number, status FROM campaign_tasks WHERE plan_id = ?'
  ).bind(id).all()).results as any[]

  const phases = [1, 2, 3, 4].map(ph => {
    const months = [1, 2, 3].map(m => (ph - 1) * 3 + m)
    const pTasks = allTasks.filter(t => months.includes(t.month_number))
    const completed = pTasks.filter(t => t.status === 'completed').length
    return {
      phase: ph,
      name: PHASE_NAMES[ph],
      total: pTasks.length,
      completed,
      pct: pTasks.length ? Math.round((completed / pTasks.length) * 100) : 0,
    }
  })

  return c.json({ plan, tasks: tasks.results, phases })
})

// ──────────────────────────────────────────────
// PATCH /api/campaign-plans/:id/reschedule
// Update plan start_date and recalculate all pending task due dates
// ──────────────────────────────────────────────
campaignPlansRoutes.patch('/:id/reschedule', async (c) => {
  const id = c.req.param('id')
  const { start_date } = await c.req.json()

  if (!start_date) return c.json({ error: 'start_date required' }, 400)

  const plan = await c.env.DB.prepare(
    'SELECT * FROM campaign_plans WHERE id = ?'
  ).bind(id).first() as any
  if (!plan) return c.json({ error: 'Plan not found' }, 404)

  // Update plan start_date
  await c.env.DB.prepare(
    'UPDATE campaign_plans SET start_date = ?, updated_at = ? WHERE id = ?'
  ).bind(start_date, new Date().toISOString(), id).run()

  // Also update the linked campaign's start_date
  await c.env.DB.prepare(
    'UPDATE campaigns SET start_date = ?, updated_at = ? WHERE id = ?'
  ).bind(start_date, new Date().toISOString(), plan.campaign_id).run()

  // Recalculate due dates for all non-completed tasks
  const startDt = new Date(start_date)
  const tasks = await c.env.DB.prepare(
    "SELECT id, month_number, status FROM campaign_tasks WHERE plan_id = ? AND status != 'completed'"
  ).bind(id).all()

  for (const t of tasks.results as any[]) {
    const dueDate = new Date(startDt)
    dueDate.setMonth(dueDate.getMonth() + t.month_number - 1)
    // Last day of that month
    dueDate.setMonth(dueDate.getMonth() + 1, 0)
    const dueDateStr = dueDate.toISOString().split('T')[0]

    await c.env.DB.prepare(
      'UPDATE campaign_tasks SET due_date = ?, updated_at = ? WHERE id = ?'
    ).bind(dueDateStr, new Date().toISOString(), t.id).run()
  }

  await c.env.DB.prepare(
    "INSERT INTO activity_log (client_id, activity_type, description) VALUES (?, 'plan_rescheduled', ?)"
  ).bind(plan.client_id, `Campaign plan rescheduled: new start date ${start_date}, ${(tasks.results as any[]).length} task due dates updated`).run()

  return c.json({ success: true, tasks_updated: (tasks.results as any[]).length })
})

// ──────────────────────────────────────────────
// DELETE /api/campaign-plans/:id – delete plan + tasks
// ──────────────────────────────────────────────
campaignPlansRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM campaign_tasks WHERE plan_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM campaign_plans WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})
