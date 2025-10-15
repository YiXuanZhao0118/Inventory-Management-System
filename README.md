# Inventory Management System

A full-stack inventory, rental, and knowledge management platform for optical components built on the Next.js App Router. The app combines product cataloguing, stock tracking, QR code flows, and admin workflows backed by a PostgreSQL database via Prisma.

## Key Features
- **Inventory browsing and search** – Browse stock by product, location hierarchy, or status with aggregated vs. per-item views, quick search, and access to transfer/discard modals from the inventory dashboard. (`app/(protected)/inventory`, `features/Inventory.tsx`)
- **Location management** – Drill into the storage tree, lock the configured root location, and manage nested nodes when editing stock placements. (`app/(protected)/locations`, `features/Location.tsx`)
- **Short- and long-term rentals** – Track active loans, overdue items, extensions, and historical records with device registration and QR-code based quick check-in flows. (`features/short-term.tsx`, `features/long-term.tsx`, `app/api/rentals/*`)
- **Product assets and QA knowledge base** – Host documentation, attachments, Markdown/HTML QA articles, and image libraries. API endpoints normalize paths so exports/imports bundle associated files correctly. (`app/(protected)/products`, `app/api/product-files`, `app/api/data/export`)
- **Administrative tools** – Review audit-friendly loan logs, manage user accounts with email verification/reset, and run bulk data import/export and maintenance-mode toggles. (`features/Admin.tsx`, `app/api/users/*`, `app/api/sys/maintenance`)
- **QR code automation** – Generate on-demand SVG/PNG codes that deep-link to the kiosk-friendly short-term checkout page with configurable base origins. (`app/api/qrcode/stock/[stockId]/route.ts`)
- **Internationalised UI** – Switch between Traditional Chinese, English, Hindi, and German translations using the lightweight language context. (`src/components/LanguageSwitcher.tsx`, `app/data/language/*.json`)
- **Python-assisted product intel** – Call the bundled `ProductInformation/analyze_cli.py` scraper through an API route to enrich product records by fetching metadata from supplier pages. (`app/api/products/analyze_product_info/route.ts`)

## Tech Stack
- **Framework**: Next.js 15 (App Router), React 19
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS 4 + custom CSS modules
- **State/data**: React hooks, SWR-like custom `useJson` helper
- **Auth & security**: Signed JWT cookies (`jose`), bcrypt hashing, middleware-based route protection
- **Utilities**: Zod validation, Nodemailer for email, dnd-kit drag & drop, lucide-react icons, QRCode generation, Archiver/Adm-Zip for data bundles
- **Automation**: Python 3 + requests/BeautifulSoup for product info analyzer

## Repository Layout
```
app/                     # App Router routes (public & protected) and API handlers
features/                # Client-side feature modules used by routes
hooks/                   # Reusable React hooks (e.g. lightweight JSON fetching)
lib/                     # Server utilities: auth, Prisma client, mailing, config helpers
prisma/                  # Prisma schema and migrations
public/                  # Static assets (product images/files, QA media, icons)
ProductInformation/      # Python metadata analyzer CLI used by API integration
styles/, src/            # Shared styles and components
```

## Prerequisites
- **Node.js** ≥ 18.18 or ≥ 20.x (Next.js 15 requirement)
- **npm** (or another compatible package manager)
- **PostgreSQL** 13+ reachable via `DATABASE_URL`
- **Python** 3.10+ with `requests` and `beautifulsoup4` for the analyzer script

## Environment Variables
Create a `.env` / `.env.local` file in the project root. The most important variables are:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string used by Prisma. |
| `AUTH_SECRET` | ✅ | 32+ character secret for signing user session JWTs & verification tickets. |
| `ROOT_LOCATION_ID` | ✅ | UUID of the root storage location; validated on boot. |
| `NEXT_PUBLIC_ROOT_LOCATION_ID` | Optional | Exposes the same root UUID to the client for locking the location tree. |
| `NEXT_PUBLIC_BASE_ORIGIN` / `APP_BASE_ORIGIN` / `BASE_ORIGIN` | Optional | Preferred host origin for generated QR code URLs. |
| `PREFERRED_HOSTPORT` | Optional | Fallback host:port when QR codes are generated in offline/dev contexts (default `172.30.10.16:3000`). |
| `APP_NAME` | Optional | Display name in transactional emails; defaults to `Inventory`. |
| `APP_URL` | Optional | Base URL inserted into email templates. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Conditional | SMTP settings for verification and reset emails. Provide host, port, and sender; credentials are optional for open relays. |
| `PYTHON` | Optional | Overrides the Python executable used by the product analyzer API (defaults to `python3`). |

