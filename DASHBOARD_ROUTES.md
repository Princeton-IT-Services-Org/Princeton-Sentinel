# Princeton Sentinel — Pages + API Routes Reference

This document enumerates every **UI page route** and **JSON API route** implemented in this repo, including:

- What each route is for (user-facing intent)
- What data it shows/returns (fields + meaning)
- Which query params it accepts (search, pagination, sorting, time windows)
- How pages link to each other (navigation model)

---

## 1) Auth + access control model

### Authentication provider
- **NextAuth** with **Microsoft Entra ID** provider.
- Sign-in UX is the `/signin` page; the underlying auth handlers live under `/api/auth/*`.

### Authorization gate (who can access)
- All routes under:
  - `/dashboard/*` (UI pages)
  - `/api/*` (JSON APIs)
  require:
  1) a valid NextAuth JWT session, and
  2) membership in the Entra group identified by `USER_GROUP_ID` (admins must be in `ADMIN_GROUP_ID`).
- `/api/auth/*`, `/signin`, and `/forbidden` are excluded from the gate (to allow sign-in/out callbacks).

### Standard error behavior
- For API routes:
  - Unauthenticated → HTTP **401** `{ "error": "unauthorized" }`
  - Authenticated but not in allowed group → HTTP **403** `{ "error": "forbidden" }`
- For UI routes:
  - Unauthenticated → redirect to `/signin?callbackUrl=<original path + query>`
  - Not in allowed group → redirect to `/forbidden`

### Relevant env vars
- Auth:
  - `ENTRA_TENANT_ID`
  - `ENTRA_CLIENT_ID`
  - `ENTRA_CLIENT_SECRET`
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
  - `USER_GROUP_ID`
  - `ADMIN_GROUP_ID`
- DB:
  - `DATABASE_URL` (Postgres connection string)
- Sharing classification:
  - `INTERNAL_EMAIL_DOMAINS` (comma-separated; used to classify principals as internal vs external)
- Risk defaults (optional):
  - `DASHBOARD_DORMANT_LOOKBACK_DAYS` (default 90)
  - `DASHBOARD_RISK_SCAN_LIMIT` (default 500, clamped)
  - `DASHBOARD_RISK_LOG` (enables timing logs for the Risk page)

---

## 2) Common URL/query conventions

### ID path parameters
Dynamic pages use URL-encoded IDs:
- `/dashboard/sites/<siteId>`
- `/dashboard/users/<userId>`
- `/dashboard/groups/<groupId>`
- `/dashboard/items/<itemId>`

Links in the UI encode IDs with `encodeURIComponent`, and server pages decode with a safe decode helper.

### Pagination params
Most list pages use:
- `page` (1-based)
- `pageSize` (clamped per page)

Some pages paginate multiple lists and therefore use different param names:
- Sharing link breakdown pagination uses `lbPage` and `lbPageSize`.

### Sorting params (tables)
Sortable tables use:
- `sort` = column id (string)
- `dir` = `asc` | `desc`

When sorting changes, UI resets `page=1`.

### Time window param (`days`)
Several pages/APIs accept a time window as:
- `days=<number>` (e.g. `7`, `30`, `90`, `365`)
- or `days=all` meaning **all-time**

The server converts this to `windowDays: number | null`:
- `null` = all-time
- number = last N days window

Used for “activity in window” and “risk item lists in window” (details per route below).

---

## 3) Data model (what the dashboard “talks about”)

The dashboard is driven by a MySQL “raw” schema (`MYSQL_DB_RAW`). The UI speaks in these entities:

### Site
A “site” is a row in the `sites` table. Many metrics are derived by joining:
- `sites` → `drive_items` (by SharePoint site id matching) and/or → `drives` (for personal sites).

