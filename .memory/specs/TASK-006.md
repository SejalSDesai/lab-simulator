# TASK-006: Multi-Channel Canvas Animation

**Spec:** SPEC-002 → Animation  
**Status:** Ready  
**Complexity:** Complex  
**Branch:** feature/spec-002  
**Blocked by:** TASK-004, TASK-005

## What to Build

Update the Konva canvas animation so that multi-channel steps show all tips moving as a single unit and all destination wells fill simultaneously.

## Acceptance Criteria

### Tip movement
- For a multi-channel step, all N tip markers are rendered and move together as one group from source to destination.
- The group travels in a single tween — not N sequential tweens.
- Tip markers are spaced to visually correspond to their respective wells (e.g., 8 tips spanning a column).

### Well fill animation
- All destination wells animate their color change at the same time, triggered when the tip group arrives.
- No sequential fill — every well in the step updates simultaneously.

### Timing
- A multi-channel step animation takes the same wall-clock duration as a single-channel step.
- The stats panel estimated duration does not multiply by tip count for multi-channel steps.

### Single-channel unchanged
- Single-channel step animations are pixel-for-pixel identical to the current behavior.

### Cancel
- The animation cancel control works for multi-channel steps the same as single-channel (stops mid-animation cleanly).

## Notes for Developer

- Current animation helpers are in `src/utils/animationHelpers.ts`. The multi-channel path likely needs a new helper or an extension of the existing tween logic.
- Konva groups can be used to move multiple shapes with a single tween — preferred over coordinating N independent tweens.
- The complexity rating reflects Konva group management and simultaneous color transitions, not algorithmic complexity.
