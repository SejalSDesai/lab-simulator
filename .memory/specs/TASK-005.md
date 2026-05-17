# TASK-005: Multi-Channel Simulation Logic

**Spec:** SPEC-002 → Parallel Execution  
**Status:** Ready  
**Complexity:** Standard  
**Branch:** feature/spec-002  
**Blocked by:** TASK-003

## What to Build

Update the simulator to execute multi-channel steps in parallel — all source wells aspirated and all destination wells filled in a single logical operation.

## Acceptance Criteria

### Volume tracking
- All source wells in a multi-channel step each lose `volume` µL simultaneously (not sequentially).
- All destination wells each gain `volume` µL simultaneously.
- Volume validation runs per well pair independently: each source must have enough volume; each destination must have enough remaining capacity.
- If any single well pair fails validation, the entire multi-channel step is flagged as an error. No partial execution.

### Tip change accounting
- A multi-channel step counts as **one tip change event**, not N tip changes (where N = tip count).

### Stats panel
- Total volume transferred for a multi-channel step = `volume × tipCount`.
- Stats panel displays this correctly (not just `volume`).
- The distinction between "volume per tip" and "total volume transferred" is visible in the stats output.

### Backwards compatibility
- Single-channel steps (tipCount 1) execute identically to before.
- Existing saved protocols load and simulate without error.

## Out of Scope

- UI or well selection (TASK-004).
- Animation (TASK-006).
