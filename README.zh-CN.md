# Cloudflare DNS 管理面板

[English](./README.md) | **简体中文** | [繁體中文](./README.zh-TW.md)

一个现代化的无服务器 Cloudflare DNS 管理面板。完全运行在 Cloudflare Pages（免费套餐）上，无需服务器、无需数据库、无需 Docker —— 部署即用。后端基于 Cloudflare Pages Functions（Workers 运行时），存储使用 Cloudflare KV。基础设施成本：$0。

**在线演示：** [cfdns.demo.c.nf](https://cfdns.demo.c.nf)

![登录页面](https://github.com/user-attachments/assets/2af36988-0911-42c3-b4b6-7e660b3b5b90)

![管理面板](https://github.com/user-attachments/assets/66eaaa49-561d-4cad-a0fc-377a1fa1f402)

## 功能特性

### DNS 管理
- 跨多个域名查看、创建、编辑和删除 DNS 记录
- 内联编辑，快速修改
- 拖拽排序 MX/SRV 记录优先级
- 从 JSON、CSV 或 BIND 区域文件批量导入
- 导出 DNS 记录为 BIND 格式
- DNS 历史快照对比与一键回滚
- 分享快照链接

### 多账户与多域名
- 在单个面板中管理多个 Cloudflare 账户
- 快速域名切换器（支持搜索）
- 全局跨域名 DNS 记录搜索
- 每个域名可独立切换本地/托管存储

### SaaS（自定义主机名）
- 创建和管理 Cloudflare for SaaS 自定义主机名
- SSL 证书验证流程
- 回退源配置

### 定时任务与监控
- 定时执行 DNS 变更
- DNS 监控与自动健康检查
- 监控异常时在顶栏显示徽标通知

### 安全
- 服务器模式 JWT 身份验证
- SHA-256 密码哈希（零知识架构）
- TOTP 两步验证
- WebAuthn/通行密钥登录
- 多用户管理与角色权限（管理员/用户）
- 按用户分配域名权限
- 审计日志

### 用户体验
- 深色模式
- 响应式设计（移动端卡片布局）
- 键盘快捷键（Ctrl+K 搜索、Ctrl+N 新建记录、? 帮助）
- 新手引导
- 多语言支持（英语、中文、日语、韩语）
- Toast 通知
- 离线检测横幅

## 快速开始

### 前置要求

- Node.js 18+
- 一个至少有一个域名的 Cloudflare 账户

### 本地开发

```bash
npm install
npm run dev
```

使用 Wrangler 本地开发（Cloudflare Pages 环境）：

```bash
npm run dev:wrangler
```

### 构建

```bash
npm run build
```

### 部署到 Cloudflare Pages

#### 方式一：GitHub 集成（推荐）

1. Fork 或推送此仓库到你的 GitHub 账户。
2. 前往 **Cloudflare 控制台** > **Workers & Pages** > **创建应用** > **Pages** > **连接到 Git**。
3. 选择你的仓库并配置：
   - **构建命令：** `npm run build`
   - **构建输出目录：** `dist`
4. 添加环境变量（见下文）并部署。

#### 方式二：CLI 直接上传

```bash
npm install
npm run build
npx wrangler pages project create my-dns-manager
npx wrangler pages deploy dist --project-name my-dns-manager
```

#### 部署后设置

1. **创建 KV 命名空间：**
   - 前往 **Workers & Pages** > **KV** > **创建命名空间**
   - 名称随意（如 `dns-manager-kv`）

2. **绑定 KV 到 Pages 项目：**
   - 前往你的 Pages 项目 > **设置** > **Functions** > **KV 命名空间绑定**
   - 添加绑定：变量名 = `CF_DNS_KV`，KV 命名空间 = 刚创建的命名空间

3. **设置环境变量：**
   - 前往 **设置** > **环境变量**
   - 添加下方列出的变量

4. **重新部署**以使绑定生效（触发新部署或从控制台重新部署）。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `APP_PASSWORD` | 是（服务器模式） | 内置 `admin` 账户的管理员密码。 |

> **注意：** 无需将 `CF_API_TOKEN` 设为环境变量。API 令牌在登录后通过面板 UI 按用户添加，存储在 KV 中。

### KV 命名空间绑定

| 绑定名称 | 必填 | 说明 |
|----------|------|------|
| `CF_DNS_KV` | 是 | 存储用户账户、API 令牌、会话、设置、审计日志、DNS 快照、监控和定时任务 |

### 可选：自定义域名

使用自己的域名替代 `*.pages.dev` URL：

1. 前往 Pages 项目 > **自定义域** > **设置自定义域**
2. 输入子域名（如 `dns.example.com`）—— 域名必须在同一 Cloudflare 账户中
3. Cloudflare 会自动创建 CNAME 记录并配置 SSL

## API 概览

后端基于 Cloudflare Pages Functions 实现。完整 OpenAPI 规范见 [`api-docs.yaml`](./api-docs.yaml)。

主要接口：

- `POST /api/login` -- 身份验证并获取 JWT
- `GET /api/zones` -- 列出所有域名
- `GET/POST/PATCH/DELETE /api/zones/:zoneId/dns_records` -- DNS 记录增删改查
- `POST /api/zones/:zoneId/dns_import` -- 批量导入 DNS 记录
- `GET /api/zones/:zoneId/dns_export` -- 导出 DNS 记录
- `GET/POST /api/zones/:zoneId/dns_history` -- 快照历史与回滚
- `GET/POST/DELETE /api/monitors` -- DNS 健康监控
- `GET/POST/DELETE /api/scheduled-changes` -- 定时 DNS 变更
- `GET/POST/PUT/DELETE /api/admin/users` -- 用户管理（仅管理员）
- `GET/DELETE /api/admin/audit-log` -- 审计日志（仅管理员）

## 技术栈

- **前端：** React 18、Vite、Lucide Icons
- **后端：** Cloudflare Pages Functions（Workers 运行时）
- **存储：** Cloudflare KV
- **认证：** JWT (jose)、WebAuthn (@simplewebauthn)、TOTP
- **测试：** Vitest、Playwright、Testing Library
- **代码检查：** ESLint

## 许可证

[MIT](./LICENSE)
