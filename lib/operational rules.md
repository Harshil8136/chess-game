# CF-ADMIN PROJECT — OPERATIONAL RULES & ARCHITECTURE BIBLE

> **Last Updated:** 2026-04-05
> **Research Sources:** Cloudflare Docs MCP, Supabase MCP, Cloudflare Bindings MCP, Tavily, Official Documentation

---

## 🚨 RULE #0 — THE ABSOLUTE LAW (NEVER VIOLATE)

**cf-admin is the Cloudflare-native version of admin-app. We can deeply review, understand how everything looks, works, and is designed in admin-app — however, WE NEVER, like NEVER, copy any single file or code from there.**

This is the **STRICTEST** rule and MUST be followed at ALL times:

- ✅ **ALLOWED:** Reference admin-app to understand features, flows, UX patterns, business logic concepts
- ✅ **ALLOWED:** Use MCP tools (Cloudflare Docs, Supabase, Tavily) and SKILLs to find the best Cloudflare-native approach
- ✅ **ALLOWED:** Build equivalent functionality from scratch using Cloudflare-optimized patterns
- ❌ **FORBIDDEN:** Copy-pasting any file, component, function, hook, schema, or code block from admin-app
- ❌ **FORBIDDEN:** Duplicating CSS, design tokens, or configuration verbatim from admin-app
- ❌ **FORBIDDEN:** Using admin-app files as templates with "find and replace" modifications

**Every line of code in cf-admin must be written fresh, optimized for the Cloudflare + Astro + Preact stack.**

---

## 🏢 PROJECT MISSION — SECURE ADMIN PORTAL, $0 INFRASTRUCTURE

**cf-admin is a production-ready, commercial-grade administrative portal built entirely on FREE tier services.** This is a standard admin product — architected so any project with a main site can plug in a professional admin portal. Designed to:

- ✅ Manage content, bookings, users, and site settings via secure dashboard
- ✅ Enforce multi-level RBAC (DEV > SuperAdmin > Admin > Staff) on every route
- ✅ Authenticate via Supabase GoTrue (Magic Link + Google/GitHub/Facebook OAuth)
- ✅ Block ALL unauthorized access — signup disabled, whitelist-only entry
- ✅ Refresh JWT tokens every 30 minutes, hard-expire sessions at 24 hours
- ✅ Run 24/7 at **$0/month** total infrastructure cost
- ✅ Deliver premium, animated, dark-themed admin experience
- ✅ Meet professional security, accessibility, and performance standards

**Every architectural decision optimizes for: maximum security + maximum quality + exactly ZERO ongoing cost.**

---

## 1. PROJECT IDENTITY

| Property | Value |
|----------|-------|
| **Name** | cf-admin (Madagascar Pet Hotel — Admin Portal) |
| **Purpose** | Cloudflare-native admin portal equivalent to admin-app |
| **Framework** | Astro 6.0+ with `@astrojs/cloudflare` adapter |
| **Rendering** | Full SSR (`output: 'server'`) — every route requires auth |
| **UI Islands** | Preact (3KB, React-compatible) for interactive components |
| **Hosting** | Cloudflare Workers |
| **Auth** | Supabase GoTrue (Magic Link + OAuth providers) |
| **Database** | Supabase PostgreSQL (shared project `pklzjomfwqzricpsyrrc`) |
| **Session Store** | Cloudflare KV (via Astro Sessions API) |
| **Cache** | Upstash Redis (free tier — 10K commands/day) |
| **Storage** | Cloudflare R2 (CMS image uploads — `madagascar-images` bucket → `cdn.madagascarhotelags.com`) |
| **CSS** | Tailwind CSS v4 via `@tailwindcss/vite` |
| **Design System** | "Obsidian Clarity" V4 — dark-first with violet accents |
| **Domain** | `secure.madagascarhotelags.com` (provisioned at v1.0) |
| **GitHub** | `Harshil8136/cf-admin-madagascar` (private) |
| **Worker Name** | `cf-admin-madagascar` (Harshil Cloudflare account) |

---

