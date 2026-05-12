import { useState } from 'react';
import type {
  Plate,
  Protocol,
  ProtocolStep,
  LiquidCategory,
  SimulationResult,
} from '../types';
import { PIPETTE_PRESETS, LIQUID_COLORS } from '../types';
import { generateId, isValidWellId, getPlateById } from '../utils';

const LIQUID_OPTIONS: LiquidCategory[] = ['reagent', 'buffer', 'sample', 'water'];

interface ProtocolBuilderProps {
  protocol: Protocol;
  plates: Plate[];
  selectedPipetteId: string;
  animatingStep: number;
  simResult: SimulationResult | null;
  darkMode: boolean;
  onProtocolChange: (protocol: Protocol) => void;
}

interface StepFormState {
  srcPlateId: string;
  srcWellId: string;
  dstPlateId: string;
  dstWellId: string;
  volume: string;
  pipetteId: string;
  liquidType: LiquidCategory;
}

const DEFAULT_FORM: StepFormState = {
  srcPlateId: '',
  srcWellId: '',
  dstPlateId: '',
  dstWellId: '',
  volume: '50',
  pipetteId: 'p200',
  liquidType: 'sample',
};

function stepDescription(step: ProtocolStep, plates: Plate[]): string {
  const srcPlate = getPlateById(plates, step.sourceAddress.plateId);
  const dstPlate = getPlateById(plates, step.destAddress.plateId);
  const src = `${srcPlate?.name ?? '?'} ${step.sourceAddress.wellId}`;
  const dst = `${dstPlate?.name ?? '?'} ${step.destAddress.wellId}`;
  return `${src} → ${dst}  ·  ${step.volume} µL`;
}

