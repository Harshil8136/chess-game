# Manage Users & RBAC Architecture

> **Component:** CF-Admin Role-Based Access Control (RBAC) System
> **Framework:** Astro 6 + Preact + Cloudflare Workers
> **Auth Provider:** Supabase GoTrue (Admin API / Service Role)

This document details the exact flow and architecture for managing administrative access within the internal Madagascar Pet Hotel admin portal (`cf-admin`).

## 1. System Overview & Security Posture

The CF-Admin portal operates under strict zero-trust principles optimized for Cloudflare's serverless environment:
- **Signups Disabled:** General signups are completely disabled in the Supabase GoTrue dashboard. Nobody can randomly create an account.
- **Whitelist-Drive Authentication:** Application access is heavily gated by a custom D1/PostgreSQL `admin_authorized_users` whitelist table.
- **Service-Role Isolation:** Magic links, User Creations, and Roles are managed exclusively via the `service_role_key` accessed *only* server-side within the Cloudflare Worker running Astro.

## 2. Role Hierarchy

Access levels operate dynamically based on strict numeric permissions (lower number = higher clearance):

1. **DEV (0)** — Full system access, bypasses all restrictions, can see and manage all users. Invisible to lower-tier users.
2. **SUPER_ADMIN (1)** — Can manage lower-tier users, read metrics, update content, change prices.
3. **ADMIN (2)** — Can manage content, galleries, services. Cannot manage users.
4. **STAFF (3)** — Standard entry level, read-only metrics, minimal interaction.

## 3. The "Ghost ID" Concept (DEV Isolation)

To ensure operational security, users with the `DEV` role are treated as "Ghosts" within the application interface.
- 🚫 They **do not appear** in the user list for `SUPER_ADMIN` or lower queries.
- 🚫 `SUPER_ADMIN` cannot see, modify, or revoke `DEV` access.
- ✅ Only a logged-in `DEV` can see other `DEV` users and manage them. 

This is enforced securely via server-side Astro API endpoints by reading the active requester's JWT and applying hardcoded `WHERE` clause exclusions to the D1/Postgres retrieval queries.

## 4. User Lifecycle Management (API Architecture)

The `/api/users/manage` Astro SSR endpoint securely bridges Supabase GoTrue logic.

### 4.1 Inviting/Authorizing a New User
When a SuperAdmin adds a new member from the dashboard:
1. **Frontend Request:** UI validates inputs (Email, Role, Display Name).
2. **Endpoint Validation:** Endpoint verifies the requesting user is `DEV` or `SUPER_ADMIN`, and prevents elevation of privilege (cannot assign a role higher than their own).
3. **Whitelist Insertion:** User details are inserted into the `admin_authorized_users` table with `is_active = true`.
4. **GoTrue Admin Creation:** Since signups are disabled in the Supabase instance, the Worker calls the Supabase Admin API to forcefully register the user profile on the backend:
   ```typescript
   // 1. Create Auth user via service_role bypassing signup blocks
   const { data, error } = await adminClient.auth.admin.createUser({
     email: newUserEmail,
     email_confirm: true,
     user_metadata: { role: assignedRole }
   });
   
   // 2. Transmit Magic Link Programmatically via email provider
   const { data: linkData } = await adminClient.auth.admin.generateLink({
     type: 'magiclink',
     email: newUserEmail
   });
   ```

### 4.2 Restoring / Enabling Access
Instead of continuously deleting and re-creating users, access is managed via the `is_active` flag inside `admin_authorized_users`.
- When set to `true`, the `cf-admin` login portal accepts the JWT created by Supabase.

### 4.3 Revoking / Locking Access
If a user needs immediate revocation:
1. **Soft Lock:** Toggle `is_active = false` inside `admin_authorized_users`. Custom global sessions immediately reject the user during the Astro Middleware guard check without touching Supabase.
2. **Hard Lock (DB Revoke):** Optionally, the API calls `adminClient.auth.admin.deleteUser(uid)` to fully nuke their session pool in Supabase GoTrue for strict compliance with enterprise security.

## 5. UI Implementation (Manage Users Dashboard)

Housed within `/dashboard/users/index.astro`, the interface is built as a highly responsive Preact Island (`UsersManager.tsx`) featuring:

- **State Management:** Live fetching and tracking of users.
- **Glassmorphic Data Grids:** "Obsidian Clarity V4" themed grids.
- **Modal Add/Edit Actions:** Overlays for cleanly executing creation, utilizing `Turnstile`/server payload validations.
- **Toast Notifications:** Standardized success/failure animations bridging the `UserList` component interactions with API successes. 

## 6. Security Boilerplates & Error Flow

All actions within the API routes return specific `error` states handled elegantly by the UI:
- `401 Unauthorized` → Render standard "Session Expired" overlay.
- `403 Forbidden` → Render "Insufficient Permissions / Action Locked" when a SuperAdmin attempts an impossible action (e.g. promoting a user to DEV).
- `405 Method Not Allowed` → Block manual HTTP verb injections via Postman.
- `400 Bad Request` → Return `{ status: 'error', message: 'Invalid payload schema' }`. 

The entire flow has been structurally validated against the Cloudflare Workers architecture and conforms 100% to `$0 cost Edge-based constraints`.

## 7. Page-Level Access Control (PLAC) System

To ensure maximum long-term security, maintainability, and scalability across dozens of dashboard routes, `cf-admin` utilizes an integrated **PLAC (Page-Level Access Control)** system for per-user explicit overrides, acting as the ultimate single source of truth.

### 7.1 What is PLAC?
Rather than scattering hardcoded role checks or relying on a static `registry.ts` file, all pages and their baseline role requirements are declared in the D1 database `admin_pages` table. Super Admins and DEVs can grant or restrict access to specific, singular pages for a user, regardless of their foundational role.

- If an explicitly declared `DENY` override exists for a user on a route, it absolutely wins. A Super Admin could theoretically be locked out of a specific tool if explicitly denied.
- If a `GRANT` exists for a user, they bypass their natural constraint just for that page.
- If no override exists, the resolution seamlessly falls back to the baseline mapping defined in the `admin_pages` D1 registry.

### 7.2 Technical Implementation (O(1) Middleware)
To maintain our strict serverless limits:
1. When a user's role evolves or a new PLAC permission is provisioned in the UI, a D1 database query merges the constraints and computes a flat Hashmap `PageAccessMap`.
2. This resulting final `JSON` representation is immediately uploaded to and stored inside the user's Session in Cloudflare KV.
3. Every subsequent navigation query intercepted by `middleware.ts` merely verifies if `session.accessMap[request.pathname] === true`.
4. This keeps the D1 query burden isolated only to rare modification tasks and delivers blistering `<0.5ms` authentication latency routing for admins.
