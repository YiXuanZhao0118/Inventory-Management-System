# Inventory Management System / 庫存管理系統

A full-stack inventory, rental, and knowledge management platform for optical components built on the Next.js App Router. The app combines product cataloguing, stock tracking, QR code flows, and admin workflows backed by a PostgreSQL database via Prisma.

這是一個以 Next.js App Router 為基礎、專為光學元件打造的全端庫存與租借管理平台，整合產品建檔、庫存追蹤、QR Code 流程與後台管理工具，並透過 Prisma 連接 PostgreSQL 資料庫。

## Key Features / 主要功能
- **Inventory browsing and search / 庫存瀏覽與搜尋** – Browse stock by product, location hierarchy, or status with aggregated vs. per-item views, quick search, and access to transfer/discard modals from the inventory dashboard. (`app/(protected)/inventory`, `features/Inventory.tsx`)
  - 可依產品、倉儲層級或狀態檢視庫存，支援彙總與個別項目雙視角、快速搜尋，以及從儀表板直接開啟轉移與報廢彈窗。
- **Location management / 儲位管理** – Drill into the storage tree, lock the configured root location, and manage nested nodes when editing stock placements. (`app/(protected)/locations`, `features/Location.tsx`)
  - 支援多層儲位結構瀏覽，可鎖定根節點避免誤編輯，並在調整庫存位置時管理巢狀節點。
- **Short- and long-term rentals / 短期與長期租借** – Track active loans, overdue items, extensions, and historical records with device registration and QR-code based quick check-in flows. (`features/short-term.tsx`, `features/long-term.tsx`, `app/api/rentals/*`)
  - 追蹤租借狀態、逾期、展延與歷史紀錄，支援設備註冊與 QR Code 快速歸還流程。
- **Product assets and QA knowledge base / 產品資源與知識庫** – Host documentation, attachments, Markdown/HTML QA articles, and image libraries. API endpoints normalize paths so exports/imports bundle associated files correctly. (`app/(protected)/products`, `app/api/product-files`, `app/api/data/export`)
  - 集中管理產品文件、附件、Markdown/HTML QA 文章與圖庫；API 會統一路徑，讓匯出/匯入時自動打包關聯檔案。
- **Administrative tools / 管理工具** – Review audit-friendly loan logs, manage user accounts with email verification/reset, and run bulk data import/export and maintenance-mode toggles. (`features/Admin.tsx`, `app/api/users/*`, `app/api/sys/maintenance`)
  - 提供稽核友善的租借紀錄、電子郵件驗證／重設的使用者管理、以及批次匯入匯出與維護模式切換。
- **QR code automation / QR Code 自動化** – Generate on-demand SVG/PNG codes that deep-link to the kiosk-friendly short-term checkout page with configurable base origins. (`app/api/qrcode/stock/[stockId]/route.ts`)
  - 可產生對應短期租借頁面的 SVG/PNG QR Code，支援自訂網址基準。
- **Internationalised UI / 多語系介面** – Switch between Traditional Chinese, English, Hindi, and German translations using the lightweight language context. (`src/components/LanguageSwitcher.tsx`, `app/data/language/*.json`)
  - 透過語系 Context 切換繁中、英文、印地文與德文等多種介面語言。
- **Python-assisted product intel / Python 輔助產品情報** – Call the bundled `ProductInformation/analyze_cli.py` scraper through an API route to enrich product records by fetching metadata from supplier pages. (`app/api/products/analyze_product_info/route.ts`)
  - 以 API 呼叫內建的 Python 爬蟲 `ProductInformation/analyze_cli.py`，自動抓取供應商資料增補產品資訊。

## Page Reference & API Map / 頁面與 API 對照

### Public Routes / 公開頁面

#### `/account` – Account portal / 帳號入口
- **Purpose / 用途**: User login and session bootstrap before redirecting into the protected workspace. / 供使用者登入並在進入受保護工作區前建立 Session。
- **API calls / 使用 API**:
  - `GET /api/auth/me` – Reads the current session cookie and returns the authenticated profile. / 讀取現有 Session Cookie 並回傳已驗證的使用者資料。
  - `POST /api/auth/login` – Submits credentials, issues the `session` JWT cookie, and broadcasts an auth-change event to the shell. / 提交帳密、簽發 `session` JWT Cookie，並通知外層殼層登入狀態變更。

