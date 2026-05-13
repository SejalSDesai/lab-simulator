export type PlateType = '96-well' | '384-well' | 'deep-well-96' | 'reservoir';
export type LiquidCategory = 'reagent' | 'buffer' | 'sample' | 'water' | 'empty';

export interface Well {
  id: string;
  row: number;
  col: number;
  volume: number;
  maxVolume: number;
  liquidType: LiquidCategory;
}

export interface Plate {
  id: string;
  type: PlateType;
  name: string;
  x: number;
  y: number;
  rows: number;
  cols: number;
  wells: Well[][];
}

export interface Pipette {
  id: string;
  name: string;
  minVolume: number;
  maxVolume: number;
  channels: 1 | 8 | 96;
}

export interface WellAddress {
  plateId: string;
  wellId: string;
}

export interface ProtocolStep {
  id: string;
  sourceAddress: WellAddress;
  destAddress: WellAddress;
  /** When set, transfer goes to ALL of these wells (overrides destAddress for execution). */
  destAddresses?: WellAddress[];
  /** 'each' = volume per well; 'distribute' = split total volume equally among all dests. */
  volumeMode?: 'each' | 'distribute';
  volume: number;
  pipetteId: string;
  liquidType: LiquidCategory;
}

export interface Protocol {
  id: string;
  name: string;
  steps: ProtocolStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationError {
  stepId: string;
  stepIndex: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface SimulationStats {
  totalVolumeTransferred: number;
  totalSteps: number;
  completedSteps: number;
  estimatedDurationSeconds: number;
  tipChanges: number;
}

export interface SimulationResult {
  success: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: SimulationStats;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
}

export interface PlateConfig {
  rows: number;
  cols: number;
  wellMaxVolume: number;
  label: string;
  cellSize: number;
  gap: number;
  /** Override total rendered width (used by reservoir). */
  fixedWidth?: number;
  /** Override total rendered height (used by reservoir). */
  fixedHeight?: number;
}

export const PLATE_PADDING      = 12;
export const PLATE_LABEL_HEIGHT = 22;

/** Sentinel value stored in well.maxVolume to mark an infinite-volume reservoir well. */
export const RESERVOIR_MAX_VOLUME = 10_000_000;

export const ROW_LABELS: readonly string[] = 'ABCDEFGHIJKLMNOP'.split('');

export const PLATE_CONFIGS: Record<PlateType, PlateConfig> = {
  '96-well':      { rows: 8,  cols: 12, wellMaxVolume: 300,               label: '96-Well Plate',      cellSize: 16, gap: 2 },
  '384-well':     { rows: 16, cols: 24, wellMaxVolume: 120,               label: '384-Well Plate',     cellSize: 8,  gap: 1 },
  'deep-well-96': { rows: 8,  cols: 12, wellMaxVolume: 2000,              label: '96-Deep-Well Plate', cellSize: 16, gap: 2 },
  reservoir:      { rows: 1,  cols: 1,  wellMaxVolume: RESERVOIR_MAX_VOLUME, label: 'Reagent Reservoir',  cellSize: 60, gap: 0,
                    fixedWidth: 200, fixedHeight: 90 },
};

export const LIQUID_COLORS: Record<LiquidCategory, string> = {
  reagent: '#ef4444',
  buffer:  '#3b82f6',
  sample:  '#22c55e',
  water:   '#93c5fd',
  empty:   '#d1d5db',
};

export const PIPETTE_PRESETS: Pipette[] = [
  { id: 'p20',      name: 'P20 (1–20 µL)',         minVolume: 1,   maxVolume: 20,   channels: 1 },
  { id: 'p200',     name: 'P200 (20–200 µL)',       minVolume: 20,  maxVolume: 200,  channels: 1 },
  { id: 'p1000',    name: 'P1000 (100–1000 µL)',    minVolume: 100, maxVolume: 1000, channels: 1 },
  { id: 'p300-8ch', name: 'P300 8-ch (20–300 µL)', minVolume: 20,  maxVolume: 300,  channels: 8  },
];