## 2. RELATIONSHIP TO OTHER PROJECTS

| Project | Role | Relationship |
|---------|------|-------------|
| **cf-astro** | Main customer-facing website | Shares Supabase project, D1 database, Hyperdrive binding |
| **admin-app** | Legacy admin portal (Next.js) | Reference for UX/features only — **NEVER copy code** |
| **nextjs-app** | Legacy main site (Next.js) | Reference only — no code sharing |

### Shared Resources
- **Supabase Project:** `pklzjomfwqzricpsyrrc` (same PostgreSQL instance)
- **D1 Database:** `madagascar-db` (ID: `67472110-4e86-44ad-942c-cdce861cb224`)
- **Hyperdrive:** ID `34e77b687f2740f4b86636bad393b950`
- **R2 Bucket:** `madagascar-images` → `cdn.madagascarhotelags.com` (CMS images, shared read/write)
- **Cloudflare Account:** Harshil

### Isolation Rules
- Admin tables use `admin_` prefix to avoid collision with cf-astro tables
- cf-admin has its own KV namespace for sessions (separate from cf-astro SESSION KV)
- cf-admin has its own Worker deployment (not shared with cf-astro)
- Each project has its own `wrangler.toml`, `.dev.vars`, and deployment pipeline

---

## 3. RBAC — ROLE-BASED ACCESS CONTROL

### Role Hierarchy (lower number = higher privilege)

| Role | Level | Badge Color | Hex | Permissions |
|------|-------|-------------|-----|-------------|
| **DEV** | 0 | Red | `#ef4444` | Full system access + dev tools + DB admin + user management |
| **SuperAdmin** | 1 | Gold | `#d4a017` | Full access + user management + settings |
| **Admin** | 2 | Purple | `#8b5cf6` | Content management + bookings + reports |
| **Staff** | 3 | Blue | `#3b82f6` | Read bookings + basic operations |

### Authorization Model (RBAC + PLAC)
1. **Supabase signup is DISABLED** in dashboard settings
2. Only users listed in `admin_authorized_users` table can access the portal. They are assigned a natural hierarchy level above.
3. SuperAdmin/DEV adds users to the whitelist with assigned roles.
4. **PLAC (Page-Level Access Control)** dynamically overlays explicit `GRANT` and `DENY` parameters to specific pages per user in D1 `admin_page_overrides`.
5. Access Maps are evaluated via Cloudflare KV with O(1) reads taking <0.5ms on `middleware.ts`. "Deny" values strictly overrule all naturally inherited hierarchies.
6. **Ghost Audit Engine** logs all sensitive mutations via `context.locals.runtime.waitUntil`. This occurs asynchronously after a 200 OK HTML payload fires back, preventing DB write latency from obstructing human UI experiences.
7. GoTrue issues JWTs for valid auth attempts; application layer validates the JWT against KV caches and role definitions.

### Session Security
| Setting | Value | Rationale |
|---------|-------|-----------|
| JWT Refresh | Every 30 minutes | `SESSION_REFRESH_INTERVAL_MS=1800000` |
| Max Session | 24 hours | `SESSION_MAX_LIFETIME_MS=86400000` |
| Storage | Cloudflare KV (Astro Sessions) | Edge-local, fast reads |
| SignOut | Destroys KV entry | No lingering tokens |

---

## 4. CLOUDFLARE FREE TIER — EXACT LIMITS & QUOTAS

> Identical to cf-astro. All data verified against official Cloudflare documentation (March 2026).

### 4.1 Workers (Compute)

| Metric | Free Limit |
|--------|-----------|
| Requests | **100,000/day** |
| CPU time per request | **10 ms** |
| Memory | 128 MB |
| Subrequests per request | 50 |
| Worker script size | 3 MB |
| Number of Workers | 100 per account |

### 4.2 KV (Sessions)

| Metric | Free Limit |
|--------|-----------|
| Keys read | **100,000/day** |
| Keys written | **1,000/day** |
| Storage per account | **1 GB** |

### 4.3 D1 Database (SQLite)

