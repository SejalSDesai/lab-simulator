# TASK-004: Multi-Channel Well Selection UI

**Spec:** SPEC-002 → Well Selection Mode  
**Status:** Ready  
**Complexity:** Standard  
**Branch:** feature/spec-002  
**Blocked by:** TASK-003

## What to Build

When a multi-channel pipette is selected in the protocol builder step form, show a selection mode control and adapt the well input accordingly.

## Acceptance Criteria

- When a pipette with `tipCount > 1` is selected, a **selection mode control** appears with three options: Column, Row, Individual.
- Single-channel pipettes show no selection mode control (existing behavior).

### Column mode
- User enters or selects a starting column number.
- UI displays which wells will be affected (e.g., "A1–H1 (8 wells)") as a read-only preview.
- Source and destination each have their own column selector.

### Row mode
- User enters or selects a starting row letter.
- UI displays which wells will be affected (e.g., "A1–A12 (12 wells)") as a read-only preview.
- Source and destination each have their own row selector.

### Individual mode
- User selects wells manually — same multi-well selection UI already in place for single-channel steps.
- If the number of selected wells does not equal the pipette's `tipCount`, a validation warning is shown inline. The step cannot be saved until the count matches.

### General
- Switching selection mode resets the well selection for that step (source and destination cleared).
- The step list entry for a multi-channel step shows the pipette name, selection mode, and range (e.g., "P300 8-ch · Col 1 → Col 3" or "P300 8-ch · 8 wells").

## Out of Scope

- Simulation execution (TASK-005).
- Canvas animation (TASK-006).
