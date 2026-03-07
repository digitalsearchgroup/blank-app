-- ============================================================
-- Migration 0007: Demo Seed Data
-- Adds campaign plans for BlueSky Legal and Coastal Dental
-- with realistic task progress, keywords, and a sample proposal
-- ============================================================

-- ─────────────────────────────────────────────
-- Campaign plans for existing campaigns
-- ─────────────────────────────────────────────

-- BlueSky Legal → Ultimate tier (AI Authority Accelerator - $3,997)
INSERT OR IGNORE INTO campaign_plans (campaign_id, client_id, tier_id, start_date, status, current_month, total_months, notes)
VALUES (
  2, 2,
  (SELECT id FROM plan_tiers WHERE tier_key = 'ultimate'),
  '2024-10-01', 'active', 6, 12,
  'High-value legal firm targeting competitive litigation keywords'
);

-- Coastal Dental → Basic tier (AI Authority Foundation - $1,497)
INSERT OR IGNORE INTO campaign_plans (campaign_id, client_id, tier_id, start_date, status, current_month, total_months, notes)
VALUES (
  3, 4,
  (SELECT id FROM plan_tiers WHERE tier_key = 'basic'),
  '2025-02-01', 'active', 1, 12,
  'Local dental group targeting suburb-level keywords'
);

-- ─────────────────────────────────────────────
-- Auto-generate tasks for BlueSky Legal (campaign_id=2, plan via subquery)
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO campaign_tasks
  (plan_id, campaign_id, client_id, deliverable_id, month_number, qty, title, status, priority, due_date, client_visible)
SELECT
  (SELECT id FROM campaign_plans WHERE campaign_id = 2 LIMIT 1),
  2, 2,
  tmd.deliverable_id, tmd.month_number, tmd.qty,
  dc.client_name,
  CASE
    WHEN tmd.month_number <= 5 THEN 'completed'
    WHEN tmd.month_number = 6 THEN 'in_progress'
    ELSE 'pending'
  END,
  CASE WHEN dc.task_type = 'milestone' THEN 'high' WHEN tmd.month_number <= 3 THEN 'high' ELSE 'medium' END,
  date('2024-10-01', '+' || ((tmd.month_number - 1) * 30) || ' days', 'start of month', '+1 month', '-1 day'),
  0
FROM tier_monthly_deliverables tmd
JOIN deliverable_catalogue dc ON tmd.deliverable_id = dc.id
WHERE tmd.tier_id = (SELECT id FROM plan_tiers WHERE tier_key = 'ultimate')
  AND NOT EXISTS (
    SELECT 1 FROM campaign_tasks ct2 
    WHERE ct2.campaign_id = 2 
    AND ct2.deliverable_id = tmd.deliverable_id 
    AND ct2.month_number = tmd.month_number
  );

-- Set completed_at for completed BlueSky tasks
UPDATE campaign_tasks
SET completed_at = datetime('2024-10-01', '+' || ((month_number - 1) * 30 + 28) || ' days'),
    completed_by = 'DSG Admin'
WHERE campaign_id = 2 AND status = 'completed';

-- ─────────────────────────────────────────────
-- Auto-generate tasks for Coastal Dental (campaign_id=3, basic tier)
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO campaign_tasks
  (plan_id, campaign_id, client_id, deliverable_id, month_number, qty, title, status, priority, due_date, client_visible)
SELECT
  (SELECT id FROM campaign_plans WHERE campaign_id = 3 LIMIT 1),
  3, 4,
  tmd.deliverable_id, tmd.month_number, tmd.qty,
  dc.client_name,
  CASE
    WHEN tmd.month_number = 1 THEN 'in_progress'
    ELSE 'pending'
  END,
  CASE WHEN dc.task_type = 'milestone' THEN 'high' WHEN tmd.month_number <= 3 THEN 'high' ELSE 'medium' END,
  date('2025-02-01', '+' || ((tmd.month_number - 1) * 30) || ' days', 'start of month', '+1 month', '-1 day'),
  0
FROM tier_monthly_deliverables tmd
JOIN deliverable_catalogue dc ON tmd.deliverable_id = dc.id
WHERE tmd.tier_id = (SELECT id FROM plan_tiers WHERE tier_key = 'basic')
  AND NOT EXISTS (
    SELECT 1 FROM campaign_tasks ct2 
    WHERE ct2.campaign_id = 3 
    AND ct2.deliverable_id = tmd.deliverable_id 
    AND ct2.month_number = tmd.month_number
  );

-- ─────────────────────────────────────────────
-- Mark some Apex Plumbing tasks as completed (realistic Month 1 progress)
-- ─────────────────────────────────────────────

UPDATE campaign_tasks
SET status = 'completed',
    completed_at = '2025-01-28 10:00:00',
    completed_by = 'DSG Admin',
    assigned_to = 'DSG Admin'
WHERE campaign_id = 1 AND month_number = 1 AND status = 'pending'
AND deliverable_id IN (
  SELECT id FROM deliverable_catalogue WHERE category IN ('foundation', 'technical') LIMIT 10
);

UPDATE campaign_tasks
SET status = 'in_progress',
    assigned_to = 'DSG Admin'
WHERE campaign_id = 1 AND month_number = 1 AND status = 'pending'
AND deliverable_id IN (
  SELECT id FROM deliverable_catalogue WHERE category IN ('on_page', 'content') LIMIT 5
);

