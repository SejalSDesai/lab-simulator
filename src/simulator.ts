import type {
  Plate,
  Well,
  ProtocolStep,
  Pipette,
  ValidationError,
  SimulationResult,
  SimulationStats,
} from './types';

function deepCopyPlates(plates: Plate[]): Plate[] {
  return plates.map(plate => ({
    ...plate,
    wells: plate.wells.map(row => row.map(well => ({ ...well }))),
  }));
}

function findWell(plates: Plate[], plateId: string, wellId: string): Well | null {
  const plate = plates.find(p => p.id === plateId);
  if (!plate) return null;
  for (const row of plate.wells) {
    for (const well of row) {
      if (well.id === wellId) return well;
    }
  }
  return null;
}

export function validateProtocol(
  steps: ProtocolStep[],
  plates: Plate[],
  pipettes: Pipette[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  // Simulate on a copy so cascading volume errors are caught in sequence
  const simPlates = deepCopyPlates(plates);

  steps.forEach((step, index) => {
    const n = index + 1;
    const pipette = pipettes.find(p => p.id === step.pipetteId);

    if (!pipette) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Selected pipette not found.`, severity: 'error' });
      return;
    }

    if (step.volume <= 0) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Volume must be greater than 0.`, severity: 'error' });
      return;
    }

    if (step.volume < pipette.minVolume || step.volume > pipette.maxVolume) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: ${step.volume} µL is outside ${pipette.name} range (${pipette.minVolume}–${pipette.maxVolume} µL).`,
        severity: 'error',
      });
    }

    const src = findWell(simPlates, step.sourceAddress.plateId, step.sourceAddress.wellId);
    if (!src) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source well ${step.sourceAddress.wellId} not found.`, severity: 'error' });
      return;
    }

    if (src.volume < step.volume) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: Source ${step.sourceAddress.wellId} has ${src.volume} µL — need ${step.volume} µL.`,
        severity: 'error',
      });
    }

    const dst = findWell(simPlates, step.destAddress.plateId, step.destAddress.wellId);
    if (!dst) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Destination well ${step.destAddress.wellId} not found.`, severity: 'error' });
      return;
    }

    if (dst.volume + step.volume > dst.maxVolume) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: Destination ${step.destAddress.wellId} would overflow (${dst.volume} + ${step.volume} > ${dst.maxVolume} µL max).`,
        severity: 'error',
      });
    }

    if (
      step.sourceAddress.plateId === step.destAddress.plateId &&
      step.sourceAddress.wellId  === step.destAddress.wellId
    ) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source and destination are the same well.`, severity: 'warning' });
    }

    // Apply step to simulated plates so later steps see updated volumes
    const hasBlockingError = errors.some(e => e.stepIndex === index && e.severity === 'error');
    if (!hasBlockingError) {
      src.volume -= step.volume;
      dst.volume += step.volume;
      dst.liquidType = step.liquidType;
    }
  });

  return errors;
}

// Apply a single step to a plate array, returning new plates (used for animation).
export function applyStep(plates: Plate[], step: ProtocolStep): Plate[] {
  const updated = deepCopyPlates(plates);
  const src = findWell(updated, step.sourceAddress.plateId, step.sourceAddress.wellId);
  const dst = findWell(updated, step.destAddress.plateId, step.destAddress.wellId);
  if (!src || !dst) return plates;
  src.volume -= step.volume;
  dst.volume += step.volume;
  dst.liquidType = step.liquidType;
  return updated;
}

export function executeProtocol(
  steps: ProtocolStep[],
  plates: Plate[],
  pipettes: Pipette[],
): { plates: Plate[]; result: SimulationResult } {
  const validationErrors = validateProtocol(steps, plates, pipettes);
  const blockingErrors = validationErrors.filter(e => e.severity === 'error');

  if (blockingErrors.length > 0) {
    const stats: SimulationStats = {
      totalVolumeTransferred: 0,
      totalSteps: steps.length,
      completedSteps: 0,
      estimatedDurationSeconds: 0,
      tipChanges: 0,
    };
    return {
      plates,
      result: {
        success: false,
        errors: blockingErrors,
        warnings: validationErrors.filter(e => e.severity === 'warning'),
        stats,
      },
    };
  }

  const updatedPlates = deepCopyPlates(plates);
  let totalVolume = 0;
  let tipChanges = 0;
  let lastPipetteId = '';
  let completedSteps = 0;

  for (const step of steps) {
    const src = findWell(updatedPlates, step.sourceAddress.plateId, step.sourceAddress.wellId);
    const dst = findWell(updatedPlates, step.destAddress.plateId, step.destAddress.wellId);
    if (!src || !dst) continue;

    if (step.pipetteId !== lastPipetteId) {
      tipChanges++;
      lastPipetteId = step.pipetteId;
    }

    src.volume -= step.volume;
    dst.volume += step.volume;
    dst.liquidType = step.liquidType;
    totalVolume += step.volume;
    completedSteps++;
  }

  const stats: SimulationStats = {
    totalVolumeTransferred: totalVolume,
    totalSteps: steps.length,
    completedSteps,
    estimatedDurationSeconds: steps.length * 4,
    tipChanges,
  };

  return {
    plates: updatedPlates,
    result: {
      success: true,
      errors: [],
      warnings: validationErrors.filter(e => e.severity === 'warning'),
      stats,
    },
  };
}
