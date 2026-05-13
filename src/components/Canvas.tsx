import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Rect, Line, Group, Circle as KonvaCircle } from 'react-konva';
import Konva from 'konva';
import PlateComponent from './PlateComponent';
import type { Plate, ProtocolStep, SimulationResult, LiquidCategory, WellAddress } from '../types';
import {
  PLATE_CONFIGS, PLATE_PADDING, PLATE_LABEL_HEIGHT, RESERVOIR_MAX_VOLUME,
} from '../types';
import { snapToGrid } from '../utils';
import { applyStep } from '../simulator';
import {
  getWellCanvasPosition,
  getColorForVolume,
  tweenTo,
  wait,
} from '../utils/animationHelpers';

const GRID_SIZE  = 40;
const HOME_X     = 30;
const HOME_Y     = 30;
const DUR_TRAVEL = 0.45;
const DUR_RETURN = 0.30;
const DUR_COLOR  = 0.30;

interface CanvasProps {
  plates: Plate[];
  selectedPlateId: string | null;
  selectedWells: WellAddress[];
  animatingStepIndex: number;
  darkMode: boolean;
  onPlateSelect: (plateId: string | null) => void;
  onPlateDrop: (plateId: string, x: number, y: number) => void;
  onWellClick: (plateId: string, wellId: string, modifiers: { shift: boolean; ctrl: boolean }) => void;
  onWellsSelect: (wells: WellAddress[]) => void;
}

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

/** Compute which wells fall inside a rubber-band rect (canvas coords). */
function computeWellsInRect(
  plates: Plate[],
  rect: { x1: number; y1: number; x2: number; y2: number },
): WellAddress[] {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  const result: WellAddress[] = [];

  for (const plate of plates) {
    if (plate.type === 'reservoir') continue; // reservoir is one big trough, skip rubber-band selection
    const config = PLATE_CONFIGS[plate.type];
    for (const row of plate.wells) {
      for (const well of row) {
        const cx = plate.x + PLATE_PADDING + well.col * (config.cellSize + config.gap) + config.cellSize / 2;
        const cy = plate.y + PLATE_LABEL_HEIGHT + PLATE_PADDING + well.row * (config.cellSize + config.gap) + config.cellSize / 2;
        if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
          result.push({ plateId: plate.id, wellId: well.id });
        }
      }
    }
  }
  return result;
}

function getDestAddresses(step: ProtocolStep): WellAddress[] {
  return step.destAddresses && step.destAddresses.length > 0
    ? step.destAddresses
    : [step.destAddress];
}

function volumePerDest(step: ProtocolStep, numDests: number): number {
  return step.volumeMode === 'distribute' ? step.volume / numDests : step.volume;
}

function totalVolumeForStep(step: ProtocolStep, numDests: number): number {
  return step.volumeMode === 'distribute' ? step.volume : step.volume * numDests;
}