| Metric | Free Limit |
|--------|-----------|
| Rows read | **5 million/day** |
| Rows written | **100,000/day** |
| Storage | **5 GB** |

### 4.4 R2 Object Storage

| Metric | Free Limit |
|--------|-----------|
| Storage | **10 GB/month** |
| Reads | **10 million/month** |
| Writes | **1 million/month** |
| Egress | **FREE (always $0)** |

---

## 5. SUPABASE FREE TIER

| Metric | Free Limit |
|--------|-----------|
| Projects | **2 active** (cf-astro + cf-admin share 1 project) |
| PostgreSQL size | **500 MB** |
| Auth MAUs | **50,000** |
| File storage | **1 GB** |
| Edge Functions | **500,000/month** |
| RLS policies | **Unlimited** |

---

## 6. UPSTASH FREE TIER

| Metric | Free Limit |
|--------|-----------|
| Commands per day | **10,000** |
| Max data size | **256 MB** |
| Concurrent connections | 10 |
| Databases | 1 |

---

## 7. TECHNOLOGY STACK

### 7.1 Framework: Astro 6.0+ (Full SSR for Admin)

- `output: 'server'` — ALL routes are server-rendered (auth check required)
- Cloudflare adapter with native binding access
- Astro Sessions API backed by Cloudflare KV for session persistence
- No static pages — admin portal has zero public content

### 7.2 UI: Preact Islands

- 3KB gzipped vs 45KB+ for React runtime
- Full React API compatibility via `preact/compat`
- Use `client:load` for auth-critical UI (login form)
- Use `client:idle` for dashboard widgets

### 7.3 CSS: Tailwind CSS v4

- Runs via `@tailwindcss/vite` as a Vite plugin
- Uses `@theme` in `src/styles/global.css` for design tokens
- Dark-first "Obsidian Clarity" V4 palette with violet accent (`#8b5cf6`)

### 7.4 Auth: Supabase GoTrue

- Client-side: `@supabase/supabase-js` for login flows
- Server-side: service_role client for whitelist verification
- Providers: Magic Link, Google, GitHub, Facebook
- JWT refresh every 30 min, hard session expiry at 24 hours

### 7.5 Database Access

- Supabase PostgreSQL via Hyperdrive (connection pooling)
- Admin tables: `admin_authorized_users`, `admin_sessions`
- All tables have RLS enabled — service_role only
- D1 for non-PII operational data (future)

### 7.6 Environment Variables

```
# .dev.vars (local — gitignored)
PUBLIC_SUPABASE_URL=https://pklzjomfwqzricpsyrrc.supabase.co
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
TURNSTILE_SECRET_KEY=...
SITE_URL=https://secure.madagascarhotelags.com
```

Secrets in production: `wrangler secret put <KEY>`

---

## 8. CODE QUALITY RULES

### 8.1 TypeScript Strictness
- `moduleResolution: "bundler"` in tsconfig.json
- `any` type is **FORBIDDEN** (unless bypassing upstream type bug, documented)
- All Cloudflare bindings typed

### 8.2 File Naming
All file names must be unique and descriptive:
- ✅ `LoginForm.tsx`, `AuthLayout.astro`, `rbac.ts`
- ❌ `Form.tsx` (ambiguous), `index.tsx` (without context)

### 8.3 Component Architecture
- **Astro components** (`.astro`) for layout and static structure
- **Preact islands** (`.tsx`) only for interactive UI
- Use `client:load` for above-fold critical interactivity
- Use `client:idle` for below-fold widgets

### 8.4 Error Handling
- Never show white screens — use ErrorBoundary component
- Section-level boundaries: one broken widget never crashes the page
- API routes return structured JSON errors with proper HTTP status codes
- Users always have navigation to recover

### 8.5 Animation Standards
- All interactive elements must have smooth transitions
- Use `var(--duration-normal)` (200ms) for hover/focus states
- Use `var(--duration-slow)` (350ms) for page transitions
- Respect `prefers-reduced-motion` media query

---

## 9. SECURITY RULES