#### `/device-registration` – Device ID registration / 裝置註冊
- **Purpose / 用途**: Self-serve kiosk registration that assigns a UUID and friendly name before allowing short-term loans. / 讓自助裝置取得 UUID 與顯示名稱，才能進行短期租借。
- **API calls / 使用 API**:
  - `GET /api/devices?id={deviceId}` – Checks whether the generated device ID already exists; auto-redirects when registered. / 檢查產生的 deviceId 是否已存在，若已註冊則自動導向下一步。
  - `POST /api/devices` – Persists the device ID/name pair. / 儲存裝置識別碼與名稱。

### Protected Routes / 受保護頁面

#### `/` – Feature launchpad / 功能總覽
- **Purpose / 用途**: Static navigation grid for privileged users. / 顯示主要功能的導覽看板。
- **API calls / 使用 API**: None – this page only links to other routes. / 無直接 API 呼叫，僅提供超連結。

#### `/inventory` – Inventory dashboard & actions / 庫存儀表板與操作
- **Purpose / 用途**: Searchable inventory tables with aggregated/individual views, transfer and discard workflows, and IAMS tagging. / 可搜尋的庫存表格（彙總／個別模式）、轉移與報廢流程，以及 IAMS 標籤管理。
- **API calls / 使用 API**:
  - `GET /api/inventory/pm?status=…&q=…` – Lists property-managed stock records for the current filter. / 依條件列出財產管理品項。
  - `GET /api/inventory/nonpm?status=…&q=…` – Lists non-property-managed stock groups with quantity aggregates. / 依條件列出非財產品項與數量。
  - `PATCH /api/inventory/pm/iams` – Saves edited IAMS tag IDs per stock record. / 儲存個別庫存項目的 IAMS 標籤。
  - **Discard modal / 報廢彈窗**
    - `POST /api/inventory/discard` – Confirms scrap actions for PM / non-PM selections. / 對財產與非財產項目提交報廢。
  - **Transfer modal / 轉移彈窗**
    - `GET /api/locations/tree` – Loads the latest selectable location tree. / 取得可用的儲位樹。
    - `POST /api/inventory/transfer` – Moves selected items into a new location. / 將指定庫存轉移至新儲位。

#### `/inventory/add` – Stock intake / 新增庫存
- **Purpose / 用途**: Adds property-managed singles or quantity-based non-property stock via drag-and-drop drafts. / 透過拖放草稿新增財產單件或非財產數量。
- **API calls / 使用 API**:
  - `GET /api/products?isPM=true|false&q=…&page=…` – Paginates candidate products for PM and non-PM columns. / 分別分頁取得財產與非財產可用商品清單。
  - `POST /api/inventory/add` – Persists drafted stock additions for both categories. / 提交草稿並寫入兩類庫存。

#### `/long-term` – Long-term rentals / 長期租借作業
- **Purpose / 用途**: Handles borrowing and returning workflows with due dates, borrower/operator attribution, and outstanding loan visibility. / 管理長期借出與歸還流程，含到期日、借出人／經手人資訊與未結清清單。
- **API calls / 使用 API**:
  - `GET /api/inventory/pm?status=in_stock&q=…` – Sources available property-managed stock for loans. / 取得可借出的財產項目。
  - `GET /api/inventory/nonpm?status=in_stock&q=…` – Sources available non-property stock and remaining caps. / 取得可借出的非財產項目與剩餘可借數。
  - `POST /api/rentals/long-term/loan` – Creates loan records for all drafted items. / 依草稿批次建立長期借出紀錄。
  - `GET /api/rentals/long-term/open/pm?…` – Lists active property-managed loans for return processing. / 取得仍在外的財產借出清單供歸還作業。
  - `GET /api/rentals/long-term/open/nonpm?…` – Lists active non-property loans grouped by product/location. / 取得仍在外的非財產借出分組資料。
  - `POST /api/rentals/long-term/return` – Records returns (with quantities for non-PM). / 提交歸還動作，並處理非財產數量。

