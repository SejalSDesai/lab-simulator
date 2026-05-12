import { Group, Rect, Circle, Text } from 'react-konva';
import Konva from 'konva';
import type { Plate } from '../types';
import { PLATE_CONFIGS, PLATE_PADDING, PLATE_LABEL_HEIGHT } from '../types';
import { getColorForVolume } from '../utils/animationHelpers';

interface PlateComponentProps {
  plate: Plate;
  isSelected: boolean;
  animating: boolean;
  onClick: (plateId: string) => void;
  onDragEnd: (plateId: string, x: number, y: number) => void;
  onWellClick: (plateId: string, wellId: string) => void;
  /** Called with the Konva Circle node when each well mounts so Canvas can animate it. */
  onWellRef: (plateId: string, wellId: string, node: Konva.Circle) => void;
}

export default function PlateComponent({
  plate,
  isSelected,
  animating,
  onClick,
  onDragEnd,
  onWellClick,
  onWellRef,
}: PlateComponentProps) {
  const config = PLATE_CONFIGS[plate.type];
  const { cellSize, gap } = config;

  const innerWidth  = plate.cols * (cellSize + gap) - gap;
  const innerHeight = plate.rows * (cellSize + gap) - gap;
  const plateWidth  = innerWidth  + PLATE_PADDING * 2;
  const plateHeight = innerHeight + PLATE_PADDING * 2 + PLATE_LABEL_HEIGHT;

  const borderColor = animating ? '#f59e0b' : isSelected ? '#6366f1' : '#94a3b8';
  // Only render volume labels for plates with wells large enough to read
  const showLabels  = cellSize >= 14;

  return (
    <Group
      x={plate.x}
      y={plate.y}
      draggable
      onClick={() => onClick(plate.id)}
      onDragStart={e => e.target.moveToTop()}
      onDragEnd={e => onDragEnd(plate.id, e.target.x(), e.target.y())}
    >
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
        width={innerWidth}
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
          // Color encodes both liquid type AND fill level; opacity is fixed at 1.
          const fill   = getColorForVolume(well.volume, well.maxVolume, well.liquidType);

          return (
            <Group key={well.id}>
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
                onClick={e => {
                  e.cancelBubble = true;
                  onWellClick(plate.id, well.id);
                }}
              />

              {/* Volume text — only for plates with wells large enough to read */}
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
    </Group>
  );
}