### 9.1 Secrets Management
- Local dev secrets in `.dev.vars` (gitignored)
- Production secrets via `wrangler secret put <KEY>`
- Never commit secrets; `.dev.vars` is in `.gitignore`

### 9.2 Auth Architecture
- Signup is **DISABLED** in Supabase dashboard
- Only `admin_authorized_users` whitelist members can authenticate
- Server-side whitelist check on every auth callback
- JWT validation + refresh via Supabase client
- Sessions stored in KV with 24-hour hard expiry

### 9.3 Route Protection
- Astro middleware checks session on EVERY non-public route
- Public routes: `/` (login), `/auth/callback`
- Everything else requires valid session + role check
- Failed auth → redirect to login with error message

### 9.4 Input Validation
- All form inputs validated server-side before processing
- Parameterized queries only — never string concatenation
- Turnstile protection on login form (magic link)

### 9.5 Content Security Policy
Defined in `public/_headers`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## 10. DESIGN SYSTEM — "OBSIDIAN COMMAND"

### Color Palette

| Token | Dark Value | Purpose |
|-------|-----------|---------|
| `surface-base` | `#060a0e` | Page background |
| `surface-raised` | `#0c1117` | Card/panel background |
| `surface-overlay` | `#131a22` | Modal/dropdown background |
| `surface-glass` | `rgba(12,17,23,0.72)` | Glassmorphism panels |
| `accent` | `#00d4ff` | Primary interactive color |
| `text-primary` | `#f0f4f8` | Headings, important text |
| `text-secondary` | `#8b9ab5` | Body text, labels |
| `text-tertiary` | `#5a6b83` | Hints, captions |

### Typography
- Primary: `Inter` (Google Fonts) — 400, 500, 600, 700, 800
- Mono: `JetBrains Mono` — code blocks, technical data

### Motion
- Fast: 120ms (micro-interactions)
- Normal: 200ms (hover, focus)
- Slow: 350ms (page transitions)
- Spring: `cubic-bezier(0.34, 1.56, 0.64, 1)` (bouncy elements)

### 10.1 Login Portal — V4 "Obsidian Clarity" Design Specification

The login page uses a **single-column, centered card** layout inspired by Clerk/Vercel auth flows. No split-screen, no sidebar — just a pristine glassmorphic card on a warm dark canvas.

#### Background & Ambient System

| Element | Spec |
|---------|------|
| **Base** | `#09090b` (zinc-950) — set via inline `style` on `<body>`, not Tailwind class |
| **Orb 1 (Violet)** | `radial-gradient` of `rgba(139,92,246,0.6)` → `rgba(99,102,241,0.2)`, `opacity-[0.12]`, `blur(90px)`, top-left bias |
| **Orb 2 (Rose)** | `radial-gradient` of `rgba(244,63,94,0.5)` → `rgba(236,72,153,0.15)`, `opacity-[0.08]`, `blur(80px)`, right-center |
| **Orb 3 (Cyan)** | `radial-gradient` of `rgba(6,182,212,0.4)` → `rgba(99,102,241,0.15)`, `opacity-[0.06]`, `blur(100px)`, bottom-center |
| **Orb Animation** | Slow `translate()` drift at 25s/30s/35s cycles per orb. Defined in `<style>` block in `AuthLayout.astro` |
| **Noise Texture** | SVG `feTurbulence` overlay at `opacity-[0.015]` for grain |

All orbs are `position: absolute` inside a `fixed inset-0 pointer-events-none z-0` container.

#### Glassmorphic Card

```
background:  rgba(255,255,255,0.035)
border:      1px solid rgba(255,255,255,0.08)   /* border-white/[0.08] */
backdrop:    blur(40px)
radius:      rounded-2xl (1rem)
padding:     p-10 sm:p-12
max-width:   max-w-[440px]
box-shadow:  0 0 0 1px rgba(139,92,246,0.06),   /* violet inner ring */
             0 20px 50px rgba(0,0,0,0.5),        /* depth shadow */
             0 0 80px rgba(139,92,246,0.06),      /* violet ambient glow */
             0 0 120px rgba(99,102,241,0.03)      /* indigo far glow */
```

