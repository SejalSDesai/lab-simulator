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
import { RESERVOIR_MAX_VOLUME, ROW_LABELS, PIPETTE_PRESETS } from './types';

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

/** True for column/row multi-channel steps where each tip has its own source well. */
function isParallelMultiChannel(step: ProtocolStep, pipette: Pipette): boolean {
  return pipette.tipCount > 1 &&
    (step.selectionMode === 'column' || step.selectionMode === 'row');
}

/** Reconstruct all source well addresses for a parallel multi-channel step. */
function getSourceAddresses(step: ProtocolStep, tipCount: number): WellAddress[] {
  if (step.selectionMode === 'column' && step.sourceColumn) {
    return ROW_LABELS.slice(0, tipCount).map(row => ({
      plateId: step.sourceAddress.plateId,
      wellId:  `${row}${step.sourceColumn}`,
    }));
  }
  if (step.selectionMode === 'row' && step.sourceRow) {
    return Array.from({ length: tipCount }, (_, i) => ({
      plateId: step.sourceAddress.plateId,
      wellId:  `${step.sourceRow}${i + 1}`,
    }));
  }
  return [step.sourceAddress];
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

    if (step.volume < pipette.minVolume || step.volume > pipette.maxVolume) {
      errors.push({
        stepId: step.id, stepIndex: index,
        message: `Step ${n}: ${step.volume} µL/tip is outside ${pipette.name} range (${pipette.minVolume}–${pipette.maxVolume} µL).`,
        severity: 'error',
      });
    }

    if (isParallelMultiChannel(step, pipette)) {
      // ── Parallel multi-channel (column / row mode) ──────────────────
      // Each tip has its own source well; validate and apply each pair independently.
      const srcAddrs = getSourceAddresses(step, pipette.tipCount);
      const dstAddrs = getDestAddresses(step);
      const pairLen  = Math.min(srcAddrs.length, dstAddrs.length);

      for (let i = 0; i < pairLen; i++) {
        const src = findWell(simPlates, srcAddrs[i].plateId, srcAddrs[i].wellId);
        const dst = findWell(simPlates, dstAddrs[i].plateId, dstAddrs[i].wellId);

        if (!src) {
          errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source well ${srcAddrs[i].wellId} not found.`, severity: 'error' });
          continue;
        }
        if (!dst) {
          errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Destination well ${dstAddrs[i].wellId} not found.`, severity: 'error' });
          continue;
        }
        if (!isReservoirWell(src) && src.volume < step.volume) {
          errors.push({
            stepId: step.id, stepIndex: index,
            message: `Step ${n}: Source ${srcAddrs[i].wellId} has ${src.volume} µL — need ${step.volume} µL.`,
            severity: 'error',
          });
        }
        if (dst.volume + step.volume > dst.maxVolume) {
          errors.push({
            stepId: step.id, stepIndex: index,
            message: `Step ${n}: Destination ${dstAddrs[i].wellId} would overflow (${dst.volume} + ${step.volume} > ${dst.maxVolume} µL max).`,
            severity: 'error',
          });
        }
        if (srcAddrs[i].plateId === dstAddrs[i].plateId && srcAddrs[i].wellId === dstAddrs[i].wellId) {
          errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source and destination are the same well.`, severity: 'warning' });
        }
      }

      const hasBlockingError = errors.some(e => e.stepIndex === index && e.severity === 'error');
      if (!hasBlockingError) {
        for (let i = 0; i < pairLen; i++) {
          const src = findWell(simPlates, srcAddrs[i].plateId, srcAddrs[i].wellId);
          const dst = findWell(simPlates, dstAddrs[i].plateId, dstAddrs[i].wellId);
          if (src && !isReservoirWell(src)) src.volume -= step.volume;
          if (dst) { dst.volume += step.volume; dst.liquidType = step.liquidType; }
        }
      }
    } else {
      // ── Single-channel / individual multi-dest ──────────────────────
      const dests    = getDestAddresses(step);
      const numDests = dests.length;
      const perDest  = volumePerDest(step, numDests);
      const totalVol = totalVolumeNeeded(step, numDests);

      // Re-check volume range with effective per-dest volume (distribute mode)
      if (step.volumeMode === 'distribute' && (perDest < pipette.minVolume || perDest > pipette.maxVolume)) {
        errors.push({
          stepId: step.id, stepIndex: index,
          message: `Step ${n}: Distributed ${perDest.toFixed(1)} µL/well is outside ${pipette.name} range.`,
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
        if (step.sourceAddress.plateId === destAddr.plateId && step.sourceAddress.wellId === destAddr.wellId) {
          errors.push({ stepId: step.id, stepIndex: index, message: `Step ${n}: Source and destination are the same well.`, severity: 'warning' });
        }
      }

      const hasBlockingError = errors.some(e => e.stepIndex === index && e.severity === 'error');
      if (!hasBlockingError) {
        if (!isReservoirWell(src)) src.volume -= totalVol;
        for (const destAddr of dests) {
          const dst = findWell(simPlates, destAddr.plateId, destAddr.wellId);
          if (dst) { dst.volume += perDest; dst.liquidType = step.liquidType; }
        }
      }
    }
  });

  return errors;
}

export function applyStep(plates: Plate[], step: ProtocolStep): Plate[] {
  const updated = deepCopyPlates(plates);
  const pipette = PIPETTE_PRESETS.find(p => p.id === step.pipetteId);

  if (pipette && isParallelMultiChannel(step, pipette)) {
    const srcAddrs = getSourceAddresses(step, pipette.tipCount);
    const dstAddrs = getDestAddresses(step);
    const pairLen  = Math.min(srcAddrs.length, dstAddrs.length);
    for (let i = 0; i < pairLen; i++) {
      const src = findWell(updated, srcAddrs[i].plateId, srcAddrs[i].wellId);
      const dst = findWell(updated, dstAddrs[i].plateId, dstAddrs[i].wellId);
      if (src && !isReservoirWell(src)) src.volume -= step.volume;
      if (dst) { dst.volume += step.volume; dst.liquidType = step.liquidType; }
    }
    return updated;
  }

  const src = findWell(updated, step.sourceAddress.plateId, step.sourceAddress.wellId);
  if (!src) return plates;

  const dests    = getDestAddresses(step);
  const numDests = dests.length;
  const perDest  = volumePerDest(step, numDests);
  const totalVol = totalVolumeNeeded(step, numDests);

  if (!isReservoirWell(src)) src.volume -= totalVol;
  for (const destAddr of dests) {
    const dst = findWell(updated, destAddr.plateId, destAddr.wellId);
    if (dst) { dst.volume += perDest; dst.liquidType = step.liquidType; }
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
    const pipette = pipettes.find(p => p.id === step.pipetteId);
    if (!pipette) continue;

    if (step.pipetteId !== lastPipetteId) {
      tipChanges++;
      lastPipetteId = step.pipetteId;
    }

    if (isParallelMultiChannel(step, pipette)) {
      // ── Parallel multi-channel ──────────────────────────────────────
      const srcAddrs = getSourceAddresses(step, pipette.tipCount);
      const dstAddrs = getDestAddresses(step);
      const pairLen  = Math.min(srcAddrs.length, dstAddrs.length);

      for (let i = 0; i < pairLen; i++) {
        const src = findWell(updatedPlates, srcAddrs[i].plateId, srcAddrs[i].wellId);
        const dst = findWell(updatedPlates, dstAddrs[i].plateId, dstAddrs[i].wellId);
        if (src && !isReservoirWell(src)) src.volume -= step.volume;
        if (dst) { dst.volume += step.volume; dst.liquidType = step.liquidType; }
      }

      totalVolume += step.volume * pairLen;
    } else {
      // ── Single-channel / individual multi-dest ──────────────────────
      const src = findWell(updatedPlates, step.sourceAddress.plateId, step.sourceAddress.wellId);
      if (!src) continue;

      const dests    = getDestAddresses(step);
      const numDests = dests.length;
      const perDest  = volumePerDest(step, numDests);
      const totalVol = totalVolumeNeeded(step, numDests);

      if (!isReservoirWell(src)) src.volume -= totalVol;
      for (const destAddr of dests) {
        const dst = findWell(updatedPlates, destAddr.plateId, destAddr.wellId);
        if (dst) { dst.volume += perDest; dst.liquidType = step.liquidType; }
      }

      totalVolume += totalVol;
    }

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