#### `/short-term` – Short-term kiosk / 短期自助借還
- **Purpose / 用途**: Device-aware kiosk for scanning QR codes, borrowing, extending, and returning items in hours-long sessions. / 供裝置識別的自助機掃碼借出、展延與歸還短期租借。
- **API calls / 使用 API**:
  - `GET /api/rentals/short-term/active?includeDeviceNames=1` – Streams active loans plus device-name mappings for “My Loans” and “All Active”. / 取得目前租借中清單及裝置名稱對照，用於「我的租借」與「全部活動中」。
  - `GET /api/devices/verify?deviceId=…` – Confirms the kiosk/device registration before allowing borrowing. / 借出前確認裝置是否已註冊。
  - `POST /api/rentals/short-term/borrow` – Creates a new short-term rental tied to the device ID. / 依裝置識別建立短期租借。
  - `POST /api/rentals/short-term/extend` – Extends the due time by three hours (guarded by policies). / 依規則展延三小時。
  - `POST /api/rentals/short-term/return` – Marks a rental as returned. / 完成短期租借歸還。

#### `/short-term/qrcodes` – QR batch generator / 短期 QR Code 產生器
- **Purpose / 用途**: Produces printable QR labels for property-managed stock with sizing and base-origin options. / 為財產項目產生可列印 QR 標籤，並可設定尺寸與網址來源。
- **API calls / 使用 API**:
  - `GET /api/qrcode/short-term/pm?…` – Returns SVG/PNG payloads for the requested stock IDs. / 依參數回傳對應庫存的 SVG/PNG 內容。

#### `/qrcode/print` – Print layout for QR batches / QR Code 列印版面
- **Purpose / 用途**: Dedicated print-ready grid fed by selections from the QR generator. / 供列印 QR 批次的專用版面。
- **API calls / 使用 API**:
  - `GET /api/qrcode/short-term/pm?…` – Prefetches all QR assets to embed on the page before printing. / 預先載入所有選定 QR 資源以便列印。

#### `/products` – Product catalogue / 產品清單管理
- **Purpose / 用途**: Full CRUD surface with usage guards, analyzer integration, and optional image uploads. / 提供具使用限制檢查的產品 CRUD、整合資料分析器並支援圖片上傳。
- **API calls / 使用 API**:
  - `GET /api/products/sort?isPM=…&q=…&page=…&limit=…&sortBy=…&sortDir=…` – Retrieves the paginated, sorted catalogue. / 依條件取得分頁與排序後的商品清單。
  - `GET /api/products/usage?ids=…` – Returns stock usage, deletion locks, and short-term status flags. / 回傳每個商品的庫存使用量、刪除限制與短期租借鎖定資訊。
  - `POST /api/products/sort` – Creates a new product entry. / 新增商品。
  - `POST /api/products/sort/{id}/image` – Uploads an optional hero image for the created/edited product. / 上傳對應商品的主圖片。
  - `POST /api/products/analyze_product_info` – Invokes the Python scraper to prefill fields from a supplier URL. / 呼叫 Python 爬蟲自供應商網址帶入欄位。
  - `PATCH /api/products/sort/{id}` – Updates product metadata (respecting usage locks). / 更新商品資料並遵守使用鎖定規則。
  - `DELETE /api/products/sort/{id}` – Removes a product when no blocking usage exists. / 在無使用限制時刪除商品。

#### `/products-overview` – Datasheet overview / 產品資料庫概覽
- **Purpose / 用途**: Visualises datasheet coverage per product and manages file bundles (images, PDFs, videos). / 彙總每個產品的資料檔覆蓋率並管理附件（圖片、PDF、影片）。
- **API calls / 使用 API**:
  - `GET /api/products-overview?isPM=…&q=…&page=…` – Lists products with coverage statistics. / 依條件列出產品與附件覆蓋統計。
  - `GET /api/product-files?productId={id}` – Fetches the grouped attachment metadata for a product. / 取得指定產品的附件明細。
  - `POST /api/product-files` – Creates a new product-file bundle or uploads additional assets. / 新增產品附件資料夾或上傳新檔案。
  - `PATCH /api/product-files` – Renames folders/files, reorders entries, and uploads replacements. / 重新命名資料夾／檔案、調整排序並可補上新檔案。
  - `DELETE /api/product-files?id={id}` – Deletes an entire product-file record and its stored assets. / 刪除整筆產品附件與對應實體檔案。

