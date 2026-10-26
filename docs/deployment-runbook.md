# Deployment runbook — login.carbonoz.com (SolarBMS platform)

For the server that runs the app: `localadmin@carbonoz-api` (192.168.160.190), checkout `~/login.carbonoz.com`, processes from `ecosystem.config.js` under pm2 (`carbonoz-api` = `server-api/dist/src/main.js` on :3000, `carbonoz-frontend` = `vite preview` on :5174), nginx in front (`/api` → :3000, `/` → :5174). The API reads `server-api/.env` (pm2 `cwd`).

**Nothing in this runbook prints a secret.** Commands that need the database URL read it from `server-api/.env` inside Node and print host/database only; the backup helper masks credentials in every line of tool output.

> State on 18 Oct 2026 (checked from outside, read-only): `https://login.carbonoz.com/api/v1/auth/config`, `/solar/…`, `/admin/solar/health` all answer **404** — production still runs the code from **before** the SolarBMS platform. The first deployment therefore brings the whole platform and retires the old one (section R). New behaviour that needs configuration is **off by default** (`KEYCLOAK_ENABLED=false`, `LEGACY_AUTH_ENABLED=true`, `INGEST_BRIDGE_ENABLED=false`); the first rollout needs **no** bridge or ingest-Redis credentials.

## 0. Preconditions — deployment is BLOCKED until every box is ticked

- [ ] **Credential rotation** — removing a secret from a file does not revoke it. Each owner confirms the old value no longer works:
  - `localadmin` SSH/sudo password of 192.168.160.190 (in git history of both repositories). Server owner. Confirmed by: ________
  - InfluxDB token of `carbonoz-unified-service` (tracked `.env` files, `ecosystem.config.js`, code fallback; in history). Influx owner — revoking it stops the unified service's Influx writes (retired feature, section R). Confirmed by: ________
  - The app-server credential and the Redis (192.168.160.155) password that were pasted into a chat on 18 Oct 2026: treat both as exposed. Server owner / Redis admin (Felix). Confirmed by: ________
  - The production `ADMIN_PASSWORD`, if it was ever the value committed in the old `server-api/.env.production` (in history). Server owner. Confirmed by: ________
- [ ] **Legacy retirement checks** (section R) done, results recorded, retirement impact accepted by the product owner.
- [ ] **Preflight** (section 1) passed on the server.
- [ ] **Backup taken and verified by a scratch restore** (section 2): `verify` printed `ok`.
- [ ] **Rollback safeguards** understood (section 5): `logs/previous-commit` will hold the running commit; a maintenance window is agreed.
- [ ] Explicit approval for this deployment.

## R. Retiring the old platform (intended end state)

SolarBMS replaces the old platform. These are **intentionally retired** with the first deployment; the new code no longer contains them:

| Retired | Old endpoints / parts (all under `/api/v1`) | Impact |
|---|---|---|
| Billing (plans, subscriptions, PayPal/Stripe) | `/billing/…`, PayPal webhook `POST /billing/webhook/paypal`, Subscribe page, admin Plans page | No new payments; PayPal webhook calls answer 404; existing `Subscription`/`Payment` documents stay in MongoDB untouched (read by nothing) |
| AI Charging | `/ai-charging/…` | Feature and UI gone |
| MQTT / Home Assistant / box clients | `/auth/hosts`, `/auth/authenticate`, `/box/…`, `/topic/…`, `/energy/…`, `/reports/…`, `/carbon-intensity/…`, `/socket.io` | HA add-on, Docker and desktop clients that log in or post through these stop working |
| Grafana / InfluxDB views | Analytics, Charts, Carbon Intensity, Diagnostics, Devices pages | Replaced by the Solar dashboard |
| `carbonoz-unified-service` (pm2 `carbonoz-unified`, port 8000) | not part of the new architecture | Per its repo config it writes `TotalEnergy` in database `carbonoz` on this server's MongoDB (192.168.160.190:27017), Redis keys on 192.168.160.185 (`redis-data`, `carbon-settings`, `ai-charging:*`) and InfluxDB on :8086. The new app reads `TotalEnergy` only as historical data (Redex months without SolarBMS data). |

Old bookmarks to the retired pages redirect to the Solar dashboard (`/admin/plans` → admin overview) instead of "not found".

**`carbonoz-unified-service` repository:** its credentials were removed and its `.env` files are no longer tracked (branch `remove-committed-secrets`). If that service is still deployed from git, **copy its `.env` aside before any `git pull` there** (git deletes a file that stops being tracked) and export `INFLUXDB_TOKEN` before `pm2 restart ecosystem.config.js`. Stopping or removing the service is a separate approval.

**Read-only checks before deploying** (on the server; record the numbers in the deployment ticket):