**Site list row shape (used across multiple pages/APIs):**
```ts
type SiteListItem = {
  id: string;
  title: string;                 // best-effort: displayName, name, else id
  webUrl: string | null;
  createdDateTime: string | null; // ISO
  isPersonalSite: boolean | null; // true=personal, false=SharePoint, null=unknown
  template: string | null;        // derived from site raw_json webTemplate fields

  // Derived from drives + drive_items + permissions:
  storageUsedBytes: number | null;
  storageTotalBytes: number | null;
  lastWriteDateTime: string | null;    // max drive_items.lastModifiedDateTime
  lastShareDateTime: string | null;    // max permissions.createdDateTime where link_scope != null
  lastActivityDateTime: string | null; // max(lastWriteDateTime, lastShareDateTime)
};
```

### Drive + Drive item
Drive-related metrics come from:
- `drives` (quota, driveType, owner)
- `drive_items` (files/folders, size, paths, lastModifiedBy, timestamps, sp_siteId, etc.)

### Sharing / Permissions
Sharing is derived from:
- `permissions` rows:
  - `source`: `direct` or `inherited`
  - `link_scope`: commonly `anonymous`, `organization`, `users` (or null for non-link grants)
  - `link_type`: link type detail (varies by M365 link kind)
  - `createdDateTime`: when the permission/link was created/observed
  - `link_webUrl`, `link_expiration`, `preventDownload`, `roles_json`, etc.
- `permission_grants` rows: principals (users/groups/apps) granted by each permission.

### Principal classification (guest vs external vs internal)
Across the app, principal email classification is:
- If email contains `#EXT#` → **guest**
- Else if `INTERNAL_EMAIL_DOMAINS` is unset → **internal**
- Else if email domain matches one of the configured internal domains (or a subdomain) → **internal**
- Else → **external**

### Identity (Users + Groups)
- `users`, `account_status` drive user overview/sign-in timestamps.
- `groups`, `group_members` drive group list + membership drilldown.

---

## 4) UI page routes (browser pages)

All `/dashboard/*` pages require auth + allowed group membership.

### `/` — Home
- File: `src/app/page.tsx`
- Purpose: simple landing page with a link to `/dashboard`.
- Data: none.

### `/signin` — Sign in
- File: `src/app/signin/page.tsx`
- Purpose: prompt user to sign in via Microsoft Entra ID.
- Query params:
  - `callbackUrl` (string): where to redirect after sign-in (defaults to `/dashboard`)
  - `error` (string): optional error code shown in UI
- Data shown:
  - No DB data; uses `getServerSession()` to redirect already-authenticated users to `/dashboard`.

### `/forbidden` — Access denied
- File: `src/app/forbidden/page.tsx`
- Purpose: show “not in allowed group” message.
- Links:
  - Home `/`
  - Sign out `/api/auth/signout`

### `/dashboard` — Dashboard (high-level)
- File: `src/app/dashboard/page.tsx`
- Purpose: high-level posture signals from directory, storage, and sharing metadata.
- Data shown:
  - **Directory totals** (bar chart):
    - `sitesTotal`, `usersTotal`, `groupsTotal`, `drivesTotal`
  - **Sharing link scopes** (pie chart):
    - derived from global link breakdown grouped by `permissions.link_scope` (aggregated across `link_type`)
  - **Drive types** (pie chart):
    - `drives.driveType` grouped counts
  - **Top drives by used storage** (bar chart):
    - top 10 drives by `drives.quota_used` (shown as GB), plus total used/allocated in bytes.
- Query functions that feed it (server-side):
  - `getDirectoryTotals()` → `{ sitesTotal, usersTotal, groupsTotal, drivesTotal }`
  - `getDriveOverview()` → `{ storageUsedBytes, storageTotalBytes, driveTypeBreakdown[], topDrivesByUsed[] }`
  - `getLinkBreakdown()` → `Array<{ link_scope, link_type, count }>`

### `/dashboard/sites` — Sites (inventory)
- File: `src/app/dashboard/sites/page.tsx`
- Purpose: discover and browse all sites; show inventory and basic posture fields.
- Query params:
  - `q` (string): search tokens across site title/URL/id
  - `page` (number, 1-based)
  - `pageSize` (number; clamped 10–200; default 50)
  - `sort` (string): one of `title`, `type`, `template`, `created`, `storage`, `lastActivity`
  - `dir` (`asc` | `desc`)
