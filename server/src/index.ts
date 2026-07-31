import { SyncHub } from './sync_hub';

export interface Env {
  DB: D1Database;
  SYNC_HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  JWT_SECRET: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_EXPIRY_HOURS: string;
}

export { SyncHub };

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    ...init,
  });

const err = (msg: string, status = 400) =>
  json({ error: msg }, { status });

// ---- JWT helpers (Web Crypto) ----
async function importSecret(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importSecret(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(${header}.));
  return ${header}..;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const key = await importSecret(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key, b64urlDecode(parts[2]), new TextEncoder().join
      ? new TextEncoder().encode(${parts[0]}.)
      : new TextEncoder().encode(${parts[0]}.)
  );
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch { return null; }
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  };
}

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
  return payload?.sub as string || null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Serve frontend static files
    if (!path.startsWith('/api/')) {
      try {
        let asset = await env.ASSETS.fetch(request);
        if (asset.status === 404) {
          // SPA fallback: serve index.html for non-asset routes
          asset = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), request));
        }
        if (asset && asset.ok) return asset;
      } catch (e) {
        console.error('Asset error:', e);
      }
    }

    try {
      // ---- Auth endpoints ----
      if (path === '/api/auth/github/url' && request.method === 'GET') {
        return handleGithubAuthUrl(url, env);
      }
      if (path === '/api/auth/github/callback' && request.method === 'POST') {
        return handleGithubCallback(request, env);
      }

      // ---- Protected endpoints ----
      const userId = await getUserId(request, env);
      if (!userId) return err('Unauthorized', 401);

      // Ingest
      if (path === '/api/ingest' && request.method === 'POST') {
        return handleIngest(request, env, userId);
      }
      // Stats
      if (path === '/api/stats' && request.method === 'GET') {
        return handleStats(request, env, userId);
      }
      // SSE stream
      if (path === '/api/stats/stream' && request.method === 'GET') {
        return handleSSE(request, env, userId);
      }
      // Usage detail
      if (path === '/api/usage' && request.method === 'GET') {
        return handleUsage(request, env, userId);
      }
      // Vendors
      if (path === '/api/vendors' && request.method === 'GET') {
        return handleVendorsGet(env);
      }
      if (path === '/api/vendors' && request.method === 'POST') {
        return handleVendorsPost(request, env);
      }
      // Devices
      if (path === '/api/devices' && request.method === 'GET') {
        return handleDevices(env, userId);
      }
      // Device heartbeat
      if (path === '/api/devices/heartbeat' && request.method === 'POST') {
        return handleHeartbeat(request, env, userId);
      }
      // Export
      if (path === '/api/export' && request.method === 'GET') {
        return handleExport(request, env, userId);
      }
      // Budget
      if (path === '/api/budget' && request.method === 'GET') {
        return handleBudgetGet(env, userId);
      }
      if (path === '/api/budget' && request.method === 'POST') {
        return handleBudgetPost(request, env, userId);
      }
      // Time series
      if (path === '/api/timeseries' && request.method === 'GET') {
        return handleTimeseries(request, env, userId);
      }

      return err('Not found', 404);
    } catch (e: any) {
      console.error(e);
      return err(e.message || 'Internal error', 500);
    }
  },

  // Cron: cleanup old data
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
    await env.DB.prepare('DELETE FROM usage_logs WHERE created_at < ?').bind(thirtyDaysAgo).run();
    const dateStr = new Date(thirtyDaysAgo).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM daily_agg WHERE date < ?').bind(dateStr).run();
    // Refresh daily_agg
    await env.DB.prepare(INSERT OR REPLACE INTO daily_agg (date, vendor_id, model, total_tokens, cost_usd, call_count)
      SELECT date(created_at / 1000, 'unixepoch') as d, vendor_id, model,
        SUM(total_tokens), SUM(cost_usd), COUNT(*)
      FROM usage_logs WHERE created_at >= ?
      GROUP BY d, vendor_id, model).bind(thirtyDaysAgo).run();
  },
};

// ---- Handlers ----

function handleGithubAuthUrl(url: URL, env: Env): Response {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: ${url.origin}/api/auth/github/callback,
    scope: 'read:user',
    state,
  });
  return json({
    url: https://github.com/login/oauth/authorize?,
    state,
  });
}