```bash
cd ~/login.carbonoz.com/server-api

# 1. Is carbonoz-unified-service still running, and is it still writing the shared database?
pm2 status | grep -Ei 'unified|name' ; ss -ltnp 2>/dev/null | grep -E ':(8000|8086|3001)\b' || true
node -e 'require("dotenv").config();const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$runCommandRaw({aggregate:"TotalEnergy",pipeline:[{$group:{_id:null,n:{$sum:1},lastDate:{$max:"$date"}}}],cursor:{}}).then(r=>console.log("TotalEnergy:",JSON.stringify(r.cursor.firstBatch[0]||{n:0}))).catch(e=>console.log("TotalEnergy: "+e.message.split("\n").pop())).finally(()=>p.$disconnect())'
#    → a lastDate of today/yesterday means it is still writing.

# 2. Active PayPal / Stripe subscriptions and recent payments (counts only, no personal data)
node -e 'require("dotenv").config();const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();const now={$date:new Date().toISOString()},d90={$date:new Date(Date.now()-90*864e5).toISOString()};(async()=>{const c=(q)=>p.$runCommandRaw(q).then(r=>r.n??r.cursor.firstBatch).catch(e=>"n/a ("+e.message.split("\n").pop()+")");console.log("subscriptions ACTIVE and not expired:",await c({count:"Subscription",query:{status:"ACTIVE",endDate:{$gt:now}}}));console.log("payments in the last 90 days by provider:",JSON.stringify(await c({aggregate:"Payment",pipeline:[{$match:{createdAt:{$gte:d90}}},{$group:{_id:"$provider",n:{$sum:1}}}],cursor:{}})));await p.$disconnect()})()'

# 3. Clients still calling retired endpoints (all retained nginx logs; counts by path, no IPs)
sudo sh -c 'zcat -f /var/log/nginx/access.log* 2>/dev/null' \
  | awk '{print $7}' \
  | grep -E '^/api/v1/(billing|ai-charging|box|topic|energy|reports|carbon-intensity)|^/api/v1/auth/(hosts|authenticate)|^/socket\.io' \
  | sed -E 's#\?.*##; s#/[0-9a-f]{24}#/:id#g' | sort | uniq -c | sort -rn | head -30
sudo sh -c 'zcat -f /var/log/nginx/access.log* 2>/dev/null' | grep -E '"(GET|POST) /api/v1/(auth/(hosts|authenticate)|box|topic)' | awk -F'"' '{print $6}' | sort | uniq -c | sort -rn | head   # user agents of HA/desktop clients
cd ..
```

Act on the results **before** deploying (each is a product/owner decision, not done by this runbook):

- Active subscriptions > 0 → decide refunds/cancellations and tell the customers; disable the PayPal webhook in the PayPal dashboard after deployment.
- Retired endpoints still called → tell those users (HA add-on / desktop app) that the integration ends; their data path is now SolarBMS.
- `carbonoz-unified` running → after the deployment, stop it (`pm2 stop carbonoz-unified && pm2 save`, separate approval). Until then it keeps writing `TotalEnergy`, which the Redex report may still read for months without SolarBMS data.
- Grafana (:3001) / InfluxDB (:8086) → decommission separately once nothing links to them.

## 1. Preflight (on the server, read-only)

```bash
cd ~/login.carbonoz.com

# 1. What is running and is the checkout clean? (a dirty tree can make `git pull --ff-only` stop)
git rev-parse HEAD; git log -1 --format='%h %cd %s'; git status --short
ls logs/deploy-in-progress 2>/dev/null && echo "an earlier deployment did not finish — see section 5"
pm2 status
node -v        # 18+ works; CI uses 20
which mongodump mongorestore   # MongoDB Database Tools, needed for section 2

# 2. Database and Redis targets — host and name only, never credentials (a malformed URL is reported as such, not printed)
cd server-api
node -e 'require("dotenv").config();for(const k of ["DATABASE_URL","REDIS_URL"]){const v=process.env[k];if(!v){console.log(k+": (not set)");continue}let u;try{u=new URL(v.replace(/^[a-z+]+:/,"http:"))}catch{console.log(k+": not a valid URL (not shown)");process.exitCode=1;continue}console.log(k+": host="+u.host+" path="+(u.pathname||"/")+" auth="+(u.username?"yes":"no")+" params="+[...u.searchParams.keys()].join(","))}'

# 3. Settings this version knows that the server .env does not set (names only; defaults apply)
comm -13 <(grep -oE '^[A-Z_]+' .env | sort -u) <(grep -oE '^[A-Z_]+' .env.example | sort -u)

# 4. MongoDB must be a replica set (Prisma); Redis must answer
node -e 'require("dotenv").config();const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$runCommandRaw({hello:1}).then(h=>console.log("mongo setName="+(h.setName||"NONE")+" primary="+h.isWritablePrimary)).catch(e=>{console.log("mongo: "+e.message.split("\n").pop());process.exitCode=1}).finally(()=>p.$disconnect())'
node -e 'require("dotenv").config();const{createClient}=require("redis");const c=createClient({url:process.env.REDIS_URL||"redis://localhost:6379",socket:{reconnectStrategy:false,connectTimeout:5000}});c.on("error",()=>{});c.connect().then(()=>c.ping()).then(r=>console.log("redis:",r)).catch(e=>{console.log("redis: "+e.message);process.exitCode=1}).finally(()=>c.quit().catch(()=>{}))'

# 5. Free disk for the backup and the builds
df -h ~ /var/lib/mongodb 2>/dev/null
cd ..
```

