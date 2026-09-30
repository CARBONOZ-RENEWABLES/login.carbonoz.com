# Carbonoz platform architecture

How the Carbonoz customer platform (login.carbonoz.com + server-api) works: Keycloak sign-in, customer/site multitenancy, SolarBMS ingestion and the Solar dashboard. SolarBMS is the only energy-data source.

```
Keycloak (realm "customers")                     SolarBMS Pi
      │ OIDC, server-side session                    │ HTTPS, machine credential
      ▼                                              ▼
Carbonoz User ─► Customer ─► Site ─► Installation ◄─ POST /api/v1/ingest/solarbms
                                                     │
                                          Redis stream solar:ingest
                                                     │ worker (consumer group)
                                                     ▼
                                    MongoDB (raw + normalized) · Redis live snapshot
                                                     │
                                       Carbonoz API /api/v1/solar/sites/:siteId/*
                                                     │
                                              Solar dashboard (SPA)
```

## 1. Components

- **Frontend** `offsettingdashboard/`: React + Vite, Redux Toolkit Query (`src/lib/api`), antd + the Carbonoz design system (`src/design`, `src/layout`).
  - Customer area `/ds/*` (Solar dashboard, Profile, Settings), admin `/admin/*` (Redex, Users, Logs).
  - Onboarding: `/onboarding`, `/redexsteps`, `/systemsteps`.
- **Backend** `server-api/`: NestJS 9, Prisma + MongoDB, Redis. Global prefix `/api/v1`; responses are `GenericResponse {message, data}`. Nginx serves the SPA and proxies `/api` on the same origin.
- **Identity:** `User.id` (ObjectId) is the tenant key. Onboarding and business data (UserInformation, Partners, Asset, MeteringEvidence, Certification, Project, Redex*) hang off `userId`.

### Removed (retired, not merely disabled)

| Retired | What was removed |
|---|---|
| MQTT / Home Assistant / unified-service data path | Box (`UserPorts`) registration, MQTT topics, client credentials for the HA/Docker/desktop apps; `/auth/hosts` and `/auth/authenticate`; energy, CSV-report and carbon-intensity endpoints built on MQTT data; the Grafana/InfluxDB live views (Analytics, Charts, Carbon Intensity, Diagnostics, Devices); the `socket.io` Nginx locations and unused socket.io packages. |
| AI Charging | `/ai-charging/status/:userId`, `/ai-charging/update`, its module and all UI. |
| Subscription plans and billing | Plans, subscriptions, payments (PayPal, Stripe), the PayPal webhook, the subscription guard, manual-access grants, the Subscribe page and header pill, the admin Plans page, their packages and env keys. |

The separate `carbonoz-unified-service` repository (the old WebSocket → Redis/InfluxDB/MongoDB writer) is not used by anything in this repository. Decommission it by stopping its PM2 process. The Redis keys it wrote (`redis-data`, `carbon-settings`, `ai-charging:*`) can then be deleted.

`TotalEnergy` stays as **read-only historical data**: nothing writes it any more. The Redex report uses it only for months without SolarBMS data (see §6).

## 2. Data model

```
Keycloak identity (realm "customers", sub)
      │  UserIdentity (provider, subject) ──► User.id   ← unchanged tenant key + all business data
      ▼
Customer ◄── CustomerMember (userId, role OWNER|ADMIN|VIEWER)
  └── Site (name, location, timezone)
        └── Installation (kind SOLARBMS, externalSystemId)
              ├── MachineCredential (per device: API key hash or Keycloak client id)
              └── SolarDevice (SYSTEM / INVERTER / BATTERY / BMS, parentExternalId)
                    └── SolarSample (per device per reading: metrics{} + cells[])
SolarIngest (raw payload per message) · SolarEvent · SolarForecast · SolarMetric (catalogue) · SolarDeadLetter
```

- **Additive.** No existing document was migrated.
- **Keycloak link.** The `sub` lives in `UserIdentity`, not in a nullable unique field on `User`: MongoDB unique indexes treat missing fields as equal.
- **Many-to-many.** A customer has several sites and several users; a user may belong to several customers.
- **Member roles.** Customer-facing, all members read the same data. OWNER/ADMIN/VIEWER are recorded for future customer-side management and don't change access today.

## 3. Authentication

### Humans — `src/auth`

