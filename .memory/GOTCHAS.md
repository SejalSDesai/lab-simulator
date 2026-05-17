# Lab Simulator — Gotchas

Hard-won lessons from lab-simulator development. Read before working on tasks.

- Well IDs are normalized internally (A01 → A1) — always use normalized form in state
- Simulation runs on a deep copy of plates — never mutate original plate state during a run
- xlsx library is lazy-loaded on demand (only when an Excel file is uploaded) — do not import it at module top-level
- 8-channel pipette (P300) is defined but currently executes sequentially — logic does not parallelize across columns
- localStorage key is `'lab-simulator-protocol'` — stores `{ protocol, plates }` as JSON