Stop if: the tree is dirty, a step prints an error or "not a valid URL", MongoDB is not a replica-set primary, the database target is not the one you expect, `mongodump`/`mongorestore` are missing, or disk is short.

## 2. Backup and scratch-restore verification (before every deployment that touches the schema)

Inside the maintenance window, so nothing writes while dumping (stop the old API first if needed: `pm2 stop carbonoz-api`).

**Where this runs and what it costs.** Both steps run on the production server against the **production MongoDB server** (the `DATABASE_URL` host). `dump` only reads. `verify` writes a full copy of the data into a separate **scratch database `<db>_restoretest` on that same MongoDB server**, then drops it; it never writes the real database (details after the commands). Implications:

- **Disk:** about 1× the database size for the dump in `~/backups`, plus about 1× data + indexes in MongoDB's data directory while the scratch copy exists — check free space first (below). MongoDB may keep the freed space allocated after the drop.
- **Load:** the restore and its index builds use CPU and disk I/O on the production MongoDB server for its duration; run it in the maintenance window, not under traffic.
- **Replica set:** the restore's writes go through the oplog. On a single-node set that only shortens the oplog window; with secondaries they replicate the scratch copy too.
- **Permissions:** the account needs write access to `<db>_restoretest` (see below).

```bash
cd ~/login.carbonoz.com/server-api
# Size of the database (read-only; MB) and free disk, before dump and verify
node -e 'require("dotenv").config();const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$runCommandRaw({dbStats:1,scale:1048576}).then(s=>console.log("db "+s.db+": data "+s.dataSize.toFixed(1)+" MB, storage "+s.storageSize.toFixed(1)+" MB, indexes "+s.indexSize.toFixed(1)+" MB")).catch(e=>{console.log("dbStats: "+e.message.split("\n").pop());process.exitCode=1}).finally(()=>p.$disconnect())'
df -h ~ /var/lib/mongodb 2>/dev/null
```

Stop if free space is under about 3× (storage + indexes).

```bash
cd ~/login.carbonoz.com/server-api
node scripts/db-backup.js dump                      # → ~/backups/<db>-<timestamp>/ + manifest.json (live counts)
node scripts/db-backup.js verify ~/backups/<db>-<timestamp>
cd ..
```

- `dump` fails if the dump differs from the live database (something was writing).
- `verify` restores into a scratch database `<db>_restoretest` (never the real one: the restore is limited to `<db>.*` and renamed to `<db>_restoretest.*`, other databases in the folder are ignored, and database names with pattern characters are refused). It also compares the real database's document counts before and after and fails if they changed. It checks every collection's document count against the live counts in `manifest.json`, then drops the scratch database. It must print `ok: …`. If the app's database user may not write `<db>_restoretest`, run `verify` with an admin account's `DATABASE_URL` in the environment (`DATABASE_URL=… node scripts/db-backup.js verify …`, typed, not pasted into chat).
- Output never contains the password (masked as `***`).

Restoring for real (only to recover from damaged data, with approval): stop the API, then

```bash
cd ~/login.carbonoz.com/server-api
# URI WITHOUT the database name + --dir = the backup root; with a database name in the URI, mongorestore restores nothing and still exits 0.
(umask 077; node -e 'require("dotenv").config();let u;try{u=new URL(process.env.DATABASE_URL)}catch{console.error("DATABASE_URL is not a valid URL (not shown)");process.exit(1)}const db=u.pathname.slice(1);u.pathname="/";if(u.username&&!u.searchParams.has("authSource"))u.searchParams.set("authSource",db);process.stdout.write(u.toString())' > ~/.restore-uri) \
  && set -o pipefail && mongorestore --uri="$(cat ~/.restore-uri)" --dir=~/backups/<db>-<timestamp> --nsInclude='<db>.*' --drop 2>&1 | sed -E 's#(mongodb(\+srv)?://)[^@/ ]*@#\1***@#g'
rm -f ~/.restore-uri
```

## 3. Deploy (bridge stays disabled)

```bash
cd ~/login.carbonoz.com
bash deploy-update.sh
```

`deploy-update.sh` records the running commit (rollback point) in `logs/previous-commit` and marks `logs/deploy-in-progress`; pulls `origin/main` fast-forward only; `npm ci` (API with `--legacy-peer-deps`); Prisma generate; the read-only system-ID duplicate check (**stops the deployment, exit 3, if any installations share a systemId — before any database change, build or restart**); `prisma db push` (additive on MongoDB: new collections and indexes; it does not drop the old billing collections or any data); both builds with an output check; only then `pm2 restart ecosystem.config.js`, `pm2 save`, and removes `logs/deploy-in-progress`. Any failing step stops the script **before** the restart.

If it stops after a build started, the running processes keep working (code is in memory), but `dist/` may be empty — **do not restart pm2 by hand; roll back (section 5) or fix and re-run.** Re-running keeps the original rollback point (it is not overwritten while `logs/deploy-in-progress` exists). The marker is written before `git pull`, so a failed pull (network, non-fast-forward, dirty tree) leaves the running commit checked out and recorded; a marker that does not name a commit stops the script before it does anything.