export default function ProtocolBuilder({
  protocol,
  plates,
  selectedPipetteId,
  animatingStep,
  simResult,
  darkMode: _darkMode,
  onProtocolChange,
}: ProtocolBuilderProps) {
  const [form, setForm] = useState<StepFormState>({
    ...DEFAULT_FORM,
    pipetteId: selectedPipetteId || DEFAULT_FORM.pipetteId,
    srcPlateId: plates[0]?.id ?? '',
    dstPlateId: plates[0]?.id ?? '',
  });
  const [formError, setFormError] = useState('');

  const updateField = <K extends keyof StepFormState>(key: K, value: StepFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormError('');
  };

  const addStep = () => {
    const srcPlate = getPlateById(plates, form.srcPlateId);
    const dstPlate = getPlateById(plates, form.dstPlateId);
    const volume   = parseFloat(form.volume);

    if (!srcPlate) { setFormError('Select a source plate.'); return; }
    if (!dstPlate) { setFormError('Select a destination plate.'); return; }
    if (!form.srcWellId || !isValidWellId(form.srcWellId.toUpperCase(), srcPlate)) {
      setFormError(`"${form.srcWellId}" is not a valid well in ${srcPlate.name}.`);
      return;
    }
    if (!form.dstWellId || !isValidWellId(form.dstWellId.toUpperCase(), dstPlate)) {
      setFormError(`"${form.dstWellId}" is not a valid well in ${dstPlate.name}.`);
      return;
    }
    if (isNaN(volume) || volume <= 0) { setFormError('Volume must be a positive number.'); return; }

    const step: ProtocolStep = {
      id: generateId(),
      sourceAddress: { plateId: form.srcPlateId, wellId: form.srcWellId.toUpperCase() },
      destAddress:   { plateId: form.dstPlateId, wellId: form.dstWellId.toUpperCase() },
      volume,
      pipetteId:   form.pipetteId,
      liquidType:  form.liquidType,
    };

    onProtocolChange({
      ...protocol,
      steps: [...protocol.steps, step],
      updatedAt: new Date().toISOString(),
    });
    setFormError('');
  };

  const removeStep = (stepId: string) => {
    onProtocolChange({
      ...protocol,
      steps: protocol.steps.filter(s => s.id !== stepId),
      updatedAt: new Date().toISOString(),
    });
  };

  const inputCls =
    'w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-0.5';

  return (
    <aside className="w-72 shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col text-sm text-gray-700 dark:text-gray-300 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Protocol Builder</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">{protocol.steps.length} step(s)</p>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto py-2">
        {protocol.steps.length === 0 && (
          <p className="px-3 text-xs text-gray-400 dark:text-gray-500 italic">No steps yet. Add one below.</p>
        )}

        {protocol.steps.map((step, idx) => {
          const isAnimating = idx === animatingStep;
          const stepError   = simResult?.errors.find(e => e.stepIndex === idx);
          const stepWarn    = simResult?.warnings.find(e => e.stepIndex === idx);
          const pipette     = PIPETTE_PRESETS.find(p => p.id === step.pipetteId);

          return (
            <div
              key={step.id}
              className={`mx-2 mb-1 px-2 py-2 rounded border text-xs transition-all ${
                isAnimating
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30'
                  : stepError
                  ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-medium text-gray-500 dark:text-gray-400 shrink-0">
                  {isAnimating ? '▶' : `${idx + 1}.`}
                </span>
                <span className="flex-1 leading-relaxed break-all">
                  {stepDescription(step, plates)}
                </span>
                <button
                  onClick={() => removeStep(step.id)}
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                  title="Delete step"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center gap-2 mt-1 text-gray-400 dark:text-gray-500">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: LIQUID_COLORS[step.liquidType] }}
                />
                <span>{step.liquidType}</span>
                <span>·</span>
                <span>{pipette?.name ?? step.pipetteId}</span>
              </div>

              {stepError && (
                <p className="mt-1 text-red-500 dark:text-red-400">{stepError.message}</p>
              )}
              {!stepError && stepWarn && (
                <p className="mt-1 text-amber-500 dark:text-amber-400">{stepWarn.message}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Simulation stats */}
      {simResult?.success && (
        <div className="mx-2 mb-2 px-2 py-2 rounded bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-xs">
          <p className="font-semibold text-green-700 dark:text-green-400 mb-1">Simulation Complete</p>
          <p>Volume transferred: <strong>{simResult.stats.totalVolumeTransferred} µL</strong></p>
          <p>Steps completed: <strong>{simResult.stats.completedSteps}</strong></p>
          <p>Tip changes: <strong>{simResult.stats.tipChanges}</strong></p>
          <p>Est. duration: <strong>{simResult.stats.estimatedDurationSeconds}s</strong></p>
        </div>
      )}

      {/* Add step form */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-2 shrink-0 bg-gray-50 dark:bg-gray-800/80">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Add Transfer Step</p>

        {plates.length < 2 && (
          <p className="text-xs text-amber-500 italic">Add at least 2 plates to the canvas first.</p>
        )}

        {/* Source */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Source Plate</label>
            <select
              value={form.srcPlateId}
              onChange={e => updateField('srcPlateId', e.target.value)}
              className={inputCls}
            >
              <option value="">— plate —</option>
              {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Source Well</label>
            <input
              type="text"
              placeholder="e.g. A1"
              value={form.srcWellId}
              onChange={e => updateField('srcWellId', e.target.value)}
              className={inputCls}
              maxLength={4}
            />
          </div>
        </div>

        {/* Destination */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Dest Plate</label>
            <select
              value={form.dstPlateId}
              onChange={e => updateField('dstPlateId', e.target.value)}
              className={inputCls}
            >
              <option value="">— plate —</option>
              {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Dest Well</label>
            <input
              type="text"
              placeholder="e.g. B3"
              value={form.dstWellId}
              onChange={e => updateField('dstWellId', e.target.value)}
              className={inputCls}
              maxLength={4}
            />
          </div>
        </div>

        {/* Volume + liquid */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Volume (µL)</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={form.volume}
              onChange={e => updateField('volume', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Liquid Type</label>
            <select
              value={form.liquidType}
              onChange={e => updateField('liquidType', e.target.value as LiquidCategory)}
              className={inputCls}
            >
              {LIQUID_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Pipette */}
        <div>
          <label className={labelCls}>Pipette</label>
          <select
            value={form.pipetteId}
            onChange={e => updateField('pipetteId', e.target.value)}
            className={inputCls}
          >
            {PIPETTE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {formError && (
          <p className="text-xs text-red-500">{formError}</p>
        )}

        <button
          onClick={addStep}
          disabled={plates.length < 1}
          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded transition-colors"
        >
          + Add Step
        </button>
      </div>
    </aside>
  );
}
