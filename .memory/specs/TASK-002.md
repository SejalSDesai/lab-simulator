# TASK-002: Edit Save Logic

**Spec:** SPEC-001 → Save Behavior, Cancel Behavior, Edge States  
**Status:** Ready  
**Complexity:** Standard  
**Branch:** feature/spec-001  
**Blocked by:** TASK-001

## What to Build

Wire the Save button in the edit panel to validate the edited step and, on success, replace it in the protocol at its original index.

## Acceptance Criteria

- Save runs the same validation as adding a new step (volume within pipette range, valid well IDs, referenced plates exist on canvas).
- If validation fails:
  - Inline error messages appear within the panel next to the failing fields.
  - The panel stays open.
  - The protocol step list is not modified.
- If validation passes:
  - The step at its original index is replaced with the edited values.
  - Step order does not change.
  - The panel closes.
  - If a simulation result is currently displayed, it is cleared (result no longer reflects the protocol).
- Cancel closes the panel with no changes to the step list and no effect on any displayed simulation result.
- After a successful save, the updated step is immediately visible in the step list with its new values.

## Out of Scope

- UI layout of the panel (TASK-001).
- Any changes to simulation execution or animation.
