# SolarBMS → Carbonoz ingestion API

How a SolarBMS system (Raspberry Pi) sends its data to Carbonoz. Version 1.

## 1. Credentials

Each installation (one SolarBMS system) gets its **own** machine credential from Carbonoz. It identifies the device, never a person, and can only write data for that one installation.

Two options are supported. Carbonoz tells you which one your installation uses.

| Option | What you receive | What you send |
|---|---|---|
| Carbonoz API key | `czk.<id>.<secret>` (shown once) | `Authorization: Bearer czk.<id>.<secret>` |
| Keycloak client | a client id + secret in the Carbonoz machine realm | get a token with the client-credentials grant, then `Authorization: Bearer <access_token>` |

Keycloak token request:

```
POST https://auth.carbonoz.com/realms/machines/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<id>&client_secret=<secret>
```

Reuse the token until shortly before `expires_in`, then request a new one.

Keep the credential on the Pi only. If it leaks, Carbonoz revokes it and issues a new one. A revocation takes effect within 60 seconds.

## 2. Endpoint

```
POST https://login.carbonoz.com/api/v1/ingest/solarbms
Content-Type: application/json
Authorization: Bearer …
```

The body is **one message**, or `{ "messages": [ … ] }` with up to 100 messages (for sending buffered data after an outage).

| Response | Meaning | What to do |
|---|---|---|
| `202` + `{"data":[{"messageId":"…","status":"queued"}]}` | Accepted | Done |
| `202` with `"status":"duplicate"` | Already received | Done; don't resend |
| `400` | Not a JSON object, invalid JSON, or more than 100 messages | Fix the payload |
| `413` | Request larger than 100 kB | Split into smaller requests |
| `401` | Credential missing, wrong, expired or revoked | Refresh the token; if it persists, contact Carbonoz |
| `409` | `systemId` belongs to a different installation | Check configuration |
| `503` | Temporary problem or ingestion backlog | Retry with backoff; keep the data buffered |
| other `5xx`, timeout, network error | Temporary problem | Same as `503` |

## 3. Message

Send everything the SolarBMS API has. **Unknown fields are accepted and stored**, so new metrics need no Carbonoz change. Carbonoz keeps the original message exactly as sent and derives its own normalized data from it.

```json
{
  "schemaVersion": "1",
  "messageId": "4f7c7c1e-2b1a-4d7e-9a53-8a0a8a1d2c11",
  "systemId": "sbms-andreas-01",
  "timestamp": "2026-09-29T10:00:00Z",

  "measurements": {
    "pvPower": 4200, "loadPower": 1300, "gridPower": -800, "batteryPower": 2100, "soc": 67
  },

  "inverters": [
    { "id": "GW-123", "manufacturer": "Growatt", "model": "SPH 6000", "status": "Normal",
      "power": 4100, "acFrequency": 50.01, "dailyYieldKwh": 12.4 }
  ],

  "batteries": [
    { "id": "bat-1", "soc": 67, "voltage": 53.1, "current": 39.5, "temperature": 24.2,
      "bms": {
        "id": "seplos-1", "manufacturer": "Seplos", "status": "Charging",
        "alarms": [{ "code": "CELL_OVERVOLT", "message": "Cell over voltage", "severity": "warning" }],
        "temperatures": [23.9, 24.4, 25.0],
        "cells": [
          { "id": 1, "voltage": 3.311, "timestamp": "2026-09-29T09:59:58Z" },
          { "id": 2, "voltage": 3.325 }
        ]
      } }
  ],

  "events": [
    { "timestamp": "2026-09-29T09:58:00Z", "level": "info", "code": "GRID_RESTORED",
      "message": "Grid restored", "deviceKind": "inverter", "deviceId": "GW-123" }
  ],

  "forecast": {
    "source": "solcast", "generatedAt": "2026-09-29T06:00:00Z",
    "points": [{ "ts": "2026-09-29T12:00:00Z", "pvPowerW": 5200 }]
  }
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `messageId` | recommended | Unique per message. Makes retries safe: the same id is stored once. If missing, Carbonoz uses a hash of the body. |
| `systemId` | recommended | Your id for the system. Must match the installation's registered id. |
| `timestamp` | recommended | Time of the reading: ISO 8601 or epoch seconds/milliseconds. Devices and cells can carry their own `timestamp`. If missing, the receive time is used. |
| `measurements` | – | System totals. `metrics`, `system`, `energy` and `totals` are accepted too. |
| `inverters` | – | Array, or an object keyed by id. |
| `batteries` | – | Array, or an object keyed by id. Each may contain a `bms` object (or array). A top-level `bms` array with `batteryId` also works. |
| `cells` | – | Numbers (`[3.31, 3.32]`) or objects `{id, voltage, temperature?, balancing?, timestamp?}`. Any other per-cell field (e.g. `cellResistance`, `balancingCurrentMa`) is kept too. Voltages above 100 are read as millivolts. Also accepted as `cellVoltages`. Each BMS may report a different number of cells. |
| `alarms` / `warnings` | – | On a device (inverter, battery, BMS) or at the top level for the whole system. Strings, objects `{code, message, severity, active}`, or flags `{ "overTemp": true }`. Carbonoz records when an alarm appears and when it clears (it clears when a newer reading of that device no longer reports it). |
| `events` | – | One-off events. |
| `forecast` | – | `points` / `values` / `hours` with a timestamp each. |

- **Names:** camelCase or snake_case both work (`pvPower`, `pv_power`).
- **Units:** metrics without a unit in the name are taken as W, V, A, °C and %. When a value uses another unit, put it in the name, e.g. `dailyYieldKwh` or `voltageMv`.
- **Sign convention (to confirm):** positive `gridPower` = import from the grid, positive `batteryPower` = charging. Please tell us if SolarBMS uses the opposite.

Minimum/maximum cell voltage, cell spread and average are calculated by Carbonoz when you don't send them. Values you send yourself are kept as sent.

- **Any field name works.** Names MongoDB can't store (containing a NUL byte or `.`, or starting with `$`) are stored under a substitute name, and Carbonoz also keeps your message exactly as sent.
- **Nothing is silently dropped.** A message Carbonoz can't process even after retries is kept for inspection and can be re-run once the cause is fixed.
- **Energy history uses power, not counters.** Daily/monthly/yearly kWh are integrated from `pvPower`, `loadPower`, `gridPower` and `batteryPower`. Energy counters you send (e.g. `dailyPvEnergyKwh`) are stored and shown, but not used for history until we agree on their exact meaning (reset time, cumulative or interval).
- **Limit on new metric names.** Carbonoz tracks at most 2000 distinct metric names per site. Beyond that, new names are kept in the stored message but not charted; a well-behaved system never reaches this.

## 4. Sending

- **Frequency:** send every 10–60 s. Batch older buffered data with `{ "messages": [...] }`.
- **Retries:** retry on any `5xx`, timeout or network error with the same `messageId`. Carbonoz stores each message only once.
- **Clock:** keep the Pi's clock in sync (NTP). Timestamps more than 5 minutes ahead of Carbonoz's time are replaced by the receive time.
- **Size:** keep a single request under 100 kB (split large backfills into several requests).