**Users sign in again once:** legacy login tokens now expire (`JWT_EXPIRES_IN`, default 12h) and tokens issued before this version (no expiry) are refused. The frontend sends users to the login page on the first 401.

New settings (defaults apply when unset; see `server-api/.env.example`): `JWT_EXPIRES_IN`, `AUTH_RATE_LIMIT_*` (brute-force limit on the password endpoints), `CLIENT_IP_HEADER=cf-connecting-ip` (set it: behind Cloudflare the proxy address is shared by many users), `TRUST_PROXY`, `KEYCLOAK_LINK_PRIVILEGED_BY_EMAIL` (keep `false`).

If it stopped at the duplicate check (exit 3): nothing was written to the database and nothing was built or restarted; only `server-api/node_modules` was reinstalled (the running API has its modules loaded). Resolve the duplicates in Admin → Installations, then re-run.

## 3b. Two hosts: backend on 192.168.160.95, frontend and Nginx on 192.168.160.190

The backend (`carbonoz-api`) runs on **192.168.160.95**; the frontend (`carbonoz-frontend`) and Nginx stay on **192.168.160.190**, where Nginx sends `/api` to `192.168.160.95:3000` (`nginx-https.conf`, `nginx-solar.conf`). Browsers still see one site, so session cookies and CORS are unchanged.

**Additional preconditions** (on top of section 0):

- [ ] **Database reachable from .95, with authentication.** Today the API reaches MongoDB as `localhost` on .190. From .95 it needs a network path: either .190's MongoDB opened to .95 only (bind address + firewall) **with authentication enabled first**, or the move to .150 (section 7, still blocked). Database owner decides. Confirmed: ________
- [ ] Main Redis (`REDIS_URL`) and Keycloak (if used later) reachable from .95.
- [ ] Felix agrees to the API running on .95 next to the ingestion API, and port 3000 is free there (else `API_PORT` + the Nginx `proxy_pass` port).
- [ ] Firewall on .95: port 3000 open to 192.168.160.190 only (server owner).
- [ ] Node 20 and pm2 on .95; the repository cloned at `~/login.carbonoz.com` with read-only GitHub access (deploy key).

**One-time setup on .95** (`server-api/.env` typed from the password manager, never pasted into chat):

```bash
cd ~/login.carbonoz.com/server-api
nano .env      # DATABASE_URL, REDIS_URL, JWT_SECRET, FRONTED_URL=https://login.carbonoz.com, ...
               # TRUST_PROXY=loopback,192.168.160.190   (Nginx on .190 is the proxy)
               # CLIENT_IP_HEADER=cf-connecting-ip
               # INGEST_BRIDGE_ENABLED=false  KEYCLOAK_ENABLED=false
```
Then section 1 (preflight) and section 2 (backup + verify) **from .95**, since the API's database connection is now made from there.

**Rollout order** (maintenance window):

1. **.95:** `cd ~/login.carbonoz.com && DEPLOY_ROLE=api bash deploy-update.sh` (schema change happens here). Check from .190: `curl -s -o /dev/null -w '%{http_code}\n' http://192.168.160.95:3000/api/v1/auth/config` → `200`.
2. **.190:** `cd ~/login.carbonoz.com && DEPLOY_ROLE=frontend bash deploy-update.sh` (no database step; restarts only the frontend). The old API on .190 keeps running untouched.
3. **.190:** install the updated Nginx site files (`/api` → .95), then `sudo nginx -t && sudo systemctl reload nginx`.
4. Section 4 checks against `https://login.carbonoz.com`.

**Rollback:** on .190 set `proxy_pass http://127.0.0.1:3000;` again and reload Nginx (the old API is still there), then roll back the frontend (section 5 on .190). The schema added from .95 stays; the old code ignores it (section 5).

**Afterwards (separate approval):** stop the old API on .190 (`pm2 stop carbonoz-api && pm2 save`) once the new one has run cleanly for an agreed period.

## 4. Verify

```bash
pm2 status
pm2 logs carbonoz-api --lines 80 --nostream | grep -Ei 'error|started|Server running|Solar worker'
curl -s -o /dev/null -w 'auth/config %{http_code}\n' https://login.carbonoz.com/api/v1/auth/config            # 200 (was 404)
curl -s -o /dev/null -w 'admin health %{http_code}\n' https://login.carbonoz.com/api/v1/admin/solar/health      # 401 without login (was 404)
curl -s -o /dev/null -w 'frontend %{http_code}\n' https://login.carbonoz.com/                                    # 200
curl -sI https://login.carbonoz.com/api/v1/auth/config | grep -iE 'x-content-type-options|x-frame-options|content-security-policy|x-powered-by'   # three headers, no x-powered-by
```

In the browser: sign in as the admin (`ADMIN_EMAIL`), open Admin → Overview (MongoDB/Redis green), Admin → Customers/Sites; sign in as a customer and open the Solar dashboard.

Then the database-level guard for systemIds:

```bash
cd ~/login.carbonoz.com/server-api
node scripts/installation-system-id-index.js check     # exit 0 = no duplicates
node scripts/installation-system-id-index.js apply     # refuses while duplicates exist
```