Card mounts with a CSS transition: `opacity 0→1`, `translateY(12px)→0`, `scale(0.98→1)` over 500ms.

#### Color Accent System

Primary accent: **Violet** (`#8b5cf6` / `rgba(139,92,246,*)`) — used consistently across all interactive elements:

| Element | Idle State | Active/Hover State |
|---------|-----------|-------------------|
| **Shield/Mail Icon BG** | `rgba(139,92,246,0.08)` bg + `rgba(139,92,246,0.15)` border | — |
| **Social Buttons** | `border-white/[0.08]` + `bg-white/[0.04]` | `hover:bg-violet-500/[0.06]` + `hover:border-violet-400/[0.2]` |
| **Input Focus Ring** | `border-white/[0.1]` | `border: rgba(139,92,246,0.4)` + `box-shadow: 0 0 0 3px rgba(139,92,246,0.1)` |
| **CTA Button (empty)** | `rgba(139,92,246,0.08)` bg + `rgba(139,92,246,0.12)` border | — |
| **CTA Button (filled)** | `linear-gradient(135deg, #fff, #f0e6ff)` | `box-shadow: 0 0 25px rgba(139,92,246,0.15)` |
| **Divider Lines** | Gradient: `transparent → rgba(139,92,246,0.15) → rgba(255,255,255,0.06)` | — |

#### Component Layout (top → bottom)

1. **Shield Icon** — `w-12 h-12 rounded-xl`, violet-tinted bg
2. **Heading** — `text-[22px] font-bold text-white tracking-tight`
3. **Subtext** — `text-[13px] text-white/45 font-medium`
4. **Social Buttons** — Full-width stacked (Google first, then GitHub), `py-3 rounded-xl`, `gap-3`
5. **Divider** — Gradient lines with `OR` label (`text-[11px] text-white/30 uppercase tracking-widest`)
6. **Email Input** — `px-4 py-3 rounded-xl`, `bg-rgba(255,255,255,0.03)`, violet focus ring
7. **CTA Button** — `py-3 rounded-xl font-semibold`, disabled=transparent violet / enabled=white-to-lavender gradient w/ glow

#### Auth Providers (Supabase GoTrue via `@supabase/ssr`)

| Provider | Method | Notes |
|----------|--------|-------|
| **Google** | `signInWithOAuth` + PKCE | Redirects to `/auth/callback` |
| **GitHub** | `signInWithOAuth` + PKCE | Redirects to `/auth/callback` |
| **Magic Link** | `signInWithOtp` | Shows "Check your email" confirmation card |

No password auth. No Facebook (removed). No signup.

#### Typography

```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11'  /* stylistic alternates for crisp rendering */
weights: 400 (body), 500 (labels), 600 (subheadings), 700 (headings/CTA)
```

Loaded via Google Fonts with `opsz` (optical sizing) axis: `Inter:opsz,wght@14..32,400..700`.

#### CSS Architecture — Critical Rules

1. **Global CSS** lives in `src/styles/global.css` — imported by `AuthLayout.astro`
2. **Tailwind v4** uses `@theme` block for design tokens and `@source` directives for component scanning
3. **⚠️ CRITICAL:** ALL base resets/styles MUST be inside `@layer base { }`. Unlayered CSS overrides Tailwind utilities and causes layout collapse (padding, margin, flex all break). This was the root cause of the original "squishy card" bug
4. **Animation keyframes** (`authFadeIn`, `orbDrift1-3`) are scoped inside `AuthLayout.astro`'s `<style>` block, NOT in global.css
5. **IDE lint warnings** for `@source`, `@theme` are false positives — Tailwind v4 syntax not yet recognized by CSS linters

#### File Map

| File | Purpose |
|------|---------|
| `src/layouts/AuthLayout.astro` | HTML shell, ambient orbs, noise texture, footer |
| `src/components/auth/LoginForm.tsx` | Preact island — full login UI + auth logic |
| `src/styles/global.css` | Tailwind v4 config, design tokens, dashboard CSS |
| `src/pages/index.astro` | Entry point — renders `<AuthLayout>` + `<LoginForm>` |
| `src/pages/auth/callback.astro` | OAuth redirect handler |

