# TASK-001: Edit Panel UI

**Spec:** SPEC-001 → Edit Step Panel  
**Status:** Ready  
**Complexity:** Standard  
**Branch:** feature/spec-001  
**Blocked by:** none

## What to Build

Add an edit control to each step row in `ProtocolBuilder.tsx`. When activated, open a side panel that displays all fields of that step pre-populated with current values.

## Acceptance Criteria

- Every step row has an edit button/icon that is visible and accessible.
- Clicking it opens a side panel (not a modal, not inline).
- Panel renders all fields pre-populated with the step's current values:
  - Source plate (selector, lists current canvas plates)
  - Source well
  - Destination plate (selector, lists current canvas plates)
  - Destination well
  - Volume (numeric, µL)
  - Liquid type (reagent / buffer / sample / water)
  - Pipette (selector, lists available pipettes)
- Panel has explicit **Save** and **Cancel** buttons — no auto-save.
- Cancel closes the panel without any changes to the step list.
- Opening a second step's edit while a panel is already open closes the first (treated as Cancel).
- The edit button is disabled / not rendered while a simulation animation is running.
- If a plate referenced by the step no longer exists on the canvas, the plate selector shows the missing name with a visible warning indicator.

## Out of Scope

- Save logic and validation (TASK-002).
- Any changes to simulation or stats.