- Data shown:
  1) Summary cards:
     - Total sites (matches current search)
     - New (30 days) and New (90 days) (matches current search)
  2) Summary graphs (across the full result set for the search):
     - Site type breakdown: SharePoint vs Personal vs Unknown
     - Sites created per month
  3) Inventory table (paged):
     - Columns:
       - Title (+ link to site detail), URL/id
       - Type: Personal / SharePoint / Unknown
       - Template
       - Created date
       - Storage used / allocated (bytes formatted)
       - Last activity (max of last write and last share timestamps)
- Query functions:
  - `getSitesOverview({ search })` → totals + created-by-month series
  - `listSites({ search, sort, dir, limit, offset })` → `{ items: SiteListItem[], total }`

### `/dashboard/sites/:siteId` — Site detail
- File: `src/app/dashboard/sites/[siteId]/page.tsx`
- Purpose: deep dive into one site’s storage, activity, access model, and sharing risk.
- Route params:
  - `siteId` (URL-encoded)
- Query params:
  - `days` (string): activity window; `all` or a number (default `90`)
- Data shown:
  1) Header:
     - Site title + badges (privacy, template)
     - Created date, last activity timestamp
     - Site web URL (if present)
     - Links: Back to sites, Sharing subpage, Files subpage
  2) Cards:
     - Storage:
       - Used / Allocated (from drives quota totals)
       - Drive count
     - Activity (windowed by `days`):
       - Items last modified (count of drive_items in window)
       - Link shares (count of link permissions created in window)
       - Last write timestamp
     - Sharing risk:
       - Anonymous links (distinct permission ids where `link_scope='anonymous'`)
       - Guest users (distinct guest emails)
       - External users (distinct non-internal emails)
  3) Activity trend table (windowed):
     - Per-day series: `{ date, modifiedItems, shares }`
  4) Access model:
     - Direct users (distinct user principals granted)
     - Groups (distinct group/siteGroup principals granted)
     - Sharing links (count of link permissions)
  5) Top active users (windowed):
     - Top 10 users by number of items where they are `lastModifiedBy`
- Query functions:
  - `getSiteDetail(siteId, { windowDays })` → `SiteDetail` (see API schema below)
  - `getSiteActivitySeries(siteId, { windowDays })` → `Array<{ date, modifiedItems, shares }>`
  - `getSiteTopUsers(siteId, 10, { windowDays })` → `Array<{ userId, displayName, email, modifiedItems, lastModifiedDateTime }>`

### `/dashboard/sites/:siteId/files` — Site files
- File: `src/app/dashboard/sites/[siteId]/files/page.tsx`
- Purpose: file-level signals for a site.
- Route params:
  - `siteId` (URL-encoded)
- Data shown:
  1) Write heatmap:
     - Aggregated counts of drive item writes by:
       - day-of-week (`DAYOFWEEK(lastModifiedDateTime)`)
       - hour-of-day (`HOUR(lastModifiedDateTime)`)
  2) Recently modified (top 25):
     - Drive items ordered by `lastModifiedDateTime DESC`
  3) Largest files (top 25):
     - Files only (`isFolder=0`) ordered by `size DESC`
  4) Most shared/permissioned items (top 25):
     - Items ordered by:
       - sharing links count (permissions with `link_scope != null`) DESC
       - total permissions count DESC
- Table columns (as shown in UI):
  - Recently modified:
    - Item name (+ Open link if webUrl, + Details link), normalized path/id
    - Modified timestamp
  - Largest files:
    - File name (+ Open link if webUrl, + Details link), normalized path/id
    - Size
  - Most shared/permissioned items:
    - Item name (+ Open link if webUrl, + Details link)
    - Sharing links count
    - Total permissions count
