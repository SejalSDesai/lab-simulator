# SPEC-001: Edit Protocol Step

**Status:** Planned  
**Created:** 2026-05-17  
**Branch:** feature/spec-001

## Problem

Protocol steps can only be deleted, not modified. A user who enters a wrong volume or wrong well must delete the step and re-enter it from scratch. For protocols with many steps this is disruptive.

## Behavioral Goal

A user can edit any existing protocol step in full, using a side panel, without losing their place in the step list.

---

## Feature: Edit Step Panel

### Trigger

Each step row in the ProtocolBuilder has an edit control. Activating it opens the edit panel for that step.

### Panel Contents

The panel displays all fields of the selected step, pre-populated with current values:

- Source plate (selector — existing plates on canvas)
- Source well (text/selector)
- Destination plate (selector — existing plates on canvas)
- Destination well (text/selector — supports multi-well as current add-step does)
- Volume (numeric input, µL)
- Liquid type (selector — reagent, buffer, sample, water)
- Pipette (selector — available pipettes)

### Save Behavior

- The panel has explicit **Save** and **Cancel** buttons.
- On Save: validate the edited step using the same rules applied when adding a new step (volume in range for selected pipette, valid well IDs, plates exist on canvas).
- If validation fails: display inline error messages within the panel. The panel stays open. The step list is not modified.
- If validation passes: replace the step at its original index in the protocol. The step list order does not change. The panel closes.
- If a simulation result is currently displayed, saving any edit clears it (the result no longer reflects the current protocol).

### Cancel Behavior

- Discards all edits and closes the panel.
- The step list is unchanged.
- Any in-progress simulation result is unaffected.

### Panel Lifecycle

- Only one step can be in edit state at a time.
- Opening edit on a second step while a panel is already open closes the first (treats it as Cancel).
- The panel is not available while a simulation animation is running.

### Empty / Edge States

- If a plate referenced by the step has been removed from the canvas since the step was created, the plate selector shows the missing plate name with a warning indicator. The user must select a valid plate before Save will succeed.