### Error-log records written before redaction (needs the data owner's approval)

Until this version, a failed request stored its body in the `logs` collection — a failed login stored the submitted password. Count first (read-only, prints counts only):

```bash
cd ~/login.carbonoz.com/server-api
node scripts/logs-credential-audit.js check
```

If the count is not 0: with the data owner's approval and after a verified backup (section 2), redact them in place (dry run first; only `metadata` and `requestUrl` of the matching records change, nothing is deleted):

```bash
node scripts/logs-credential-audit.js redact            # dry run
node scripts/logs-credential-audit.js redact --apply
node scripts/logs-credential-audit.js check             # expect 0
```

Passwords that may have been logged belong to users who mistyped them at login; consider asking affected users to change their password.

### Before turning Keycloak on (separate approval)

ADMIN/SUB_ADMIN accounts are never linked to Keycloak by email. With the Keycloak administrator, take each admin's Keycloak user ID and link it deliberately (dry run first):

```bash
node scripts/link-identity.js --email <admin email> --subject <keycloak user id>
node scripts/link-identity.js --email <admin email> --subject <keycloak user id> --apply
```

### Turning on single sign-on (auth.carbonoz.com)

Keycloak (set up by Felix on 192.168.160.160, public at `https://auth.carbonoz.com`): realm **`customers`** (display name CARBONOZ), confidential client **`carbonoz-portal`** for login.carbonoz.com and **`carbonoz-portal-dev`** for `http://localhost:5174`.

Check on the client `carbonoz-portal` (Keycloak admin console → Clients → carbonoz-portal):

- Settings → Capability config: **Client authentication on**, Standard flow on, Direct access grants off; PKCE method **S256** (the API always sends a code challenge).
- Valid redirect URI `https://login.carbonoz.com/api/v1/auth/oidc/callback`, post-logout `https://login.carbonoz.com/*`, web origin `https://login.carbonoz.com` (as set).
- Credentials tab: the client secret goes into the API `.env` on api2 only (never into Git or chat).

API `.env` on api2 (then `pm2 restart carbonoz-api --update-env`):

```
KEYCLOAK_ENABLED=true
KEYCLOAK_ISSUER_URL=https://auth.carbonoz.com/realms/customers
KEYCLOAK_CLIENT_ID=carbonoz-portal
KEYCLOAK_CLIENT_SECRET=<Credentials tab>
KEYCLOAK_REDIRECT_URI=https://login.carbonoz.com/api/v1/auth/oidc/callback
KEYCLOAK_POST_LOGOUT_REDIRECT_URI=https://login.carbonoz.com/
AUTH_RETURN_ORIGINS=https://login.carbonoz.com,https://solar.carbonoz.com
```

Frontend on .190: build with `VITE_AUTH_MODE=keycloak` in `offsettingdashboard/.env`, then `DEPLOY_ROLE=frontend bash deploy-update.sh`. Check: `curl -s https://login.carbonoz.com/api/v1/auth/config` answers `{"data":{"sso":true}}`; the login button opens auth.carbonoz.com.

**Creating users (with SSO):** people are created in Keycloak, not in Carbonoz: realm CARBONOZ → Users → Add user, e-mail, **Email verified on**, Credentials → Set password with **Temporary on**. To give them their site before the first sign-in, add the same e-mail as a member of the customer in Carbonoz Admin (or Admin → Users → Prepare): this prepares a Carbonoz account **without a password**, and their first Keycloak sign-in links to it by the verified e-mail. Admin accounts are never linked by e-mail — use `scripts/link-identity.js` as above. Keep `LEGACY_AUTH_ENABLED=true` until every existing user has signed in once through Keycloak, then set it to `false`.

## 5. Rollback

```bash
cd ~/login.carbonoz.com
git checkout "$(cat logs/previous-commit)"          # detached HEAD at the version that ran before
cd server-api && npm ci --legacy-peer-deps && npm run prisma:generate && npm run build && cd ..
cd offsettingdashboard && npm ci && npm run build && cd ..
pm2 restart ecosystem.config.js && pm2 save
rm -f logs/deploy-in-progress
# Before the next deployment: git checkout main
```

Which situation you are in (from the deploy output and `pm2 status`):

| Where the deployment stopped | Database | Running processes | What to do |
|---|---|---|---|
| Before the duplicate check finished (pull, `npm ci`, Prisma generate) or **at** the check (exit 3) | unchanged | old version, still running | Fix the cause and re-run, or run the rollback above (no restore needed). |
| After `prisma db push`, before `pm2 restart` (a build failed) | new collections and indexes added; existing data unchanged | old version, still running from memory; `dist/` may be empty | **Do not restart pm2 by hand.** Fix and re-run, or run the rollback above. No restore needed. |
| After `pm2 restart` (new version ran) | as above, plus anything the new version wrote | new version | Run the rollback above. No restore needed unless data was damaged (below). |

What a rollback does and does not undo:

