# Lab Simulator — Backlog

## Dependency Chain

```
TASK-001 (edit panel UI)
    └→ TASK-002 (edit save logic)

TASK-003 (multi-channel data model)
    ├→ TASK-004 (well selection UI)
    └→ TASK-005 (simulation logic)
            └→ TASK-006 (animation) ←── also needs TASK-004
```

## Active Tasks

### TASK-001: Edit Panel UI
- Spec: SPEC-001 → Edit Step Panel
- Status: Ready
- Complexity: Standard
- Parallelism: Independent
- Blocked by: none
- Branch: feature/spec-001

### TASK-002: Edit Save Logic
- Spec: SPEC-001 → Save Behavior, Cancel Behavior, Edge States
- Status: Ready
- Complexity: Standard
- Parallelism: Sequential (depends on TASK-001)
- Blocked by: TASK-001
- Branch: feature/spec-001

### TASK-003: Multi-Channel Data Model
- Spec: SPEC-002 → Pipette Tip Count, Well Selection Mode
- Status: Ready
- Complexity: Mechanical
- Parallelism: Independent
- Blocked by: none
- Branch: feature/spec-002

### TASK-004: Multi-Channel Well Selection UI
- Spec: SPEC-002 → Well Selection Mode
- Status: Ready
- Complexity: Standard
- Parallelism: Sequential (depends on TASK-003)
- Blocked by: TASK-003
- Branch: feature/spec-002

### TASK-005: Multi-Channel Simulation Logic
- Spec: SPEC-002 → Parallel Execution
- Status: Ready
- Complexity: Standard
- Parallelism: Sequential (depends on TASK-003)
- Blocked by: TASK-003
- Branch: feature/spec-002

### TASK-006: Multi-Channel Canvas Animation
- Spec: SPEC-002 → Animation
- Status: Ready
- Complexity: Complex
- Parallelism: Sequential (depends on TASK-004, TASK-005)
- Blocked by: TASK-004, TASK-005
- Branch: feature/spec-002

---

## Completed Tasks

(none yet)

---

## Future

- Undo/redo history stack
- Serial dilution wizard
- Mixing / incubation protocol steps
- Dead volume tracking
- Vitest test suite
