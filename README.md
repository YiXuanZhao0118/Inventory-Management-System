
## Lab330 Optical Inventory

A Next.js (App Router)-based inventory and asset management system for optical laboratories.
Supports both Property-Managed (per-item) and Non-Property (quantity-based) modes, with features for stock adding, short-term/long-term rentals and returns, product gallery, QR generation/scanning, location tree management, file upload & browsing, and multi-language UI.

## Features Overview

    Multi-language UI: Traditional Chinese (zh-TW), English, Hindi, German (extensible)

    Device Registration: Generates deviceId on first open and registers via /device-registration

    Authentication: Simple username/password login page (with /admin for management)

    Auto Logout: Private pages auto-logout after 60 seconds of inactivity (configurable)


    Stock List (/stocks)

        Property: individual listing with stockId and IAMS tag fields

        Non-Property: aggregated by product × location with quantities

        Search, sort, QR scanning for quick access

    Add Inventory (/add_inventory)

        Select product and location tree; property mode fixed to 1 unit, non-property allows quantity

        QR scanning for quick input

    Short-Term Rental (/short_term)

        Scan stockId to rent to current device (deviceId)

        Shows "My Rentals" with countdown/overdue status; supports extend & return

    Long-Term Rental/Return (/long_term_rented)

        Rent: property (per stockId) or non-property (by quantity)

        Return: both modes supported with search & pagination

    Product Gallery (/products_overview)

        Group by brand, keyword search, QR scanning

        Context menu (right-click/long-press) for quick actions

        Product files: upload/sort (images, documents, videos), browse & preview

    QR Generator (/generate_QRcode)

        Generate QR codes for product IDs or stockIds, downloadable as SVG

## Architecture & Tech Stack

    Framework: Next.js (App Router) + React 18 + TypeScript

    Data Fetching: SWR

    Styling: Tailwind CSS

    QR Scanning: jsqr

    Drag & Drop: @dnd-kit/*

    QR Generation: qrcode.react

    Icons: lucide-react

    Offline Image Script: features/product/downloadProductImages.js


## Key Directory Structure

```bash

app/                      # App Router pages
  add_inventory/
  admin/
  device-registration/
  generate_QRcode/
  long_term_rented/
  products_overview/
  short_term_rented/
  stocks/
  data/
    database.json         # Sample data: products, stock, locations...
    productCategories.json
    rentalLogs.json
    transferLogs.json
    IAMS_property.json
    users.json
    device.json           # Registered devices (sample)
    language/             # Multi-language strings
        Language.json
        zh-TW.json
        en-US.json
        hi.json
        de.json
pages/                    # UI components used by app routes
    admin/
        AllRentalStatuses/
            AllRentalStatuses.tsx
        Location/
            LocationTree.tsx
        password/
            ChangePassword.tsx
            CreateAccount.tsx
        Product/
            AddProduct.tsx
            EditModal.tsx
            EditProducts.tsx
            EditProperty.tsx
        productCategories/
            productCategories.tsx
        Admin.tsx
    ProductGallery/
        components/
            CategoryFilter.tsx
            ContextMenu.tsx
            FileUploadModal.tsx
            ProductCard.tsx
            SearchBarWithScanner.tsx
            Upload.tsx
            useProductGallery.ts
            ViewSpec.tsx
        ProductGallery.tsx
    AddStockPage.tsx
    Discarded.tsx
    generateQRcode.tsx
    LocationPicker.tsx
    LongTermRentedPage.tsx
    LongTermReturnPage.tsx
    StockList.tsx
    ShortTermPage.tsx
    Transfers.tsx
    ProductGallery/*
public/
  product_images/         # Product images (downloaded by script)
  product_files/          # Uploaded product files

```

## Requirements

    Node.js ≥ 18

    npm / yarn / pnpm / bun

    HTTPS or localhost for camera access

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Development mode

```bash
npm run dev
```

Browse at: https:// IP :3000

3. (Optional) Offline product images
    Downloads products[].imageLink from app/data/Database.json into public/product_images and updates with localImage:

```bash
node features/product/downloadProductImages.js
```

4. Build & deploy

```bash
npm run build
npm start
```


## Core Workflows

Device Registration

    Generates deviceId on first run (stored in localStorage)

    Checks /api/device for registration; if not registered, redirects to /device-registration

Property vs Non-Property

    Property (isPropertyManaged = true): Each asset has a unique stockId

    Non-Property (false): Quantity managed by product + location combination

Rentals & Returns

    Short-term: Scan stockId → rent → countdown/overdue → extend/return

    Long-term: Property or non-property; supports both rent and return flows

Gallery & Files

    Grouped view, filtering, QR search

    Upload and sort images/docs/videos for each product

    File preview for images, PDFs, and videos

## API Endpoints (Frontend Contracts)

Example endpoints used by the frontend (backend can adapt as needed):

    GET /api/stocklist → { stock[], products[], locations[], iams[] }

    GET /api/addStock

    POST /api/addStock

    GET /api/locations

    GET /api/product-categories

    GET /api/rentals/rental / POST /api/rentals/rental

    GET /api/rentals/return / POST /api/rentals/return

    GET /api/rentals/short-term/available / GET /api/rentals/short-term/active

    POST /api/rentals/short-term/extend

    GET /api/device / POST /api/device

    GET /api/db

    POST /api/upload_product_files

    GET /api/list_product_files

    POST /api/login / GET /api/user / POST /api/account/create-user

## Settings & Parameters

Auto logout: app/layout.tsx → TIMEOUT_MS (default: 60s)

QRScanner settings:

    warmupMs (default: 600ms)

    confirmFrames (default: 2)

    regexFilter

    dedupeWindowMs, scanInterval, area, facingMode

File uploads: Stored in public/product_files/<productId>/...

Offline images: Stored in public/product_images/<productId>.jpg|png

## Multi-language (i18n)

Switch via top-right button

Language files: app/data/language/*.json

To add a language:

    1. Add {locale}.json

    2. Update Language.json with [code, label]

    3. Register in translationMap

## Known Issues & Notes

QR scanning requires HTTPS (or localhost)

Flashlight works only on supported devices/browsers

Hooks must be at top-level (avoid early returns before all hooks run)

## Development & Contribution

1. Fork & create a branch

2. Follow the project guidelines

3. Submit a PR with screenshots or steps to reproduce features

## License

Internal project — license terms TBD.