const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    plates, selectedPlateId, selectedWells, animatingStepIndex,
    darkMode, onPlateSelect, onPlateDrop, onWellClick, onWellsSelect,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size,       setSize      ] = useState({ width: 800, height: 600 });
  const [rubberBand, setRubberBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const wellRefs              = useRef<Map<string, Konva.Node>>(new Map());
  const pipetteRef            = useRef<Konva.Group>(null);
  const cancelledRef          = useRef(false);
  const dragStartPos          = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRubber      = useRef(false);
  const justFinishedRubberBand = useRef(false);

  // Build a Set of selected well IDs per plate for fast lookup in PlateComponent
  const selectedWellIdsByPlate = useRef<Map<string, Set<string>>>(new Map());
  for (const [plateId, set] of selectedWellIdsByPlate.current) {
    set.clear();
    void plateId;
  }
  selectedWellIdsByPlate.current.clear();
  for (const addr of selectedWells) {
    let set = selectedWellIdsByPlate.current.get(addr.plateId);
    if (!set) { set = new Set(); selectedWellIdsByPlate.current.set(addr.plateId, set); }
    set.add(addr.wellId);
  }

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

  async function movePipetteTo(x: number, y: number): Promise<void> {
    const pip = pipetteRef.current;
    if (!pip) return;
    await tweenTo(pip, { x, y: y - 18 }, DUR_TRAVEL);
  }

  async function returnPipetteHome(): Promise<void> {
    const pip = pipetteRef.current;
    if (!pip) return;
    await tweenTo(pip, { x: HOME_X, y: HOME_Y }, DUR_RETURN);
  }

  async function animateWellColor(plateId: string, wellId: string, targetColor: string): Promise<void> {
    const node = wellRefs.current.get(`${plateId}:${wellId}`);
    if (!node) return;
    await tweenTo(node, { fill: targetColor }, DUR_COLOR);
  }

  // ── Rubber-band handlers ───────────────────────────────────────────────────

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!(e.target instanceof Konva.Stage)) return;
    if (animatingStepIndex >= 0) return;
    const pos = e.target.getPointerPosition();
    if (!pos) return;
    dragStartPos.current = pos;
    isDraggingRubber.current = false;
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!dragStartPos.current) return;
    const stage = e.target instanceof Konva.Stage ? e.target : e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const dx = Math.abs(pos.x - dragStartPos.current.x);
    const dy = Math.abs(pos.y - dragStartPos.current.y);
    if (dx > 4 || dy > 4) {
      isDraggingRubber.current = true;
      setRubberBand({ x1: dragStartPos.current.x, y1: dragStartPos.current.y, x2: pos.x, y2: pos.y });
    }
  }

  function handleStageMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (isDraggingRubber.current) {
      const stage = e.target instanceof Konva.Stage ? e.target : e.target.getStage();
      const pos = stage?.getPointerPosition();
      const finalRect = rubberBand
        ? { ...rubberBand, x2: pos?.x ?? rubberBand.x2, y2: pos?.y ?? rubberBand.y2 }
        : null;
      if (finalRect) {
        const selected = computeWellsInRect(plates, finalRect);
        onWellsSelect(selected);
      }
      justFinishedRubberBand.current = true;
    }
    dragStartPos.current   = null;
    isDraggingRubber.current = false;
    setRubberBand(null);
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (justFinishedRubberBand.current) {
      justFinishedRubberBand.current = false;
      return;
    }
    if (e.target instanceof Konva.Stage) {
      onPlateSelect(null);
      onWellsSelect([]);
    }
  }

  // ── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    cancelAnimation() {
      cancelledRef.current = true;
    },

    async runAnimation(steps, initialPlates, onStepStart, onPlatesUpdate, onDone) {
      cancelledRef.current = false;

      let currentPlates  = initialPlates.map(p => ({
        ...p,
        wells: p.wells.map(r => r.map(w => ({ ...w }))),
      }));

      let totalVolume    = 0;
      let tipChanges     = 0;
      let lastPip        = '';
      let completedSteps = 0;

      for (let i = 0; i < steps.length; i++) {
        if (cancelledRef.current) break;

        const step     = steps[i];
        onStepStart(i);

        if (step.pipetteId !== lastPip) { tipChanges++; lastPip = step.pipetteId; }

        const dests     = getDestAddresses(step);
        const numDests  = dests.length;
        const perDest   = volumePerDest(step, numDests);
        const totalVol  = totalVolumeForStep(step, numDests);

        // ── Source ──
        const srcPos   = getWellCanvasPosition(currentPlates, step.sourceAddress);
        const srcPlate = currentPlates.find(p => p.id === step.sourceAddress.plateId);
        const srcWell  = srcPlate?.wells.flat().find(w => w.id === step.sourceAddress.wellId);
        const srcIsReservoir = srcWell ? srcWell.maxVolume >= RESERVOIR_MAX_VOLUME : false;

        if (srcPos) await movePipetteTo(srcPos.x, srcPos.y);
        await wait(180);

        if (srcWell && srcPlate && !srcIsReservoir) {
          const afterVol   = Math.max(0, srcWell.volume - totalVol);
          const targetColor = getColorForVolume(afterVol, srcWell.maxVolume, srcWell.liquidType);
          await animateWellColor(step.sourceAddress.plateId, step.sourceAddress.wellId, targetColor);
        }

        if (cancelledRef.current) break;

        // ── Destinations ──
        for (const destAddr of dests) {
          if (cancelledRef.current) break;

          const dstPos   = getWellCanvasPosition(currentPlates, destAddr);
          const dstPlate = currentPlates.find(p => p.id === destAddr.plateId);
          const dstWell  = dstPlate?.wells.flat().find(w => w.id === destAddr.wellId);

          if (dstPos) await movePipetteTo(dstPos.x, dstPos.y);
          await wait(180);

          if (dstWell && dstPlate) {
            const afterVol   = dstWell.volume + perDest;
            const liquidType = step.liquidType as LiquidCategory;
            const targetColor = getColorForVolume(afterVol, dstWell.maxVolume, liquidType);
            await animateWellColor(destAddr.plateId, destAddr.wellId, targetColor);
          }
        }

        if (cancelledRef.current) break;

        currentPlates  = applyStep(currentPlates, step);
        totalVolume   += totalVol;
        completedSteps += 1;
        onPlatesUpdate([...currentPlates]);

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

  const handleWellRef = (plateId: string, wellId: string, node: Konva.Node) => {
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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
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
              selectedWellIds={selectedWellIdsByPlate.current.get(plate.id) ?? new Set()}
              onClick={onPlateSelect}
              onDragEnd={handleDragEnd}
              onWellClick={onWellClick}
              onWellRef={handleWellRef}
            />
          ))}
        </Layer>

        {/* ── Rubber-band selection layer ── */}
        <Layer listening={false}>
          {rubberBand && (
            <Rect
              x={Math.min(rubberBand.x1, rubberBand.x2)}
              y={Math.min(rubberBand.y1, rubberBand.y2)}
              width={Math.abs(rubberBand.x2 - rubberBand.x1)}
              height={Math.abs(rubberBand.y2 - rubberBand.y1)}
              fill="rgba(99,102,241,0.08)"
              stroke="#6366f1"
              strokeWidth={1}
              dash={[5, 3]}
            />
          )}
        </Layer>

        {/* ── Pipette layer (always on top) ── */}
        <Layer listening={false}>
          <Group ref={pipetteRef} x={HOME_X} y={HOME_Y} visible={animatingStepIndex >= 0}>
            <Rect
              x={-5}
              y={-30}
              width={10}
              height={26}
              fill="#6366f1"
              cornerRadius={2}
              opacity={0.9}
            />
            <Line
              points={[-5, -4, 5, -4, 0, 4]}
              closed={true}
              fill="#818cf8"
              stroke="#4f46e5"
              strokeWidth={0.5}
              opacity={0.9}
            />
            <KonvaCircle x={0} y={-20} radius={2.5} fill="#c7d2fe" opacity={0.8} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
});

export default Canvas;
