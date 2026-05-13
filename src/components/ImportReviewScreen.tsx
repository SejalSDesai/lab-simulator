import { useState, useMemo } from 'react';
import type { Plate, LiquidCategory, PlateType } from '../types';
import { PLATE_CONFIGS, LIQUID_COLORS } from '../types';
import type { SetupPlan, PlateSpec, FillSpec } from '../utils/protocolAnalyzer';
import type { RawStep } from '../utils/protocolParser';

// ─── Local editable state ──────────────────────────────────────────────────────

interface EditableFill extends FillSpec {
  included: boolean;
}
interface EditableStep extends RawStep {
  included: boolean;
}
interface EditState {
  plates: PlateSpec[];
  fills: EditableFill[];
  steps: EditableStep[];
  replace: boolean;
}

function initEditState(plan: SetupPlan): EditState {
  return {
    plates: plan.plates.map(p => ({ ...p })),
    fills:  plan.fills.map(f  => ({ ...f,  included: true })),
    steps:  plan.steps.map(s  => ({ ...s,  included: true })),
    replace: false,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ImportReviewScreenProps {
  plan: SetupPlan;
  filename: string;
  existingPlates: Plate[];
  darkMode: boolean;
  onApprove: (plan: SetupPlan, replace: boolean) => void;
  onClose: () => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const inputCls =
  'text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400';

const PLATE_TYPE_OPTIONS: PlateType[] = ['96-well', '384-well', 'deep-well-96', 'reservoir'];
const LIQUID_OPTIONS: LiquidCategory[] = ['reagent', 'buffer', 'sample', 'water'];

// ── Plates Tab ─────────────────────────────────────────────────────────────────

function PlatesTab({
  plates,
  onChangeName,
  onChangeType,
}: {
  plates: PlateSpec[];
  onChangeName: (tempId: string, name: string) => void;
  onChangeType: (tempId: string, t: PlateType)  => void;
}) {
  return (
    <div className="space-y-0 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
      {/* Header */}
      <div className="grid grid-cols-[1fr_150px_120px] gap-3 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400">
        <span>Name</span><span>Type</span><span>Status</span>
      </div>

      {plates.map(p => {
        const isExisting = !!p.matchedPlateId;
        return (
          <div key={p.tempId} className="grid grid-cols-[1fr_150px_120px] gap-3 px-3 py-2 items-center">
            {/* Name */}
            {isExisting ? (
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{p.name}</span>
            ) : (
              <input
                value={p.name}
                onChange={e => onChangeName(p.tempId, e.target.value)}
                className={`${inputCls} w-full`}
              />
            )}

            {/* Type */}
            {isExisting ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">{PLATE_CONFIGS[p.plateType].label}</span>
            ) : (
              <select
                value={p.plateType}
                onChange={e => onChangeType(p.tempId, e.target.value as PlateType)}
                className={`${inputCls} w-full`}
              >
                {PLATE_TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{PLATE_CONFIGS[t].label}</option>
                ))}
              </select>
            )}

            {/* Status */}
            {isExisting ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                Using existing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Will be created
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Wells Tab ──────────────────────────────────────────────────────────────────

function WellsTab({
  fills,
  plates,
  onChangeVolume,
  onChangeLiquid,
  onToggleInclude,
}: {
  fills: EditableFill[];
  plates: PlateSpec[];
  onChangeVolume:    (id: string, vol: number)          => void;
  onChangeLiquid:    (id: string, liq: LiquidCategory)  => void;
  onToggleInclude:   (id: string) => void;
}) {
  const plateByTempId = useMemo(
    () => new Map(plates.map(p => [p.tempId, p])),
    [plates],
  );

  if (fills.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic py-6 text-center">
        No wells need filling — all source wells already have sufficient liquid.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            {['', 'Plate', 'Well', 'Liquid', 'Volume (µL)', 'Needed'].map(h => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {fills.map(f => {
            const plate     = plateByTempId.get(f.plateTempId);
            const maxVol    = plate ? PLATE_CONFIGS[plate.plateType].wellMaxVolume : 300;
            const overLimit = f.volume > maxVol;
            return (
              <tr key={f.id} className={!f.included ? 'opacity-40' : ''}>
                {/* Include checkbox */}
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={f.included}
                    onChange={() => onToggleInclude(f.id)}
                    className="rounded"
                  />
                </td>
                {/* Plate name */}
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 max-w-[120px] truncate">
                  {plate?.name ?? '—'}
                </td>
                {/* Well ID */}
                <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-200">{f.wellId}</td>
                {/* Liquid */}
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: LIQUID_COLORS[f.liquidType] }}
                    />
                    <select
                      value={f.liquidType}
                      onChange={e => onChangeLiquid(f.id, e.target.value as LiquidCategory)}
                      className={`${inputCls}`}
                      disabled={!f.included}
                    >
                      {LIQUID_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </td>
                {/* Volume */}
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={maxVol}
                      value={f.volume}
                      onChange={e => onChangeVolume(f.id, Number(e.target.value))}
                      className={`${inputCls} w-20 ${overLimit ? 'border-red-400 ring-red-300' : ''}`}
                      disabled={!f.included}
                    />
                    {overLimit && (
                      <span className="text-red-500 text-xs" title={`Max is ${maxVol} µL`}>!</span>
                    )}
                  </div>
                </td>
                {/* Raw needed */}
                <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{f.rawVolume}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Steps Tab ──────────────────────────────────────────────────────────────────

function StepsTab({
  steps,
  onToggleInclude,
}: {
  steps: EditableStep[];
  onToggleInclude: (stepNum: number) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            {['', '#', 'Source', '→', 'Destination', 'Volume', 'Liquid', 'Pipette'].map(h => (
              <th key={h} className="text-left px-2 py-2 font-semibold text-gray-500 dark:text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {steps.map(s => (
            <tr key={s.stepNum} className={!s.included ? 'opacity-40' : ''}>
              <td className="px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={s.included}
                  onChange={() => onToggleInclude(s.stepNum)}
                  className="rounded"
                />
              </td>
              <td className="px-2 py-1.5 text-gray-400">{s.stepNum}</td>
              <td className="px-2 py-1.5">
                <span className="font-medium text-gray-700 dark:text-gray-300">{s.sourcePlateName}</span>
                <span className="text-gray-400 ml-1 font-mono">{s.sourceWell}</span>
              </td>
              <td className="px-2 py-1.5 text-gray-400">→</td>
              <td className="px-2 py-1.5">
                <span className="font-medium text-gray-700 dark:text-gray-300">{s.destPlateName}</span>
                <span className="text-gray-400 ml-1 font-mono">{s.destWell}</span>
              </td>
              <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300">{s.volume} µL</td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: LIQUID_COLORS[s.liquidType] }}
                  />
                  {s.liquidType}
                </span>
              </td>
              <td className="px-2 py-1.5 text-gray-400 dark:text-gray-500">{s.pipetteId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportReviewScreen({
  plan,
  filename,
  darkMode: _dark,
  onApprove,
  onClose,
}: ImportReviewScreenProps) {
  const [edit, setEdit] = useState<EditState>(() => initEditState(plan));
  const [tab,  setTab ] = useState<'plates' | 'fills' | 'steps'>('plates');

  // Derived counts
  const newPlatesCount    = edit.plates.filter(p => !p.matchedPlateId).length;
  const includedFills     = edit.fills.filter(f => f.included);
  const includedSteps     = edit.steps.filter(s => s.included);
  const hasOverLimit      = edit.fills.some(f => {
    const spec   = edit.plates.find(p => p.tempId === f.plateTempId);
    const maxVol = spec ? PLATE_CONFIGS[spec.plateType].wellMaxVolume : 300;
    return f.included && f.volume > maxVol;
  });

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const setPlates = (fn: (prev: PlateSpec[]) => PlateSpec[]) =>
    setEdit(e => ({ ...e, plates: fn(e.plates) }));
  const setFills = (fn: (prev: EditableFill[]) => EditableFill[]) =>
    setEdit(e => ({ ...e, fills: fn(e.fills) }));
  const setSteps = (fn: (prev: EditableStep[]) => EditableStep[]) =>
    setEdit(e => ({ ...e, steps: fn(e.steps) }));

  function handleChangePlateName(tempId: string, name: string) {
    setPlates(prev => prev.map(p => p.tempId === tempId ? { ...p, name } : p));
  }
  function handleChangePlateType(tempId: string, plateType: PlateType) {
    setPlates(prev => prev.map(p => p.tempId === tempId ? { ...p, plateType } : p));
  }
  function handleChangeFillVolume(id: string, volume: number) {
    setFills(prev => prev.map(f => f.id === id ? { ...f, volume } : f));
  }
  function handleChangeFillLiquid(id: string, liquidType: LiquidCategory) {
    setFills(prev => prev.map(f => f.id === id ? { ...f, liquidType } : f));
  }
  function handleToggleFill(id: string) {
    setFills(prev => prev.map(f => f.id === id ? { ...f, included: !f.included } : f));
  }
  function handleToggleStep(stepNum: number) {
    setSteps(prev => prev.map(s => s.stepNum === stepNum ? { ...s, included: !s.included } : s));
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  function handleApprove() {
    const finalPlan: SetupPlan = {
      plates: edit.plates,
      fills:  includedFills,
      steps:  includedSteps,
    };
    onApprove(finalPlan, edit.replace);
  }

  // ── Tab bar helper ─────────────────────────────────────────────────────────

  function tabCls(t: typeof tab) {
    return `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? 'border-indigo-500 text-indigo-700 dark:text-indigo-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-sm text-gray-700 dark:text-gray-300">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Review Import Plan</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{filename}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none ml-4">×</button>
          </div>

          {/* Summary chips */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
              {newPlatesCount} plate{newPlatesCount !== 1 ? 's' : ''} to create
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
              {includedFills.length} well{includedFills.length !== 1 ? 's' : ''} to fill
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium">
              {includedSteps.length} step{includedSteps.length !== 1 ? 's' : ''} to import
            </span>
            {hasOverLimit && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
                ⚠ Volume exceeds plate max
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 px-2">
          <button className={tabCls('plates')} onClick={() => setTab('plates')}>
            Plates ({edit.plates.length})
          </button>
          <button className={tabCls('fills')} onClick={() => setTab('fills')}>
            Wells ({edit.fills.length})
          </button>
          <button className={tabCls('steps')} onClick={() => setTab('steps')}>
            Steps ({edit.steps.length})
          </button>
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'plates' && (
            <PlatesTab
              plates={edit.plates}
              onChangeName={handleChangePlateName}
              onChangeType={handleChangePlateType}
            />
          )}
          {tab === 'fills' && (
            <WellsTab
              fills={edit.fills}
              plates={edit.plates}
              onChangeVolume={handleChangeFillVolume}
              onChangeLiquid={handleChangeFillLiquid}
              onToggleInclude={handleToggleFill}
            />
          )}
          {tab === 'steps' && (
            <StepsTab
              steps={edit.steps}
              onToggleInclude={handleToggleStep}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={edit.replace}
              onChange={e => setEdit(prev => ({ ...prev, replace: e.target.checked }))}
              className="rounded"
            />
            <span className="text-gray-600 dark:text-gray-300">Replace existing protocol steps</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={includedSteps.length === 0 || hasOverLimit}
              className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors"
            >
              Approve &amp; Load ({includedSteps.length} step{includedSteps.length !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
