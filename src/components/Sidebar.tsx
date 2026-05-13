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
    <div className="border-b border-gray-200 dark:border-gray-700 pb-3 mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-3">
        {title}
      </h3>
      {children}
    </div>
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

  const selectedPlate = selectedWell
    ? plates.find(p => p.id === selectedWell.plateId)
    : null;
  const currentWell = selectedPlate
    ? selectedPlate.wells.flat().find(w => w.id === selectedWell?.wellId)
    : null;

  const isReservoirWell = currentWell ? currentWell.maxVolume >= RESERVOIR_MAX_VOLUME : false;

  const pipettes: Pipette[] = PIPETTE_PRESETS;

  return (
    <aside className="w-56 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col py-3 text-sm text-gray-700 dark:text-gray-300">
      {/* Multi-well selection badge */}
      {selectedWells.length > 1 && (
        <div className="mx-3 mb-3 px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded border border-indigo-200 dark:border-indigo-700 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
          {selectedWells.length} wells selected
        </div>
      )}

      {/* Plate library */}
      <Section title="Add Plate">
        {PLATE_TYPES.map(type => (
          <button
            key={type}
            onClick={() => onAddPlate(type)}
            className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 rounded-none transition-colors flex items-center gap-2"
          >
            <span className="inline-block w-4 h-4 bg-indigo-100 dark:bg-indigo-900 border border-indigo-300 rounded-sm shrink-0" />
            <span className="text-xs">{PLATE_CONFIGS[type].label}</span>
          </button>
        ))}
      </Section>

      {/* Equipment (reservoir, etc.) */}
      <Section title="Equipment">
        <button
          onClick={() => onAddPlate('reservoir')}
          className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-gray-700 rounded-none transition-colors flex items-center gap-2"
        >
          <span className="inline-block w-6 h-3 bg-blue-100 dark:bg-blue-900 border border-blue-300 rounded-sm shrink-0" />
          <span className="text-xs">{PLATE_CONFIGS['reservoir'].label}</span>
        </button>
      </Section>

      {/* Pipette selector */}
      <Section title="Pipette">
        {pipettes.map(pip => (
          <button
            key={pip.id}
            onClick={() => onSelectPipette(pip.id)}
            className={`w-full text-left px-3 py-2 transition-colors text-xs ${
              selectedPipetteId === pip.id
                ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {pip.name}
          </button>
        ))}
      </Section>

      {/* Well editor — appears when a well is selected */}
      {selectedWell && currentWell && (
        <Section title="Well Editor">
          <div className="px-3 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {selectedPlate?.name} · {selectedWell.wellId}
              </span>
              <div className="mt-0.5">
                {isReservoirWell
                  ? 'Volume: ∞ (unlimited)'
                  : `Volume: ${currentWell.volume} / ${currentWell.maxVolume} µL`}
              </div>
              {currentWell.volume > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: LIQUID_COLORS[currentWell.liquidType] }}
                  />
                  {currentWell.liquidType}
                </div>
              )}
            </div>

            {/* Liquid type selector */}
            <select
              value={wellLiquid}
              onChange={e => setWellLiquid(e.target.value as LiquidCategory)}
              className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-200"
            >
              {LIQUID_OPTIONS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* Volume input — hidden for reservoir wells */}
            {!isReservoirWell && (
              <input
                type="number"
                min={0}
                max={currentWell.maxVolume}
                value={wellVolume}
                onChange={e => setWellVolume(Number(e.target.value))}
                className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-200"
                placeholder={`Volume (max ${currentWell.maxVolume} µL)`}
              />
            )}

            <div className="flex gap-1">
              <button
                onClick={() =>
                  onSetWellLiquid(
                    selectedWell,
                    isReservoirWell ? RESERVOIR_MAX_VOLUME : wellVolume,
                    wellLiquid,
                  )
                }
                className="flex-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded transition-colors"
              >
                {isReservoirWell ? 'Set Liquid' : 'Set'}
              </button>
              <button
                onClick={() => onSetWellLiquid(selectedWell, 0, 'empty')}
                className="flex-1 px-2 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-xs rounded transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Liquid legend */}
      <Section title="Liquid Colors">
        <div className="px-3 space-y-1">
          {LIQUID_OPTIONS.map(l => (
            <div key={l} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-full border border-gray-300"
                style={{ background: LIQUID_COLORS[l] }}
              />
              {l}
            </div>
          ))}
        </div>
      </Section>
    </aside>
  );
}
