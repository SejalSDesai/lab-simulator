import type { Plate, LiquidCategory, PlateType } from '../types';
import { PLATE_CONFIGS, RESERVOIR_MAX_VOLUME } from '../types';
import { generateId } from '../utils';
import type { RawStep } from './protocolParser';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PlateSpec {
  tempId: string;
  name: string;
  plateType: PlateType;
  /** If a canvas plate already has this name, reuse it instead of creating a new one. */
  matchedPlateId?: string;
}

export interface FillSpec {
  id: string;
  plateTempId: string;
  wellId: string;
  liquidType: LiquidCategory;
  /** Volume to place in the well (rawVolume × 1.2, capped to plate max). */
  volume: number;
  /** Exact total volume needed by protocol steps (before buffer). */
  rawVolume: number;
}

export interface SetupPlan {
  plates: PlateSpec[];
  fills: FillSpec[];
  /** Parsed raw steps, ordered as they appear in the file. */
  steps: RawStep[];
}

// ─── Core Analyser ────────────────────────────────────────────────────────────

/**
 * Inspect `rawSteps` and build a SetupPlan that describes exactly what plates
 * to create and which source wells need liquid before the protocol can run.
 *
 * Existing canvas plates (matched by name, case-insensitive) are reused.
 * Existing wells that already hold enough liquid are not overwritten.
 */
export function analyzeProtocol(rawSteps: RawStep[], existingPlates: Plate[]): SetupPlan {
  // ── 1. Collect unique plate names in order of first appearance ──────────────
  const seenNames = new Set<string>();
  const orderedNames: string[] = [];

  for (const s of rawSteps) {
    for (const name of [s.sourcePlateName, s.destPlateName]) {
      const key = name.toLowerCase();
      if (!seenNames.has(key)) { seenNames.add(key); orderedNames.push(name); }
    }
  }

  // ── 2. Build PlateSpec list ─────────────────────────────────────────────────
  const plates: PlateSpec[] = orderedNames.map(name => {
    const existing    = existingPlates.find(p => p.name.toLowerCase() === name.toLowerCase());
    const isReservoir = name.toLowerCase().includes('reservoir');
    return {
      tempId:          generateId(),
      name,
      plateType:       existing?.type ?? (isReservoir ? 'reservoir' : '96-well'),
      matchedPlateId:  existing?.id,
    };
  });

  const tempIdByName = new Map(plates.map(p => [p.name.toLowerCase(), p.tempId]));

  // ── 3. Accumulate volume needed per source well ─────────────────────────────
  const needed = new Map<string, { vol: number; liquid: LiquidCategory }>();

  for (const s of rawSteps) {
    const key = `${s.sourcePlateName.toLowerCase()}::${s.sourceWell}`;
    const cur = needed.get(key);
    if (cur) {
      cur.vol += s.volume;
    } else {
      needed.set(key, { vol: s.volume, liquid: s.liquidType });
    }
  }

  // ── 4. Build FillSpec list ──────────────────────────────────────────────────
  const fills: FillSpec[] = [];

  for (const [key, { vol, liquid }] of needed) {
    const [nameLower, wellId] = key.split('::') as [string, string];
    const tempId = tempIdByName.get(nameLower);
    if (!tempId) continue;

    const spec = plates.find(p => p.tempId === tempId)!;

    // Skip if the matched plate's well already holds enough liquid
    if (spec.matchedPlateId) {
      const existing = existingPlates.find(p => p.id === spec.matchedPlateId);
      const well     = existing?.wells.flat().find(w => w.id === wellId);
      if (well && well.liquidType !== 'empty' && well.volume >= vol) continue;
    }

    const maxVol = spec.plateType === 'reservoir'
      ? RESERVOIR_MAX_VOLUME
      : PLATE_CONFIGS[spec.plateType].wellMaxVolume;

    fills.push({
      id:          generateId(),
      plateTempId: tempId,
      wellId,
      liquidType:  liquid,
      rawVolume:   vol,
      volume:      Math.min(Math.ceil(vol * 1.2), maxVol), // 20 % safety buffer
    });
  }

  return { plates, fills, steps: rawSteps };
}