#### `/locations` – Location tree manager / 儲位樹管理
- **Purpose / 用途**: Drag-and-drop editor for the hierarchical storage map with root locking and usage badges. / 提供多層儲位拖曳編輯，支援根節點鎖定與使用量徽章。
- **API calls / 使用 API**:
  - `GET /api/locations` – Loads the canonical storage tree. / 載入標準儲位樹。
  - `POST /api/locations` – Saves edited tree structures after validation. / 驗證通過後儲存更新的儲位結構。
  - `GET /api/locations/usage` – Returns per-node stock counts to block unsafe deletions. / 取得每個節點的庫存數以阻擋不安全的刪除。

#### `/FAQs` – Knowledge base / 知識庫管理
- **Purpose / 用途**: Curates Markdown Q&A articles with media attachments, ordering, and search. / 管理附帶媒體的 Markdown Q&A 文章，支援排序與搜尋。
- **API calls / 使用 API**:
  - `GET /api/qa` – Loads all QA entries and their ordering metadata. / 取得全部 QA 條目與排序資訊。
  - `POST /api/qa` – Creates a new QA article. / 建立新的 QA 文章。
  - `PATCH /api/qa/{id}` – Updates an existing QA article. / 更新既有 QA 文章。
  - `DELETE /api/qa/{id}` – Removes an article and its references. / 刪除 QA 條目及相關連結。
  - `POST /api/qa/upload` – Uploads supporting images or videos used inside Markdown content. / 上傳 Markdown 內容使用的圖片或影片。
  - `POST /api/qa/reorder` – Persists drag-and-drop ordering changes. / 儲存拖曳後的排序調整。

#### `/admin` – Administrative console / 管理控制台
- **Purpose / 用途**: Hosts data import/export tooling, short-term rental oversight, and manual account management. / 提供資料匯入匯出、短期租借監控與手動帳號管理。
- **API calls / 使用 API**:
  - **Data I/O / 資料匯入匯出**
    - `POST /api/sys/maintenance` – Toggles maintenance banners during destructive imports. / 匯入期間切換維護模式橫幅。
    - `GET /api/data/export?format=zip&files=referenced&qa=referenced` – Streams the full asset-inclusive export bundle. / 匯出含附件的完整資料包。
    - `GET /api/data/export?format=json` – Retrieves a JSON snapshot for diffing. / 取得 JSON 快照以利差異比較。
    - `POST /api/data/import` – Uploads the reviewed bundle and applies changes. / 上傳審核後的壓縮包並套用變更。
  - **Short-term admin / 短期租借總覽**
    - `GET /api/rentals/short-term/active?includeDeviceNames=1` – Mirrors kiosk data with device display names for auditing. / 與自助機同步取得租借清單及裝置名稱供稽核。
    - `POST /api/rentals/short-term/return` – Lets admins close any active rental (with audit headers). / 讓管理者結束任一租借，並附帶稽核標頭。
  - **User accounts / 使用者帳號**
    - `POST /api/users/register/init` – Sends verification codes for new accounts. / 寄送註冊驗證碼。
    - `POST /api/users/register/verify-only` – Confirms the code without setting a password yet. / 驗證註冊碼但尚未設定密碼。
    - `POST /api/users/register/complete` – Finalises registration with credentials. / 完成註冊並設定密碼。
    - `POST /api/users/reset/init` – Initiates password reset emails. / 寄送密碼重設驗證碼。
    - `POST /api/users/reset/verify-only` – Validates the reset code. / 驗證重設碼。
    - `POST /api/users/reset/complete` – Sets a new password using the issued ticket. / 使用票證設定新密碼。

## Tech Stack / 技術棧
- **Framework / 框架**: Next.js 15 (App Router), React 19
- **Database / 資料庫**: PostgreSQL with Prisma ORM
- **Styling / 樣式**: Tailwind CSS 4 + 自訂 CSS modules
- **State/data / 狀態與資料處理**: React hooks、類 SWR 的自製 `useJson` helper
- **Auth & security / 認證與安全**: 使用 `jose` 簽署的 JWT Cookie、bcrypt 雜湊、middleware 路由保護
- **Utilities / 工具**: Zod 驗證、Nodemailer 郵件、dnd-kit 拖放、lucide-react 圖示、QRCode 生成、Archiver/Adm-Zip 資料打包
- **Automation / 自動化**: Python 3 + requests/BeautifulSoup 產品分析腳本

