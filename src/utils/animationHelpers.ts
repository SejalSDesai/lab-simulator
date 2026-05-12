import Konva from 'konva';
import type { Plate, Well, WellAddress, LiquidCategory } from '../types';
import { PLATE_CONFIGS, LIQUID_COLORS, PLATE_PADDING, PLATE_LABEL_HEIGHT } from '../types';

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/** Linearly blend color1 → color2. ratio 0 = color1, 1 = color2. */
export function interpolateColor(color1: string, color2: string, ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

const EMPTY_COLOR = '#d1d5db';

/**
 * Compute well fill color based on how full it is.
 * Empty → light grey. Partially full → light tint of liquid. Full → full liquid color.
 */
export function getColorForVolume(
  volume: number,
  maxVolume: number,
  liquidType: LiquidCategory,
): string {
  if (volume <= 0) return EMPTY_COLOR;
  const ratio     = Math.min(volume / maxVolume, 1);
  const baseColor = LIQUID_COLORS[liquidType];
  // At low volume: blend from white-tinted base; at full: pure base color.
  const lightTint = interpolateColor('#ffffff', baseColor, 0.3);
  return interpolateColor(lightTint, baseColor, ratio);
}

// ─── Position helpers ─────────────────────────────────────────────────────────

/**
 * Return the absolute canvas (x, y) center of a well, or null if not found.
 * Mirrors the layout arithmetic in PlateComponent so positions stay in sync.
 */
export function getWellCanvasPosition(
  plates: Plate[],
  address: WellAddress,
): { x: number; y: number } | null {
  const plate = plates.find(p => p.id === address.plateId);
  if (!plate) return null;

  const config = PLATE_CONFIGS[plate.type];
  let target: Well | null = null;
  for (const row of plate.wells) {
    const found = row.find(w => w.id === address.wellId);
    if (found) { target = found; break; }
  }
  if (!target) return null;

  return {
    x: plate.x + PLATE_PADDING + target.col * (config.cellSize + config.gap) + config.cellSize / 2,
    y: plate.y + PLATE_LABEL_HEIGHT + PLATE_PADDING + target.row * (config.cellSize + config.gap) + config.cellSize / 2,
  };
}

// ─── Tween helpers ────────────────────────────────────────────────────────────

// `node.to()` accepts AnimTo (NodeConfig + duration/onFinish) but Konva's types
// omit `easing`, so we widen via a cast for the call site only.
type KonvaTweenConfig = Konva.NodeConfig & {
  duration?: number;
  easing?: (t: number, b: number, c: number, d: number) => number;
  onFinish?: () => void;
};

/** Wrap Konva's node.to() in a Promise so animation steps can be awaited. */
export function tweenTo(
  node: Konva.Node,
  attrs: Konva.NodeConfig,
  durationSec: number,
): Promise<void> {
  return new Promise(resolve => {
    const config: KonvaTweenConfig = {
      ...attrs,
      duration: durationSec,
      easing: Konva.Easings.EaseInOut,
      onFinish: resolve,
    };
    node.to(config as Parameters<typeof node.to>[0]);
  });
}

/** Promisified delay in milliseconds. */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
