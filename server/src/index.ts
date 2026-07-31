// @ts-nocheck
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

const json = (data, init) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json; charset=utf-8' },
  ...init
});

const err = (msg, status = 400) => json({ error: msg }, { status });

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importSecret(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signJWT(payload, secret) {
  const h = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const b = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importSecret(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(h + '.' + b));
  return h + '.' + b + '.' + b64url(new Uint8Array(sig));
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const key = await importSecret(secret);
  const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) return null;
  try { return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))); } catch { return null; }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  };
}

async function getUserId(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
  return payload?.sub || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    if (!path.startsWith('/api/')) {
      try {
        let asset = await env.ASSETS.fetch(request);
        if (asset.status === 404) {
          asset = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString(), request));
        }
        if (asset && asset.ok) return asset;
      } catch (e) { console.error('Asset error:', e); }

      // Seed demo data
      if (path === '/api/seed' && request.method === 'POST') {
        const devices = ['device-win-001', 'device-mac-002', 'device-phone-003'];
        const vendors = [
          { id: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini'], pricing: { 'gpt-4o': { input: 2.5, output: 10 }, 'gpt-4o-mini': { input: 0.15, output: 0.6 }, 'o1-preview': { input: 15, output: 60 }, 'o3-mini': { input: 1.1, output: 4.4 } } },
          { id: 'anthropic', models: ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-opus'], pricing: { 'claude-3-5-sonnet': { input: 3, output: 15 }, 'claude-3-haiku': { input: 0.25, output: 1.25 }, 'claude-3-opus': { input: 15, output: 75 } } },
          { id: 'deepseek', models: ['deepseek-chat', 'deepseek-reasoner'], pricing: { 'deepseek-chat': { input: 0.27, output: 1.1 }, 'deepseek-reasoner': { input: 0.55, output: 2.19 } } },
          { id: 'glm', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'], pricing: { 'glm-4-plus': { input: 5, output: 5 }, 'glm-4-air': { input: 1, output: 1 }, 'glm-4-flash': { input: 0, output: 0 } } },
          { id: 'qwen', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], pricing: { 'qwen-max': { input: 2.4, output: 9.6 }, 'qwen-plus': { input: 0.8, output: 2 }, 'qwen-turbo': { input: 0.3, output: 0.6 } } },
          { id: 'gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'], pricing: { 'gemini-1.5-pro': { input: 3.5, output: 10.5 }, 'gemini-1.5-flash': { input: 0.35, output: 1.05 }, 'gemini-2.0-flash': { input: 0.1, output: 0.4 } } },
        ];
        const now = Date.now();
        const batch = [];
        for (let day = 30; day >= 0; day--) {
          const baseDate = now - day * 86400000;
          const count = 5 + Math.floor(Math.random() * 20);
          for (let i = 0; i < count; i++) {
            const vIdx = Math.floor(Math.random() * vendors.length);
            const v = vendors[vIdx];
            const mIdx = Math.floor(Math.random() * v.models.length);
            const model = v.models[mIdx];
            const pricing = v.pricing[model];
            const hour = Math.floor(Math.random() * 24);
            const minute = Math.floor(Math.random() * 60);
            const createdAt = baseDate + (hour * 3600 + minute * 60) * 1000;
            const prompt = 200 + Math.floor(Math.random() * 5000);
            const completion = 100 + Math.floor(Math.random() * 2000);
            const total = prompt + completion;
            const cost = (prompt * pricing.input + completion * pricing.output) / 1000000;
            const uuid = 'seed-' + baseDate + '-' + i + '-' + v.id;
            const deviceId = devices[Math.floor(Math.random() * devices.length)];
            batch.push(env.DB.prepare('INSERT OR IGNORE INTO usage_logs (uuid, device_id, vendor_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(uuid, deviceId, v.id, model, prompt, completion, total, cost, createdAt));
          }
        }
        await env.DB.batch(batch);
        return json({ ok: true, seeded: batch.length });
      }

      return err('Not found', 404);
    }

    try {
      if (path === '/api/auth/github/url' && request.method === 'GET') {
        const state = crypto.randomUUID();
        const params = new URLSearchParams({
          client_id: env.GITHUB_CLIENT_ID,
          redirect_uri: url.origin + '/api/auth/github/callback',
          scope: 'read:user',
          state,
        });
        return json({ url: 'https://github.com/login/oauth/authorize?' + params, state });
      }

      if (path === '/api/auth/github/callback' && request.method === 'GET') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (code && state) {
          return Response.redirect(url.origin + '/login?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state), 302);
        }
        return err('Missing code or state', 400);
      }

      if (path === '/api/auth/github/callback' && request.method === 'POST') {
        const { code, redirect_uri } = await request.json();
        if (!code) return err('Missing code');
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return err('Token exchange failed', 401);
        const userRes = await fetch('https://api.github.com/user', {
          headers: { authorization: 'Bearer ' + tokenData.access_token, accept: 'application/json', 'user-agent': 'token-usage-tracker' },
        });
        const ghUser = await userRes.json();
        if (!ghUser.id) return err('Failed to get user info', 401);
        const userId = String(ghUser.id);
        const now = Date.now();
        const expiryHours = parseInt(env.JWT_EXPIRY_HOURS || '24');
        await env.DB.prepare('INSERT INTO users (user_id, login, avatar_url, email, gh_token_enc, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url, email=excluded.email, updated_at=excluded.updated_at')
          .bind(userId, ghUser.login, ghUser.avatar_url || null, ghUser.email || null, null, now, now).run();
        const token = await signJWT({ sub: userId, login: ghUser.login, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + expiryHours * 3600 }, env.JWT_SECRET);
        return json({ token, user: { id: userId, login: ghUser.login, avatar_url: ghUser.avatar_url, email: ghUser.email } });
      }

      const userId = await getUserId(request, env);
      if (!userId) return err('Unauthorized', 401);

      if (path === '/api/ingest' && request.method === 'POST') {
        const { device_id, device_name, records } = await request.json();
        if (!Array.isArray(records) || records.length === 0) return err('Invalid records');
        let inserted = 0, duplicates = 0;
        const stmt = env.DB.prepare('INSERT OR IGNORE INTO usage_logs (uuid, device_id, vendor_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const batch = [];
        for (const r of records) {
          batch.push(stmt.bind(r.uuid || crypto.randomUUID(), device_id || 'unknown', r.vendor_id, r.model, r.prompt_tokens || 0, r.completion_tokens || 0, r.total_tokens || ((r.prompt_tokens || 0) + (r.completion_tokens || 0)), r.cost_usd || 0, r.created_at || Date.now()));
        }
        const results = await env.DB.batch(batch);
        for (const r of results) { if (r.changes === 1) inserted++; else duplicates++; }
        if (device_id && device_name) {
          await env.DB.prepare('INSERT INTO devices (device_id, device_name, user_id, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET device_name=excluded.device_name, last_seen_at=excluded.last_seen_at')
            .bind(device_id, device_name, userId, Date.now(), Date.now()).run();
        }
        const id = env.SYNC_HUB.idFromName(userId);
        const stub = env.SYNC_HUB.get(id);
        try { await stub.fetch('http://internal/broadcast', { method: 'POST', body: JSON.stringify({ type: 'ingest', inserted, duplicates, device_id }) }); } catch {}
        return json({ ok: true, inserted, duplicates, server_time: Date.now() });
      }

      if (path === '/api/stats' && request.method === 'GET') {
        const period = url.searchParams.get('period') || 'today';
        const now = Date.now();
        const sod = new Date(); sod.setHours(0, 0, 0, 0);
        let since;
        if (period === 'month') since = new Date(sod.getFullYear(), sod.getMonth(), 1).getTime();
        else if (period === 'last30days') since = now - 30 * 86400000;
        else since = sod.getTime();
        const logs = await env.DB.prepare('SELECT vendor_id, model, total_tokens, cost_usd FROM usage_logs WHERE created_at >= ?').bind(since).all();
        let totalTokens = 0, totalCost = 0, callCount = 0;
        const vendors = {};
        const models = {};
        for (const row of (logs.results || [])) {
          totalTokens += row.total_tokens; totalCost += row.cost_usd; callCount++;
          if (!vendors[row.vendor_id]) vendors[row.vendor_id] = { totalTokens: 0, costUsd: 0, callCount: 0 };
          vendors[row.vendor_id].totalTokens += row.total_tokens;
          vendors[row.vendor_id].costUsd += row.cost_usd;
          vendors[row.vendor_id].callCount++;
          if (!models[row.model]) models[row.model] = { totalTokens: 0, costUsd: 0, callCount: 0 };
          models[row.model].totalTokens += row.total_tokens;
          models[row.model].costUsd += row.cost_usd;
          models[row.model].callCount++;
        }
        const devRes = await env.DB.prepare('SELECT device_id, device_name, last_seen_at FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC').bind(userId).all();
        const devices = (devRes.results || []).map(d => ({ device_id: d.device_id, device_name: d.device_name, last_seen_at: d.last_seen_at, stale: Date.now() - d.last_seen_at > 600000 }));
        let daily = [];
        if (period === 'last30days') {
          const dr = await env.DB.prepare("SELECT date(created_at/1000, 'unixepoch') as date, SUM(total_tokens) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls FROM usage_logs WHERE created_at >= ? GROUP BY date ORDER BY date").bind(since).all();
          daily = (dr.results || []).map(r => ({ date: r.date, totalTokens: r.tokens, costUsd: r.cost, callCount: r.calls }));
        }
        return json({ updatedAt: new Date().toISOString(), period, totalTokens, costUsd: totalCost, callCount, vendors, models, devices, daily });
      }

      if (path === '/api/stats/stream' && request.method === 'GET') {
        const id = env.SYNC_HUB.idFromName(userId);
        const stub = env.SYNC_HUB.get(id);
        return stub.fetch('http://internal/connect', request);
      }

      if (path === '/api/usage' && request.method === 'GET') {
        const since = url.searchParams.get('since');
        const vendor = url.searchParams.get('vendor');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000);
        let sql = 'SELECT * FROM usage_logs WHERE 1=1';
        const params = [];
        if (since) { sql += ' AND created_at > ?'; params.push(parseInt(since)); }
        if (vendor) { sql += ' AND vendor_id = ?'; params.push(vendor); }
        sql += ' ORDER BY created_at DESC LIMIT ?'; params.push(limit);
        const res = await env.DB.prepare(sql).bind(...params).all();
        return json({ records: res.results || [], server_time: Date.now() });
      }

      if (path === '/api/vendors' && request.method === 'GET') {
        const res = await env.DB.prepare('SELECT vendor_id, display_name, api_base_url, pricing_json, icon_url FROM vendors').all();
        const vendors = (res.results || []).map(v => ({ vendor_id: v.vendor_id, display_name: v.display_name, api_base_url: v.api_base_url, pricing: v.pricing_json ? JSON.parse(v.pricing_json) : {}, icon_url: v.icon_url }));
        return json({ vendors });
      }

      if (path === '/api/vendors' && request.method === 'POST') {
        const { vendor_id, display_name, api_base_url, pricing_json } = await request.json();
        if (!vendor_id || !display_name) return err('Missing fields');
        await env.DB.prepare('INSERT INTO vendors (vendor_id, display_name, api_base_url, pricing_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(vendor_id) DO UPDATE SET display_name=excluded.display_name, api_base_url=excluded.api_base_url, pricing_json=excluded.pricing_json')
          .bind(vendor_id, display_name, api_base_url || null, pricing_json ? JSON.stringify(pricing_json) : null, Date.now()).run();
        return json({ ok: true });
      }

      if (path === '/api/devices' && request.method === 'GET') {
        const res = await env.DB.prepare('SELECT device_id, device_name, last_seen_at, created_at FROM devices WHERE user_id = ? ORDER BY last_seen_at DESC').bind(userId).all();
        const devices = (res.results || []).map(d => ({ device_id: d.device_id, device_name: d.device_name, last_seen_at: d.last_seen_at, created_at: d.created_at, stale: Date.now() - d.last_seen_at > 600000 }));
        return json({ devices });
      }

      if (path === '/api/devices/heartbeat' && request.method === 'POST') {
        const { device_id, device_name } = await request.json();
        if (!device_id || !device_name) return err('Missing fields');
        await env.DB.prepare('INSERT INTO devices (device_id, device_name, user_id, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET device_name=excluded.device_name, last_seen_at=excluded.last_seen_at')
          .bind(device_id, device_name, userId, Date.now(), Date.now()).run();
        return json({ ok: true });
      }

      if (path === '/api/export' && request.method === 'GET') {
        const format = url.searchParams.get('format') || 'json';
        const since = parseInt(url.searchParams.get('since') || '0');
        const res = await env.DB.prepare('SELECT * FROM usage_logs WHERE created_at > ? ORDER BY created_at DESC LIMIT 5000').bind(since).all();
        const records = res.results || [];
        if (format === 'csv') {
          const header = 'uuid,device_id,vendor_id,model,prompt_tokens,completion_tokens,total_tokens,cost_usd,created_at\n';
          const rows = records.map(r => r.uuid + ',' + r.device_id + ',' + r.vendor_id + ',' + r.model + ',' + r.prompt_tokens + ',' + r.completion_tokens + ',' + r.total_tokens + ',' + r.cost_usd + ',' + r.created_at).join('\n');
          return new Response(header + rows, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="usage_export.csv"' } });
        }
        return json({ records, exported_at: Date.now() });
      }

      if (path === '/api/budget' && request.method === 'GET') {
        const res = await env.DB.prepare('SELECT value FROM sync_state WHERE key = ?').bind('budget_' + userId).first();
        if (!res) return json({ budget: null, spent: 0 });
        const budget = JSON.parse(res.value);
        const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
        const spent = await env.DB.prepare('SELECT SUM(cost_usd) as s FROM usage_logs WHERE created_at >= ?').bind(ms.getTime()).first();
        return json({ budget, spent: spent?.s || 0 });
      }

      if (path === '/api/budget' && request.method === 'POST') {
        const { amount, currency } = await request.json();
        await env.DB.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
          .bind('budget_' + userId, JSON.stringify({ amount, currency: currency || 'USD' }), Date.now()).run();
        return json({ ok: true });
      }

      if (path === '/api/timeseries' && request.method === 'GET') {
        const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);
        const since = Date.now() - days * 86400000;
        const res = await env.DB.prepare("SELECT date(created_at/1000, 'unixepoch') as date, vendor_id, SUM(total_tokens) as tokens, SUM(cost_usd) as cost, COUNT(*) as calls FROM usage_logs WHERE created_at >= ? GROUP BY date, vendor_id ORDER BY date").bind(since).all();
        return json({ series: res.results || [] });
      }

      return err('Not found', 404);
    } catch (e) {
      console.error(e);
      return err(e.message || 'Internal error', 500);
    }
  },

  async scheduled(event, env) {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
    await env.DB.prepare('DELETE FROM usage_logs WHERE created_at < ?').bind(thirtyDaysAgo).run();
    const dateStr = new Date(thirtyDaysAgo).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM daily_agg WHERE date < ?').bind(dateStr).run();
    await env.DB.prepare("INSERT OR REPLACE INTO daily_agg (date, vendor_id, model, total_tokens, cost_usd, call_count) SELECT date(created_at / 1000, 'unixepoch') as d, vendor_id, model, SUM(total_tokens), SUM(cost_usd), COUNT(*) FROM usage_logs WHERE created_at >= ? GROUP BY d, vendor_id, model").bind(thirtyDaysAgo).run();
  },
};