- Query functions:
  - `getSiteWriteHeatmap(siteId)` → `Array<{ dayOfWeek, hour, count }>`
  - `listRecentlyModifiedItems(siteId, 25)` → `Array<{ id, name, webUrl, normalizedPath, isFolder, size, lastModifiedDateTime }>`
  - `listLargestFiles(siteId, 25)` → `Array<{ id, name, webUrl, normalizedPath, isFolder, size, lastModifiedDateTime }>`
  - `listItemsByPermissions(siteId, 25)` → `Array<{ itemId, name, webUrl, permissions, sharingLinks }>`

### `/dashboard/sites/:siteId/sharing` — Site sharing
- File: `src/app/dashboard/sites/[siteId]/sharing/page.tsx`
- Purpose: sharing links + external access rollups for a specific site.
- Route params:
  - `siteId` (URL-encoded)
- Data shown:
  1) Link breakdown (site-scoped):
     - Grouped by `{ link_scope, link_type }` with counts
  2) External principals (top 25):
     - Guests (emails containing `#EXT#`)
     - External users (non-internal domains)
     - Ranked by number of grants; includes last grant timestamp
  3) Most shared items (top 25):
     - Items ranked by:
       - number of sharing links DESC
       - number of permissions DESC
     - Includes last shared timestamp
- Table columns:
  - Link breakdown: scope, type, count
  - External principals: email, type (guest|external), grants, last grant seen
  - Most shared items: item, sharing links, permissions, last link share seen
- Query functions:
  - `getSiteLinkBreakdown(siteId)` → `Array<{ link_scope, link_type, count }>`
  - `listSiteExternalPrincipals({ siteId, limit: 25 })` → `Array<{ email, type, grants, lastGrantedDateTime }>`
  - `listMostSharedItems(siteId, 25)` → `Array<{ itemId, name, webUrl, sharingLinks, permissions, lastSharedDateTime }>`

### `/dashboard/activity` — Activity (site-level)
- File: `src/app/dashboard/activity/page.tsx`
- Purpose: site activity across a window (modifications + link shares + active users).
- Query params:
  - `q` (string): search sites
  - `days` (string): activity window; `all` or number (default `90`)
  - `page`, `pageSize` (clamped 10–200; default 50)
  - `sort` (string): one of `site`, `modified`, `shares`, `activeUsers`, `storage`, `lastActivity`
  - `dir` (`asc` | `desc`)
- Data shown:
  1) Total sites card (matching search)
  2) Two “top 10 sites” graphs (matching search + window):
     - Top sites by active users (distinct last-modifier users)
     - Top sites by link shares and items modified (two-series bar)
  3) Sites table (paged):
     - Site title (+ template badge; personal badge if personal)
     - Items last modified (window)
     - Link shares (window)
     - Users with last-modified items (window)
     - Storage used/allocated
     - Last activity timestamp
- Query functions:
  - `listSitesWithActivitySummary({ search, limit, offset, sort, dir, windowDays })` → `{ items: SiteActivitySummary[], total }`
    - `SiteActivitySummary` extends `SiteListItem` with:
      - `modifiedItemsInWindow: number`
      - `sharesInWindow: number`
      - `topUsersInWindow: number`
  - `getActivityTopSites({ search, windowDays, limit: 10 })` → graphs data:
    - `topSitesByActiveUsers: Array<{ title, activeUsers }>`
    - `topSitesBySharesMods: Array<{ title, shares, mods }>`

### `/dashboard/sharing` — Sharing (global)
- File: `src/app/dashboard/sharing/page.tsx`
- Purpose: global link inventory + per-site oversharing signals.
- Query params:
  - `q` (string): search sites
  - `externalThreshold` (number; clamped 0–10000; default 10)
    - Used only to label a site as “Oversharing” when `distinctExternalUsers >= externalThreshold` (and threshold > 0)
  - Sites pagination:
    - `page`, `pageSize` (clamped 10–200; default 50)
  - Link breakdown pagination:
    - `lbPage`, `lbPageSize` (clamped 5–100; default 10)
  - Table sorting:
    - `sort` one of `site`, `links`, `anonymous`, `guests`, `external`, `lastShare`
    - `dir` = `asc` | `desc`