async function handleGithubCallback(request: Request, env: Env): Promise<Response> {
  const { code, redirect_uri } = await request.json() as any;
  if (!code) return err('Missing code');

  // Exchange code for access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri,
    }),
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) return err('Token exchange failed', 401);

  // Get user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      authorization: Bearer ,
      accept: 'application/json',
      'user-agent': 'token-usage-tracker',
    },
  });
  const ghUser = await userRes.json() as any;
  if (!ghUser.id) return err('Failed to get user info', 401);

  const userId = String(ghUser.id);
  const now = Date.now();
  const expiryHours = parseInt(env.JWT_EXPIRY_HOURS || '24');

  // Upsert user
  await env.DB.prepare(INSERT INTO users (user_id, login, avatar_url, email, gh_token_enc, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url,
      email=excluded.email, updated_at=excluded.updated_at)
    .bind(userId, ghUser.login, ghUser.avatar_url || null, ghUser.email || null, null, now, now).run();

  // Sign JWT
  const token = await signJWT({
    sub: userId,
    login: ghUser.login,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + expiryHours * 3600,
  }, env.JWT_SECRET);

  return json({
    token,
    user: { id: userId, login: ghUser.login, avatar_url: ghUser.avatar_url, email: ghUser.email },
  });
}

async function handleIngest(request: Request, env: Env, userId: string): Promise<Response> {
  const { device_id, device_name, records } = await request.json() as any;
  if (!Array.isArray(records) || records.length === 0) return err('Invalid records');

  let inserted = 0;
  let duplicates = 0;

  const stmt = env.DB.prepare(INSERT OR IGNORE INTO usage_logs
    (uuid, device_id, vendor_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?));

  const batch: D1PreparedStatement[] = [];
  for (const r of records) {
    batch.push(stmt.bind(
      r.uuid || crypto.randomUUID(),
      device_id || 'unknown',
      r.vendor_id,
      r.model,
      r.prompt_tokens || 0,
      r.completion_tokens || 0,
      r.total_tokens || ((r.prompt_tokens || 0) + (r.completion_tokens || 0)),
      r.cost_usd || 0,
      r.created_at || Date.now()
    ));
  }

  const results = await env.DB.batch(batch as any);
  for (const r of results as any[]) {
    if (r.changes === 1) inserted++;
    else duplicates++;
  }

  // Register device
  if (device_id && device_name) {
    await env.DB.prepare(INSERT INTO devices (device_id, device_name, user_id, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET device_name=excluded.device_name, last_seen_at=excluded.last_seen_at)
      .bind(device_id, device_name, userId, Date.now(), Date.now()).run();
  }

  // Notify SSE hub
  const id = env.SYNC_HUB.idFromName(userId);
  const stub = env.SYNC_HUB.get(id);
  await stub.fetch('http://internal/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type: 'ingest', inserted, duplicates, device_id }),
  } as any);

  return json({ ok: true, inserted, duplicates, server_time: Date.now() });
}

async function handleStats(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'today';
  
  let since: number;
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  
  switch (period) {
    case 'month':
      since = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1).getTime();
      break;
    case 'last30days':
      since = now - 30 * 86400000;
      break;
    case 'today':
    default:
      since = startOfDay.getTime();
  }

  const logs = await env.DB.prepare(SELECT vendor_id, model, total_tokens, cost_usd, prompt_tokens, completion_tokens
    FROM usage_logs WHERE created_at >= ?).bind(since).all();

  let totalTokens = 0, totalCost = 0, callCount = 0;
  const vendors: Record<string, any> = {};
  const models: Record<string, any> = {};

  for (const row of (logs.results || []) as any[]) {
    totalTokens += row.total_tokens;
    totalCost += row.cost_usd;
    callCount++;
    
    if (!vendors[row.vendor_id]) vendors[row.vendor_id] = { totalTokens: 0, costUsd: 0, callCount: 0 };
    vendors[row.vendor_id].totalTokens += row.total_tokens;
    vendors[row.vendor_id].costUsd += row.cost_usd;
    vendors[row.vendor_id].callCount++;

    if (!models[row.model]) models[row.model] = { totalTokens: 0, costUsd: 0, callCount: 0 };
    models[row.model].totalTokens += row.total_tokens;
    models[row.model].costUsd += row.cost_usd;
    models[row.model].callCount++;
  }

  // Get devices
  const devicesRes = await env.DB.prepare(SELECT device_id, device_name, last_seen_at FROM devices
    WHERE user_id = ? ORDER BY last_seen_at DESC).bind(userId).all();
  const devices = (devicesRes.results || []).map((d: any) => ({
    device_id: d.device_id,
    device_name: d.device_name,
    last_seen_at: d.last_seen_at,
    stale: Date.now() - d.last_seen_at > 10 * 60 * 1000,
  }));

  // Daily trend for last30days
  let daily: any[] = [];
  if (period === 'last30days') {
    const dailyRes = await env.DB.prepare(SELECT date(created_at/1000, 'unixepoch') as date,
      SUM(total_tokens) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls
      FROM usage_logs WHERE created_at >= ?
      GROUP BY date ORDER BY date).bind(since).all();
    daily = (dailyRes.results || []).map((r: any) => ({
      date: r.date, totalTokens: r.tokens, costUsd: r.cost, callCount: r.calls,
    }));
  }

  return json({
    updatedAt: new Date().toISOString(),
    period,
    totalTokens,
    costUsd: totalCost,
    callCount,
    vendors,
    models,
    devices,
    daily,
  });
}