-- ─────────────────────────────────────────────
-- Add keywords for BlueSky Legal (campaign_id=2)
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO keywords (campaign_id, client_id, keyword, target_url, monthly_search_volume, priority, is_tracking)
VALUES
  (2, 2, 'sydney litigation lawyers', 'https://blueskylegal.com.au/litigation', 1900, 'high', 1),
  (2, 2, 'commercial law firm sydney', 'https://blueskylegal.com.au/commercial', 2400, 'high', 1),
  (2, 2, 'employment law solicitors nsw', 'https://blueskylegal.com.au/employment', 1600, 'high', 1),
  (2, 2, 'contract dispute lawyers sydney', 'https://blueskylegal.com.au/disputes', 880, 'medium', 1),
  (2, 2, 'property law firm sydney', 'https://blueskylegal.com.au/property', 3100, 'medium', 1),
  (2, 2, 'intellectual property lawyers', 'https://blueskylegal.com.au/ip', 720, 'low', 1),
  (2, 2, 'family law solicitors sydney', 'https://blueskylegal.com.au/family', 4200, 'high', 1),
  (2, 2, 'no win no fee lawyers nsw', 'https://blueskylegal.com.au', 2800, 'high', 1);

-- ─────────────────────────────────────────────
-- Add keywords for Coastal Dental (campaign_id=3)
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO keywords (campaign_id, client_id, keyword, target_url, monthly_search_volume, priority, is_tracking)
VALUES
  (3, 4, 'dentist bondi beach', 'https://coastaldental.com.au', 590, 'high', 1),
  (3, 4, 'emergency dentist sydney eastern suburbs', 'https://coastaldental.com.au/emergency', 480, 'high', 1),
  (3, 4, 'teeth whitening bondi', 'https://coastaldental.com.au/whitening', 320, 'medium', 1),
  (3, 4, 'family dentist coogee', 'https://coastaldental.com.au', 210, 'medium', 1),
  (3, 4, 'invisalign bondi', 'https://coastaldental.com.au/invisalign', 390, 'high', 1),
  (3, 4, 'bulk billing dentist eastern suburbs', 'https://coastaldental.com.au', 270, 'medium', 1);

-- ─────────────────────────────────────────────
-- Add a draft proposal for TechNova Solutions
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO proposals (client_id, title, proposal_type, status, monthly_investment, contract_length, setup_fee,
  scope_summary, deliverables, target_keywords, goals, baseline_data,
  account_manager, reporting_frequency)
VALUES (
  3,
  'TechNova Solutions – AI Authority Accelerator Package',
  'organic_seo',
  'draft',
  3997,
  12,
  0,
  'A comprehensive 12-month AI Authority Accelerator engagement designed to establish TechNova Solutions as the dominant authority in the B2B SaaS space. This proposal covers all phases of our authority engineering framework, from foundational entity alignment through to AI-ready citation optimisation.',
  '• Technical SEO audit & entity alignment
• Monthly authority placements (guest posts on DA40+ sites)
• Quarterly media authority injections (Google News)
• Entity signal reinforcement & schema markup
• AI visibility tracking (ChatGPT, Gemini, Perplexity)
• 6x SEO-optimised long-form content per month
• Monthly authority velocity reporting
• Tiered link building & digital PR
• Competitor gap analysis & intelligence reports',
  'B2B SaaS platform, project management software, team collaboration tools, enterprise software sydney, SaaS CRM sydney',
  '• Achieve page 1 rankings for 15+ commercial B2B keywords within 6 months
• Generate 40%+ increase in organic traffic by month 6
• Establish brand mentions in ChatGPT and Google AI Overviews
• Build 50+ high-authority backlinks across tech and business publications
• 3x increase in demo requests from organic search',
  'Current organic traffic: ~2,400/month. Domain rating: 28. Currently ranking for 4 brand keywords only. No AI search visibility.',
  'DSG Admin',
  'monthly'
);

-- ─────────────────────────────────────────────
-- Add LLM prompts for Apex Plumbing
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO llm_prompts (campaign_id, client_id, prompt_text, target_brand, llm_model, is_tracking)
VALUES
  (1, 1, 'Who are the best plumbers in Sydney?', 'Apex Plumbing Services', 'chatgpt', 1),
  (1, 1, 'What is the best plumbing company for blocked drains in Sydney?', 'Apex Plumbing Services', 'perplexity', 1),
  (1, 1, 'Recommend a reliable emergency plumber in Sydney', 'Apex Plumbing Services', 'gemini', 1);

-- LLM prompts for BlueSky Legal
INSERT OR IGNORE INTO llm_prompts (campaign_id, client_id, prompt_text, target_brand, llm_model, is_tracking)
VALUES
  (2, 2, 'Who are the top litigation lawyers in Sydney?', 'BlueSky Legal', 'chatgpt', 1),
  (2, 2, 'Best commercial law firms in Sydney NSW', 'BlueSky Legal', 'perplexity', 1);

-- ─────────────────────────────────────────────
-- Add activity log entries for demo
-- ─────────────────────────────────────────────

INSERT OR IGNORE INTO activity_log (client_id, activity_type, description, created_at)
VALUES
  (1, 'plan_created', 'Campaign plan created – AI Authority Growth tier (12 months, 145 tasks generated)', '2025-01-01 09:00:00'),
  (2, 'plan_created', 'Campaign plan created – AI Authority Accelerator tier (12 months, 180 tasks generated)', '2024-10-01 09:00:00'),
  (4, 'plan_created', 'Campaign plan created – AI Authority Foundation tier (12 months, 108 tasks generated)', '2025-02-01 09:00:00'),
  (1, 'rank_tracking', 'Rank tracking completed – 12 keywords updated', '2025-01-15 14:30:00'),
  (2, 'rank_tracking', 'Rank tracking completed – 8 keywords updated', '2025-03-01 11:00:00');