```
Browser ─► GET /auth/oidc/login?returnTo=…
             PKCE S256 + state + nonce (pending state in Redis, 10 min)
             Set-Cookie cz_oidc_state=sha256(state)   (HttpOnly, 10 min, Path=/api/v1/auth/oidc)
        ─► Keycloak realm "customers"
        ─► GET /auth/oidc/callback
             state cookie must match → login CSRF / foreign callback rejected
             code exchange with the client secret (server-side)
             id_token: signature (JWKS, RS/PS/ES only), issuer, audience, expiry, nonce
        ─► IdentityService
             UserIdentity(sub) → User
             else a Keycloak-verified email → existing User: exact, escaped, case-insensitive match;
               several accounts differing only by case → refused (email_ambiguous)
             else a new User (email stored lower-case)
        ─► Redis session session:<sha256(id)> { userId, sub, refresh/id token }
        ─► Set-Cookie cz_session=<opaque>; HttpOnly; Secure; SameSite=Lax; Domain=$SESSION_COOKIE_DOMAIN
        ─► 302 to returnTo (relative, or an allow-listed origin)
```

- **One guard.** `JwtGuard` accepts the session cookie. Without one, it falls back to the legacy bearer JWT while `LEGACY_AUTH_ENABLED=true`.
- **CSRF.** Cookie-authenticated writes need the `x-carbonoz-csrf` header. SameSite alone doesn't cover sibling subdomains.
- **Keycloak-side revocation.** After the access token expires, the next request refreshes it with Keycloak.
  - Rejected → session ends.
  - Unreachable or slow (3 s timeout) → the session continues, and the next attempt waits 30 s instead of every request retrying.
  - Idle (8 h) and absolute (7 d) limits always apply.
- **Disabled users** (`activeStatus=false`) lose sessions and site access, including through legacy tokens.
- **Roles** come from Carbonoz (`User.role`), never from Keycloak.
- **Frontend.** `VITE_AUTH_MODE=keycloak` hands `/`, `/signup` and `/forgot-password` to Keycloak. Credentials are included only in SSO mode, and nothing auth-related is stored in `localStorage`.

**Cut-over switch `LEGACY_AUTH_ENABLED=false`.** Rejects password login, sign-up, email-verification and reset links (410), and every legacy bearer JWT (401). Only Keycloak sessions and machine credentials work.

### Machines — `src/machine-auth`

- **Separate guard.** `MachineAuthGuard` sets `req.machine`, never `req.user`. Machine tokens can't reach customer endpoints, and customer tokens are refused on ingestion.
- **Keycloak client credentials** from the *machine* realm. Issuer, audience, expiry, the `solarbms-ingest` role and an asymmetric algorithm are required, and the client id must be registered to an installation.
- **Carbonoz API key** `czk.<id>.<secret>`. It is stored as a SHA-256 hash and compared in constant time.
- **Binding.** A credential writes only for its own installation and site, and only its registered `systemId` (when one is set).
- **Revocation.** Immediate on the instance handling it; within 60 s on the others, because verified credentials are cached 60 s so devices keep sending through short MongoDB outages. Tokens are never honoured past their `exp`. Credential lookups are bounded at 5 s.

## 4. SolarBMS pipeline — `src/solar`

```
Pi ─► POST /ingest/solarbms   machine auth → backlog check → dedupe marker → XADD solar:ingest
                              ← 202 {messageId, status: queued|duplicate}
Worker (consumer group solar-store; connects to Redis in the background)
   per entry, under a per-entry lock (no concurrent double processing):
   1. SolarIngest ← raw payload (field names MongoDB can't store are rewritten;
                    the original text is kept in rawText)
   2. normalizeSolarBms(payload)   pure, unit-tested; unknown fields become metrics
   3. SolarMetric catalogue (≤ 2000 names per site; extra names stay raw-only)
   4. SolarDevice (lastSeenAt only moves forward) · SolarSample · SolarEvent · SolarForecast
   5. alarm state per device, applied only from readings newer than the current state
   6. Redis live snapshot per installation (older readings never overwrite newer ones)
   ack only once the outcome is stored (PROCESSED, FAILED with raw kept, or dead-lettered)
```