async function handleSSE(request: Request, env: Env, userId: string): Promise<Response> {
  const id = env.SYNC_HUB.idFromName(userId);
  const stub = env.SYNC_HUB.get(id);
  return stub.fetch('http://internal/connect', request as any);
}

async function handleUsage(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const since = url.searchParams.get('since');
  const vendor = url.searchParams.get('vendor');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);

  let sql = 'SELECT * FROM usage_logs WHERE 1=1';
  const params: any[] = [];
  if (since) { sql += ' AND created_at > ?'; params.push(parseInt(since)); }
  if (vendor) { sql += ' AND vendor_id = ?'; params.push(vendor); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const res = await env.DB.prepare(sql).bind(...params).all();
  return json({ records: res.results || [], server_time: Date.now() });
}

async function handleVendorsGet(env: Env): Promise<Response> {
  const res = await env.DB.prepare('SELECT vendor_id, display_name, api_base_url, pricing_json, icon_url FROM vendors').all();
  const vendors = (res.results || []).map((v: any) => ({
    vendor_id: v.vendor_id,
    display_name: v.display_name,
    api_base_url: v.api_base_url,
    pricing: v.pricing_json ? JSON.parse(v.pricing_json) : {},
    icon_url: v.icon_url,
  }));
  return json({ vendors });
}

async function handleVendorsPost(request: Request, env: Env): Promise<Response> {
  const { vendor_id, display_name, api_base_url, pricing_json } = await request.json() as any;
  if (!vendor_id || !display_name) return err('Missing fields');
  
  await env.DB.prepare(INSERT INTO vendors (vendor_id, display_name, api_base_url, pricing_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(vendor_id) DO UPDATE SET display_name=excluded.display_name,
      api_base_url=excluded.api_base_url, pricing_json=excluded.pricing_json)
    .bind(vendor_id, display_name, api_base_url || null, pricing_json ? JSON.stringify(pricing_json) : null, Date.now()).run();
  
  return json({ ok: true });
}

async function handleDevices(env: Env, userId: string): Promise<Response> {
  const res = await env.DB.prepare(SELECT device_id, device_name, last_seen_at, created_at
    FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC).bind(userId).all();
  const devices = (res.results || []).map((d: any) => ({
    device_id: d.device_id,
    device_name: d.device_name,
    last_seen_at: d.last_seen_at,
    created_at: d.created_at,
    stale: Date.now() - d.last_seen_at > 10 * 60 * 1000,
  }));
  return json({ devices });
}

async function handleHeartbeat(request: Request, env: Env, userId: string): Promise<Response> {
  const { device_id, device_name } = await request.json() as any;
  if (!device_id || !device_name) return err('Missing fields');
  
  await env.DB.prepare(INSERT INTO devices (device_id, device_name, user_id, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET device_name=excluded.device_name, last_seen_at=excluded.last_seen_at)
    .bind(device_id, device_name, userId, Date.now(), Date.now()).run();
  
  return json({ ok: true });
}

async function handleExport(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'json';
  const since = parseInt(url.searchParams.get('since') || '0');

  const res = await env.DB.prepare(
    'SELECT * FROM usage_logs WHERE created_at > ? ORDER BY created_at DESC LIMIT 5000'
  ).bind(since).all();
  const records = res.results || [];

  if (format === 'csv') {
    const header = 'uuid,device_id,vendor_id,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,created_at\n';
    const rows = records.map((r: any) =>
      ${r.uuid},,,,,,,,
    ).join('\n');
    return new Response(header + rows, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="usage_export.csv"',
      },
    });
  }

  return json({ records, exported_at: Date.now() });
}

async function handleBudgetGet(env: Env, userId: string): Promise<Response> {
  const res = await env.DB.prepare(SELECT value FROM sync_state WHERE key = ?)
    .bind(udget_).first();
  if (!res) return json({ budget: null, spent: 0 });
  
  const budget = JSON.parse(res.value as string);
  // Calculate current month spending
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const spent = await env.DB.prepare(
    'SELECT SUM(cost_usd) as s FROM usage_logs WHERE created_at >= ?'
  ).bind(monthStart.getTime()).first();
  
  return json({ budget, spent: (spent?.s as number) || 0 });
}

async function handleBudgetPost(request: Request, env: Env, userId: string): Promise<Response> {
  const { amount, currency } = await request.json() as any;
  await env.DB.prepare(INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at)
    .bind(udget_, JSON.stringify({ amount, currency: currency || 'USD' }), Date.now()).run();
  return json({ ok: true });
}

async function handleTimeseries(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
  const since = Date.now() - days * 86400000;

  const res = await env.DB.prepare(SELECT date(created_at/1000, 'unixepoch') as date,
    vendor_id, SUM(total_tokens) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls
    FROM usage_logs WHERE created_at >= ?
    GROUP BY date, vendor_id ORDER BY date).bind(since).all();
  
  return json({ series: res.results || [] });
}
