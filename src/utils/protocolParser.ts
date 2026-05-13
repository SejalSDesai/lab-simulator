import type { LiquidCategory } from '../types';
import { PIPETTE_PRESETS } from '../types';

// ─── Public Types ─────────────────────────────────────────────────────────────

/** A protocol step as parsed from an imported file (plate references are by name, not ID). */
export interface RawStep {
  stepNum: number;
  sourcePlateName: string;
  sourceWell: string;
  destPlateName: string;
  destWell: string;
  volume: number;
  liquidType: LiquidCategory;
  pipetteId: string;
}

export type FileFormat = 'csv' | 'json' | 'excel' | 'text';

// ─── Format Detection ─────────────────────────────────────────────────────────

export function detectFormat(filename: string): FileFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv')              return 'csv';
  if (ext === 'json')             return 'json';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  return 'text';
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

/** A01 → A1, a1 → A1 */
export function normalizeWellId(raw: string): string {
  const m = /^([A-Pa-p])0*(\d{1,2})$/.exec(raw.trim());
  if (!m) return raw.toUpperCase().trim();
  return `${m[1].toUpperCase()}${parseInt(m[2], 10)}`;
}

/** "50µL", "50ul", "0.05mL" → 50 */
export function normalizeVolume(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/\s/g, '');
  const ml = /^([\d.]+)ml$/.exec(s);
  if (ml) return parseFloat(ml[1]) * 1000;
  const ul = /^([\d.]+)(?:µl|ul|μl)?$/.exec(s);
  if (ul) return parseFloat(ul[1]);
  return parseFloat(raw) || 0;
}

/** Map arbitrary liquid names to our fixed LiquidCategory set */
export function normalizeLiquidType(raw: string): LiquidCategory {
  const v = raw.trim().toLowerCase();
  if (v === 'reagent' || v === 'buffer' || v === 'sample' || v === 'water') return v;
  if (v.includes('water') || v.includes('h2o'))           return 'water';
  if (v.includes('buffer') || v.includes('pbs') || v.includes('tris')) return 'buffer';
  if (v.includes('sample') || v.includes('dna') || v.includes('rna') || v.includes('pcr')) return 'sample';
  return 'reagent';
}

/** Map "P200", "200", "p20", etc. to a preset pipette ID */
export function normalizePipetteId(raw: string): string {
  const v = raw.trim().toLowerCase();
  const preset = PIPETTE_PRESETS.find(
    p => p.id.toLowerCase() === v || p.name.toLowerCase().includes(v),
  );
  if (preset) return preset.id;
  const vol = parseInt(/(\d+)/.exec(v)?.[1] ?? '0', 10);
  if (vol <= 20)   return 'p20';
  if (vol <= 200)  return 'p200';
  if (vol <= 1000) return 'p1000';
  return 'p200';
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/** Handle quoted fields in a single CSV line. */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

export function parseCSV(content: string): { steps: RawStep[]; errors: string[] } {
  const steps: RawStep[] = [];
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
  if (lines.length === 0) { errors.push('File is empty.'); return { steps, errors }; }

  const headerLine = lines[0].toLowerCase();
  const header     = splitCSVLine(headerLine);
  const hasHeader  = header.some(h =>
    ['step', 'source plate', 'source well', 'dest plate', 'dest well', 'volume'].includes(h),
  );
  const dataLines  = hasHeader ? lines.slice(1) : lines;

  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const srcPl  = hasHeader ? col(['source plate', 'src plate', 'from plate', 'source_plate']) : 1;
  const srcW   = hasHeader ? col(['source well',  'src well',  'from well',  'source_well'])  : 2;
  const dstPl  = hasHeader ? col(['dest plate', 'destination plate', 'to plate', 'dest_plate']) : 3;
  const dstW   = hasHeader ? col(['dest well',  'destination well',  'to well',  'dest_well'])  : 4;
  const volC   = hasHeader ? col(['volume', 'volume (µl)', 'volume (ul)', 'vol'])               : 5;
  const liqC   = hasHeader ? col(['liquid type', 'liquid', 'reagent', 'type'])                  : 6;
  const pipC   = hasHeader ? col(['pipette', 'instrument'])                                     : 7;

  dataLines.forEach((line, li) => {
    const n = li + 1;
    if (!line.trim()) return;
    const c = splitCSVLine(line);
    if (c.length < 5) { errors.push(`Row ${n}: only ${c.length} columns (need ≥5).`); return; }

    const srcPlateName = c[srcPl] ?? '';
    const srcWell      = normalizeWellId(c[srcW] ?? '');
    const dstPlateName = c[dstPl] ?? '';
    const dstWell      = normalizeWellId(c[dstW] ?? '');
    const volume       = normalizeVolume(c[volC] ?? '0');
    const liquidType   = normalizeLiquidType(c[liqC] ?? 'reagent');
    const pipetteId    = normalizePipetteId(c[pipC] ?? 'p200');

    if (!srcPlateName) { errors.push(`Row ${n}: missing source plate.`); return; }
    if (!dstPlateName) { errors.push(`Row ${n}: missing dest plate.`); return; }
    if (!srcWell)      { errors.push(`Row ${n}: missing source well.`); return; }
    if (!dstWell)      { errors.push(`Row ${n}: missing dest well.`); return; }
    if (volume <= 0)   { errors.push(`Row ${n}: volume must be > 0.`); return; }

    steps.push({ stepNum: n, sourcePlateName: srcPlateName, sourceWell: srcWell,
                 destPlateName: dstPlateName, destWell: dstWell,
                 volume, liquidType, pipetteId });
  });

  return { steps, errors };
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

export function parseJSON(content: string): { steps: RawStep[]; errors: string[] } {
  const steps: RawStep[] = [];
  const errors: string[] = [];

  try {
    const data: unknown = JSON.parse(content);
    const rawArr: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { steps?: unknown[] }).steps)
        ? (data as { steps: unknown[] }).steps
        : [];

    if (rawArr.length === 0) {
      errors.push('No steps found. Expected { steps: [...] } or a top-level array.');
      return { steps, errors };
    }

    rawArr.forEach((raw, i) => {
      const n = i + 1;
      const s = raw as Record<string, unknown>;
      const src = s.source as Record<string, unknown> | undefined;
      const dst = s.dest   as Record<string, unknown> | undefined;

      const srcPlateName = String(s.sourcePlateName ?? s.source_plate ?? src?.plate ?? '');
      const srcWell      = normalizeWellId(String(s.sourceWell ?? s.source_well ?? src?.well ?? ''));
      const dstPlateName = String(s.destPlateName ?? s.dest_plate ?? dst?.plate ?? '');
      const dstWell      = normalizeWellId(String(s.destWell ?? s.dest_well ?? dst?.well ?? ''));
      const volume       = normalizeVolume(String(s.volume ?? '0'));
      const liquidType   = normalizeLiquidType(String(s.liquidType ?? s.liquid_type ?? s.liquid ?? 'reagent'));
      const pipetteId    = normalizePipetteId(String(s.pipetteId ?? s.pipette ?? 'p200'));

      if (!srcPlateName || !dstPlateName || !srcWell || !dstWell || volume <= 0) {
        errors.push(`Step ${n}: missing required fields (sourcePlateName, sourceWell, destPlateName, destWell, volume).`);
        return;
      }

      steps.push({ stepNum: n, sourcePlateName: srcPlateName, sourceWell: srcWell,
                   destPlateName: dstPlateName, destWell: dstWell,
                   volume, liquidType, pipetteId });
    });
  } catch {
    errors.push('Invalid JSON — could not parse file.');
  }

  return { steps, errors };
}

