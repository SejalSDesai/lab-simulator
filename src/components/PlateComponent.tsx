import { Group, Rect, Circle, Text, Line } from 'react-konva';
import Konva from 'konva';
import type { Plate } from '../types';
import { PLATE_CONFIGS, PLATE_PADDING, PLATE_LABEL_HEIGHT, LIQUID_COLORS } from '../types';
import { getColorForVolume } from '../utils/animationHelpers';

interface PlateComponentProps {
  plate: Plate;
  isSelected: boolean;
  animating: boolean;
  selectedWellIds: ReadonlySet<string>;
  onClick: (plateId: string) => void;
  onDragEnd: (plateId: string, x: number, y: number) => void;
  onWellClick: (plateId: string, wellId: string, modifiers: { shift: boolean; ctrl: boolean }) => void;
  /** Called with the Konva node when each well mounts so Canvas can animate it. */
  onWellRef: (plateId: string, wellId: string, node: Konva.Node) => void;
}

// ── Reservoir renderer ────────────────────────────────────────────────────────

function ReservoirBody({
  plate,
  isSelected,
  animating,
  onWellRef,
  onWellClick,
}: {
  plate: Plate;
  isSelected: boolean;
  animating: boolean;
  onWellRef: (plateId: string, wellId: string, node: Konva.Node) => void;
  onWellClick: (plateId: string, wellId: string, modifiers: { shift: boolean; ctrl: boolean }) => void;
}) {
  const config      = PLATE_CONFIGS[plate.type];
  const totalW      = config.fixedWidth  ?? 200;
  const totalH      = config.fixedHeight ?? 90;
  const troughX     = PLATE_PADDING;
  const troughY     = PLATE_LABEL_HEIGHT + PLATE_PADDING;
  const troughW     = totalW - PLATE_PADDING * 2;
  const troughH     = totalH - PLATE_LABEL_HEIGHT - PLATE_PADDING * 2;
  const borderColor = animating ? '#f59e0b' : isSelected ? '#6366f1' : '#94a3b8';

  const well      = plate.wells[0]?.[0];
  const fillColor = well ? getColorForVolume(well.volume, well.maxVolume, well.liquidType) : '#d1d5db';
  const hasLiquid = well && well.volume > 0;
  const liquidColor = well && hasLiquid ? LIQUID_COLORS[well.liquidType] : null;

  return (
    <>
      {/* Outer card */}
      <Rect
        width={totalW}
        height={totalH}
        fill="#f8fafc"
        stroke={borderColor}
        strokeWidth={isSelected || animating ? 2 : 1}
        cornerRadius={8}
        shadowBlur={isSelected ? 10 : 4}
        shadowColor={isSelected ? '#6366f1' : 'rgba(0,0,0,0.12)'}
        shadowOpacity={0.5}
      />

      {/* Trough body — this is the animatable node registered in wellRefs */}
      <Rect
        x={troughX}
        y={troughY}
        width={troughW}
        height={troughH}
        fill={fillColor}
        cornerRadius={4}
        stroke="#cbd5e1"
        strokeWidth={1}
        ref={(node: Konva.Rect | null) => {
          if (node && well) onWellRef(plate.id, well.id, node);
        }}
        onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          if (well) onWellClick(plate.id, well.id, {
            shift: e.evt.shiftKey,
            ctrl: e.evt.ctrlKey || e.evt.metaKey,
          });
        }}
      />

      {/* Liquid type color stripe on left edge */}
      {liquidColor && (
        <Rect
          x={troughX}
          y={troughY}
          width={6}
          height={troughH}
          fill={liquidColor}
          cornerRadius={[4, 0, 0, 4]}
          listening={false}
        />
      )}

      {/* ∞ symbol in center of trough */}
      <Text
        x={troughX}
        y={troughY + troughH / 2 - 8}
        width={troughW}
        height={16}
        text={hasLiquid ? '∞' : 'Empty'}
        fontSize={hasLiquid ? 18 : 10}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        fill={hasLiquid ? '#1e293b' : '#94a3b8'}
        listening={false}
      />

      {/* Liquid type label */}
      {hasLiquid && well && (
        <Text
          x={troughX + 10}
          y={troughY + 4}
          text={well.liquidType}
          fontSize={8}
          fill="#475569"
          listening={false}
        />
      )}

      {/* Decorative horizontal lines inside trough (like a real reservoir) */}
      {Array.from({ length: 3 }, (_, i) => (
        <Line
          key={i}
          points={[troughX + 12, troughY + (troughH / 4) * (i + 1), troughX + troughW - 4, troughY + (troughH / 4) * (i + 1)]}
          stroke="rgba(148,163,184,0.3)"
          strokeWidth={0.5}
          listening={false}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlateComponent({
  plate,
  isSelected,
  animating,
  selectedWellIds,
  onClick,
  onDragEnd,
  onWellClick,
  onWellRef,
}: PlateComponentProps) {
  const config = PLATE_CONFIGS[plate.type];

  const isReservoir = plate.type === 'reservoir';

  // For reservoir, use fixedWidth/fixedHeight; otherwise compute from grid
  const plateWidth  = isReservoir
    ? (config.fixedWidth  ?? 200)
    : plate.cols * (config.cellSize + config.gap) - config.gap + PLATE_PADDING * 2;
  const plateHeight = isReservoir
    ? (config.fixedHeight ?? 90)
    : plate.rows * (config.cellSize + config.gap) - config.gap + PLATE_PADDING * 2 + PLATE_LABEL_HEIGHT;

  const borderColor  = animating ? '#f59e0b' : isSelected ? '#6366f1' : '#94a3b8';
  const { cellSize, gap } = config;
  const showLabels   = cellSize >= 14;

  return (
    <Group
      x={plate.x}
      y={plate.y}
      draggable
      onClick={() => onClick(plate.id)}
      onDragStart={e => e.target.moveToTop()}
      onDragEnd={e => onDragEnd(plate.id, e.target.x(), e.target.y())}
    >
      {isReservoir ? (
        <ReservoirBody
          plate={plate}
          isSelected={isSelected}
          animating={animating}
          onWellRef={onWellRef}
          onWellClick={onWellClick}
        />
      ) : (
        <>
          {/* Plate background card */}
          <Rect
            width={plateWidth}
            height={plateHeight}
            fill="#ffffff"
            stroke={borderColor}
            strokeWidth={isSelected || animating ? 2 : 1}
            cornerRadius={6}
            shadowBlur={isSelected ? 10 : 4}
            shadowColor={isSelected ? '#6366f1' : 'rgba(0,0,0,0.12)'}
            shadowOpacity={0.5}
          />

          {/* Plate name label */}
          <Text
            text={plate.name}
            x={PLATE_PADDING}
            y={4}
            width={plateWidth - PLATE_PADDING * 2}
            height={PLATE_LABEL_HEIGHT - 4}
            fontSize={10}
            fontStyle="bold"
            fill="#475569"
            ellipsis={true}
            wrap="none"
          />

          {/* Wells */}
          {plate.wells.map((row, rowIdx) =>
            row.map(well => {
              const cx     = PLATE_PADDING + well.col * (cellSize + gap) + cellSize / 2;
              const cy     = PLATE_LABEL_HEIGHT + PLATE_PADDING + rowIdx * (cellSize + gap) + cellSize / 2;
              const radius = cellSize / 2 - 1;
              const fill   = getColorForVolume(well.volume, well.maxVolume, well.liquidType);
              const isWellSelected = selectedWellIds.has(well.id);

              return (
                <Group key={well.id}>
                  {/* Selection ring */}
                  {isWellSelected && (
                    <Circle
                      x={cx}
                      y={cy}
                      radius={radius + 2}
                      fill="rgba(99,102,241,0.15)"
                      stroke="#6366f1"
                      strokeWidth={1.5}
                      listening={false}
                    />
                  )}

                  <Circle
                    x={cx}
                    y={cy}
                    radius={radius}
                    fill={fill}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                    ref={(node: Konva.Circle | null) => {
                      if (node) onWellRef(plate.id, well.id, node);
                    }}
                    onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
                      e.cancelBubble = true;
                      onWellClick(plate.id, well.id, {
                        shift: e.evt.shiftKey,
                        ctrl: e.evt.ctrlKey || e.evt.metaKey,
                      });
                    }}
                  />

                  {showLabels && well.volume > 0 && (
                    <Text
                      x={cx - cellSize / 2}
                      y={cy - 3}
                      width={cellSize}
                      height={6}
                      text={`${well.volume}`}
                      fontSize={5}
                      align="center"
                      fill="#1e293b"
                      listening={false}
                    />
                  )}
                </Group>
              );
            })
          )}
        </>
      )}
    </Group>
  );
}