---

### 10.2 Dashboard & Navigation — V4 "Obsidian Clarity" Design Specification

The dashboard, sidebar, and topbar share the same V4 design tokens as the login portal but with adjusted intensities for daily-use comfort.

#### Accent Migration: Cyan → Violet

The entire design system was migrated from **Cyan** (`#00d4ff`) to **Violet** (`#8b5cf6`) as the primary accent. Cyan is retained as a secondary for health indicators only.

| Token | Old Value (Cyan) | New Value (Violet) |
|-------|-----------------|-------------------|
| `--color-accent` | `#00d4ff` | `#8b5cf6` |
| `--color-accent-hover` | `#33ddff` | `#a78bfa` |
| `--color-accent-muted` | `rgba(0,212,255,0.12)` | `rgba(139,92,246,0.12)` |
| `--color-border-accent` | `rgba(0,212,255,0.3)` | `rgba(139,92,246,0.3)` |

#### Ambient Background (Dashboard)

Same 3-orb system as login but at **50% opacity** to avoid distraction during extended use:

| Orb | Login Opacity | Dashboard Opacity |
|-----|--------------|------------------|
| Violet (top-left) | `0.12` | `0.06` |
| Rose (right) | `0.08` | `0.04` |
| Cyan (bottom) | `0.06` | `0.03` |

Defined in `AdminLayout.astro`'s `<style>` block using the same `orbDrift1-3` keyframes.

#### Glassmorphism System

New CSS tokens added to `@theme` for reusable glass patterns:

```
--color-glass:        rgba(255, 255, 255, 0.035)
--color-glass-border: rgba(255, 255, 255, 0.08)
--color-glass-hover:  rgba(255, 255, 255, 0.06)
```

Used by: `.stat-card`, `.health-bar`, `.quick-action-card`, `.dashboard-panel`

#### Sidebar

- **Background:** Glassmorphic with `@supports` fallback — uses `backdrop-filter: blur(20px)` if supported, falls back to solid `surface-raised`
- **Logo icon:** Violet stroke `#8b5cf6` with `rgba(139,92,246,0.08)` bg
- **Active item:** Violet bg `rgba(139,92,246,0.12)` + 3px violet accent bar
- **Hover:** `rgba(139,92,246,0.06)` background tint
- **Border:** `1px solid rgba(139,92,246,0.06)` instead of generic border-subtle

#### TopBar

- **Glass:** `rgba(6,10,14,0.75)` bg with `blur(24px) saturate(1.5)`
- **Border:** `rgba(139,92,246,0.06)` bottom border for violet warmth
- **Avatar:** Violet/indigo gradient `linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.15))`
- **Dropdown:** Glassmorphic with `rgba(19,26,34,0.95)` bg + blur + violet ambient shadow + `revealDown` animation

#### Dashboard Widgets

| Widget | Key Treatment |
|--------|---------------|
| **StatCard** | Glass bg, violet hover glow (`0 12px 32px rgba(0,0,0,0.3), 0 0 30px rgba(139,92,246,0.06)`), `translateY(-3px)` lift, tabular nums |
| **QuickActions** | Glass bg, violet icon containers (`rgba(139,92,246,0.08)`), violet arrow on hover |
| **ActivityFeed** | Violet avatar gradient, violet row hover tint (`rgba(139,92,246,0.03)`) |
| **SystemHealthBar** | Glass bg, retained green/amber health dots |
| **Greeting** | Gradient text on name: `linear-gradient(135deg, #f0f4f8, #a78bfa)` via `-webkit-background-clip: text` |

#### File Map (Dashboard)

