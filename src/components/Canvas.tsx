import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Rect, Line, Group, Circle as KonvaCircle } from 'react-konva';
import Konva from 'konva';
import PlateComponent from './PlateComponent';
import type { Plate, ProtocolStep, SimulationResult, LiquidCategory } from '../types';
import { snapToGrid } from '../utils';
import { applyStep } from '../simulator';
import {
  getWellCanvasPosition,
  getColorForVolume,
  tweenTo,
  wait,
} from '../utils/animationHelpers';

const GRID_SIZE  = 40;
const HOME_X     = 30;   // pipette resting position (canvas coords)
const HOME_Y     = 30;
// Duration constants in seconds (Konva convention)
const DUR_TRAVEL = 0.45; // pipette moves between wells
const DUR_RETURN = 0.30; // pipette returns home
const DUR_COLOR  = 0.30; // well color transition

interface CanvasProps {
  plates: Plate[];
  selectedPlateId: string | null;
  animatingStepIndex: number;
  darkMode: boolean;
  onPlateSelect: (plateId: string | null) => void;
  onPlateDrop: (plateId: string, x: number, y: number) => void;
  onWellClick: (plateId: string, wellId: string) => void;
}

/** Imperative API exposed to App via ref so it can trigger animations. */
export interface CanvasHandle {
  runAnimation: (
    steps: ProtocolStep[],
    plates: Plate[],
    onStepStart: (idx: number) => void,
    onPlatesUpdate: (plates: Plate[]) => void,
    onDone: (result: SimulationResult) => void,
  ) => void;
  cancelAnimation: () => void;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  { plates, selectedPlateId, animatingStepIndex, darkMode, onPlateSelect, onPlateDrop, onWellClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Map from "plateId:wellId" → Konva Circle node, populated via ref callbacks.
  const wellRefs    = useRef<Map<string, Konva.Circle>>(new Map());
  const pipetteRef  = useRef<Konva.Group>(null);
  // Flip to true to abort a running animation between steps.
  const cancelledRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Pipette animation helpers ──────────────────────────────────────────────

  /** Move the pipette to (x, y) on the canvas, stopping just above the well. */
  async function movePipetteTo(x: number, y: number): Promise<void> {
    const pip = pipetteRef.current;
    if (!pip) return;
    await tweenTo(pip, { x, y: y - 18 }, DUR_TRAVEL); // 18px above well center
  }

  async function returnPipetteHome(): Promise<void> {
    const pip = pipetteRef.current;
    if (!pip) return;
    await tweenTo(pip, { x: HOME_X, y: HOME_Y }, DUR_RETURN);
  }

  /**
   * Animate a well's fill color from its current color to `targetColor`.
   * The React state update happens *after* the tween so there's no visual jump.
   */
  async function animateWellColor(plateId: string, wellId: string, targetColor: string): Promise<void> {
    const node = wellRefs.current.get(`${plateId}:${wellId}`);
    if (!node) return;
    await tweenTo(node, { fill: targetColor }, DUR_COLOR);
  }

  // ── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    cancelAnimation() {
      cancelledRef.current = true;
    },

