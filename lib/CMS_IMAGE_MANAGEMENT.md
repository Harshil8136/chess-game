# CMS Image Management & Content Studio — Technical Documentation

> **Version:** 3.0 (Unified Sync Edition)
> **Last Updated:** 2026-04-07
> **Authors:** CMS Team  
> **Projects:** `cf-admin`, `cf-astro`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema (Infinite Scaling)](#database-schema-infinite-scaling)
3. [Content Studio Hub](#content-studio-hub)
4. [Preact Interactive Gallery UI](#preact-interactive-gallery-ui)
5. [Storage & CDN Flow](#storage--cdn-flow)
6. [Frontend Rendering (cf-astro)](#frontend-rendering-cf-astro)
7. [ISR Revalidation](#isr-revalidation)
8. [API Endpoints](#api-endpoints)

---

## Architecture Overview

The CMS Image Management system enables authorized admin users to manage the visual assets of `cf-astro` via a premium, lightning-fast dashboard built entirely within Cloudflare's **$0 Free Tier**.

Version 2.0 modernizes the system by moving away from hard-coded slots (`gallery_1`, `gallery_2`) into a highly flexible JSON-driven array mapped to D1. This enables **infinite** asset limits without ever needing to run new D1 SQL migrations.

**Core Stack:**
* **Database:** Cloudflare D1
* **Storage:** Cloudflare R2
* **Interactivity:** Preact + Native HTML5 Drag and Drop (`0kb` dependencies) 
* **Frontend:** Astro 6 + Vite

---

## Database Schema (Infinite Scaling)

### `cms_content` Table
```sql
CREATE TABLE IF NOT EXISTS cms_content (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'image_url', 'json')),
  content TEXT NOT NULL,
  last_updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Shift to JSON Arrays
To allow infinite gallery capacity, the gallery now stores a serialized JSON map in a single row under `id = 'gallery_images'` with `type = 'json'`:

**Example D1 Payload:**
```json
[
  { "id": "uuid-1", "src": "https://cdn.../hero.jpg", "alt": "Habitaciones" },
  { "id": "uuid-2", "src": "https://cdn.../play.jpg", "alt": "Área de juegos" }
]
```
This is easily fetched via `/api/media/gallery` and mapped gracefully on the `cf-astro` layout.

---

## Content Studio Hub

The original monolithic `content.astro` page has been sunset and refactored into a scalable routing hub (`/dashboard/content/*`) utilizing the **Midnight Slate** aesthetics:

1. **`/dashboard/content/index.astro`** — The Hero Background manager (LCP critical).
2. **`/dashboard/content/gallery.astro`** — The dynamic visual asset Drag-and-Drop manager.
3. **`/dashboard/content/services.astro`** — Services & Pricing editor (fully operational).
4. **`/dashboard/content/reviews.astro`** — "Happy Clients" testimonials editor.

---

## Preact Interactive Gallery UI

**File:** `cf-admin/src/components/admin/content/GalleryManager.tsx`

To mimic the high-end interactivity of our legacy systems while preserving strict performance budgets (under 5kb JS), the Gallery Editor relies entirely on **Preact** acting as an Astro Island (`client:load`). 

**Key Features:**
* **Native HTML5 Drag and Drop:** Infinite resorting capabilities utilizing pure browser-native `draggable={true}` and `onDragStart`/`onDragEnd` events.
* **Instant R2 Pushing:** Local asset uploads instantly hit `/api/media/upload` (via `slot="temp_gallery_upload"`) generating a permanent CDN linkage mapped locally.
* **Alt text assignment:** In-line editing natively mapped to state.
* **Optimistic Saves:** Upon clicking `Save Configuration`, the monolithic JSON array is pushed replacing the D1 map, instantly purging Edge Cache across all global datacenters.

---

## Storage & CDN Flow

### Production Domain
- **URL:** `https://cdn.madagascarhotelags.com`
- **Type:** R2 Custom Domain (Cloudflare-managed DNS)
- **Caching:** Cache-Everything page rule ensures edge caching is preserved natively.

**The Workflow:**
1. Image is locally uploaded using the Preact `GalleryManager`.
2. Form-data hits `POST /api/media/upload`.
3. Validation ensures `image/jpeg,png,webp,avif` only and sizes `≤5MB`.
4. R2 secures object as `gallery/{uuid}.ext`.
5. Preact appends `cdnUrl` natively.
6. The entire configuration is posted to `POST /api/media/gallery` persisting it into the D1 JSON string.

---

## Frontend Rendering (cf-astro)

### Helper: `cf-astro/src/lib/images.ts`

```typescript
// Fetches the dynamic JSON JSON array. Falls back to static presets if D1 is empty.
const galleryImages = await getGalleryImageUrls(db);
/* Returns: 
[
  { id: "uuid", src: "https://cdn...", alt: "..." },
  { id: "uuid", src: "https://cdn...", alt: "..." }
]
*/
```

### Component: `cf-astro/src/components/sections/Gallery.astro`
The main carousel now maps entirely dynamically, wrapping grid carousels natively without breaking styling regardless of whether you pass `1` or `100` items from the API.

```astro
{galleryImages.map((img, idx) => (
  // Carousel rendering
))}
```

---

## ISR Revalidation

All 5 Content Studio API endpoints (Hero upload, Gallery save, Services save, Reviews save, and Text blocks save) trigger ISR cache purge via a **single unified helper** in `src/lib/cms.ts`.

### Unified Helper Signature
```typescript
import { revalidateAstro } from '../../../lib/cms';

// Called identically in every endpoint:
await revalidateAstro(env, ['/']);
```

### Automatic Locale Path Expansion
The helper includes a built-in "Path Expansion Engine" that automatically generates locale variants:
- `'/'` → `['/', '/en', '/es']`
- `'/services'` → `['/services', '/en/services', '/es/services']`

This ensures that all cached locale pages are purged simultaneously — no stale translations.

> ⚠️ To add a new locale, update ONLY the `SITE_LOCALES` array in `src/lib/cms.ts`.

### Webhook Target
The helper posts to `{PUBLIC_ASTRO_URL}/api/revalidate` with `Authorization: Bearer {REVALIDATION_SECRET}`. cf-astro verifies the secret and deletes the matching `isr:*` keys from its `ISR_CACHE` KV namespace.

When changes resolve successfully, users visually receive green "CDN Global Purge" confirmed status updates.

---

## API Endpoints

### cf-admin 

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/media/gallery` | Admin+ (or PLAC grant) | Read `gallery_images` json from D1. |
| `POST` | `/api/media/gallery` | Admin+ (or PLAC grant) | Push new array to D1 `gallery_images` + Purge edge cache. |
| `POST` | `/api/media/upload` | Admin+ (or PLAC grant) | Upload image direct to R2 returning CDN url link. |

### cf-astro 

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/media/[...path]` | None | Dev-only proxy simulating the R2 bucket. |
| `POST` | `/api/revalidate` | Bearer Token | Force flush all statically cached worker KV routes. |