| File | Purpose |
|------|---------|
| `src/layouts/AdminLayout.astro` | HTML shell, ambient orbs (50% opacity), noise texture |
| `src/components/navigation/Sidebar.tsx` | Preact island — collapsible nav, violet accents |
| `src/components/navigation/TopBar.tsx` | Preact island — glassmorphic header + user menu |
| `src/components/dashboard/StatCard.tsx` | KPI card with glassmorphic hover glow |
| `src/components/dashboard/ActivityFeed.tsx` | Recent admin sessions with violet avatars |
| `src/components/dashboard/SystemHealthBar.tsx` | Infrastructure status indicators |
| `src/components/dashboard/QuickActions.tsx` | RBAC-gated action shortcuts |
| `src/pages/dashboard/index.astro` | Dashboard page — server-side data + Preact islands |

---

## 11. DYNAMIC CMS & ISG/ISR ARCHITECTURE (cf-admin <> cf-astro)

cf-admin securely mutates data for the public-facing cf-astro site via a precise "$0 ISR Edge-Cache" mechanism.

### 11.1 The Shared Data Layer
- **Structured Content**: All CMS content (text, prices) is stored in the D1 `cms_content` table (shared with cf-astro).
- **Media/Images**: Uploaded and managed securely through the shared Cloudflare R2 `IMAGES` Bucket (`madagascar-images`).
- **RBAC**: Any mutation query is strictly gated by the active Supabase JWT role (`SuperAdmin` or `Admin`).

### 11.2 KV-Backed ISR Gateway (How it works)
We intentionally bypass native Cloudflare Cache API purging (which requires privileged Account-level Tokens) in favor of a KV-backed manual revalidation Gateway.
1. Admin saves changes in cf-admin UI.
2. cf-admin writes updates to the D1 `cms_content` table or R2.
3. cf-admin triggers a background webhook `POST https://madagascarhotelags.com/api/revalidate` with a shared secret (`REVALIDATION_SECRET`).
4. cf-astro receives the webhook, verifies the secret, and deletes the requested paths from its `ISR_CACHE` KV namespace.
5. The next request to cf-astro triggers an SSR rebuild using the fresh D1 data, delivering high performance (sub-10ms cache hits) and true CMS dynamism.

---

## 12. DEPLOYMENT RULES

### Build & Deploy
```bash
# Development
astro dev                    # Local dev with .dev.vars

# Type Check
astro check                  # TypeScript validation

# Build
astro build                  # Production build to ./dist

# Deploy
astro build && wrangler deploy  # Build + deploy to Cloudflare
```

### Git Workflow
- **Repository:** `https://github.com/Harshil8136/cf-admin-madagascar.git`
- `main` branch = production
- Feature branches for development
- `astro check` + `astro build` must pass before merge

### Environment
- `wrangler.toml` — Cloudflare bindings (D1, KV, Hyperdrive)
- `.dev.vars` — Local secrets (gitignored)
- `wrangler secret put <KEY>` — Production secrets

---

## 13. DOCUMENTATION ARCHITECTURE

| File/Folder | Purpose |
|-------------|---------|
| `RULES.md` | This file — operational bible |
| `ToDoAdmin.md` | Living progress tracker (what's done, what's next) |
| `README.md` | Quick start guide for developers |
| `documentation/` | Detailed technical documentation |
| `.agents/context/` | AI agent reference files |

### Documentation Folder Structure
```
documentation/
├── 00-architecture.md       # System overview, tech stack, diagrams
├── 01-setup-guide.md        # 5-step quickstart
├── 02-environment-vars.md   # Every .dev.vars key documented
├── 03-supabase-config.md    # Auth providers, RLS, table schemas
├── 04-cloudflare-resources.md  # D1, KV, R2, Hyperdrive setup
├── 05-rbac-system.md        # Role hierarchy, permission matrix
├── 06-error-handling.md     # Error boundary architecture
├── 07-deployment.md         # Build, deploy, DNS instructions
├── 08-limitations.md        # Free tier limits & constraints
└── 09-cms-isr-architecture.md # Dedicated doc for the KV CMS edge cache
```

---

## 14. MCP & SKILL USAGE GUIDE

### 14.1 Active MCP Tools