- **Dynamic data.** Every scalar becomes a snake_case metric, nested objects are flattened, and per-cell fields are kept. Known spellings map to canonical keys with unit suffixes. Cell min/max/avg/spread are computed when the BMS doesn't send them.
- **Rebuildable.** `POST /admin/solar/ingests/:id/reprocess` re-derives everything from the stored raw payload.
- **Scaling.** Set `SOLAR_WORKER_ENABLED=false` on API nodes and run more workers; the consumer group shares the stream.

### Reliability (verified by `test/outage.e2e-spec.ts`)

| Situation | Behaviour |
|---|---|
| Redis down at start-up | The API starts and serves everything that doesn't need Redis; the worker connects when Redis is back. |
| Redis down at runtime | Ingest and cookie sessions answer `503` within milliseconds; legacy bearer requests keep working; recovery is automatic. Sessions survive a Redis restart with AOF. |
| MongoDB down | Known devices keep sending (credential cache, stream buffer). Queued entries stay pending and are stored when MongoDB returns; transient failures are never dead-lettered. |
| Permanently bad message | Retried up to `SOLAR_MAX_DELIVERIES` (5), then recorded verbatim in `SolarDeadLetter` (or the Redis stream `solar:ingest:dead` if MongoDB is down) and acknowledged — never before it is recorded. It can't block trimming or other installations. `GET /admin/solar/dead-letters`, `POST /admin/solar/dead-letters/:id/requeue`. |
| Crash mid-processing | Un-acked entries are reclaimed after `SOLAR_RECLAIM_IDLE_MS`. A retry clears partially derived rows first, so nothing is duplicated. |
| Two workers | A per-entry Redis lock (5 min) prevents concurrent processing of one entry. |
| Backlog | `XADD` never trims. Above `SOLAR_STREAM_MAXLEN` entries ingestion answers `503` (the Pi buffers). The worker trims only acknowledged entries. |
| Duplicates | `messageId` dedupe: a pending marker (60 s), then 24 h. The unique `(installationId, messageId)` index is the final guard. |
| Malformed / large | `400` / `413`; odd shapes are accepted and kept raw. Text is capped at 500 characters, and at most 500 metrics per device. |
| Clock skew / order | Readings more than 5 min in the future get the receive time. Older readings don't change live values, alarm state or `lastSeenAt`. |

## 5. API

All under `/api/v1`.

| Area | Endpoints |
|---|---|
| Auth | `GET auth/config` · `GET auth/oidc/login` · `GET auth/oidc/callback` · `GET auth/session` · `POST auth/logout` · legacy (until cut-over): `POST auth/{login,sign-up,forgot-password,verify-user,verify-user-email}` |
| Tenancy | `GET customers/me` · `GET sites` · `GET sites/:siteId` |
| Solar (customer) | `GET solar/sites/:siteId/{overview, devices, inverters, batteries, bms, cells, metrics, history, events, forecast, access}` · `GET solar/sites/:siteId/energy?range=30d\|1y\|10y&anchor=` (energy history) |
| Ingestion (machine) | `POST ingest/solarbms` |
| Admin · tenancy | `GET/POST admin/customers` (list with member/site/installation counts, status, last activity; `?q=`) · `GET/PATCH admin/customers/:id` · `POST/DELETE admin/customers/:id/members` · `POST admin/customers/:id/sites` · `GET admin/sites` (`?q=&customerId=`) · `GET/POST admin/sites/:id/installations` · `GET admin/installations` (`?q=&siteId=&customerId=`) · `PATCH admin/installations/:id` (name, systemId, active) |
| Admin · machine credentials | `GET admin/credentials` (`?installationId=&status=&q=`, never secrets) · `POST admin/installations/:id/credentials` · `POST admin/credentials/:id/rotate` (API keys) · `DELETE admin/credentials/:id` |
| Admin · SolarBMS | `GET admin/solar/health` · `GET admin/solar/installations` (per-installation ingestion stats) · `GET admin/solar/ingests` (`?status=&installationId=&siteId=&q=&page=&size=`) · `GET admin/solar/ingests/:id` · `POST admin/solar/ingests/:id/reprocess` · `GET admin/solar/sites/:id/ingests` · `GET admin/solar/{devices,events,metrics}` · `GET admin/solar/dead-letters` · `POST admin/solar/dead-letters/:id/requeue` |
| Onboarding / business | `partners`, `steps`, `systemsteps`, `user/*` (information, asset, meter, project, certification, Redex file), `redex/*`, `admin/*` (users, logs, Redex) |