    async runAnimation(steps, initialPlates, onStepStart, onPlatesUpdate, onDone) {
      cancelledRef.current = false;

      let   currentPlates = initialPlates.map(p => ({
        ...p,
        wells: p.wells.map(r => r.map(w => ({ ...w }))),
      }));

      let totalVolume    = 0;
      let tipChanges     = 0;
      let lastPip        = '';
      let completedSteps = 0;

      for (let i = 0; i < steps.length; i++) {
        if (cancelledRef.current) break;

        const step = steps[i];
        onStepStart(i);

        if (step.pipetteId !== lastPip) { tipChanges++; lastPip = step.pipetteId; }

        // ── Find source well ──
        const srcPos  = getWellCanvasPosition(currentPlates, step.sourceAddress);
        const srcPlate = currentPlates.find(p => p.id === step.sourceAddress.plateId);
        const srcWell  = srcPlate?.wells.flat().find(w => w.id === step.sourceAddress.wellId);

        // ── 1. Move pipette to source ──
        if (srcPos) await movePipetteTo(srcPos.x, srcPos.y);
        await wait(180); // aspirate pause

        // ── 2. Animate source well emptying ──
        if (srcWell && srcPlate) {
          const afterVolume  = srcWell.volume - step.volume;
          const targetColor  = getColorForVolume(
            Math.max(0, afterVolume),
            srcWell.maxVolume,
            srcWell.liquidType,
          );
          await animateWellColor(step.sourceAddress.plateId, step.sourceAddress.wellId, targetColor);
        }

        if (cancelledRef.current) break;

        // ── Find destination well ──
        const dstPos   = getWellCanvasPosition(currentPlates, step.destAddress);
        const dstPlate = currentPlates.find(p => p.id === step.destAddress.plateId);
        const dstWell  = dstPlate?.wells.flat().find(w => w.id === step.destAddress.wellId);

        // ── 3. Move pipette to destination ──
        if (dstPos) await movePipetteTo(dstPos.x, dstPos.y);
        await wait(180); // dispense pause

        // ── 4. Animate destination well filling ──
        if (dstWell && dstPlate) {
          const afterVolume = dstWell.volume + step.volume;
          // Use the incoming liquid type for the destination color
          const liquidType  = step.liquidType as LiquidCategory;
          const targetColor = getColorForVolume(afterVolume, dstWell.maxVolume, liquidType);
          await animateWellColor(step.destAddress.plateId, step.destAddress.wellId, targetColor);
        }

        // ── 5. Apply the step to React state so volumes update ──
        currentPlates = applyStep(currentPlates, step);
        totalVolume    += step.volume;
        completedSteps += 1;
        onPlatesUpdate([...currentPlates]);

        // ── 6. Return pipette home ──
        await returnPipetteHome();
      }

      onDone({
        success: !cancelledRef.current,
        errors: [],
        warnings: [],
        stats: {
          totalVolumeTransferred: totalVolume,
          totalSteps: steps.length,
          completedSteps,
          estimatedDurationSeconds: steps.length * 4,
          tipChanges,
        },
      });
    },
  }));

  // ── Render ─────────────────────────────────────────────────────────────────

  const handleWellRef = (plateId: string, wellId: string, node: Konva.Circle) => {
    wellRefs.current.set(`${plateId}:${wellId}`, node);
  };

  const handleDragEnd = (plateId: string, x: number, y: number) => {
    onPlateDrop(plateId, snapToGrid(x, GRID_SIZE), snapToGrid(y, GRID_SIZE));
  };

  const bgColor   = darkMode ? '#1e293b' : '#f8fafc';
  const gridColor = darkMode ? '#334155' : '#e2e8f0';
  const hLines    = Math.ceil(size.height / GRID_SIZE) + 1;
  const vLines    = Math.ceil(size.width  / GRID_SIZE) + 1;

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <Stage
        width={size.width}
        height={size.height}
        onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
          if (e.target instanceof Konva.Stage) onPlateSelect(null);
        }}
      >
        {/* ── Grid layer (non-interactive) ── */}
        <Layer listening={false}>
          <Rect width={size.width} height={size.height} fill={bgColor} />
          {Array.from({ length: vLines }, (_, i) => (
            <Line
              key={`v${i}`}
              points={[i * GRID_SIZE, 0, i * GRID_SIZE, size.height]}
              stroke={gridColor}
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: hLines }, (_, i) => (
            <Line
              key={`h${i}`}
              points={[0, i * GRID_SIZE, size.width, i * GRID_SIZE]}
              stroke={gridColor}
              strokeWidth={0.5}
            />
          ))}
        </Layer>

        {/* ── Plates layer ── */}
        <Layer>
          {plates.map(plate => (
            <PlateComponent
              key={plate.id}
              plate={plate}
              isSelected={plate.id === selectedPlateId}
              animating={animatingStepIndex >= 0}
              onClick={onPlateSelect}
              onDragEnd={handleDragEnd}
              onWellClick={onWellClick}
              onWellRef={handleWellRef}
            />
          ))}
        </Layer>

        {/* ── Pipette layer (always on top) ── */}
        <Layer listening={false}>
          {/*
            Pipette visual: barrel (rect) + downward-pointing tip (triangle).
            The Group's (x,y) is the tip point; the barrel hangs above it.
          */}
          <Group ref={pipetteRef} x={HOME_X} y={HOME_Y} visible={animatingStepIndex >= 0}>
            {/* Barrel */}
            <Rect
              x={-5}
              y={-30}
              width={10}
              height={26}
              fill="#6366f1"
              cornerRadius={2}
              opacity={0.9}
            />
            {/* Tip triangle — points down to (0,0) */}
            <Line
              points={[-5, -4, 5, -4, 0, 4]}
              closed={true}
              fill="#818cf8"
              stroke="#4f46e5"
              strokeWidth={0.5}
              opacity={0.9}
            />
            {/* Highlight dot to show it's a liquid handler */}
            <KonvaCircle x={0} y={-20} radius={2.5} fill="#c7d2fe" opacity={0.8} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
});

export default Canvas;
