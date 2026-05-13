import type {
  Plate,
  Well,
  ProtocolStep,
  Pipette,
  ValidationError,
  SimulationResult,
  SimulationStats,
  WellAddress,
} from './types';
import { RESERVOIR_MAX_VOLUME } from './types';

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

function isReservoirWell(well: Well): boolean {
  return well.maxVolume >= RESERVOIR_MAX_VOLUME;
}

function getDestAddresses(step: ProtocolStep): WellAddress[] {
  return step.destAddresses && step.destAddresses.length > 0
    ? step.destAddresses
    : [step.destAddress];
}

function volumePerDest(step: ProtocolStep, numDests: number): number {
  return step.volumeMode === 'distribute' ? step.volume / numDests : step.volume;
}

function totalVolumeNeeded(step: ProtocolStep, numDests: number): number {
  return step.volumeMode === 'distribute' ? step.volume : step.volume * numDests;
}

export function validateProtocol(
  steps: ProtocolStep[],
  plates: Plate[],
  pipettes: Pipette[],
): ValidationError[] {
  const errors: ValidationError[] = [];
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

    const dests     = getDestAddresses(step);
    const numDests  = dests.length;
    const perDest   = volumePerDest(step, numDests);
    const totalVol  = totalVolumeNeeded(step, numDests);

    if (perDest < pipette.minVolume || perDest > pipette.maxVolume) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: ${perDest.toFixed(1)} µL/well is outside ${pipette.name} range (${pipette.minVolume}–${pipette.maxVolume} µL).`,
        severity: 'error',
      });
    }

    const src = findWell(simPlates, step.sourceAddress.plateId, step.sourceAddress.wellId);
    if (!src) {
      errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source well ${step.sourceAddress.wellId} not found.`, severity: 'error' });
      return;
    }

    if (!isReservoirWell(src) && src.volume < totalVol) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: Source ${step.sourceAddress.wellId} has ${src.volume} µL — need ${totalVol} µL.`,
        severity: 'error',
      });
    }

    for (const destAddr of dests) {
      const dst = findWell(simPlates, destAddr.plateId, destAddr.wellId);
      if (!dst) {
        errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Destination well ${destAddr.wellId} not found.`, severity: 'error' });
        continue;
      }
      if (dst.volume + perDest > dst.maxVolume) {
        errors.push({
          stepId: step.id, stepIndex: index,
          message: `Step ${n}: Destination ${destAddr.wellId} would overflow (${dst.volume} + ${perDest.toFixed(1)} > ${dst.maxVolume} µL max).`,
          severity: 'error',
        });
      }
      if (
        step.sourceAddress.plateId === destAddr.plateId &&
        step.sourceAddress.wellId  === destAddr.wellId
      ) {
        errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source and destination are the same well.`, severity: 'warning' });
      }
    }

    const hasBlockingError = errors.some(e => e.stepIndex === index && e.severity === 'error');
    if (!hasBlockingError) {
      if (!isReservoirWell(src)) src.volume -= totalVol;
      for (const destAddr of dests) {
        const dst = findWell(simPlates, destAddr.plateId, destAddr.wellId);
        if (dst) {
          dst.volume    += perDest;
          dst.liquidType = step.liquidType;
        }
      }
    }
  });

  return errors;
}

export function applyStep(plates: Plate[], step: ProtocolStep): Plate[] {
  const updated  = deepCopyPlates(plates);
  const src      = findWell(updated, step.sourceAddress.plateId, step.sourceAddress.wellId);
  if (!src) return plates;

  const dests    = getDestAddresses(step);
  const numDests = dests.length;
  const perDest  = volumePerDest(step, numDests);
  const totalVol = totalVolumeNeeded(step, numDests);

  if (!isReservoirWell(src)) src.volume -= totalVol;

  for (const destAddr of dests) {
    const dst = findWell(updated, destAddr.plateId, destAddr.wellId);
    if (dst) {
      dst.volume    += perDest;
      dst.liquidType = step.liquidType;
    }
  }
  return updated;
}

export function executeProtocol(
  steps: ProtocolStep[],
  plates: Plate[],
  pipettes: Pipette[],
): { plates: Plate[]; result: SimulationResult } {
  const validationErrors = validateProtocol(steps, plates, pipettes);
  const blockingErrors   = validationErrors.filter(e => e.severity === 'error');

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

  const updatedPlates  = deepCopyPlates(plates);
  let totalVolume      = 0;
  let tipChanges       = 0;
  let lastPipetteId    = '';
  let completedSteps   = 0;

  for (const step of steps) {
    const src = findWell(updatedPlates, step.sourceAddress.plateId, step.sourceAddress.wellId);
    if (!src) continue;

    const dests    = getDestAddresses(step);
    const numDests = dests.length;
    const perDest  = volumePerDest(step, numDests);
    const totalVol = totalVolumeNeeded(step, numDests);

    if (step.pipetteId !== lastPipetteId) {
      tipChanges++;
      lastPipetteId = step.pipetteId;
    }

    if (!isReservoirWell(src)) src.volume -= totalVol;

    for (const destAddr of dests) {
      const dst = findWell(updatedPlates, destAddr.plateId, destAddr.wellId);
      if (dst) {
        dst.volume    += perDest;
        dst.liquidType = step.liquidType;
      }
    }

    totalVolume += totalVol;
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