- Data shown:
  1) Total links card:
     - sum of all link breakdown counts (across all `{scope,type}` buckets)
  2) Charts:
     - Top 10 sites by total sharing links
     - Pie chart of global `scope:type` buckets
  3) Link breakdown table (paged):
     - scope, type, count
     - Clicking scope/type drills into `/dashboard/sharing/links?scope=...&type=...`
  4) Sites table (paged):
     - Site name (links to that site’s Sharing page)
     - Total links
     - Anonymous links
     - Guests (distinct)
     - External (distinct)
     - Last link share seen
     - Badges:
       - “Oversharing” if threshold met
       - “Anonymous” if anonymousLinks > 0
- Query functions:
  - `getLinkBreakdown()` → `Array<{ link_scope, link_type, count }>`
  - `listSitesWithSharingSummary({ search, sort, dir })` → `{ items: SiteSharingListRow[], total }`
    - `SiteSharingListRow`:
      - `id`, `title`
      - `lastShareDateTime`
      - `sharingLinks`, `anonymousLinks`
      - `distinctGuests`, `distinctExternalUsers`

### `/dashboard/sharing/links` — Sharing drilldown (items for a scope/type bucket)
- File: `src/app/dashboard/sharing/links/page.tsx`
- Purpose: list the items contributing to a specific global link bucket.
- Query params (required):
  - `scope` (string): link scope or `"null"` (represents `NULL` scope)
  - `type` (string): link type or `"null"` (represents `NULL` type)
- Query params (optional):
  - `q` (string): search items by name/path/url/id
  - `page`, `pageSize` (clamped 10–200; default 50)
- Data shown:
  - Items list (paged):
    - Item name (links to `/dashboard/items/:itemId`)
    - Matching permissions count (how many permission rows match this scope/type for this item)
    - Size (folders show `—`)
    - Last modified timestamp
- Query function:
  - `listItemsByLinkBreakdownRow({ linkScope, linkType, search, limit, offset })`
    → `{ items: SharingLinkItemRow[], total }`

### `/dashboard/risk` — Risk
- File: `src/app/dashboard/risk/page.tsx`
- Purpose: combine site-level signals with file-level exposure lists.
- Query params:
  - `q` (string): search sites before scanning
  - `scanLimit` (number; clamped 50–2000; default from env; controls how many sites are evaluated)
  - `dormantDays` (number; default from env; defines dormant cutoff for site signals)
  - `days` (string): file window for risk item lists (`all`, `30`, `90`, `365`; default `90`)
  - `page`, `pageSize` (clamped 10–200; default 50)
  - `sort` one of `site`, `flags`, `storage`, `lastActivity`
  - `dir` = `asc` | `desc`
- Site-level signals (computed per scanned site):
  - `dormant`: true if `lastActivityDateTime` is missing or older than `now - dormantDays`
  - `anonymousLinksSignal`: true if site has any anonymous sharing links
  - `orgLinksSignal`: true if site has any organization-wide sharing links
  - `externalUsersSignal`: true if site has any distinct external users
  - `guestUsersSignal`: true if site has any distinct guest users
- A site is included in “Flagged sites” if **any** of the above signals are true.
- Data shown:
  1) Summary cards:
     - Flagged sites count
     - Files with anonymous links (top list size; windowed by `days`)
     - Files with org-wide links (top list size; windowed by `days`)
     - Sites scanned count
  2) Charts:
     - Top 10 flagged sites by storage used (GB)
     - Pie: breakdown of which signal(s) caused flags (“Multiple signals” if >1)
     - Top 10 sites by external principals count (guest + external)
     - Top 10 sites by anonymous links count
  3) File exposure lists (top 25 each, windowed by `days`):
     - Files with anonymous links (ranked by link count)
     - Files with org-wide links (ranked by link count)
  4) Flagged sites table (paged):
     - Site
     - Signals badges
     - Exposure summary (sharing links + principals counts, plus anon/org breakdown)
     - Storage used/allocated
     - Last activity timestamp