// ─── Plain Text Parser ────────────────────────────────────────────────────────

/**
 * Recognizes lines like:
 * "Transfer 50µL from Plate1 A1 to Plate2 B3 (Buffer, P200)"
 * "transfer 100ul from Reagent_Reservoir A1 to 96-Well_Plate B6"
 */
export function parsePlainText(content: string): { steps: RawStep[]; errors: string[] } {
  const steps: RawStep[] = [];
  const errors: string[] = [];

  const RE =
    /transfer\s+([\d.]+\s*(?:µl|ul|ml)?)\s+from\s+(\S+)\s+([A-Za-z]\d{1,2})\s+to\s+(\S+)\s+([A-Za-z]\d{1,2})(?:\s*\(([^,)]*)?(?:,\s*([^)]+))?\))?/i;

  let stepNum = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = RE.exec(line);
    if (!m) { errors.push(`Unrecognised: "${line.slice(0, 60)}"`); continue; }

    stepNum++;
    steps.push({
      stepNum,
      sourcePlateName: m[2].replace(/_/g, ' '),
      sourceWell:      normalizeWellId(m[3]),
      destPlateName:   m[4].replace(/_/g, ' '),
      destWell:        normalizeWellId(m[5]),
      volume:          normalizeVolume(m[1]),
      liquidType:      normalizeLiquidType(m[6] ?? 'reagent'),
      pipetteId:       normalizePipetteId(m[7] ?? 'p200'),
    });
  }

  if (steps.length === 0 && errors.length === 0) {
    errors.push('No steps found. Use format: "Transfer 50µL from Plate1 A1 to Plate2 B1 (Buffer, P200)"');
  }

  return { steps, errors };
}

// ─── Excel Parser (async, lazy-loads xlsx) ────────────────────────────────────

export async function parseExcel(buffer: ArrayBuffer): Promise<{ steps: RawStep[]; errors: string[] }> {
  try {
    const XLSX = await import('xlsx');
    const wb   = XLSX.read(new Uint8Array(buffer));
    const ws   = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { steps: [], errors: ['Excel file has no worksheets.'] };
    const csv = XLSX.utils.sheet_to_csv(ws);
    return parseCSV(csv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('cannot find module') || msg.toLowerCase().includes('failed to fetch')) {
      return { steps: [], errors: ['Excel parsing requires the xlsx package. Run: npm install xlsx'] };
    }
    return { steps: [], errors: [`Failed to parse Excel file: ${msg}`] };
  }
}
