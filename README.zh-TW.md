# Cloudflare DNS 管理面板

[English](./README.md) | [简体中文](./README.zh-CN.md) | **繁體中文**

一個現代化的無伺服器 Cloudflare DNS 管理面板。完全運行在 Cloudflare Pages（免費方案）上，無需伺服器、無需資料庫、無需 Docker —— 部署即用。後端基於 Cloudflare Pages Functions（Workers 執行環境），儲存使用 Cloudflare KV。基礎設施成本：$0。

**線上展示：** [cfdns.demo.c.nf](https://cfdns.demo.c.nf)

![登入頁面](https://github.com/user-attachments/assets/2af36988-0911-42c3-b4b6-7e660b3b5b90)

![管理面板](https://github.com/user-attachments/assets/66eaaa49-561d-4cad-a0fc-377a1fa1f402)

## 功能特色

### DNS 管理
- 跨多個網域檢視、建立、編輯和刪除 DNS 記錄
- 內聯編輯，快速修改
- 拖曳排序 MX/SRV 記錄優先順序
- 從 JSON、CSV 或 BIND 區域檔批次匯入
- 匯出 DNS 記錄為 BIND 格式
- DNS 歷史快照比對與一鍵回滾
- 分享快照連結

### 多帳戶與多網域
- 在單一面板中管理多個 Cloudflare 帳戶
- 快速網域切換器（支援搜尋）
- 全域跨網域 DNS 記錄搜尋
- 每個網域可獨立切換本機/託管儲存

### SaaS（自訂主機名稱）
- 建立和管理 Cloudflare for SaaS 自訂主機名稱
- SSL 憑證驗證流程
- 回退來源設定

### 排程任務與監控
- 排程執行 DNS 變更
- DNS 監控與自動健康檢查
- 監控異常時在頂部列顯示徽章通知

### 安全性
- 伺服器模式 JWT 身分驗證
- SHA-256 密碼雜湊（零知識架構）
- TOTP 兩步驗證
- WebAuthn/通行金鑰登入
- 多使用者管理與角色權限（管理員/使用者）
- 按使用者分配網域權限
- 稽核日誌

### 使用者體驗
- 深色模式
- 響應式設計（行動裝置卡片佈局）
- 鍵盤快速鍵（Ctrl+K 搜尋、Ctrl+N 新增記錄、? 說明）
- 新手導覽
- 多語言支援（英語、中文、日語、韓語）
- Toast 通知
- 離線偵測橫幅

## 快速開始

### 前置需求

- Node.js 18+
- 一個至少有一個網域的 Cloudflare 帳戶

### 本機開發

```bash
npm install
npm run dev
```

使用 Wrangler 本機開發（Cloudflare Pages 環境）：

```bash
npm run dev:wrangler
```

### 建置

```bash
npm run build
```

### 部署到 Cloudflare Pages

#### 方式一：GitHub 整合（建議）

1. Fork 或推送此儲存庫到你的 GitHub 帳戶。
2. 前往 **Cloudflare 控制台** > **Workers & Pages** > **建立應用程式** > **Pages** > **連結到 Git**。
3. 選擇你的儲存庫並設定：
   - **建置命令：** `npm run build`
   - **建置輸出目錄：** `dist`
4. 新增環境變數（見下文）並部署。

#### 方式二：CLI 直接上傳

```bash
npm install
npm run build
npx wrangler pages project create my-dns-manager
npx wrangler pages deploy dist --project-name my-dns-manager
```

#### 部署後設定

1. **建立 KV 命名空間：**
   - 前往 **Workers & Pages** > **KV** > **建立命名空間**
   - 名稱隨意（如 `dns-manager-kv`）

2. **繫結 KV 到 Pages 專案：**
   - 前往你的 Pages 專案 > **設定** > **Functions** > **KV 命名空間繫結**
   - 新增繫結：變數名稱 = `CF_DNS_KV`，KV 命名空間 = 剛建立的命名空間

3. **設定環境變數：**
   - 前往 **設定** > **環境變數**
   - 新增下方列出的變數

4. **重新部署**以使繫結生效（觸發新部署或從控制台重新部署）。

## 環境變數

| 變數 | 必填 | 說明 |
|------|------|------|
| `APP_PASSWORD` | 是（伺服器模式） | 內建 `admin` 帳戶的管理員密碼。 |

> **注意：** 無需將 `CF_API_TOKEN` 設為環境變數。API 權杖在登入後透過面板 UI 按使用者新增，儲存在 KV 中。

### KV 命名空間繫結

| 繫結名稱 | 必填 | 說明 |
|----------|------|------|
| `CF_DNS_KV` | 是 | 儲存使用者帳戶、API 權杖、工作階段、設定、稽核日誌、DNS 快照、監控和排程任務 |

### 選用：自訂網域

使用自己的網域取代 `*.pages.dev` URL：

1. 前往 Pages 專案 > **自訂網域** > **設定自訂網域**
2. 輸入子網域（如 `dns.example.com`）—— 網域必須在同一 Cloudflare 帳戶中
3. Cloudflare 會自動建立 CNAME 記錄並設定 SSL

## API 概覽

後端基於 Cloudflare Pages Functions 實作。完整 OpenAPI 規格見 [`api-docs.yaml`](./api-docs.yaml)。

主要端點：

- `POST /api/login` -- 身分驗證並取得 JWT
- `GET /api/zones` -- 列出所有網域
- `GET/POST/PATCH/DELETE /api/zones/:zoneId/dns_records` -- DNS 記錄增刪改查
- `POST /api/zones/:zoneId/dns_import` -- 批次匯入 DNS 記錄
- `GET /api/zones/:zoneId/dns_export` -- 匯出 DNS 記錄
- `GET/POST /api/zones/:zoneId/dns_history` -- 快照歷史與回滾
- `GET/POST/DELETE /api/monitors` -- DNS 健康監控
- `GET/POST/DELETE /api/scheduled-changes` -- 排程 DNS 變更
- `GET/POST/PUT/DELETE /api/admin/users` -- 使用者管理（僅管理員）
- `GET/DELETE /api/admin/audit-log` -- 稽核日誌（僅管理員）

## 技術架構

- **前端：** React 18、Vite、Lucide Icons
- **後端：** Cloudflare Pages Functions（Workers 執行環境）
- **儲存：** Cloudflare KV
- **驗證：** JWT (jose)、WebAuthn (@simplewebauthn)、TOTP
- **測試：** Vitest、Playwright、Testing Library
- **程式碼檢查：** ESLint

## 授權條款

[MIT](./LICENSE)
