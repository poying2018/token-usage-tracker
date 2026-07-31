// API client and auth utilities

const API_BASE = '/api';

export interface User {
  id: string;
  login: string;
  avatar_url?: string;
  email?: string;
}

export interface UsageRecord {
  uuid: string;
  device_id: string;
  vendor_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  created_at: number;
}

export interface StatsData {
  updatedAt: string;
  period: string;
  totalTokens: number;
  costUsd: number;
  callCount: number;
  vendors: Record<string, { totalTokens: number; costUsd: number; callCount: number }>;
  models: Record<string, { totalTokens: number; costUsd: number; callCount: number }>;
  devices: Array<{ device_id: string; device_name: string; last_seen_at: number; stale: boolean }>;
  daily: Array<{ date: string; totalTokens: number; costUsd: number; callCount: number }>;
}

export interface Vendor {
  vendor_id: string;
  display_name: string;
  api_base_url: string;
  pricing: Record<string, { input: number; output: number }>;
  icon_url?: string;
}

// ---- Auth ----
export function getToken(): string | null {
  return localStorage.getItem('jwt_token');
}

export function setToken(token: string) {
  localStorage.setItem('jwt_token', token);
}

export function clearToken() {
  localStorage.removeItem('jwt_token');
}

export function getUser(): User | null {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user: User) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem('user');
}

// ---- API ----
async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    clearUser();
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'HTTP ' + res.status);
  }
  return res.json();
}

export const api = {
  getGithubAuthUrl: () => apiFetch('/auth/github/url'),
  githubCallback: (code: string, redirectUri: string) =>
    apiFetch('/auth/github/callback', { method: 'POST', body: JSON.stringify({ code, redirect_uri: redirectUri }) }),

  ingest: (deviceId: string, deviceName: string, records: any[]) =>
    apiFetch('/ingest', { method: 'POST', body: JSON.stringify({ device_id: deviceId, device_name: deviceName, records }) }),

  getStats: (period: string = 'today') => apiFetch('/stats?period=' + period),
  getUsage: (params: { since?: number; vendor?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.since) qs.set('since', String(params.since));
    if (params.vendor) qs.set('vendor', params.vendor);
    if (params.limit) qs.set('limit', String(params.limit));
    return apiFetch('/usage?' + qs.toString());
  },

  getVendors: () => apiFetch('/vendors'),
  updateVendor: (data: Partial<Vendor>) => apiFetch('/vendors', { method: 'POST', body: JSON.stringify(data) }),

  getDevices: () => apiFetch('/devices'),
  heartbeat: (deviceId: string, deviceName: string) =>
    apiFetch('/devices/heartbeat', { method: 'POST', body: JSON.stringify({ device_id: deviceId, device_name: deviceName }) }),

  exportUrl: (format: string = 'json', since: number = 0) =>
    API_BASE + '/export?format=' + format + '&since=' + since,

  getBudget: () => apiFetch('/budget'),
  setBudget: (amount: number, currency: string = 'USD') =>
    apiFetch('/budget', { method: 'POST', body: JSON.stringify({ amount, currency }) }),

  getTimeSeries: (days: number = 30) => apiFetch('/timeseries?days=' + days),
};

export function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('device_id', id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone')) os = 'iOS';

  return browser + ' on ' + os;
}

const DB_NAME = 'token_tracker_local';
const DB_VERSION = 1;

export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('usage_logs')) {
        const store = db.createObjectStore('usage_logs', { keyPath: 'uuid' });
        store.createIndex('created_at', 'created_at');
        store.createIndex('vendor_id', 'vendor_id');
        store.createIndex('synced', 'synced');
      }
      if (!db.objectStoreNames.contains('sync_state')) {
        db.createObjectStore('sync_state', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function localAddRecord(record: UsageRecord): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('usage_logs', 'readwrite');
    const store = tx.objectStore('usage_logs');
    store.put({ ...record, synced: false });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function localGetUnsynced(): Promise<UsageRecord[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('usage_logs', 'readonly');
    const store = tx.objectStore('usage_logs');
    const idx = store.index('synced');
    const req = idx.getAll(0 as any);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function localMarkSynced(uuids: string[]): Promise<void> {
  const db = await openLocalDB();
  const tx = db.transaction('usage_logs', 'readwrite');
  const store = tx.objectStore('usage_logs');
  for (const uuid of uuids) {
    const getReq = store.get(uuid);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (rec) { rec.synced = true; store.put(rec); }
    };
  }
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function localDeleteOld(days: number = 30): Promise<void> {
  const cutoff = Date.now() - days * 86400000;
  const db = await openLocalDB();
  const tx = db.transaction('usage_logs', 'readwrite');
  const store = tx.objectStore('usage_logs');
  const idx = store.index('created_at');
  const req = idx.openCursor(IDBKeyRange.upperBound(cutoff));
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) { cursor.delete(); cursor.continue(); }
  };
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export function formatUsd(n: number): string {
  if (n < 0.01) return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

export function formatCny(usd: number): string {
  return CHINA_YUAN + (usd * 7.2).toFixed(2);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const CHINA_YUAN = '\u00A5';

export function vendorColor(vendorId: string): string {
  const map: Record<string, string> = {
    openai: '#10A37F', anthropic: '#D97706', deepseek: '#3B82F6',
    glm: '#8B5CF6', qwen: '#EC4899', gemini: '#FFC107',
  };
  return map[vendorId] || '#6B7280';
}

export function vendorName(vendorId: string): string {
  const map: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek',
    glm: '\u667A\u8C37 AI', qwen: '\u901A\u4E49\u5343\u95EE', gemini: 'Google Gemini',
  };
  return map[vendorId] || vendorId;
}