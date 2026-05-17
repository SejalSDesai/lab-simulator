# SPEC-002: Multi-Channel Pipette Support

**Status:** Planned  
**Created:** 2026-05-17  
**Branch:** feature/spec-002

## Problem

The existing P300 8-channel pipette executes steps sequentially, the same as a single-channel pipette. This misrepresents how multi-channel instruments work and makes the simulator misleading for protocols that rely on parallel dispensing.

## Behavioral Goal

Multi-channel pipette steps transfer liquid in parallel — all active tips aspirate and dispense simultaneously. The animation reflects this. Volume tracking accounts for each tip independently.

---

## Feature: Pipette Tip Count

### Pipette Definition

Each pipette has a **tip count** — the number of channels that operate in parallel. Single-channel pipettes have tip count 1. Multi-channel pipettes have tip count > 1.

Built-in multi-channel pipettes (at minimum):

| Name | Tip count | Volume range |
|------|-----------|-------------|
| P300 8-channel | 8 | 20–300 µL |
| P300 12-channel | 12 | 20–300 µL |

The tip count is a property of the pipette, not the step. A user selects a pipette; the tip count follows from that selection.

---

## Feature: Well Selection Mode

When a multi-channel pipette is selected for a step, the user chooses how source and destination wells are specified:

### Column mode
- User selects a starting column number.
- The pipette occupies N consecutive wells in that column, where N = tip count (starting from row A).
- Example: 8-channel, column 1 → wells A1, B1, C1, D1, E1, F1, G1, H1.

### Row mode
- User selects a starting row letter.
- The pipette occupies N consecutive wells in that row, where N = tip count (starting from column 1).
- Example: 12-channel, row A → wells A1, A2, A3 … A12.

### Individual mode
- User selects exactly N wells manually (same multi-well selection already available for single-channel steps).
- The UI prevents saving if the number of selected wells does not equal the pipette's tip count.

Single-channel pipettes always use individual well selection (existing behavior, unchanged).

---

## Feature: Parallel Execution

### Simulation

When a multi-channel step executes:
- All source wells are aspirated simultaneously (each loses the specified volume).
- All destination wells are filled simultaneously (each gains the specified volume with the specified liquid type).
- Tip change accounting: one tip change event per multi-channel step (not one per well).
- Volume validation: each source–destination well pair is validated independently against plate capacity and available volume.

### Animation

The canvas animation for a multi-channel step shows all tips moving as a single unit:
- All tip markers travel together from source column/row to destination column/row in one motion.
- All destination wells animate their color change at the same time, after the tips arrive.
- Duration of a multi-channel step animation is the same as a single-channel step (parallelism is the point — it does not take longer).

---

## Feature: Step Display

In the step list, a multi-channel step shows:
- Pipette name (e.g., "P300 8-ch")
- Selection mode and range (e.g., "Col 1 → Col 3" or "8 wells")
- Volume per tip (not total volume)

The distinction between "volume per tip" and "total volume transferred" is surfaced in the stats panel after simulation.

---

## Out of Scope

- Custom tip count beyond built-in pipette definitions (no free-form "tip count" input field).
- Asymmetric multi-channel configurations (e.g., skipping channels).
- Mixing or aspiration-height control.
