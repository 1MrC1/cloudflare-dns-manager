# Cloudflare DNS & SaaS Manager

一个轻量化、完全运行在 Cloudflare 生态中的 Cloudflare DNS 与 SaaS (SSL for SaaS) 管理面板。


## 📋 详细部署指南

### Cloudflare Pages

1. Fork 或克隆本仓库到您的 GitHub 账户
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 Workers 和 Pages 页面
3. 点击"创建应用-创建 Pages 应用"，连接您的 GitHub 仓库
4. 框架预设-选择：React(vite)
5. 点击"保存并部署"

#### 此时可以使用“本地模式”登录了

如果需要“托管模式”，请继续设置环境变量：
1. 在 Cloudflare Pages 控制面板中，点击"设置" > "变量和机密" > 添加类型：密钥
2. 添加 `APP_PASSWORD` 变量（必须设置）（！！！请使用复杂的密码，如有必要请开启“Cloudflare Access”）
3. 添加 `CF_API_TOKEN` 变量（必须设置）
4. 添加 `CF_API_TOKEN1` 变量（可选）
5. 添加 `CF_API_TOKEN2` 变量（可选）
6. 返回部署页面，选择"重新部署"

#### API 令牌权限推荐：区域.DNS.编辑，区域.SSL和证书.编辑

## 🏗️ 项目架构

本项目采用 **边缘原生 (Edge-Native)** 全栈架构，完全运行在 Cloudflare 生态中：

- **Frontend**: 基于 React 18 与 Vite 构建的单页应用 (SPA)，通过 Cloudflare Pages 全球分发。
- **Backend**: 使用 Cloudflare Pages Functions 实现 Serverless API，运行在边缘节点。
- **Security**: 
    - **托管模式**：后端校验 `APP_PASSWORD` 并颁发基于 `jose` 签名的 JWT 令牌。
    - **本地模式**：前端令牌通过自定义 Header 经后端透明代理，不经过任何持久化存储。
- **Middleware**: 自动拦截并校验所有 API 请求的身份合法性。


##  开发与部署

### 开发环境
1. **安装依赖**：
   ```bash
   npm install
   ```
2. **启动开发服务器**：
   ```bash
   # 模拟本地模式
   npm run dev
   
   # 模拟托管模式 (需安装 wrangler)
   npx wrangler pages dev . --binding APP_PASSWORD="your_password"
   ```

### 生产部署
1. **编译打包**：
   ```bash
   npm run build
   ```
2. **发布至 Pages**：
   ```bash
   npx wrangler pages deploy dist
   ```

---
*由 [Antigravity](https://github.com/google-deepmind) 驱动开发*
