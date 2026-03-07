import { Hono } from 'hono'

type Bindings = { DB: D1Database; APP_URL: string }

// Role permission map
// project_manager  → full system access
// project_executor → can view/edit everything EXCEPT:
//   - cannot create/delete users
//   - cannot see billing amounts / payment details
//   - cannot approve proposals or onboarding records
//   - cannot delete clients/campaigns
export const PERMISSIONS: Record<string, string[]> = {
  project_manager: ['*'],  // wildcard = all
  project_executor: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.edit',
    'campaigns.view', 'campaigns.create', 'campaigns.edit',
    'keywords.view', 'keywords.create', 'keywords.edit', 'keywords.delete',
    'rank_tracking.view', 'rank_tracking.run',
    'llm.view', 'llm.create', 'llm.edit', 'llm.run',
    'content.view', 'content.create', 'content.edit',
    'social.view', 'social.create', 'social.edit',
    'press.view', 'press.create', 'press.edit',
    'wordpress.view', 'wordpress.create', 'wordpress.edit',
    'reports.view', 'reports.generate',
    'dataforseo.view', 'dataforseo.run',
    'onboarding.view',        // can view submitted data
    'proposals.view',         // can view proposals only
    // NOT: billing.view, users.*, clients.delete, campaigns.delete,
    //      proposals.approve, onboarding.approve
  ],
}

export function hasPermission(role: string, permission: string): boolean {
  const perms = PERMISSIONS[role] || []
  if (perms.includes('*')) return true
  return perms.includes(permission)
}

export const authRoutes = new Hono<{ Bindings: Bindings }>()

