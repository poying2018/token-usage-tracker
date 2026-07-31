# 部署指南

## 前置条件

1. 一个 Cloudflare 账号（免费即可）
2. 一个 GitHub OAuth App

## 第一步：创建 Cloudflare D1 数据库

```bash
cd server
npx wrangler d1 create token-usage-tracker
```

记下输出的 database_id，填入 wrangler.toml 的 database_id 字段。

## 第二步：创建 GitHub OAuth App

1. 登录 GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App
2. Application name: Token Usage Tracker
3. Homepage URL: https://your-worker.your-subdomain.workers.dev
4. Authorization callback URL: https://your-worker.your-subdomain.workers.dev/api/auth/github/callback
5. 保存 -> 拿到 Client ID 和 Client Secret

## 第三步：配置 Secrets

```bash
cd server

# 设置 JWT 签名密钥（随机32字节）
npx wrangler secret put JWT_SECRET
# 输入: 随机32字节字符串（可以用 `openssl rand -hex 32` 生成）

# 设置 GitHub OAuth Client Secret
npx wrangler secret put GITHUB_CLIENT_SECRET
# 输入: 你的 GitHub OAuth Client Secret

# 在 wrangler.toml 中设置 GITHUB_CLIENT_ID（非敏感）
# [vars]
# GITHUB_OAUTH_CLIENT_ID = "你的Client ID"
```

## 第四步：初始化数据库

```bash
npx wrangler d1 execute token-usage-tracker --file=./migrations/0001_init.sql
```

## 第五步：构建前端 + 部署

```bash
# 构建前端
cd ../web && npm run build

# 部署 Worker（会自动包含前端静态文件）
cd ../server
npx wrangler deploy
```

## 第六步：更新 GitHub OAuth App

将 Worker URL 填入 GitHub OAuth App 的 Homepage URL 和 callback URL。

## 第七步：配置 GitHub Actions 自动部署（可选）

在 GitHub 仓库 Settings -> Secrets and variables -> Actions 中添加：

- CF_API_TOKEN: Cloudflare API Token
- CF_ACCOUNT_ID: Cloudflare Account ID
- JWT_SECRET: JWT 签名密钥
- GITHUB_CLIENT_SECRET: GitHub OAuth Client Secret