- Query functions:
  - `listSites({ search, limit: scanLimit, offset: 0 })` → scanned site list
  - `attachRiskSignals(scannedSites, { dormantDays })` → adds signals + counts to each site
  - `listItemsWithLinkScope({ linkScope: "anonymous" | "organization", windowDays, limit: 25 })` → file lists

### `/dashboard/users` — Users (activity)
- File: `src/app/dashboard/users/page.tsx`
- Purpose: rank and browse users by how many items they are currently the `lastModifiedBy` for.
- Query params:
  - `q` (string): search users (displayName/mail/UPN/id)
  - `days` (string): window for “last modified” activity; `all` or number (default `90`)
  - `page`, `pageSize` (clamped 10–200; default 50)
  - `sort` one of `user`, `modified`, `sites`, `lastModified`, `lastSignIn`
  - `dir` = `asc` | `desc`
- Data shown:
  1) Total users card (matching search)
  2) Charts (top 10):
     - Users by items last modified (windowed)
     - Users by number of sites touched (windowed)
  3) Active users table (paged):
     - User identity (displayName/email/UPN) with link to user detail page
     - Items last modified (window)
     - Sites touched (window)
     - Last modified timestamp
     - Last successful sign-in timestamp
- Query function:
  - `listUsersByActivity({ search, sort, dir, windowDays })` → `{ items: UserActivityRow[], total }`

### `/dashboard/users/:userId` — User detail
- File: `src/app/dashboard/users/[userId]/page.tsx`
- Purpose: per-user drilldown: activity summary, top sites, recent items.
- Route params:
  - `userId` (URL-encoded)
- Query params:
  - `days` (string): window; `all` or number (default `90`)
  - `page`, `pageSize` (clamped 10–200; default 25) — paginates recent items list
- Data shown:
  1) User header:
     - display name / email / UPN fallback
     - user id
     - last modified timestamp, last sign-in timestamp (from account status)
  2) Summary cards:
     - Items last modified (window)
     - Sites touched (window)
     - Last modified timestamp
     - Last successful sign-in timestamp
  3) Top sites (top 10):
     - Sites where this user is lastModifier for items
  4) Recently modified items (paged):
     - Item name + links (Open/Details)
     - Site context (site id/title when available)
     - Modified timestamp
- Query functions:
  - `getUserOverview(userId, { windowDays })` → `UserOverview`
  - `listUserTopSites(userId, 10, { windowDays })` → `UserTopSiteRow[]`
  - `listUserRecentlyModifiedItems({ userId, windowDays, limit, offset })` → `{ items: UserRecentItemRow[], total }`

### `/dashboard/groups` — Groups
- File: `src/app/dashboard/groups/page.tsx`
- Purpose: browse Microsoft 365 groups and membership counts.
- Query params:
  - `q` (string): search groups (displayName/mail/mailNickname/id)
  - `page`, `pageSize` (clamped 10–200; default 50)
  - `sort` one of `group`, `visibility`, `members`, `created`
  - `dir` = `asc` | `desc`
- Data shown:
  1) Total groups card (matching search)
  2) Charts (derived from the filtered result set):
     - Top 10 groups by member count
     - Visibility breakdown pie (e.g. Public/Private/Unknown)
  3) Groups table (paged):
     - Group identity (displayName/mail) with link to group detail
     - Visibility
     - Member count
     - Created timestamp
- Query function:
  - `listGroups({ search, sort, dir })` → `{ items: GroupRow[], total }`

### `/dashboard/groups/:groupId` — Group detail
- File: `src/app/dashboard/groups/[groupId]/page.tsx`
- Purpose: show a group’s membership and group-owned drive associations.
- Route params:
  - `groupId` (URL-encoded)
