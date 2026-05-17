# TASK-003: Multi-Channel Data Model

**Spec:** SPEC-002 → Pipette Tip Count, Well Selection Mode  
**Status:** Ready  
**Complexity:** Mechanical  
**Branch:** feature/spec-002  
**Blocked by:** none

## What to Build

Extend the TypeScript types and pipette definitions to carry tip count and well selection mode. No UI or logic changes — data model only.

## Acceptance Criteria

- `Pipette` type (or equivalent) has a `tipCount: number` field. Single-channel pipettes have `tipCount: 1`.
- Existing pipettes (P20, P200, P1000, P300 8-channel) are updated with correct tip counts.
- Two new pipettes are added: **P300 12-channel** (tipCount 12, 20–300 µL).
- Protocol step type has an optional `selectionMode` field with values: `'column' | 'row' | 'individual'`. Defaults to `'individual'` for single-channel steps and existing steps (backwards compatible).
- Steps with `selectionMode: 'column'` or `'row'` store the starting column number or row letter respectively (as a typed field, not jammed into the well string).
- All existing localStorage-persisted protocols continue to load without error (new fields are optional with safe defaults).
- TypeScript compiles with no new errors.

## Out of Scope

- UI changes (TASK-004).
- Simulation logic changes (TASK-005).
- Animation changes (TASK-006).
