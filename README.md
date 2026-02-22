# Cloudflare DNS Manager

**English** | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

A modern, serverless Cloudflare DNS management dashboard. Runs entirely on Cloudflare Pages (free tier) with no servers, no databases, and no Docker — just deploy and go. The backend is Cloudflare Pages Functions (Workers runtime), storage is Cloudflare KV. Total infrastructure cost: $0.

**Live Demo:** [cfdns.demo.c.nf](https://cfdns.demo.c.nf)

![Login](https://github.com/user-attachments/assets/2af36988-0911-42c3-b4b6-7e660b3b5b90)

![Dashboard](https://github.com/user-attachments/assets/66eaaa49-561d-4cad-a0fc-377a1fa1f402)

## Features

### DNS Management
- View, create, edit, and delete DNS records across multiple zones
- Inline editing for quick changes
- Drag-and-drop priority reordering for MX/SRV records
- Bulk import from JSON, CSV, or BIND zone files
- Export DNS records to BIND format
- DNS history with snapshot diffing and one-click rollback
- Share snapshot links for collaboration

### Multi-Account & Multi-Zone
- Manage multiple Cloudflare accounts from a single dashboard
- Quick zone switcher with search
- Global cross-zone DNS record search
- Per-zone local/server storage toggle

### SaaS (Custom Hostnames)
- Create and manage Cloudflare for SaaS custom hostnames
- SSL certificate verification workflow
- Fallback origin configuration

### Scheduling & Monitoring
- Schedule DNS changes for future execution
- DNS monitors with automatic health checks
- Failed-monitor badge notifications in the header

### Security
- Server-mode authentication with JWT tokens
- SHA-256 password hashing (zero-knowledge)
- TOTP two-factor authentication
- WebAuthn/Passkey login support
- Multi-user management with role-based access (admin/user)
- Per-user zone permissions
- Audit logging

### User Experience
- Dark mode with full theme support
- Responsive design (mobile-optimized card layout)
- Keyboard shortcuts (Ctrl+K search, Ctrl+N new record, ? help)
- Onboarding tour for first-time users
- Multi-language support (English, Chinese, Japanese, Korean)
- Toast notifications
- Offline detection banner

## Quick Start

### Prerequisites

- Node.js 18+
- A Cloudflare account with at least one zone

### Development

```bash
npm install
npm run dev
```

To run with Wrangler (Cloudflare Pages local dev):

```bash
npm run dev:wrangler
```

### Build

```bash
npm run build
```

### Deploy to Cloudflare Pages

#### Option A: GitHub Integration (recommended)

1. Fork or push this repository to your GitHub account.
2. Go to **Cloudflare Dashboard** > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository and configure:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add environment variables (see below) and deploy.

#### Option B: Direct Upload via CLI

```bash
npm install
npm run build
npx wrangler pages project create my-dns-manager
npx wrangler pages deploy dist --project-name my-dns-manager
```

#### Post-Deploy Setup

1. **Create a KV namespace:**
   - Go to **Workers & Pages** > **KV** > **Create a namespace**
   - Name it anything (e.g. `dns-manager-kv`)

2. **Bind KV to your Pages project:**
   - Go to your Pages project > **Settings** > **Functions** > **KV namespace bindings**
   - Add binding: Variable name = `CF_DNS_KV`, KV namespace = the one you just created

3. **Set environment variables:**
   - Go to **Settings** > **Environment variables**
   - Add the variables listed below

4. **Redeploy** for bindings to take effect (trigger a new deployment or redeploy from the dashboard).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes (server mode) | Admin password for the default `admin` account. Used to log in as the built-in `admin` user. |

> **Note:** You do not need to set `CF_API_TOKEN` as an environment variable. API tokens are added per-user through the dashboard UI after login and stored in KV.

### KV Namespace Binding

| Binding Name | Required | Description |
|--------------|----------|-------------|
| `CF_DNS_KV` | Yes | Stores user accounts, API tokens, sessions, settings, audit logs, DNS snapshots, monitors, and scheduled changes |

### Optional: Custom Domain

To use your own domain instead of the `*.pages.dev` URL:

1. Go to your Pages project > **Custom domains** > **Set up a custom domain**
2. Enter your subdomain (e.g. `dns.example.com`) — the domain must be a zone in the same Cloudflare account
3. Cloudflare auto-creates the CNAME record and provisions SSL

## API Overview

The backend is implemented as Cloudflare Pages Functions. See [`api-docs.yaml`](./api-docs.yaml) for the full OpenAPI specification.

Key endpoints:

- `POST /api/login` -- Authenticate and receive a JWT
- `GET /api/zones` -- List all zones across configured accounts
- `GET/POST/PATCH/DELETE /api/zones/:zoneId/dns_records` -- CRUD for DNS records
- `POST /api/zones/:zoneId/dns_import` -- Bulk import DNS records
- `GET /api/zones/:zoneId/dns_export` -- Export DNS records
- `GET/POST /api/zones/:zoneId/dns_history` -- Snapshot history and rollback
- `GET/POST/DELETE /api/monitors` -- DNS health monitors
- `GET/POST/DELETE /api/scheduled-changes` -- Scheduled DNS changes
- `GET/POST/PUT/DELETE /api/admin/users` -- User management (admin only)
- `GET/DELETE /api/admin/audit-log` -- Audit log (admin only)

## Tech Stack

- **Frontend:** React 18, Vite, Lucide Icons
- **Backend:** Cloudflare Pages Functions (Workers runtime)
- **Storage:** Cloudflare KV
- **Auth:** JWT (jose), WebAuthn (@simplewebauthn), TOTP
- **Testing:** Vitest, Playwright, Testing Library
- **Linting:** ESLint

## License

[MIT](./LICENSE)