- **Site authorization.** Every Solar endpoint checks access server-side (`SiteAccessGuard` → CustomerMember, or ADMIN); inaccessible sites return **404**.
- **History.** Raw samples, time-bucketed, at most **31 days** per request (the dashboard offers up to 30), with a 10 s server-side limit. It uses the `siteId, deviceKind, ts` index. Longer ranges would need pre-aggregated rollups.
- **Swagger** runs only with `SWAGGER_ENABLED=true`. Keep it off in production.
- **Admin routes** require the ADMIN role on the server (`JwtGuard` + `RolesGuard`): customers get 403, anonymous callers and machine credentials 401. Query values are checked to be plain strings/ids/enums, so `?x[$ne]=` is a 400, never a MongoDB operator.

## 6. Redex production reporting

`RedexService.getMonthlyData` reports each Redex customer's monthly PV production:

- **Source.** SolarBMS: hourly averages of the SYSTEM `pv_power_w` readings of the user's sites × 1 h, summed per month (`SolarEnergyService`). Gaps under-report and never over-report.
- **Fallback.** Months with no SolarBMS data yet use the historical `TotalEnergy` totals, so values Redex already received are not overwritten with zeros.
- **Not scheduled.** `src/schedule/ScheduleModule`, the month-end job, is not imported by `AppModule`, so nothing calls `getMonthlyData` today. That was already the case before this work. Enabling it is a product decision (it sends data to Redex).

## 7. Solar dashboard — `offsettingdashboard/src/features/solar`

- `/ds` opens the Solar dashboard (`/ds/solar/:siteId?/:tab?`). The customer nav is Dashboard, Profile and Settings.
- **Tabs:** Overview · Energy · Battery · BMS & Cells · Inverters · History · Forecast · Events · System, all on live API data.
- **Layers:** RTK Query (`api.ts`) → adapter (`model.ts`) → reusable components (`MetricCard`, `StatusCard`, `MetricList`, `InverterCard`, `BatteryCard`, `BMSCard`, `CellVoltageTable`, `DataTable`, `EventTable`, `HistoryChart`, `ForecastChart`, the Energy Flow house).
- **Freshness.** Live, Delayed ("Last reading …", per site and per device) and "No data yet".
  - Headline totals never mix delayed installations into current values; excluded installations are named.
  - When everything is delayed, the last values are shown as such.
- **Cells.** Any number per BMS, with every per-cell field (voltage, temperature, balancing, time, and any new field) plus a full cell table.
- **New metrics appear on their own:** device cards, the History picker, and the System tab's *All reported values* table (every current value of every device, searchable, with its update time) and metric table. Numbers get their unit, booleans Yes/No, ISO or epoch timestamps a local date/time. Only important canonical metrics get curated cards.
- **Empty states.** A customer without a site, or a site without an installation, sees "No SolarBMS system connected".

## 6a. Energy history — `GET solar/sites/:siteId/energy`

