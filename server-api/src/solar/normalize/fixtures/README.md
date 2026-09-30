# SolarBMS payload fixtures

Every `*.json` file here is run through the normalizer by
`solarbms.contract.spec.ts`. The test checks that the payload parses without
throwing, that devices are found, and that every numeric leaf of the payload
shows up as a metric, a cell value or in the raw payload.

When Andreas sends a real SolarBMS message:

1. Save it here, e.g. `andreas-2026-10.json`, exactly as the Pi sends it.
   Remove secrets first.
2. Optionally add `andreas-2026-10.expect.json` with values the normalizer
   must produce, for example:
   `{ "SYSTEM": { "pv_power_w": 4200 }, "BMS:seplos-1": { "cell_count": 16 } }`
3. Confirm the grid/battery sign convention and update `SOLAR_SIGN` in
   `offsettingdashboard/src/features/solar/model.ts` if it differs.
