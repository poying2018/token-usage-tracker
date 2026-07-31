-- ============================================
-- Token Usage Tracker — D1 Schema
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    user_id      TEXT PRIMARY KEY,
    login        TEXT NOT NULL,
    avatar_url   TEXT,
    email        TEXT,
    gh_token_enc TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

-- 厂商表
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id     TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    api_base_url  TEXT,
    api_key_enc   TEXT,
    pricing_json  TEXT,
    icon_url      TEXT,
    created_at    INTEGER NOT NULL
);

-- 用量流水表（核心）
CREATE TABLE IF NOT EXISTS usage_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid              TEXT UNIQUE NOT NULL,
    device_id         TEXT NOT NULL,
    vendor_id         TEXT NOT NULL,
    model             TEXT NOT NULL,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    cost_usd          REAL DEFAULT 0,
    created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_uuid ON usage_logs(uuid);
CREATE INDEX IF NOT EXISTS idx_usage_device ON usage_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_usage_vendor_time ON usage_logs(vendor_id, created_at);

-- 同步状态表
CREATE TABLE IF NOT EXISTS sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 设备表
CREATE TABLE IF NOT EXISTS devices (
    device_id    TEXT PRIMARY KEY,
    device_name  TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

-- 每日聚合表
CREATE TABLE IF NOT EXISTS daily_agg (
    date         TEXT NOT NULL,
    vendor_id    TEXT NOT NULL,
    model        TEXT NOT NULL,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd     REAL NOT NULL DEFAULT 0,
    call_count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, vendor_id, model)
);

-- ============================================
-- 预置厂商数据
-- ============================================
INSERT OR IGNORE INTO vendors (vendor_id, display_name, api_base_url, pricing_json, created_at) VALUES
    ('openai',    'OpenAI',    'https://api.openai.com/v1',
     '{"gpt-4o":{"input":2.5,"output":10},"gpt-4o-mini":{"input":0.15,"output":0.6},"o1-preview":{"input":15,"output":60},"o3-mini":{"input":1.1,"output":4.4}}',
     1700000000000),
    ('anthropic', 'Anthropic', 'https://api.anthropic.com/v1',
     '{"claude-3-5-sonnet":{"input":3,"output":15},"claude-3-7-sonnet":{"input":3,"output":15},"claude-3-haiku":{"input":0.25,"output":1.25},"claude-3-opus":{"input":15,"output":75}}',
     1700000000000),
    ('deepseek',  'DeepSeek',  'https://api.deepseek.com/v1',
     '{"deepseek-chat":{"input":0.27,"output":1.1},"deepseek-reasoner":{"input":0.55,"output":2.19}}',
     1700000000000),
    ('glm',       '智谱 AI',   'https://open.bigmodel.cn/api/paas/v4',
     '{"glm-4-plus":{"input":5,"output":5},"glm-4-air":{"input":1,"output":1},"glm-4-flash":{"input":0,"output":0}}',
     1700000000000),
    ('qwen',      '通义千问',  'https://dashscope.aliyuncs.com/compatible-mode/v1',
     '{"qwen-max":{"input":2.4,"output":9.6},"qwen-plus":{"input":0.8,"output":2},"qwen-turbo":{"input":0.3,"output":0.6}}',
     1700000000000),
    ('gemini',    'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta',
     '{"gemini-1.5-pro":{"input":3.5,"output":10.5},"gemini-1.5-flash":{"input":0.35,"output":1.05},"gemini-2.0-flash":{"input":0.1,"output":0.4}}',
     1700000000000);