Daily (30 days), monthly (12 months) and yearly (10 years) energy for one site, behind the same `SiteAccessGuard` as every Solar endpoint (other customers' sites → 404).

- **Source metrics (fixed meaning, SYSTEM device only):** `pv_power_w`, `load_power_w`, `grid_power_w`, `battery_power_w`. Other metrics — including energy counters such as `daily_pv_energy_kwh` or `pv_energy_today_kwh` — are stored and shown generically but never used here until their semantics are confirmed with SolarBMS.
- **Integration:** SolarBMS reports power, so energy = average power of every installation-hour with readings × 1 h. Duplicate readings don't inflate it (average), hours without readings add nothing and are reported via `completeness` (readings ÷ expected installation-hours); a metric without any reading in a bucket is `null`, never 0.
- **Signed parts:** the API returns `gridPositiveKwh`/`gridNegativeKwh` and `batteryPositiveKwh`/`batteryNegativeKwh`. The dashboard maps them to import/export and charged/discharged with `SOLAR_SIGN` (assumed grid + = import, battery + = charging — **pending SolarBMS confirmation**; one place to flip).
- **Calendar:** buckets are local days/months/years in the site's `timezone` (UTC if unset/invalid). Months and years are sums of days, so DST days (23/25 h) and month/year boundaries are exact. `partial` marks a bucket still running or one in which data started. `anchor` pages back/forward; never into the future.
- **PV coverage** (dashboard): (consumption − grid import) ÷ consumption, 0–100 %; only when both values exist.
- **Cache:** settled days (ended > 48 h ago) are stored in `SolarEnergyDay` (rebuildable). The worker drops cached days when older readings arrive (backfill, reprocess); a per-site marker in Redis (`solar:energy-dirty:<site>`) prevents a request from caching a day the worker changed meanwhile. Without Redis nothing is cached.
- **Dashboard:** Energy tab → *Energy history*: totals, charts per resolution (daily: PV vs consumption, battery charged vs discharged, grid import, coverage line; monthly/yearly: separate bars, coverage bars, value labels on yearly bars), and a table (cards on phones). Incomplete buckets are drawn lighter and labelled; missing values show "—".

## 7b. Languages — `offsettingdashboard/src/i18n`

- English, German, French, Spanish. Central catalogues in `src/i18n/messages/` (`en.ts` is the source and the fallback; missing keys fall back to English, then to the key). Keys are type-checked (`t('solar.tabs.overview')`).
- Selector on **Profile → Language**. The UI switches immediately (the app subtree re-renders, the API cache stays), the choice is stored on the device and in the profile field `customerLanguage` (`en`/`de`/`fr`/`es`; older values like "English"/"french" are understood), and a profile value is applied on every device at sign-in.
- Dates and numbers use `Intl` with the language's locale (de-DE, fr-FR, es-ES, en-GB); antd's own texts follow via its locale.
- Translated: the customer shell and navigation, the whole Solar dashboard (tabs, cards, tables, charts, energy flow, empty/loading/error states), Profile and Settings. Not yet translated (English): the admin panel, onboarding/Redex forms and the sign-in pages.

## 7a. Admin panel — `offsettingdashboard/src/features/admin`

Same shell and design system as the rest of the app; the sidebar groups the admin menu into **SolarBMS** and **Carbonoz**. Every page calls the admin API above — no local data.

| Page | Route | What an admin does there |
|---|---|---|
| Overview | `/admin/overview` | Pipeline health: installations online/offline, messages in the last 24 h, stream backlog and workers, dead letters, MongoDB/Redis. |
| Customers | `/admin/customers`, `/admin/customers/:id` | Create/edit customers; add members by email (Owner/Admin/Viewer) and remove them; create sites. |
| Sites | `/admin/sites` | Every site with customer, installations and live status; links to its dashboard, installations, ingestion and data. |
| Installations | `/admin/installations` | Create SolarBMS installations (with `systemId`), edit, deactivate; issue machine credentials. |
| Machine credentials | `/admin/credentials` | List, rotate (API keys) and revoke. A new API key is shown once, with copy button and a confirmation before the dialog closes. |
| Ingestion | `/admin/solar` | Per installation: last received/processed, 24 h counts, accepted/duplicates, failed, queued, devices, cells, active alarms, latest status. Message list with filters and pagination, message inspector (stored payload, failure reason, original text) with **Reprocess**, dead letters with **Requeue**. |
| Devices & metrics | `/admin/solar/data` | Per site: devices, events (filters) and the metric catalogue (unit, type, first/last seen). |
| Solar dashboard | `/admin/dashboard/:siteId?/:tab?` | The customer dashboard (`SolarPage`) for any site, inside the admin shell. |
| Redex · Users · Logs | `/admin`, `/admin/users`, `/admin/logs` | Unchanged. |

- **Status rules** (server): an installation is *online* if it reported within 5 min, *offline* after that, *no data yet* if it never did, *deactivated* when switched off. A deactivated installation's credentials are rejected immediately.
- **Counters.** Accepted/duplicate counts are kept per installation in Redis (`solar:stats:<installationId>`) from the deployment of this version on; they are best-effort and never affect ingestion.
- **Metric "last seen"** is refreshed at most hourly per site, so the catalogue costs no extra write per message.

## 8. Tests

| Suite | Command | Covers |
|---|---|---|
| Backend unit | `npm test` | Normalizer (contract example from `solarbms-ingestion.md`, fixtures, robustness, system-level alarms), MongoDB-safe keys, return-address allowlist, exact email matching |
| Backend e2e | `npm run test:e2e` | Disposable MongoDB replica set, `redis-server` and mock Keycloak; the real API in-process: Keycloak login and login-CSRF, email-takeover regression, CSRF, refresh revocation/back-off, legacy cut-over, tenant isolation, machine auth, ingestion and dynamic data, out-of-order state, outage drills (Redis/MongoDB kill and restart, dead-letter, locking, two workers), admin panel API (provisioning, members, rotation/revocation, deactivation, ingestion stats, failed-then-reprocessed messages, alarms kept through reprocess, metric catalogue, non-admin denial), energy history (hourly integration, duplicates, local midnight/month/New Year in Europe/Berlin, missing ≠ zero, unknown metrics ignored, backfill cache refresh, 30d/1y/10y, validation, site authorization) |
| Frontend unit | `npm test` (offsettingdashboard) | Headline totals (fresh/stale/mixed/none), site model, formatting, energy flow, dynamic metrics (types, timestamps, all-values list), 16/24/32 cells, admin helpers, i18n (4 languages, fallback, plurals, completeness of catalogues, locale formats), language switching rendered in jsdom (immediate change, persistence, profile save), energy history adapter and view (loading/empty/error, localized table, ranges, phone layout) |

CI (`.github/workflows/ci.yml`) runs type checks, lint of the platform code, both unit suites, both builds and the e2e suite.

## 9. Configuration and rollout

Backend env: `server-api/.env.example`. Frontend: `VITE_API_URL=/api`, `VITE_AUTH_MODE=keycloak`. Solar host: `nginx-solar.conf`.

1. **Deploy.** Keep `KEYCLOAK_ENABLED=false` at first (legacy login unchanged); the site and Solar APIs are live.
2. **Audit admins.** Run `npm run audit:admins` against production (read-only). Review every ADMIN/SUB_ADMIN that isn't the seeded admin, and resolve case-duplicate emails.
3. **Provision** in the admin panel: Customers → New customer (owner) → New site → Installations → New installation (`systemId`) → Issue credential. Give the API key to the Pi and watch it appear under Ingestion.
4. **Keycloak.**
   - Realm `customers`: confidential client `carbonoz-login`, redirect `https://login.carbonoz.com/api/v1/auth/oidc/callback`, email verification required, no identity provider trusted for email.
   - Realm `machines`: one client per device, audience mapper `carbonoz-ingest`, role `solarbms-ingest`.
5. **Switch on SSO.** Build the frontend with `VITE_AUTH_MODE=keycloak` and set `KEYCLOAK_ENABLED=true`. Existing users are linked by their verified email.
6. **Cut over.** Once everyone uses Keycloak, set `LEGACY_AUTH_ENABLED=false`.
7. **Solar host.** Set `SESSION_COOKIE_DOMAIN=.carbonoz.com` and `AUTH_RETURN_ORIGINS=https://solar.carbonoz.com`.
8. **Redis** (6.2+, AOF on, `maxmemory-policy noeviction`). With ACLs, the API's user needs keys `~session:* ~session-refresh:* ~oidc-pending:* ~solar:*` and these commands:
   `ping hello auth select client|setinfo info get set setex del expire getdel hset hgetall hmget hincrby sadd srem smembers smismember xadd xlen xack xclaim xreadgroup xpending xrevrange xtrim xgroup xinfo`.
   Without `hincrby` the admin counters show "—"; without `xrevrange` the Redis dead-letter fallback isn't listed. Ingestion works either way.
9. **Indexes.** After deploying a new schema version, run `npx prisma db push --skip-generate` once (it creates the new indexes; take a `mongodump` first).

## 10. Open items

- **SolarBMS payload.** The real payload and the grid/battery sign convention (Andreas). Add it to `server-api/src/solar/normalize/fixtures/`.
- **Redex job.** Whether to enable the month-end Redex job (§6).
- **Retention.** How long to keep `SolarSample`/`SolarIngest` (TTL indexes), and rollups if history beyond 31 days is needed.
- **Credentials in git history.** `server-api/.env.production` and `.env.oauth` are no longer tracked (`.gitignore`), but earlier commits contain PayPal client credentials and the default admin password. Rotate them; rewriting history is optional once they are invalid.
- **Upstream UI.** Whether the SolarBMS web UI is ever needed (the optional `/bms/` block in `nginx-solar.conf`).