## Repository Layout / 專案結構
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
```
app/                     # App Router 路由（含公開與受保護）與 API 處理器
features/                # 路由使用的前端功能模組
hooks/                   # 可重複使用的 React Hooks（例如輕量 JSON 取得）
lib/                     # 伺服器工具：驗證、Prisma Client、郵件、設定助手
prisma/                  # Prisma Schema 與遷移檔
public/                  # 靜態資產（產品圖片、檔案、QA 媒體、圖示）
ProductInformation/      # 供 API 整合使用的 Python 資料分析 CLI
styles/, src/            # 共用樣式與元件
```

## Prerequisites / 前置需求
- **Node.js** ≥ 20.19.0 (satisfies Next.js 15, Prisma 6, yargs 18, etc.)
- **npm** (or another compatible package manager)
- **PostgreSQL** 13+ reachable via `DATABASE_URL`
- **Python** 3.10+ with `requests` and `beautifulsoup4` for the analyzer script

- **Node.js** 版本需 ≥ 20.19.0（符合 Next.js 15、Prisma 6、yargs 18 等套件需求）
- **npm** 或其他相容的套件管理工具
- **PostgreSQL** 13 以上，並可透過 `DATABASE_URL` 連線
- **Python** 3.10 以上，且安裝 `requests` 與 `beautifulsoup4` 供分析腳本使用

> Recommended runtime: the repository includes an `.nvmrc` pinned to Node.js 20.19.0 so `nvm use` / `fnm use` automatically selects a compatible version.

> 建議使用版本：專案內含 `.nvmrc` 並固定在 Node.js 20.19.0，可透過 `nvm use`／`fnm use` 自動切換到相容環境。

## Environment Variables / 環境變數
Create a `.env` / `.env.local` file in the project root. The most important variables are:

A starter `.env.example` is provided—copy it to `.env.local` (or `.env`) and adjust secrets as needed.

請在專案根目錄建立 `.env` 或 `.env.local` 檔案，以下為主要環境變數：

專案提供 `.env.example` 範本，可複製為 `.env.local`（或 `.env`）後再依需求調整密鑰。

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

| 變數 | 是否必填 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Prisma 連線用 PostgreSQL 字串。 |
| `AUTH_SECRET` | ✅ | 32 字元以上的密鑰，用於簽署使用者 Session JWT 與驗證票證。 |
| `ROOT_LOCATION_ID` | ✅ | 根儲位的 UUID，啟動時會驗證格式。 |
| `NEXT_PUBLIC_ROOT_LOCATION_ID` | 選填 | 將根儲位 UUID 暴露給前端，用於鎖定儲位樹。 |
| `NEXT_PUBLIC_BASE_ORIGIN` / `APP_BASE_ORIGIN` / `BASE_ORIGIN` | 選填 | 產生 QR Code 時優先使用的主機位址。 |
| `PREFERRED_HOSTPORT` | 選填 | 離線或開發環境生成 QR Code 時的預設 host:port（預設 `172.30.10.16:3000`）。 |
| `APP_NAME` | 選填 | 郵件通知中的顯示名稱，預設為 `Inventory`。 |
| `APP_URL` | 選填 | 郵件範本中使用的基底網址。 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | 條件式 | 電子郵件驗證與重設所需的 SMTP 設定，需提供主機、埠號與寄件者；若為開放式 relay 可省略帳密。 |
| `PYTHON` | 選填 | 覆寫產品分析 API 使用的 Python 執行檔（預設 `python3`）。 |

> Tip: also export `NEXT_PUBLIC_*` variants for any env values required in the browser.

> 小提醒：若前端需要使用環境變數，請同步設定對應的 `NEXT_PUBLIC_*` 前綴。

`DATABASE_URL` defaults in the example file line up with the Docker helper below, so you can run a local database without extra setup.

範本檔案中的 `DATABASE_URL` 會對應下方的 Docker 輔助工具，讓你免額外設定即可啟動本地資料庫。

A minimal development snippet looks like:

