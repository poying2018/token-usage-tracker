# Token Usage Tracker

> 多厂商 AI Token 用量统计工具 — 统一管理 OpenAI、Anthropic、DeepSeek、智谱 GLM、通义千问、Google Gemini 等平台的 API Token 消耗

[设计文档](token-usage-tracker-design.md) | [一键部署](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USER/token-usage-tracker)

## 核心功能

- **多厂商聚合** — 一套界面查看所有厂商的 Token 用量和花费
- **GitHub OAuth 登录** — 安全的身份验证，数据绑定自己的 D1 数据库
- **多设备云同步** — 线上保存 30 天数据，多台设备自动合并
- **可视化仪表板** — ECharts 图表展示趋势、厂商分布、模型分布
- **花费估算** — 按各模型单价自动换算 USD / CNY
- **数据导出** — 支持 CSV / JSON 格式
- **预算告警** — 设置月度预算，超限提醒
- **零服务器成本** — 利用 Cloudflare 免费额度 + GitHub OAuth

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker + D1 (后端)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ GitHub OAuth │  │  D1 SQLite   │  │ SSE/DO       │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
                  │  HTTPS (API + Static) │
┌──────────────────────────────────────────────────────────────────┐
│                  🌐 浏览器 / PWA (前端)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  React + Vite │  │  IndexedDB   │  │ Sync Engine  │           │
│  │  ECharts      │  │  (本地缓存)   │  │  (SSE/HTTP)  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

## 快速开始

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/YOUR_USER/token-usage-tracker.git
cd token-usage-tracker

# 2. 安装依赖
cd web && npm install && cd ..
cd server && npm install && cd ..

# 3. 创建 D1 数据库 (Cloudflare Dashboard 或 wrangler)
wrangler d1 create token-usage-tracker

# 4. 编辑 wrangler.toml 填入 database_id

# 5. 设置 Secrets
cd server
wrangler secret put JWT_SECRET
wrangler secret put GITHUB_CLIENT_SECRET

# 6. 初始化数据库
npm run db:init

# 7. 构建前端
cd ../web && npm run build

# 8. 运行开发服务
cd ../server && npm run dev
```

### 部署到 Cloudflare

```bash
cd server
wrangler deploy
```

## GitHub OAuth 配置

1. 登录 GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Application name: `Token Usage Tracker`
3. Homepage URL: `https://your-worker.your-subdomain.workers.dev`
4. Authorization callback URL: `https://your-worker.your-subdomain.workers.dev/api/auth/github/callback`
5. 保存 → 拿到 Client ID 和 Client Secret
6. 前端只需 Client ID，PKCE 不需要 Secret

## 数据表

| 表名 | 说明 |
|------|------|
| `users` | 用户表（GitHub 身份） |
| `vendors` | 厂商表（预设 + 自定义） |
| `usage_logs` | 用量流水表（30 天滚动） |
| `daily_agg` | 每日聚合表（加速查询） |
| `devices` | 设备表（多设备同步） |
| `sync_state` | 同步状态表 |

## 安全设计

- **AES-GCM 加密** API Key
- **JWT (HS256)** 认证，24 小时有效期
- **GitHub OAuth PKCE** 流程
- **D1 按 user_id 隔离**，用户只能访问自己的数据
- **30 天自动清理**
- **零第三方追踪**

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/github/callback` | OAuth 回调，签发 JWT |
| POST | `/api/ingest` | 批量上报用量记录 |
| GET | `/api/stats` | 聚合统计数据 |
| GET | `/api/stats/stream` | SSE 实时推送 |
| GET | `/api/usage` | 查询明细记录 |
| GET/POST | `/api/vendors` | 厂商管理 |
| GET | `/api/devices` | 设备列表 |
| GET | `/api/export` | 导出 CSV/JSON |
| GET/POST | `/api/budget` | 预算设置 |

## 支持的厂商

- OpenAI (gpt-4o, gpt-4o-mini, o1-preview, o3-mini)
- Anthropic (claude-3-5-sonnet, claude-3-haiku, claude-3-opus)
- DeepSeek (deepseek-chat, deepseek-reasoner)
- 智谱 AI (glm-4-plus, glm-4-air, glm-4-flash)
- 通义千问 (qwen-max, qwen-plus, qwen-turbo)
- Google Gemini (gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash)

## 开源协议

MIT License