- **Code:** fully back to the recorded commit; `.env`, `logs/`, backups and other untracked files are kept. The retired features (billing, AI charging, MQTT endpoints, Grafana views) come back with the old code.
- **Schema:** not undone, and it does not need to be. Checked on a scratch MongoDB with the pre-SolarBMS schema of commit `6ae4f66` (confirm in preflight that production runs that commit or one with the same schema): the new `prisma db push` keeps all 23 old collections and every index on them unchanged, and only adds 15 new collections; a later `db push` keeps the systemId index created by the script. The old code ignores the new collections and indexes.
- **Data written by the new version:** stays in the database. The old code ignores the new collections (`Customer`, `Site`, `Installation`, `Solar*`, …). Users the new version created in the shared `User` collection lack the old field `manualAccessOverride`; checked: the old Prisma client reads them without error and returns `false`. Users that only ever signed in through Keycloak have no password, so they cannot log in to the old version.
- **Database recovery limits:** a rollback never needs the backup. Restoring the backup (section 2, "Restoring for real") returns the **whole** database to the backup time and **loses everything written after it** (new users, sites, installations, SolarBMS readings, profile changes, and anything the old version wrote after a rollback). Use it only for damaged data, with the API stopped and explicit approval; then verify document counts against the backup's `manifest.json`. There is no partial or point-in-time restore.

## 6. Enable the Raspberry ingest bridge (separate approval)

Preconditions — all required:

- a real Raspberry stream entry has been inspected (field layout → `INGEST_PAYLOAD_FIELD` if not detected) and added as a test fixture;
- the installation exists in Admin → Installations with **systemId = the Pi's `site`**, used by no other installation;
- the Redis admin (Felix) has issued the consumer account and opened 192.168.160.155:6379 to this server; for group mode also created the group;
- `node scripts/installation-system-id-index.js check` exits 0.

```bash
# on the server, credentials from the password manager typed into the editor, never on the command line
nano ~/login.carbonoz.com/server-api/.env
#   INGEST_BRIDGE_ENABLED=true
#   INGEST_REDIS_URL=redis://consumer:<password>@192.168.160.155:6379
#   INGEST_BRIDGE_MODE=xread            # or group (see Redis permissions)
#   INGEST_BRIDGE_START=<id>            # decide explicitly (below); anything other than 0-0, <ms>-<seq> or $ is refused
pm2 restart carbonoz-api
pm2 logs carbonoz-api --lines 50 --nostream | grep -E 'ingest bridge|ingest entry='
```

**Start position** (only for the first start; afterwards the stored cursor wins):

- `0-0` — process everything still in the stream (history the stream retains).
- `<ms>-<seq>` — continue after that entry (e.g. the last entry checked by hand with Felix).
- `$` — after the newest entry present at the first start. Resolved once with `XREVRANGE` and stored before reading, so a restart never skips anything; entries already in the stream at that moment are **not** processed (logged as a warning).

Verify: Admin → Overview / `GET /api/v1/admin/solar/health` → `ingestBridge.connected: true`, `standby: false`, `configError: null`, `backlog` falling to 0, `upToDate: true`, `lastError: null`; no dead letters for the Pi's site; the customer dashboard shows the site as Live with the newest reading at most about one send interval old. Then compare a few stored readings with the Pi's own values before widening the rollout.

Monitoring (same health endpoint): `backlog` (entries not yet processed, xread mode, counted to 1000), `gaps` (stream trimmed past the bridge position — data lost upstream), `deadLettered`, `lastError`/`lastErrorAt`, `standby` (another instance holds the lock), and in group mode `groupPending`/`groupLag`.

Disable: set `INGEST_BRIDGE_ENABLED=false`, `pm2 restart carbonoz-api`. Nothing is lost: the stream keeps the deliveries and the bridge keeps its position (cursor in MongoDB, or the consumer group).

**One active bridge per stream:** a lock in MongoDB (`SolarBridgeLock`, renewed every read and entry, 30 s) keeps a second process (pm2 reload/scale, a second server) on standby; it takes over when the holder stops or its lock expires. Each reading is also processed under a per-reading lease, so overlapping processes, retries, replays or an admin reprocess never store a reading twice.

**Failures:** MongoDB or main-Redis outages are retried with backoff (1 s … 30 s) without acknowledging, so nothing is lost while the stream retains the entries; the bridge stalls on that entry until the database is back (head-of-line, by design). A permanent error for one reading marks that ingest FAILED with its raw payload kept (Admin → Ingestion → reprocess). An entry that fails 5 times in a row for a non-transient reason is dead-lettered and the stream moves on.