以下為開發環境範例設定：

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

## Getting Started / 快速開始
> If you use `nvm`, run `nvm use` (or `nvm install`) beforehand to honour the pinned Node.js version.

> 若使用 `nvm`，建議先執行 `nvm use`（或首次執行 `nvm install`）以套用固定的 Node.js 版本。

1. **Install dependencies / 安裝套件**
   ```bash
   npm install
   ```
3. **Generate Prisma client / 產生 Prisma Client** (rerun when the schema changes / Schema 變更時需重新執行)
   ```bash
   npx prisma generate --schema prisma/schema.prisma
   ```
4. **Apply migrations / 套用資料庫遷移**
   ```bash
   # During development: creates or updates the local database / 開發環境：建立或更新本機資料庫
   npx prisma migrate dev --schema prisma/schema.prisma

   # In staging/production pipelines / 佈署環境：套用既有遷移
   npx prisma migrate deploy --schema prisma/schema.prisma
   ```
5. **Run the development server / 執行開發伺服器**
   ```bash
   npm run dev
   ```
   The app listens on http://localhost:3001 by default.
   預設服務位址為 http://localhost:3001。
6. **Build for production / 建置正式版**
   ```bash
   npm run build
   npm run start  # serves on port 3000 with Next.js / Next.js 於 3000 埠提供服務
   ```

### Optional: Dockerized PostgreSQL helper / Docker 化 PostgreSQL 輔助工具（選用）

To launch a ready-to-use Postgres 15 instance with credentials that match `.env.example`, run:

如需快速啟動與 `.env.example` 相容的 Postgres 15 容器，可執行：

```bash
docker compose up -d db
```

Stop it afterwards with `docker compose down`.

結束開發時可使用 `docker compose down` 停止容器。

## Quality & Tooling / 品質與工具
- `npm run lint` – Next.js ESLint suite / Next.js ESLint 規則檢查
- `npm run build` – Type-checks and compiles the production bundle / 進行型別檢查並建置生產套件

## Data Import / Export / 資料匯入與匯出
- `POST /api/data/import` accepts a zip bundle containing JSON exports and related assets (`product_images/`, `product_files/`, `qa/`). Files are normalised and written to `public/…` folders.
  - `POST /api/data/import` 接受包含 JSON 與相關資產（`product_images/`、`product_files/`、`qa/`）的壓縮檔，系統會正規化路徑並寫入 `public/…` 目錄。
- `GET /api/data/export` streams a zip bundle of the same shape, deduplicating attachments and filtering QA dependencies.
  - `GET /api/data/export` 會匯出相同結構的壓縮檔，包含去除重複的附件與過濾後的 QA 依賴。
- Admins can trigger these workflows through the Data I/O section of the `/admin` UI.
  - 管理者可在 `/admin` 介面的 Data I/O 區啟動上述流程。

## Authentication & Accounts / 認證與帳號管理
- User registration flows issue short-lived verification codes via email and store hashed secrets in the Prisma `User` model.
  - 使用者註冊會透過電子郵件寄送短效驗證碼，並將雜湊後的密碼儲存在 Prisma `User` 模型。
- Password resets reuse the same ticket pipeline with purpose flags for safety.
  - 密碼重設沿用相同的票證流程，並附加用途標記以確保安全。
- Protected routes (e.g. `/admin`, `/api/admin/*`) rely on middleware that validates the `session` JWT cookie and redirects unauthenticated users back to `/account` with a return URL.
  - 受保護路由（如 `/admin`, `/api/admin/*`）使用 middleware 驗證 `session` JWT Cookie，未登入者會被導向 `/account` 並附帶回傳網址。

## Rentals & Device Flows / 租借與設備流程
- The short-term kiosk UI stores a `deviceId` cookie/localStorage entry, uses QR codes for stock lookup, and polls rental APIs for real-time statuses.
  - 短期租借自助機介面會儲存 `deviceId` Cookie/LocalStorage、透過 QR Code 查詢庫存、並輪詢租借 API 取得即時狀態。
- Long-term rentals expose dedicated endpoints for loan, return, and extension operations under `app/api/rentals/`.
  - 長期租借提供專用 API，涵蓋借出、歸還與展延等操作，皆位於 `app/api/rentals/`。
