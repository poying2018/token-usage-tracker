// Demo data generator - generates sample usage data locally

export interface DemoVendor {
  vendor_id: string;
  display_name: string;
  pricing: Record<string, { input: number; output: number }>;
}

export const DEMO_VENDORS: DemoVendor[] = [
  {
    vendor_id: 'openai',
    display_name: 'OpenAI',
    pricing: {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'o1-preview': { input: 15, output: 60 },
      'o3-mini': { input: 1.1, output: 4.4 },
    },
  },
  {
    vendor_id: 'anthropic',
    display_name: 'Anthropic',
    pricing: {
      'claude-3-5-sonnet': { input: 3, output: 15 },
      'claude-3-7-sonnet': { input: 3, output: 15 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-opus': { input: 15, output: 75 },
    },
  },
  {
    vendor_id: 'deepseek',
    display_name: 'DeepSeek',
    pricing: {
      'deepseek-chat': { input: 0.27, output: 1.1 },
      'deepseek-reasoner': { input: 0.55, output: 2.19 },
    },
  },
  {
    vendor_id: 'glm',
    display_name: '智谱 AI',
    pricing: {
      'glm-4-plus': { input: 5, output: 5 },
      'glm-4-air': { input: 1, output: 1 },
      'glm-4-flash': { input: 0, output: 0 },
    },
  },
  {
    vendor_id: 'qwen',
    display_name: '通义千问',
    pricing: {
      'qwen-max': { input: 2.4, output: 9.6 },
      'qwen-plus': { input: 0.8, output: 2 },
      'qwen-turbo': { input: 0.3, output: 0.6 },
    },
  },
  {
    vendor_id: 'gemini',
    display_name: 'Google Gemini',
    pricing: {
      'gemini-1.5-pro': { input: 3.5, output: 10.5 },
      'gemini-1.5-flash': { input: 0.35, output: 1.05 },
      'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    },
  },
];

export interface DemoRecord {
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

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function generateDemoData(days: number = 30): DemoRecord[] {
  const records: DemoRecord[] = [];
  const rng = seededRandom(42);
  const now = Date.now();
  const devices = ['device-win-001', 'device-mac-002', 'device-phone-003'];

  for (let day = days; day >= 0; day--) {
    const baseDate = now - day * 86400000;
    const count = 5 + Math.floor(rng() * 20);

    for (let i = 0; i < count; i++) {
      const vendorIdx = Math.floor(rng() * DEMO_VENDORS.length);
      const vendor = DEMO_VENDORS[vendorIdx];
      const models = Object.keys(vendor.pricing);
      const model = models[Math.floor(rng() * models.length)];
      const pricing = vendor.pricing[model];

      const hour = Math.floor(rng() * 24);
      const minute = Math.floor(rng() * 60);
      const second = Math.floor(rng() * 60);
      const createdAt = baseDate + (hour * 3600 + minute * 60 + second) * 1000;

      const promptTokens = 200 + Math.floor(rng() * 5000);
      const completionTokens = 100 + Math.floor(rng() * 2000);
      const totalTokens = promptTokens + completionTokens;

      const inputCost = (promptTokens * pricing.input) / 1000000;
      const outputCost = (completionTokens * pricing.output) / 1000000;

      records.push({
        uuid: `demo-${baseDate}-${i}-${vendor.vendor_id}`,
        device_id: devices[Math.floor(rng() * devices.length)],
        vendor_id: vendor.vendor_id,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        cost_usd: inputCost + outputCost,
        created_at: createdAt,
      });
    }
  }

  return records;
}

export function calculateStats(records: DemoRecord[], period: string) {
  const now = Date.now();
  let since: number;

  if (period === 'month') {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    since = d.getTime();
  } else if (period === 'last30days') {
    since = now - 30 * 86400000;
  } else {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    since = d.getTime();
  }

  const filtered = records.filter(r => r.created_at >= since);

  let totalTokens = 0;
  let totalCost = 0;
  const vendors: Record<string, { totalTokens: number; costUsd: number; callCount: number }> = {};
  const models: Record<string, { totalTokens: number; costUsd: number; callCount: number }> = {};

  for (const r of filtered) {
    totalTokens += r.total_tokens;
    totalCost += r.cost_usd;

    if (!vendors[r.vendor_id]) vendors[r.vendor_id] = { totalTokens: 0, costUsd: 0, callCount: 0 };
    vendors[r.vendor_id].totalTokens += r.total_tokens;
    vendors[r.vendor_id].costUsd += r.cost_usd;
    vendors[r.vendor_id].callCount++;

    if (!models[r.model]) models[r.model] = { totalTokens: 0, costUsd: 0, callCount: 0 };
    models[r.model].totalTokens += r.total_tokens;
    models[r.model].costUsd += r.cost_usd;
    models[r.model].callCount++;
  }

  // Calculate daily trend for last30days
  let daily: Array<{ date: string; totalTokens: number; costUsd: number; callCount: number }> = [];
  if (period === 'last30days') {
    const dailyMap: Record<string, { totalTokens: number; costUsd: number; callCount: number }> = {};
    for (const r of filtered) {
      const date = new Date(r.created_at).toISOString().slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { totalTokens: 0, costUsd: 0, callCount: 0 };
      dailyMap[date].totalTokens += r.total_tokens;
      dailyMap[date].costUsd += r.cost_usd;
      dailyMap[date].callCount++;
    }
    daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));
  }

  // Demo devices
  const devices = [
    { device_id: 'device-win-001', device_name: 'Chrome on Windows', last_seen_at: now - 120000, stale: false },
    { device_id: 'device-mac-002', device_name: 'Safari on macOS', last_seen_at: now - 600000, stale: false },
    { device_id: 'device-phone-003', device_name: 'Chrome on Android', last_seen_at: now - 900000, stale: true },
  ];

  return {
    updatedAt: new Date().toISOString(),
    period,
    totalTokens,
    costUsd: totalCost,
    callCount: filtered.length,
    vendors,
    models,
    devices,
    daily,
  };
}