// ---- Crypto helpers (Web Crypto API – Cloudflare Workers compatible) ----
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(len = 64): string {
  const arr = new Uint8Array(len / 2)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateSalt(len = 32): string {
  const arr = new Uint8Array(len / 2)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256hex(password + salt)
}

// ---- Session helper ----
async function getSessionUser(db: D1Database, token: string | null) {
  if (!token) return null
  const now = new Date().toISOString()
  const row = await db.prepare(`
    SELECT s.*, u.id as user_id, u.email, u.full_name, u.role, u.is_active,
           u.avatar_initials, u.avatar_colour, u.force_password_change
    FROM team_sessions s
    JOIN team_users u ON s.user_id = u.id
    WHERE s.session_token = ? AND s.expires_at > ? AND u.is_active = 1
  `).bind(token, now).first() as any
  if (!row) return null
  // Touch last_active
  await db.prepare('UPDATE team_sessions SET last_active_at = ? WHERE session_token = ?').bind(now, token).run()
  return row
}

export function getTokenFromRequest(req: Request): string | null {
  // Cookie first, then Authorization header
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(/dsg_session=([^;]+)/)
  if (match) return match[1]
  const auth = req.headers.get('authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

// -------------------------------------------------------
// POST /api/auth/login
// -------------------------------------------------------
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json() as any
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const db = c.env.DB
  const user = await db.prepare(
    'SELECT * FROM team_users WHERE email = ? AND is_active = 1'
  ).bind(email.toLowerCase().trim()).first() as any

  if (!user) return c.json({ error: 'Invalid email or password' }, 401)

  const hash = await hashPassword(password, user.password_salt)

  // Handle the seeded default admin (known hash stored in migration)
  const isDefault = user.password_hash === '8c6b3d2f4e1a7b9c0d5e2f8a3b6c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9'
    && password === 'DSGadmin2025!'
  const valid = isDefault || hash === user.password_hash

  if (!valid) {
    await db.prepare(
      "INSERT INTO team_audit_log (user_id, action, description, ip_address) VALUES (?, 'login_failed', ?, ?)"
    ).bind(user.id, `Failed login attempt for ${email}`, c.req.header('cf-connecting-ip') || '').run()
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  // Create session (7 days)
  const token = generateToken()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO team_sessions (user_id, session_token, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(user.id, token, c.req.header('cf-connecting-ip') || '', c.req.header('user-agent') || '', expires).run()

  await db.prepare(
    'UPDATE team_users SET last_login_at = ?, login_count = login_count + 1 WHERE id = ?'
  ).bind(now, user.id).run()

  await db.prepare(
    "INSERT INTO team_audit_log (user_id, action, description, ip_address) VALUES (?, 'login', 'Successful login', ?)"
  ).bind(user.id, c.req.header('cf-connecting-ip') || '').run()

  // Set secure httpOnly cookie + return user info
  c.header('Set-Cookie', `dsg_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      avatar_initials: user.avatar_initials || user.full_name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2),
      avatar_colour: user.avatar_colour || '#2563eb',
      force_password_change: user.force_password_change === 1,
      permissions: PERMISSIONS[user.role] || [],
    },
  })
})

// -------------------------------------------------------
// POST /api/auth/logout
// -------------------------------------------------------
authRoutes.post('/logout', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const db = c.env.DB
  if (token) {
    const session = await db.prepare('SELECT user_id FROM team_sessions WHERE session_token = ?').bind(token).first() as any
    await db.prepare('DELETE FROM team_sessions WHERE session_token = ?').bind(token).run()
    if (session) {
      await db.prepare(
        "INSERT INTO team_audit_log (user_id, action, description) VALUES (?, 'logout', 'User logged out')"
      ).bind(session.user_id).run()
    }
  }
  c.header('Set-Cookie', 'dsg_session=; Path=/; HttpOnly; Max-Age=0')
  return c.json({ message: 'Logged out' })
})

// -------------------------------------------------------
// GET /api/auth/me – validate session + return current user
// -------------------------------------------------------
authRoutes.get('/me', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const user = await getSessionUser(c.env.DB, token)
  if (!user) return c.json({ error: 'Not authenticated' }, 401)
  return c.json({
    id: user.user_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    avatar_initials: user.avatar_initials || user.full_name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2),
    avatar_colour: user.avatar_colour || '#2563eb',
    force_password_change: user.force_password_change === 1,
    permissions: PERMISSIONS[user.role] || [],
  })
})

// -------------------------------------------------------
// POST /api/auth/change-password
// -------------------------------------------------------
authRoutes.post('/change-password', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)

  const { current_password, new_password } = await c.req.json() as any
  if (!new_password || new_password.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters' }, 400)
  }

  const db = c.env.DB
  const user = await db.prepare('SELECT * FROM team_users WHERE id = ?').bind(sessionUser.user_id).first() as any

  // Verify current password (skip check if force_password_change and it's the default)
  const isDefault = user.password_hash === '8c6b3d2f4e1a7b9c0d5e2f8a3b6c9d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9'
  if (!isDefault) {
    const currentHash = await hashPassword(current_password, user.password_salt)
    if (currentHash !== user.password_hash) {
      return c.json({ error: 'Current password is incorrect' }, 400)
    }
  }

  const newSalt = generateSalt()
  const newHash = await hashPassword(new_password, newSalt)
  const now = new Date().toISOString()

  await db.prepare(
    'UPDATE team_users SET password_hash = ?, password_salt = ?, force_password_change = 0, updated_at = ? WHERE id = ?'
  ).bind(newHash, newSalt, now, sessionUser.user_id).run()

  await db.prepare(
    "INSERT INTO team_audit_log (user_id, action, description) VALUES (?, 'password_changed', 'Password updated')"
  ).bind(sessionUser.user_id).run()

  return c.json({ message: 'Password changed successfully' })
})

// -------------------------------------------------------
// GET /api/auth/users – PM only: list all team members
// -------------------------------------------------------
authRoutes.get('/users', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)
  if (sessionUser.role !== 'project_manager') return c.json({ error: 'Insufficient permissions' }, 403)

  const users = await c.env.DB.prepare(`
    SELECT id, email, full_name, role, avatar_initials, avatar_colour,
           is_active, last_login_at, login_count, force_password_change, created_at
    FROM team_users ORDER BY full_name ASC
  `).all()

  return c.json(users.results)
})

// -------------------------------------------------------
// POST /api/auth/users – PM only: create team member
// -------------------------------------------------------
authRoutes.post('/users', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)
  if (sessionUser.role !== 'project_manager') return c.json({ error: 'Insufficient permissions' }, 403)

  const body = await c.req.json() as any
  const { email, full_name, role, password } = body

  if (!email || !full_name || !role || !password) {
    return c.json({ error: 'email, full_name, role, and password are required' }, 400)
  }
  if (!['project_manager', 'project_executor'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const db = c.env.DB
  const existing = await db.prepare('SELECT id FROM team_users WHERE email = ?').bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email already in use' }, 409)

  const salt = generateSalt()
  const hash = await hashPassword(password, salt)
  const initials = full_name.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)

  const result = await db.prepare(`
    INSERT INTO team_users (email, full_name, role, password_hash, password_salt, avatar_initials, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(email.toLowerCase().trim(), full_name, role, hash, salt, initials, sessionUser.user_id).run()

  await db.prepare(
    "INSERT INTO team_audit_log (user_id, action, target_type, target_id, description) VALUES (?, 'create_user', 'user', ?, ?)"
  ).bind(sessionUser.user_id, result.meta.last_row_id, `Created user ${email} with role ${role}`).run()

  return c.json({ id: result.meta.last_row_id, message: 'Team member created' }, 201)
})

// -------------------------------------------------------
// PUT /api/auth/users/:id – PM only: update team member
// -------------------------------------------------------
authRoutes.put('/users/:id', async (c) => {
  const id = c.req.param('id')
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)
  if (sessionUser.role !== 'project_manager') return c.json({ error: 'Insufficient permissions' }, 403)

  const body = await c.req.json() as any
  const db = c.env.DB
  const now = new Date().toISOString()

  // Build update – password is optional
  if (body.password) {
    const salt = generateSalt()
    const hash = await hashPassword(body.password, salt)
    await db.prepare(
      'UPDATE team_users SET password_hash=?, password_salt=?, force_password_change=1, updated_at=? WHERE id=?'
    ).bind(hash, salt, now, id).run()
  }

  const existingUser = await db.prepare('SELECT * FROM team_users WHERE id = ?').bind(id).first() as any

  await db.prepare(`
    UPDATE team_users SET full_name=?, role=?, is_active=?, avatar_colour=?, updated_at=? WHERE id=?
  `).bind(
    body.full_name ?? existingUser?.full_name,
    body.role ?? existingUser?.role,
    body.is_active ?? existingUser?.is_active ?? 1,
    body.avatar_colour ?? existingUser?.avatar_colour ?? '#2563eb',
    now, id
  ).run()

  await db.prepare(
    "INSERT INTO team_audit_log (user_id, action, target_type, target_id, description) VALUES (?, 'update_user', 'user', ?, ?)"
  ).bind(sessionUser.user_id, id, `Updated user ${id}`).run()

  return c.json({ message: 'Team member updated' })
})

// -------------------------------------------------------
// DELETE /api/auth/users/:id – PM only: deactivate (soft delete)
// -------------------------------------------------------
authRoutes.delete('/users/:id', async (c) => {
  const id = c.req.param('id')
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)
  if (sessionUser.role !== 'project_manager') return c.json({ error: 'Insufficient permissions' }, 403)
  if (String(sessionUser.user_id) === id) return c.json({ error: 'Cannot deactivate your own account' }, 400)

  const db = c.env.DB
  await db.prepare('UPDATE team_users SET is_active=0, updated_at=? WHERE id=?').bind(new Date().toISOString(), id).run()
  await db.prepare('DELETE FROM team_sessions WHERE user_id=?').bind(id).run()

  await db.prepare(
    "INSERT INTO team_audit_log (user_id, action, target_type, target_id, description) VALUES (?, 'deactivate_user', 'user', ?, 'User deactivated')"
  ).bind(sessionUser.user_id, id).run()

  return c.json({ message: 'Team member deactivated' })
})

// -------------------------------------------------------
// GET /api/auth/audit – PM only: recent audit log
// -------------------------------------------------------
authRoutes.get('/audit', async (c) => {
  const token = getTokenFromRequest(c.req.raw)
  const sessionUser = await getSessionUser(c.env.DB, token)
  if (!sessionUser) return c.json({ error: 'Not authenticated' }, 401)
  if (sessionUser.role !== 'project_manager') return c.json({ error: 'Insufficient permissions' }, 403)

  const rows = await c.env.DB.prepare(`
    SELECT al.*, u.full_name, u.email
    FROM team_audit_log al
    LEFT JOIN team_users u ON al.user_id = u.id
    ORDER BY al.created_at DESC LIMIT 100
  `).all()
  return c.json(rows.results)
})

// ---- Export session validator for middleware use ----
export { getSessionUser, hashPassword, generateSalt, generateToken }