- `/api/devices` lets you pre-register kiosk devices or update friendly names.
  - `/api/devices` 可預先註冊自助機設備或更新顯示名稱。

## QR Code Utilities / QR Code 工具
- `GET /api/qrcode/stock/:stockId` emits SVG/PNG images. Optional query params: `size`, `margin`, `format`, `base` (override origin). Defaults fall back to forwarded headers or `PREFERRED_HOSTPORT`.
  - `GET /api/qrcode/stock/:stockId` 會輸出 SVG/PNG 圖檔，並支援 `size`、`margin`、`format`、`base` 等參數（可覆寫來源網址），預設取自轉發 Header 或 `PREFERRED_HOSTPORT`。
- Additional endpoints under `/api/qrcode/short-term` generate batch codes for property-managed vs. non-managed stock.
  - `/api/qrcode/short-term` 下的其他端點可批次產生管理資產與非管理資產的 QR Code。

## Product Intelligence Analyzer / 產品情報分析器
- `POST /api/products/analyze_product_info` with `{ "url": "https://supplier.example/item" }` launches the Python scraper which returns structured metadata (price, images, specs).
  - `POST /api/products/analyze_product_info` 並傳入 `{ "url": "https://supplier.example/item" }` 會啟動 Python 爬蟲，回傳結構化資訊（價格、圖片、規格）。
- The analyzer needs outbound HTTP access plus the `requests` and `beautifulsoup4` packages; install them with `pip install -r ProductInformation/requirements.txt` (create this file listing dependencies if absent).
  - 分析器需能對外發出 HTTP 請求，並安裝 `requests` 與 `beautifulsoup4` 套件；可使用 `pip install -r ProductInformation/requirements.txt` 安裝（若檔案不存在可自行建立並列出依賴）。

## Maintenance Mode / 維護模式
- Toggle maintenance banners via `POST /api/sys/maintenance` (body `{ "on": true, "message": "Upgrading DB" }`). The state persists in `.runtime/maintenance.json` and the `version` field increments on each toggle for live-refresh support.
  - 使用 `POST /api/sys/maintenance`（內容 `{ "on": true, "message": "Upgrading DB" }`）切換維護橫幅，狀態會儲存在 `.runtime/maintenance.json` 並於每次切換時遞增 `version` 以支援即時更新。
- Query current state with `GET /api/sys/maintenance`.
  - 可透過 `GET /api/sys/maintenance` 查詢目前狀態。

## Internationalisation / 國際化
- Wrap pages with `LanguageProvider` and render `LanguageSwitcher` to cycle supported locales.
  - 將頁面包在 `LanguageProvider` 中並使用 `LanguageSwitcher` 以切換支援語系。
- Translation dictionaries live in `app/data/language/*.json`; extend them or add new locale codes as needed.
  - 語系字典位於 `app/data/language/*.json`，可依需求擴充或新增語系。

## Troubleshooting / 疑難排解
- **Invalid ROOT_LOCATION_ID**: ensure the UUID matches an entry in your `Location` table; the app throws on boot if the format is wrong.
  - **ROOT_LOCATION_ID 無效**：請確認 UUID 存在於 `Location` 資料表且格式正確，否則應用程式會在啟動時失敗。
- **Email failures**: check SMTP env variables; the server logs a warning when mandatory fields are missing.
  - **郵件寄送失敗**：檢查 SMTP 相關環境變數，若缺少必要欄位伺服器會紀錄警告。
- **QR codes point to 172.30.10.16**: set `NEXT_PUBLIC_BASE_ORIGIN`/`APP_BASE_ORIGIN` to your deployment hostname.
  - **QR Code 指向 172.30.10.16**：請設定 `NEXT_PUBLIC_BASE_ORIGIN`/`APP_BASE_ORIGIN` 為實際部署主機名稱。
- **Python analyzer timeouts**: endpoints time out after 30s; verify the URL is reachable and consider caching results in your database.
  - **Python 分析器逾時**：API 預設 30 秒逾時，請確認目標網址可連線，必要時可在資料庫中快取結果。

---

Made with ❤️ for lab inventory teams that need a single pane of glass for assets, rentals, and documentation.

專為需要整合資產、租借與文件視角的實驗室團隊所打造。