- Query params:
  - `q` (string): search members
  - `page`, `pageSize` (clamped 10–200; default 50)
  - `sort` one of `user`, `email`
  - `dir` = `asc` | `desc`
- Data shown:
  1) Group header:
     - displayName/mail fallback
     - groupId
     - visibility + member count
  2) Summary cards:
     - Members
     - SharePoint sites (distinct `sharepointSiteUrl` found via drives)
     - Drives count
  3) “SharePoint” / drive association list:
     - Each drive: name/id, driveType, sharepointSiteUrl (if present), drive webUrl (if present)
     - Links to open site / open drive in browser
  4) Members table (paged + searchable):
     - User identity
     - Email/UPN
     - Includes a convenience link to search that user on `/dashboard/users?q=...`
- Query functions:
  - `getGroupDetail(groupId)` → `{ group: GroupRow, drives: GroupDriveRow[] }`
  - `listGroupMembers({ groupId, search, limit, offset, sort, dir })` → `{ items: GroupMemberRow[], total }`

### `/dashboard/items/:itemId` — Drive item detail
- File: `src/app/dashboard/items/[itemId]/page.tsx`
- Purpose: file/folder detail page showing metadata + sharing exposure + permissions breakdown.
- Route params:
  - `itemId` (URL-encoded)
- Data shown:
  1) Header:
     - Item name + badges:
       - Folder/File
       - Shared (if `isShared`)
       - Anonymous link / Org-wide link / Specific users link (derived from link breakdown)
     - Path (normalizedPath + name), item id
     - Created + last modified timestamps
     - Links:
       - Back to Risk page
       - Open item in M365 (item webUrl)
       - Open drive (drive webUrl)
  2) Summary cards:
     - Item metadata: size (files), last modified by, created by
     - Drive context: type, owner, quota used/total
     - Sharing exposure:
       - Link shares (sum of link breakdown counts)
       - Principals (count)
       - Guests/external counts
  3) Tables:
     - Access links:
       - Link scope/type, roles, expiration, link URL
     - Sharing links breakdown:
       - link_scope, link_type, count
     - Principals:
       - principal identity + type + classification, total grants, via-links count
     - Permissions:
       - permission id, source (direct/inherited), inherited-from item, roles, link scope/type, principal count
- Query function:
  - `getDriveItemDetail(itemId)` → `DriveItemDetail` (see schema below)

---

## 5) JSON API routes (`/api/*`)

All `/api/*` routes require auth + allowed group membership (except `/api/auth/*`).

### `/api/auth/*` — NextAuth endpoints
- File: `src/app/api/auth/[...nextauth]/route.ts`
- Methods: GET, POST
- Purpose: NextAuth handler (sign-in, callback, sign-out, session, etc.).
- Notable URLs used by the UI:
  - `/api/auth/signout` (used by `/forbidden`)
  - `/api/auth/callback/azure-ad` (configured as Entra redirect URI)

### `GET /api/overview`
- File: `src/app/api/overview/route.ts`
- Purpose: high-level content + sharing inventory across the whole dataset.
- Response:
```ts
type OverviewResponse = {
  totals: {
    totalItems: number;
    totalFolders: number;
    totalFiles: number;
    totalSharedItems: number;
  };
  sensitivityLabels: Array<{ labelId: string | null; labelName: string | null; count: number }>;
  retention: Array<{ retentionLabel: string | null; retentionMode: string | null; count: number }>;
  linkShares: {
    anonymousLinks: number;
    breakdown: Array<{ link_scope: string | null; link_type: string | null; count: number }>;
  };
};
```
- Notes on meaning:
  - Totals come from `drive_items` (`isFolder`, `isShared`).
  - Link breakdown comes from `permissions` (direct link permissions grouped by `link_scope`/`link_type`).

