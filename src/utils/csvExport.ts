import type { Protocol, Plate, Pipette, SimulationResult } from '../types';

function getPlateName(plates: Plate[], plateId: string): string {
  return plates.find(p => p.id === plateId)?.name ?? plateId;
}

function getPipetteName(pipettes: Pipette[], pipetteId: string): string {
  return pipettes.find(p => p.id === pipetteId)?.name ?? pipetteId;
}

/** Wrap a CSV field in quotes if it contains commas, quotes, or newlines. */
function csvField(s: string | number): string {
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCSV(
  protocol: Protocol,
  plates: Plate[],
  pipettes: Pipette[],
  simResult?: SimulationResult | null,
): string {
  const lines: string[] = [];

  lines.push(`# Protocol: ${protocol.name}`);
  lines.push(`# Created: ${protocol.createdAt}`);
  lines.push(`# Exported: ${new Date().toISOString()}`);
  lines.push(`# Total steps: ${protocol.steps.length}`);
  if (simResult?.success) {
    lines.push(`# Last run: ${simResult.stats.totalVolumeTransferred} µL in ${simResult.stats.completedSteps} step(s)`);
  }
  lines.push('');
  lines.push('Step,Source Plate,Source Well,Dest Plate,Dest Well,Volume (µL),Liquid Type,Pipette,Volume Mode');

  protocol.steps.forEach((step, idx) => {
    const stepNum      = idx + 1;
    const srcPlateName = getPlateName(plates, step.sourceAddress.plateId);
    const pipetteName  = getPipetteName(pipettes, step.pipetteId);
    const mode         = step.volumeMode ?? 'each';
    const dests        = step.destAddresses && step.destAddresses.length > 1
      ? step.destAddresses
      : [step.destAddress];
    const numDests  = dests.length;
    const perDestVol = mode === 'distribute'
      ? (step.volume / numDests).toFixed(2)
      : String(step.volume);

    for (const dest of dests) {
      const dstPlateName = getPlateName(plates, dest.plateId);
      lines.push([
        stepNum,
        csvField(srcPlateName),
        step.sourceAddress.wellId,
        csvField(dstPlateName),
        dest.wellId,
        perDestVol,
        step.liquidType,
        csvField(pipetteName),
        mode,
      ].join(','));
    }
  });

  return lines.join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