| MCP Name | Cost | When to Use |
|----------|------|-------------|
| `@mcp:tavily` | **FREE** | Web searches, deep research, data extraction |
| `@mcp:cloudflare-docs` | **FREE** | API signatures, platform limits |
| `@mcp:cloudflare-bindings` | **FREE** | Runtime binding patterns |
| `@mcp:supabase-mcp-server` | **FREE** | Database schema, RLS, Auth setup |
| `@mcp:upstash` | **FREE** | Redis management, rate limiting |
| `@mcp:sentry` | **FREE** | Error tracking setup |
| `@mcp:posthog` | **FREE** | Analytics queries |
| `@mcp:resend` | **FREE** | Email management |

### 14.2 Skills

| Skill | When to Use |
|-------|-------------|
| `astro/SKILL.md` | Astro CLI, project structure, adapters |
| `cloudflare/SKILL.md` | Cloudflare product selection, limits |
| `tailwind-design-system/SKILL.md` | Tailwind v4 @theme, component patterns |
| `systematic-debugging/SKILL.md` | First response to ANY bugs |
| `brainstorming/SKILL.md` | Design process (brainstorm → plan → build) |

### 14.3 Perplexity MCP — PAID SERVICE

`@mcp:perplexity-ask` costs real money. Use ONLY as last resort after exhausting all free tools.

**Priority Order:**
1. RULES.md → 2. SKILL.md files → 3. `@mcp:cloudflare-docs` → 4. `@mcp:tavily` → 5. Pre-trained knowledge → 6. `@mcp:perplexity-ask` (💰 LAST)

---

## 15. TOTAL MONTHLY COST — $0

| Service | What We Use | Monthly Cost |
|---------|------------|-------------|
| Cloudflare Workers | Hosting + SSR | **$0** |
| Cloudflare KV | Session storage & ISR Cache | **$0** |
| Cloudflare D1 | Operational data & CMS content | **$0** |
| Cloudflare R2 | CMS image storage (10GB free) | **$0** |
| Cloudflare Hyperdrive | DB connection pooling | **$0** |
| Supabase | Auth + PostgreSQL (shared) | **$0** |
| Upstash | Redis (rate limiting) | **$0** |
| GitHub | Source control | **$0** |
| | **TOTAL** | **$0.00** |

### Only Paid Service

| Service | Cost | Note |
|---------|------|------|
| Domain name | ~$10-15/year | One-time, shared with cf-astro |
| Perplexity MCP | Per-query | Minimize usage |

---

## 16. CMS IMAGE MANAGEMENT — cf-admin ↔ cf-astro BRIDGE

The CMS Image Management system enables authorized admin users to upload and replace images (Hero background, Gallery 1–6) on `cf-astro` from the `cf-admin` dashboard. All infrastructure remains $0.

### Architecture Summary

| Component | Role |
|-----------|------|
| **R2 Bucket** (`madagascar-images`) | Stores uploaded image binaries |
| **CDN Domain** (`cdn.madagascarhotelags.com`) | Public edge-cached delivery of R2 images |
| **D1 Table** (`cms_content`) | Stores CDN URLs with cache-busting timestamps |
| **ISR KV Cache** | HTML cache in cf-astro — purged on image update |
| **Revalidation Webhook** | `POST /api/revalidate` on cf-astro, protected by `REVALIDATION_SECRET` |

### Key Files

| File | Project | Purpose |
|------|---------|----------|
| `src/lib/cms.ts` | cf-admin | Upload to R2, write D1, trigger revalidation |
| `src/pages/api/media/upload.ts` | cf-admin | Image upload API endpoint |
| `src/pages/dashboard/content.astro` | cf-admin | Image Manager UI |
| `src/lib/images.ts` | cf-astro | Dynamic image URL resolver |
| `src/components/sections/Hero.astro` | cf-astro | Dynamic hero background |
| `src/components/sections/Gallery.astro` | cf-astro | Dynamic gallery carousel |

> 📖 **Full documentation:** [`documentation/CMS_IMAGE_MANAGEMENT.md`](./documentation/CMS_IMAGE_MANAGEMENT.md)

---

*End of Rules. These constraints must be acknowledged and followed for every task in cf-admin.*
