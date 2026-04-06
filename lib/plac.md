# Page-Level Access Control (PLAC) & Ghost Audit Engine

> **System Status:** Production Ready
> **Last Updated:** April 2026

This document explains the technical implementation and operational rules of the CF-Admin Page-Level Access Control (PLAC) and the Ghost Audit Engine.

## 1. Page-Level Access Control (PLAC)

The PLAC system is a high-performance RBAC extension that allows granting or revoking access to specific pages on a per-user basis. It overrides the natural hierarchy matrix defined by the user's role.

### 1.1 Architecture & Performance

The core constraint of PLAC is that it must operate within the 10ms Cloudflare Worker CPU limit.
To achieve this, the system is designed around a **"Compute on Write, Read from Cache"** model.

*   **Middleware Read (O(1), <0.5ms):** On every request, `src/middleware.ts` reads a precomputed `PageAccessMap` from Cloudflare KV. The map is a flat JSON object (e.g., `{"/dashboard/users": false, "/dashboard/content": true}`). D1 is NEVER queried during a standard HTTP request sequence.
*   **D1 Computation (~2ms):** When an override is added, or when a user's role changes, a singular batched `LEFT JOIN` query calculates the net-effective permissions by merging the Role Baseline with User Overrides. The result is then cached in KV for 1 hour.

### 1.2 The "Deny Wins" Algorithm

Overrides have a boolean `grant` value (`1` for allowed, `0` for denied).

1.  **Is there an explicit DENY (0) for this user/page?** If yes, ACCESS IS BLOCKED. Even if the user is a Super Admin.
2.  **Is there an explicit GRANT (1) for this user/page?** If yes, ACCESS IS ALLOWED.
3.  **If no override exists:** Fall back to the natural role hierarchy. For example, a Staff user naturally lacks access to an Admin-required page.

*(Note: DEV users essentially bypass all restrictions at the code level, but DEV access should be considered a "Break Glass" capability, not for daily use.)*

### 1.3 Hierarchy-Enforced Provisioning

To prevent privilege escalation, the `POST /api/users/access` endpoint enforces four strict gates:

**Gate A: Actor Rank > Target Rank**
An admin cannot grant, revoke, or reset the permissions of someone at their own level or higher. (A Super Admin cannot restrict another Super Admin).

**Gate B: DEV Ghosting**
`DEV` tier users are invisible to `SUPER_ADMIN` and below. Only a `DEV` can alter another `DEV`.

**Gate C: Actor Page Visibility**
An admin cannot grant someone access to a page that the admin themselves is not authorized to see.

**Gate D: Natural Ceiling Enforcement**
An admin cannot grant a lower-tier user access to a module that surpasses the admin's own natural capabilities.

### 1.4 Cache Invalidation & Auto-Rest

*   **Cache Clear:** Calling the provisioning API immediately calls `kv.delete()` on the target's KV cache. The target's next page navigation will incur a cache miss (spending ~2ms) to fetch and re-cache the updated map from D1.
*   **Role Change Reset:** If a user is promoted (e.g., Staff -> Admin), all prior PLAC overrides are automatically truncated, and the cache is cleared. A new role signifies a new baseline, so historical overrides (which may now be redundant or unsafe) are discarded.

---

## 2. Ghost Audit Engine

The Ghost Audit Engine is a fire-and-forget logging utility that securely records sensitive admin mutations.

### 2.1 The `ctx.waitUntil` Strategy

Writing to D1 takes approximately 5-10ms. If an admin provisions 3 page overrides, waiting for 3 sequential D1 writes would introduce 15-30ms of blocking latency, harming the perceived speed of the SPA.

Instead, the audit logger hooks into Cloudflare's `ExecutionContext.waitUntil(promise)`.

```typescript
// Example Implementation
ctx.waitUntil(
  db.prepare(`INSERT INTO admin_audit_log ...`).bind(...).run()
);
```

When an admin clicks "Save", the API immediately returns `200 OK`. The browser transitions seamlessly. The Cloudflare Worker remains alive in the background (at zero cost, since CPU limits apply to the HTTP request phase primarily) and executes the D1 insert payload.

**Result: Zero user-perceived latency.**

### 2.2 Data Structure & Analytics

The `admin_audit_log` table tracks:
*   **Actor:** `user_id`, `user_email`, `user_role`
*   **Action & Location:** `action` (e.g., `grant_access`), `module` (e.g., `plac`)
*   **Target:** `target_id`, `target_type` (e.g., identifying the user who received the grant)
*   **Environment:** `ip_hash` (a non-reversible cryptographic hash of the `cf-connecting-ip` to identify repeated malicious attempts across different accounts without storing raw PII).

### 2.3 Immutable Logs

*   There are NO endpoints built to let a Super Admin or Admin delete an audit log.
*   Logs are theoretically mutable via Direct SQL (D1 Viewer), but the application API surfaces no DELETE methods.
*   At scale, if logs exceed the D1 5GB limit, a background cron Worker will compress logs older than 6 months and export them to R2 cold storage.