### `GET /api/sites`
- File: `src/app/api/sites/route.ts`
- Purpose: list sites with derived storage and activity timestamps.
- Query params:
  - `search` (string)
  - `limit` (number; default 200; max 5000)
  - `offset` (number; default 0)
  - `sort` (string): `title` | `template` | `created` | `type` | `storage` | `lastActivity`
  - `dir` (`asc` | `desc`)
- Response:
```ts
{ items: SiteListItem[]; total: number }
```

### `GET /api/sites/:siteId`
- File: `src/app/api/sites/[siteId]/route.ts`
- Purpose: site detail (storage, activity, access model, sharing risk).
- Query params:
  - `days` (string): window for activity counts (`all` or number)
- Success response:
```ts
type SiteDetail = SiteListItem & {
  driveCount: number;
  owners: Array<{
    type: "user" | "group" | "unknown";
    id: string | null;
    displayName: string | null;
    email: string | null;
  }>;
  privacy: string | null; // best-effort derived from owning group visibility
  activityCounts: {
    modifiedItems: number; // drive_items modified in window
    shares: number;        // link permissions created in window
  };
  accessModel: {
    directUserGrants: number; // distinct user principals granted
    groupGrants: number;      // distinct group/siteGroup principals granted
    sharingLinks: number;     // number of link permissions
  };
  sharingRisk: {
    anonymousLinks: number; // distinct link permissions where link_scope='anonymous'
    guestUsers: number;     // distinct guest emails
    externalUsers: number;  // distinct external emails
  };
};
```
- Not-found response:
  - HTTP 404 `{ "error": "not_found" }`

### `GET /api/sites/:siteId/activity`
- File: `src/app/api/sites/[siteId]/activity/route.ts`
- Purpose: time series for a single site.
- Query params:
  - `days` (string): series window (`all` or number)
- Response:
```ts
{
  siteId: string;
  series: Array<{ date: string; modifiedItems: number; shares: number }>;
}
```
- Semantics:
  - `modifiedItems` = number of drive items with `lastModifiedDateTime` on that date.
  - `shares` = number of link permissions created on that date.

### `GET /api/sites/:siteId/top-users`
- File: `src/app/api/sites/[siteId]/top-users/route.ts`
- Purpose: top users for a site by number of modified items.
- Query params:
  - `limit` (number; default 10; clamped 1–50)
  - `days` (string): window (`all` or number)
- Response:
```ts
{
  siteId: string;
  users: Array<{
    userId: string;
    displayName: string | null;
    email: string | null;
    modifiedItems: number;
    lastModifiedDateTime: string | null;
  }>;
}
```

### `GET /api/risk/sites`
- File: `src/app/api/risk/sites/route.ts`
- Purpose: site inventory augmented with risk signals and a minimal `riskFlags` object.
- Query params:
  - `search` (string)
  - `dormantDays` (number; default 90)
  - `scanLimit` (number; clamped 50–5000; default 500)
- Response:
```ts
{
  items: Array<
    SiteListItem & {
      // signals + counts (see Risk page section for meaning)
      dormant: boolean;
      anonymousLinksSignal: boolean;
      orgLinksSignal: boolean;
      externalUsersSignal: boolean;
      guestUsersSignal: boolean;
      sharingLinks: number;
      anonymousLinks: number;
      orgLinks: number;
      guestUsers: number;
      externalUsers: number;

      // simplified flags used by API consumers
      riskFlags: {
        dormant: boolean;
        highSharing: boolean; // true when anonymousLinksSignal && storageUsedBytes > 0
      };
    }
  >;
}
```

### `GET /api/dashboard/flagged`
- File: `src/app/api/dashboard/flagged/route.ts`
- Purpose: return a single number used as a “flagged sites total” KPI.
- Response:
```ts
{ flaggedSitesTotal: number }
```
- Flagged definition used by this KPI:
  - A site is counted as “flagged” if **either**:
    - it has **any** `permissions` rows with `source='direct'` associated to the site (via drive items), **or**
    - it has **no** drive items with a non-null `lastModifiedDateTime` associated to the site.