> Tip: also export `NEXT_PUBLIC_*` variants for any env values required in the browser.

A minimal development snippet looks like:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/inventory"
AUTH_SECRET="replace-with-a-long-random-string"
ROOT_LOCATION_ID="00000000-0000-0000-0000-000000000000"
NEXT_PUBLIC_ROOT_LOCATION_ID="00000000-0000-0000-0000-000000000000"
APP_BASE_ORIGIN="http://localhost:3001"
NEXT_PUBLIC_BASE_ORIGIN="http://localhost:3001"
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_FROM="inventory@example.com"
```

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Generate Prisma client** (rerun when the schema changes)
   ```bash
   npx prisma generate --schema prisma/schema.prisma
   ```
3. **Apply migrations / sync schema**
   ```bash
   # During development: creates or updates the local database
   npx prisma migrate dev --schema prisma/schema.prisma

   # In staging/production pipelines
   npx prisma migrate deploy --schema prisma/schema.prisma
   ```
4. **Run the development server**
   ```bash
   npm run dev
   ```
   The app listens on http://localhost:3001 by default.
5. **Build for production**
   ```bash
   npm run build
   npm run start  # serves on port 3000 with Next.js
   ```

## Quality & Tooling
- `npm run lint` – Next.js ESLint suite
- `npm run build` – Type-checks and compiles the production bundle

## Data Import / Export
- `POST /api/data/import` accepts a zip bundle containing JSON exports and related assets (`product_images/`, `product_files/`, `qa/`). Files are normalised and written to `public/…` folders.
- `GET /api/data/export` streams a zip bundle of the same shape, deduplicating attachments and filtering QA dependencies.
- Admins can trigger these workflows through the Data I/O section of the `/admin` UI.

## Authentication & Accounts
- User registration flows issue short-lived verification codes via email and store hashed secrets in the Prisma `User` model.
- Password resets reuse the same ticket pipeline with purpose flags for safety.
- Protected routes (e.g. `/admin`, `/api/admin/*`) rely on middleware that validates the `session` JWT cookie and redirects unauthenticated users back to `/account` with a return URL.

## Rentals & Device Flows
- The short-term kiosk UI stores a `deviceId` cookie/localStorage entry, uses QR codes for stock lookup, and polls rental APIs for real-time statuses.
- Long-term rentals expose dedicated endpoints for loan, return, and extension operations under `app/api/rentals/`.
- `/api/devices` lets you pre-register kiosk devices or update friendly names.

## QR Code Utilities
- `GET /api/qrcode/stock/:stockId` emits SVG/PNG images. Optional query params: `size`, `margin`, `format`, `base` (override origin). Defaults fall back to forwarded headers or `PREFERRED_HOSTPORT`.
- Additional endpoints under `/api/qrcode/short-term` generate batch codes for property-managed vs. non-managed stock.

## Product Intelligence Analyzer
- `POST /api/products/analyze_product_info` with `{ "url": "https://supplier.example/item" }` launches the Python scraper which returns structured metadata (price, images, specs).
- The analyzer needs outbound HTTP access plus the `requests` and `beautifulsoup4` packages; install them with `pip install -r ProductInformation/requirements.txt` (create this file listing dependencies if absent).

## Maintenance Mode
- Toggle maintenance banners via `POST /api/sys/maintenance` (body `{ "on": true, "message": "Upgrading DB" }`). The state persists in `.runtime/maintenance.json` and the `version` field increments on each toggle for live-refresh support.
- Query current state with `GET /api/sys/maintenance`.

## Internationalisation
- Wrap pages with `LanguageProvider` and render `LanguageSwitcher` to cycle supported locales.
- Translation dictionaries live in `app/data/language/*.json`; extend them or add new locale codes as needed.

## Troubleshooting
- **Invalid ROOT_LOCATION_ID**: ensure the UUID matches an entry in your `Location` table; the app throws on boot if the format is wrong.
- **Email failures**: check SMTP env variables; the server logs a warning when mandatory fields are missing.
- **QR codes point to 172.30.10.16**: set `NEXT_PUBLIC_BASE_ORIGIN`/`APP_BASE_ORIGIN` to your deployment hostname.
- **Python analyzer timeouts**: endpoints time out after 30s; verify the URL is reachable and consider caching results in your database.

---

Made with ❤️ for lab inventory teams that need a single pane of glass for assets, rentals, and documentation.
