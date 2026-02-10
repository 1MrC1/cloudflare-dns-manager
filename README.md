# CF DNS Manager

A modern, self-hosted Cloudflare DNS management dashboard built with React and deployed on Cloudflare Pages.

![Screenshot](screenshot-placeholder.png)

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

1. Push the repository to GitHub.
2. In the Cloudflare Dashboard, create a new Pages project connected to your repo.
3. Set the build command to `npm run build` and the output directory to `dist`.
4. Add the required environment variables and KV binding (see below).
5. Deploy.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes (server mode) | Admin password for the default `admin` account |

### KV Namespace Binding

| Binding Name | Description |
|--------------|-------------|
| `CF_DNS_KV` | Cloudflare KV namespace for storing accounts, sessions, settings, monitors, scheduled changes, and audit logs |

Create a KV namespace in the Cloudflare Dashboard and bind it as `CF_DNS_KV` in your Pages project settings.

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