**Dead letters** (`SolarDeadLetter`, admin-only): reason plus the stream entry with secret-looking fields dropped and credential fields inside the JSON redacted at any depth; readings are kept so the entry can be replayed (`POST /api/v1/admin/solar/ingest-bridge/dead-letters/:id/replay`, logged with the admin's id). Retention: until replayed or reviewed; review and clear them weekly (product/data owner to confirm a fixed retention).

### Redis permissions for the bridge account

| Mode | Commands on `~ingest:readings` | Notes |
|---|---|---|
| `xread` | `+xread +xrange +xrevrange +xlen +xinfo\|stream` | all `@read`; position stored in MongoDB (`xrevrange` only for `INGEST_BRIDGE_START=$`) |
| `group` | the above `+xreadgroup +xack +xautoclaim +xpending +xinfo\|groups` | `xreadgroup`/`xack`/`xautoclaim` are `@write` (they change the group's pending list, not stream data); the Redis admin creates the group: `XGROUP CREATE ingest:readings carbonoz-bridge $` |

The bridge never uses `XGROUP CREATE/DESTROY`, `XDEL`, `XTRIM`, `DEL` or configuration commands.

## 7. Moving the application database to 192.168.160.150 (separate approval)

Not a configuration change alone. Preconditions: authentication enabled on .150 and a dedicated least-privilege user for Carbonoz (`readWrite` on its database), network access limited to the app server, backups configured, and an inventory of what .150 already holds (do not write into an existing database).

1. Maintenance window: `pm2 stop carbonoz-api` (stops writes and the bridge).
2. `node scripts/db-backup.js dump` and `verify` (section 2).
3. `mongorestore` into the new, empty database on .150 with the new user (URI without database name, `--dir`, as in section 2; never `--drop` an existing database there).
4. Point `DATABASE_URL` in `server-api/.env` at .150, run `npx prisma db push --skip-generate` and `node scripts/installation-system-id-index.js apply` against it.
5. `pm2 start carbonoz-api`, verify (section 4), compare per-collection counts with the backup's `manifest.json`.

Rollback: set `DATABASE_URL` back to the old database (untouched since the dump) and restart; writes made on .150 in between must be reconciled by hand.

## 7. Telegram bot and alerts (separate approval, off by default)

Code: `server-api/src/telegram/`. Everything is off unless `TELEGRAM_ENABLED=true` **and** a bot token (and, in webhook mode, a valid webhook secret) are set; alerts need a second switch, `TELEGRAM_NOTIFICATIONS_ENABLED=true`. While off, `GET /api/v1/telegram` answers `{ enabled: false }`, the website hides the section and every other Telegram route answers 404.

**Blocked until** the live ingestion path, the metric mapping (`soc_pct`, `battery_power_w`, `grid_power_w`, `pv_power_w`, `load_power_w`), units, timestamps and the battery sign (+ = charging) are verified on the real sites. Alerts are computed from the same read model as the dashboard; a wrong mapping means wrong alerts.

Schema: four new collections (`TelegramLinkCode`, `TelegramLink`, `TelegramIncident`, `TelegramMessage`), added by `npx prisma db push --skip-generate` after the backup of section 2. Nothing existing changes.

1. **Bot** (owner of the Carbonoz Telegram account): create it with @BotFather (`/newbot`), keep the token in the password manager. Optional: `/setprivacy` → Enable, `/setjoingroups` → Disable (the bot only works in private chats anyway).
2. **API `.env` on api2** (typed into the editor, never on a command line or in chat):
   ```
   TELEGRAM_ENABLED=true
   TELEGRAM_NOTIFICATIONS_ENABLED=false     # step 5
   TELEGRAM_BOT_TOKEN=<from the password manager>
   TELEGRAM_BOT_USERNAME=<bot name without @>
   TELEGRAM_MODE=webhook
   TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
   ```
   `pm2 restart carbonoz-api --update-env`; check `GET /api/v1/telegram` (signed in) shows `enabled: true`.
3. **Webhook**: Nginx on .190 must pass `POST /api/v1/telegram/webhook` to the API. The frontend calls the API under `/api` (`VITE_API_URL=/api`); confirm the location also passes this POST: `curl -s -X POST https://login.carbonoz.com/api/v1/telegram/webhook` must print the API's JSON 404 (no secret sent), not Nginx's HTML error page. Register it once on api2, in `/var/www/login.carbonoz.com/server-api`:
   ```bash
   node scripts/telegram-webhook.js set     # url defaults to https://login.carbonoz.com/api/v1/telegram/webhook
   node scripts/telegram-webhook.js info    # registered URL, pending updates, last delivery error
   ```
   The script reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from `server-api/.env` as data (`dotenv.parse`; `dotenv` 16.4.5 is a declared dependency, the same version `@nestjs/config` uses): the file is never run as a shell script (do **not** `source` it: values such as `SMTP_FROM="Carbonoz" <…>` or a password with `$`/backticks would be interpreted), neither value is printed or put on a command line, and only Telegram's answer is shown. No public URL? `TELEGRAM_MODE=polling` instead, and no webhook. Never both: `node scripts/telegram-webhook.js delete` before polling.
4. **Bot only, with a test account**: Settings → Telegram → *Create link code*, open the bot, `/status`, `/battery`, `/sites`, `/unlink`. Values must match the dashboard.
5. **Alerts**: `TELEGRAM_NOTIFICATIONS_ENABLED=true`, restart. One API process holds the `telegram-notifier` lock; `GET /api/v1/admin/telegram/stats` (admin) shows links, message counts (no chat ids, no texts) and `ingestionOutageSuspectedSince`.

How alerts behave (what to expect after step 5):
- **Per installation.** Delayed (`TELEGRAM_STALE_MINUTES`, default 15, minimum 10), offline (`TELEGRAM_OFFLINE_MINUTES`, default 60) and "no data" are judged per active installation from its newest reading, so a quiet installation is never hidden by another one that keeps reporting. Inactive installations are not watched.
- **Values as on the dashboard.** A device is live while its reading is at most 5 min old (`LIVE_STALE_MS`); when any device is live, only live devices count. Low battery is judged on live readings only: a delayed installation's old SoC never raises or clears it. The site SoC is the plain (not capacity-weighted) average of the live batteries, as on the dashboard. **Risk:** one low battery can be hidden by the average (10% and 70% → 40%: no alert at a 20% threshold). Changing this is a product decision for the dashboard and Telegram together (per-battery alerts, a capacity-weighted SoC, or both); it is deliberately not changed yet.
- **Honest recovery.** "Recovered"/"reporting again"/"alarm cleared" is sent only when the condition genuinely cleared (battery at least 5 points above the threshold the alert was opened with, the alarm's clear confirmed (below), the installation reports live data again). Switching an alert type off, changing the threshold, deselecting a site or deactivating an installation closes the alert silently.
- **Alarms.** One alert per alarm identity (installation, device, code), whichever `SolarEvent` row currently represents it: the store writes a new row each time an alarm reappears after a reading without it. An alarm missing from the active list counts as cleared only after it stayed absent for 15 min while its installation reported **live** data the whole time (a reading at most 5 min old, the dashboard's "Live"); if it comes back before, nothing is sent. Whenever the installation is not live, the 15 min start again once live data returns, so one reading after an offline gap never clears an alarm. Consequence: an installation that reports less often than every 5 min never confirms a clear (the alarm alert then stays open). So a payload that includes its alarm list only now and then sends one alert, not an alert/clear pair per reading.
- **Re-checked before sending.** Every send (retries included) checks that the chat is still linked, the user active and the site still allowed and selected; otherwise the message is dropped (`lastError: discarded: <reason>`), never sent. A 403 from Telegram revokes only the link of that message's chat.
- **Old and obsolete messages.** An alert is not sent once its incident is resolved, or when it is older than 2 h; a recovery only when its alert was actually delivered (it waits while the alert is still being sent), and not when older than 24 h; notices expire after 1 h. Dropped as `discarded: obsolete` / `discarded: expired`. This matters after an API downtime or when alerts were switched off and on again.
- **One sender.** The notifier lock (row `telegram-notifier` in `SolarBridgeLock`, as the ingest bridge) is renewed before every link evaluated and every message sent; a process that lost it (paused for longer than 5 min) stops immediately, so two passes never overlap.
- **Carbonoz-side outages and their backlog.** Two existing times per installation: when the platform last *stored* a reading (`Installation.lastSeenAt`, server clock, also for old backlog) and the newest *measurement* stored (max `SolarDevice.lastSeenAt`, forward-only). If at least 3 installations were stored in the last 7 days and at least 80% of them have not been stored for over 5 min, an ingestion outage is assumed: no delayed/offline/no-data alert is opened or resolved (open ones stay, low battery and alarms continue). When storing resumes the pause **continues while the backlog is replayed**, until the share of installations with a live measurement (≤ 5 min) is back to the baseline minus 10 points (80% if no baseline yet), or until too few installations are left to judge. The baseline is the lowest live share over a full hour of steady operation (fewer than 20% of installations not stored, and fewer than 20% stored but measured long ago), sampled only from one hour after alerts last resumed; so neither the passes right after a recovery nor a fleet still behind after a give-up can lower it. If the fleet has not caught up 6 h after storing **first** resumed in that incident, alerts resume anyway (logged), so a lasting problem is not hidden; a relapse into outage does not restart the 6 h. The state is kept in Redis (`telegram:fleet-state`) with the time it was computed: a restart continues it, and after a failed save the newer in-memory state wins over the older copy in Redis. Logged as `ingestion outage suspected` / `… storing again, backlog not caught up` / `… caught up` / `… not caught up after 6 h`; `GET /api/v1/admin/telegram/stats` shows `ingestionOutageSuspectedSince` and `ingestionCatchingUpSince`.

Known limits: the outage check cannot tell a Carbonoz outage from many customers losing internet at once (a regional ISP failure is also paused); with fewer than 3 recently active installations it never pauses, so a platform outage then looks like site outages. Installations whose clocks are permanently behind lower the healthy share and are tolerated by the baseline; if many fall behind *during* an outage, the pause can last up to the 6 h limit. If Redis is unavailable, the state is kept in memory only (a restart then re-detects an outage on the first pass, but a restart during the catch-up phase ends the pause). Ordering by computation time assumes the API hosts' clocks agree (as the notifier lock already does). After a give-up, every installation still behind gets its delayed/offline alert (capped by the per-chat hourly limit). The access re-check runs immediately before each send; a revoke in the same moment can still let that one message through. Sent, dropped and dead messages and resolved incidents are kept (no automatic clean-up yet).

Rollback: `TELEGRAM_ENABLED=false` and restart (links and history stay; nothing is sent). To stop Telegram calling the server: `node scripts/telegram-webhook.js delete`. If the token leaked: @BotFather `/revoke`, new token into `.env`, restart, `node scripts/telegram-webhook.js set` again.
