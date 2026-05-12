import type { Plate, Well, PlateType, WellAddress } from './types';
import { PLATE_CONFIGS, ROW_LABELS, PLATE_PADDING, PLATE_LABEL_HEIGHT } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function wellIdFromRowCol(row: number, col: number): string {
  return `${ROW_LABELS[row]}${col + 1}`;
}

export function rowColFromWellId(wellId: string): { row: number; col: number } | null {
  const match = /^([A-P])(\d{1,2})$/.exec(wellId.toUpperCase());
  if (!match) return null;
  const row = ROW_LABELS.indexOf(match[1]);
  const col = parseInt(match[2], 10) - 1;
  if (row === -1 || col < 0) return null;
  return { row, col };
}

export function isValidWellId(wellId: string, plate: Plate): boolean {
  const rc = rowColFromWellId(wellId);
  if (!rc) return false;
  return rc.row >= 0 && rc.row < plate.rows && rc.col >= 0 && rc.col < plate.cols;
}

function createWell(row: number, col: number, maxVolume: number): Well {
  return {
    id: wellIdFromRowCol(row, col),
    row,
    col,
    volume: 0,
    maxVolume,
    liquidType: 'empty',
  };
}

export function createPlate(type: PlateType, name: string, x: number, y: number): Plate {
  const config = PLATE_CONFIGS[type];
  const wells: Well[][] = Array.from({ length: config.rows }, (_, row) =>
    Array.from({ length: config.cols }, (_, col) =>
      createWell(row, col, config.wellMaxVolume)
    )
  );
  return {
    id: generateId(),
    type,
    name,
    x,
    y,
    rows: config.rows,
    cols: config.cols,
    wells,
  };
}

export function getPlateSize(type: PlateType): { width: number; height: number } {
  const { cellSize, gap, rows, cols } = PLATE_CONFIGS[type];
  const innerWidth  = cols * (cellSize + gap) - gap;
  const innerHeight = rows * (cellSize + gap) - gap;
  return {
    width:  innerWidth  + PLATE_PADDING * 2,
    height: innerHeight + PLATE_PADDING * 2 + PLATE_LABEL_HEIGHT,
  };
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function getPlateById(plates: Plate[], plateId: string): Plate | undefined {
  return plates.find(p => p.id === plateId);
}

export function getWellByAddress(plates: Plate[], address: WellAddress): Well | null {
  const plate = getPlateById(plates, address.plateId);
  if (!plate) return null;
  for (const row of plate.wells) {
    for (const well of row) {
      if (well.id === address.wellId) return well;
    }
  }
  return null;
}
