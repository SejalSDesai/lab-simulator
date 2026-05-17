import { useState } from 'react';
import type { Plate, Pipette, WellAddress, LiquidCategory } from '../types';
import {
  PLATE_CONFIGS, PIPETTE_PRESETS, LIQUID_COLORS, RESERVOIR_MAX_VOLUME,
} from '../types';
import type { PlateType } from '../types';

const LIQUID_OPTIONS: LiquidCategory[] = ['reagent', 'buffer', 'sample', 'water'];
const PLATE_TYPES: PlateType[] = ['96-well', '384-well', 'deep-well-96'];

interface SidebarProps {
  plates: Plate[];
  selectedPipetteId: string;
  selectedWell: WellAddress | null;
  selectedWells: WellAddress[];
  darkMode: boolean;
  onAddPlate: (type: PlateType) => void;
  onSelectPipette: (pipetteId: string) => void;
  onSetWellLiquid: (address: WellAddress, volume: number, liquid: LiquidCategory) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 dark:border-gray-700 pb-3 mb-0">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-3 py-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PlateIcon({ type }: { type: PlateType }) {
  if (type === 'reservoir') {
    return (
      <span className="inline-block w-7 h-4 bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 rounded shrink-0" />
    );
  }
  const cols = type === '384-well' ? 6 : 4;
  const rows = type === '384-well' ? 4 : 3;
  return (
    <span className="inline-grid shrink-0" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '1.5px' }}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <span
          key={i}
          className="rounded-[1px] bg-indigo-200 dark:bg-indigo-800"
          style={{ width: type === '384-well' ? 3 : 4, height: type === '384-well' ? 3 : 4 }}
        />
      ))}
    </span>
  );
}

function ChannelBadge({ channels }: { channels: number }) {
  if (channels === 1) return null;
  return (
    <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-full px-1.5 py-0.5 ml-auto shrink-0">
      {channels}ch
    </span>
  );
}

export default function Sidebar({
  plates,
  selectedPipetteId,
  selectedWell,
  selectedWells,
  darkMode: _darkMode,
  onAddPlate,
  onSelectPipette,
  onSetWellLiquid,
}: SidebarProps) {
  const [wellVolume, setWellVolume] = useState(100);
  const [wellLiquid, setWellLiquid] = useState<LiquidCategory>('sample');

  const selectedPlate  = selectedWell ? plates.find(p => p.id === selectedWell.plateId) : null;
  const currentWell    = selectedPlate ? selectedPlate.wells.flat().find(w => w.id === selectedWell?.wellId) : null;
  const isReservoir    = currentWell ? currentWell.maxVolume >= RESERVOIR_MAX_VOLUME : false;
  const pipettes: Pipette[] = PIPETTE_PRESETS;

  const inputCls = 'w-full text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-shadow';

  return (
    <aside className="w-56 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col text-sm text-gray-700 dark:text-gray-300">

      {/* Multi-well selection badge */}
      {selectedWells.length > 1 && (
        <div className="mx-3 mt-3 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700 text-xs text-indigo-700 dark:text-indigo-300 font-semibold">
          {selectedWells.length} wells selected
        </div>
      )}

      {/* Plate library */}
      <Section title="Add Plate">
        <div className="px-2 space-y-1">
          {PLATE_TYPES.map(type => (
            <button
              key={type}
              onClick={() => onAddPlate(type)}
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5 group"
            >
              <PlateIcon type={type} />
              <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                {PLATE_CONFIGS[type].label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Equipment */}
      <Section title="Equipment">
        <div className="px-2">
          <button
            onClick={() => onAddPlate('reservoir')}
            className="w-full text-left px-2 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5 group"
          >
            <PlateIcon type="reservoir" />
            <span className="text-xs text-gray-600 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
              {PLATE_CONFIGS['reservoir'].label}
            </span>
          </button>
        </div>
      </Section>

      {/* Pipette selector */}
      <Section title="Pipette">
        <div className="px-2 space-y-0.5">
          {pipettes.map(pip => (
            <button
              key={pip.id}
              onClick={() => onSelectPipette(pip.id)}
              className={`w-full text-left px-2 py-2 rounded-lg transition-colors text-xs flex items-center gap-1 ${
                selectedPipetteId === pip.id
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <span className="flex-1 truncate">{pip.name}</span>
              <ChannelBadge channels={pip.channels} />
            </button>
          ))}
        </div>
      </Section>

      {/* Well editor */}
      {selectedWell && currentWell && (
        <Section title="Well Editor">
          <div className="px-3 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {selectedPlate?.name} · {selectedWell.wellId}
              </span>
              <div className="mt-0.5">
                {isReservoir
                  ? 'Volume: ∞ (unlimited)'
                  : `${currentWell.volume} / ${currentWell.maxVolume} µL`}
              </div>
              {currentWell.volume > 0 && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: LIQUID_COLORS[currentWell.liquidType] }}
                  />
                  <span className="capitalize">{currentWell.liquidType}</span>
                </div>
              )}
            </div>

            <select
              value={wellLiquid}
              onChange={e => setWellLiquid(e.target.value as LiquidCategory)}
              className={inputCls}
            >
              {LIQUID_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            {!isReservoir && (
              <input
                type="number"
                min={0}
                max={currentWell.maxVolume}
                value={wellVolume}
                onChange={e => setWellVolume(Number(e.target.value))}
                className={inputCls}
                placeholder={`Volume (max ${currentWell.maxVolume} µL)`}
              />
            )}

            <div className="flex gap-1.5">
              <button
                onClick={() => onSetWellLiquid(selectedWell, isReservoir ? RESERVOIR_MAX_VOLUME : wellVolume, wellLiquid)}
                className="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {isReservoir ? 'Set Liquid' : 'Set'}
              </button>
              <button
                onClick={() => onSetWellLiquid(selectedWell, 0, 'empty')}
                className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Liquid legend */}
      <Section title="Liquid Colors">
        <div className="px-3 space-y-1.5">
          {LIQUID_OPTIONS.map(l => (
            <div key={l} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ background: LIQUID_COLORS[l] }}
              />
              <span className="capitalize">{l}</span>
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}
