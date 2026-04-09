# CMS & Booking Management Operations

## Overview
This document outlines the operational details for the backend management tools built into `cf-admin`. It covers how administrators interact with the CMS Content Studio to edit dynamic website content, how they govern customer bookings, and how the integration bridge safely propagates data to the `cf-astro` frontend.

---

## 1. Booking Management (`/dashboard/bookings`)

The Booking Management interface is a React/Preact island designed to provide real-time visibility into customer reservations pulled securely from the Supabase infrastructure layer.

### System Architecture
- **Data Source:** Supabase PostgreSQL (`bookings` and `booking_pets` tables).
- **Access Control:** RBAC gated. Only `admin`, `super_admin`, and `dev` roles are permitted to access this module.
- **API Endpoint:** `/api/bookings/index.ts`
- **Component:** `src/components/admin/BookingList.tsx`

### Capabilities
- **Summary Dashboard Stats:** The main `/dashboard` features live Key Performance Indicators (KPIs) showing **Total Bookings** and **Total Pets** directly bound to the database.
- **Server-Side Pagination & Search:** The backend gracefully filters pet names and customer info prior to transit, reducing payload overhead.
- **Expandable Detail Row:** Instead of navigating to a secondary page for pet details, each row expands inline cleanly via a collapsible UI, providing immediate context for medical, dietary, and behavioral notes.

---

## 2. Content Studio: Text & Visual Editor (`/dashboard/content`)

The Content Studio operates as the headless CMS interface over the D1 Database. Changes saved here dictate the content rendered on the global `cf-astro` application.

### Key Components
- **`ContentTabs`:** Navigates between Hero settings, Text Fields, Gallery Manager, Services & Pricing, and Happy Clients.
- **`ContentBlockEditor.tsx`:** A bulk-editing interface mapping over all generic text strings on a specific page.
- **`ServicesManager.tsx`:** Manage service pricing rules synchronized seamlessly with both the static marketing pages and the Preact Booking Wizard.
- **`ReviewsManager.tsx`:** Edit, add, and re-order "Stories from Happy Clients", which populates the dynamic Testimonials carousel on the public website.
- **API Endpoints:** 
  - `POST /api/content/blocks.ts` (Text blocks)
  - `POST /api/content/services.ts` (Pricing logic)
  - `POST /api/content/reviews.ts` (Happy clients JSON)
  - `POST /api/media/gallery.ts` (Gallery images JSON)
  - `POST /api/media/upload.ts` (Image upload to R2)

All 5 API endpoints use the **unified `revalidateAstro(env, ['/'])`** helper from `src/lib/cms.ts`, which auto-expands paths to include locale variants (`/en`, `/es`).

### Side-by-Side Live Preview
To provide immediate visual feedback without requiring the user to open a new tab, the Content Studio embeds an `iframe` of the `cf-astro` frontend logic utilizing the `?preview=true` parameter.
- **Save & Publish:** Changes made in the left-hand text boxes are strictly draft-state until "Save & Publish" is pressed.
- **Auto-Refresh:** Upon successful persistence to D1, the API immediately dispatches the ISR webhook buffer, and the iframe reloads with cache-busting timestamps appended (`v={Date.now()}`), instantly fetching the materialized edits.

---

## 3. The Integration Health Bridge

Cross-project reliability is monitored actively through a localized heartbeat check on the dashboard.
- The `cf-admin` main dashboard fetches `/api/health` from `PUBLIC_ASTRO_URL` upon load.
- If the `cf-astro` worker responds, the dashboard lights up as "Operational".
- A failure gracefully marks "cf-astro (Frontend)" as degraded, visually alerting the admin to a potential routing or deployment issue.

---

## 4. Troubleshooting Revalidation
If a save occurs in `cf-admin` but the iframe (or live site) doesn't catch the update:
1. Ensure `.dev.vars` contains identical strings for `REVALIDATION_SECRET` on both the `cf-admin` and `cf-astro` sides.
2. Confirm `PUBLIC_ASTRO_URL` correctly matches the actual active deployment URI for the worker (specifically ensuring `https://` is prepended and no trailing slash exists).
3. Check the CLI output for `[revalidateAstro]` log messages — these indicate webhook failures or missing secrets.
4. Verify the `ISR_CACHE` KV namespace is correctly bound in `cf-astro`'s `wrangler.toml`.
5. Confirm cf-astro's `/api/revalidate.ts` endpoint is deployed and responding to POST requests.
