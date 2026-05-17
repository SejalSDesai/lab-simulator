import { useState } from 'react';
import type {
  Plate,
  Protocol,
  ProtocolStep,
  LiquidCategory,
  SimulationResult,
  WellAddress,
} from '../types';
import { PIPETTE_PRESETS, LIQUID_COLORS } from '../types';
import { generateId, isValidWellId, getPlateById } from '../utils';

const LIQUID_OPTIONS: LiquidCategory[] = ['reagent', 'buffer', 'sample', 'water'];

interface ProtocolBuilderProps {
  protocol: Protocol;
  plates: Plate[];
  selectedPipetteId: string;
  selectedWells: WellAddress[];
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
  volumeMode: 'each' | 'distribute';
}

const DEFAULT_FORM: StepFormState = {
  srcPlateId:  '',
  srcWellId:   '',
  dstPlateId:  '',
  dstWellId:   '',
  volume:      '50',
  pipetteId:   'p200',
  liquidType:  'sample',
  volumeMode:  'each',
};

function stepDescription(step: ProtocolStep, plates: Plate[]): string {
  const srcPlate = getPlateById(plates, step.sourceAddress.plateId);
  const src      = `${srcPlate?.name ?? '?'} ${step.sourceAddress.wellId}`;

  if (step.destAddresses && step.destAddresses.length > 1) {
    const n    = step.destAddresses.length;
    const mode = step.volumeMode === 'distribute' ? `÷${n}` : `×${n}`;
    return `${src} → ${n} wells  ·  ${step.volume} µL ${mode}`;
  }

  const dstPlate = getPlateById(plates, step.destAddress.plateId);
  const dst      = `${dstPlate?.name ?? '?'} ${step.destAddress.wellId}`;
  return `${src} → ${dst}  ·  ${step.volume} µL`;
}

export default function ProtocolBuilder({
  protocol,
  plates,
  selectedPipetteId,
  selectedWells,
  animatingStep,
  simResult,
  darkMode: _darkMode,
  onProtocolChange,
}: ProtocolBuilderProps) {
  const [form, setForm] = useState<StepFormState>({
    ...DEFAULT_FORM,
    pipetteId:  selectedPipetteId || DEFAULT_FORM.pipetteId,
    srcPlateId: plates[0]?.id ?? '',
    dstPlateId: plates[0]?.id ?? '',
  });
  const [formError, setFormError] = useState('');

  // ── Edit panel state ──────────────────────────────────────────────
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<StepFormState>(DEFAULT_FORM);

  const updateField = <K extends keyof StepFormState>(key: K, value: StepFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormError('');
  };

  const updateEditField = <K extends keyof StepFormState>(key: K, value: StepFormState[K]) => {
    setEditForm(prev => ({ ...prev, [key]: value }));
  };

  const openEdit = (step: ProtocolStep, idx: number) => {
    setEditingStepIndex(idx);
    setEditForm({
      srcPlateId: step.sourceAddress.plateId,
      srcWellId:  step.sourceAddress.wellId,
      dstPlateId: step.destAddress.plateId,
      dstWellId:  step.destAddress.wellId,
      volume:     String(step.volume),
      pipetteId:  step.pipetteId,
      liquidType: step.liquidType,
      volumeMode: step.volumeMode ?? 'each',
    });
  };

  const closeEdit = () => setEditingStepIndex(null);

  // Save logic wired in TASK-002; panel closes on Save for now.
  const handleEditSave = () => closeEdit();

  const isMultiDest = selectedWells.length > 1;

  const addStep = () => {
    const srcPlate = getPlateById(plates, form.srcPlateId);
    const volume   = parseFloat(form.volume);

    if (!srcPlate) { setFormError('Select a source plate.'); return; }
    if (!form.srcWellId || !isValidWellId(form.srcWellId.toUpperCase(), srcPlate)) {
      setFormError(`"${form.srcWellId}" is not a valid well in ${srcPlate.name}.`);
      return;
    }
    if (isNaN(volume) || volume <= 0) { setFormError('Volume must be a positive number.'); return; }

    let dstWells: WellAddress[];

    if (isMultiDest) {
      dstWells = selectedWells;
    } else {
      const dstPlate = getPlateById(plates, form.dstPlateId);
      if (!dstPlate) { setFormError('Select a destination plate.'); return; }
      if (!form.dstWellId || !isValidWellId(form.dstWellId.toUpperCase(), dstPlate)) {
        setFormError(`"${form.dstWellId}" is not a valid well in ${dstPlate.name}.`);
        return;
      }
      dstWells = [{ plateId: form.dstPlateId, wellId: form.dstWellId.toUpperCase() }];
    }

    const step: ProtocolStep = {
      id:            generateId(),
      sourceAddress: { plateId: form.srcPlateId, wellId: form.srcWellId.toUpperCase() },
      destAddress:   dstWells[0],
      volume,
      pipetteId:     form.pipetteId,
      liquidType:    form.liquidType,
    };

    if (dstWells.length > 1) {
      step.destAddresses = dstWells;
      step.volumeMode    = form.volumeMode;
    }

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

  const editingSrcMissing = editingStepIndex !== null && !plates.find(p => p.id === editForm.srcPlateId);
  const editingDstMissing = editingStepIndex !== null && !plates.find(p => p.id === editForm.dstPlateId);

  return (
    <aside className="relative w-72 shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col text-sm text-gray-700 dark:text-gray-300 overflow-hidden">
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
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(step, idx)}
                    disabled={animatingStep >= 0}
                    className="text-gray-300 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm leading-none"
                    title="Edit step"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeStep(step.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                    title="Delete step"
                  >
                    ×
                  </button>
                </div>
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

        {!isMultiDest && plates.length < 2 && (
          <p className="text-xs text-amber-500 italic">Add at least 2 plates to the canvas first.</p>
        )}
        {isMultiDest && plates.length < 1 && (
          <p className="text-xs text-amber-500 italic">Add a plate to the canvas first.</p>
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

        {/* Destination — single or multi */}
        {isMultiDest ? (
          <div className="space-y-1">
            <label className={labelCls}>Destination</label>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-xs px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-medium">
                {selectedWells.length} wells selected
              </span>
              <select
                value={form.volumeMode}
                onChange={e => updateField('volumeMode', e.target.value as 'each' | 'distribute')}
                className={`${inputCls} flex-1`}
                title="Volume mode"
              >
                <option value="each">Per well</option>
                <option value="distribute">Distribute</option>
              </select>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {form.volumeMode === 'each'
                ? `Each of the ${selectedWells.length} wells gets ${form.volume} µL`
                : `${form.volume} µL split equally: ~${(parseFloat(form.volume) / selectedWells.length || 0).toFixed(1)} µL/well`}
            </p>
          </div>
        ) : (
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
        )}

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

      {/* ── Edit Step Panel ─────────────────────────────────────────── */}
      {editingStepIndex !== null && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Edit Step {editingStepIndex + 1}</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">All changes require Save to apply.</p>
            </div>
            <button
              onClick={closeEdit}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              title="Cancel"
            >
              ×
            </button>
          </div>

          {/* Form body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">

            {/* Source */}
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select
                  value={editForm.srcPlateId}
                  onChange={e => updateEditField('srcPlateId', e.target.value)}
                  className={`${inputCls} ${editingSrcMissing ? 'border-amber-400' : ''}`}
                >
                  <option value="">— plate —</option>
                  {editingSrcMissing && (
                    <option value={editForm.srcPlateId}>⚠ (plate removed)</option>
                  )}
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {editingSrcMissing && (
                  <p className="text-xs text-amber-500 mt-0.5">Source plate no longer on canvas.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Source Well</label>
                <input
                  type="text"
                  placeholder="e.g. A1"
                  value={editForm.srcWellId}
                  onChange={e => updateEditField('srcWellId', e.target.value)}
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
                  value={editForm.dstPlateId}
                  onChange={e => updateEditField('dstPlateId', e.target.value)}
                  className={`${inputCls} ${editingDstMissing ? 'border-amber-400' : ''}`}
                >
                  <option value="">— plate —</option>
                  {editingDstMissing && (
                    <option value={editForm.dstPlateId}>⚠ (plate removed)</option>
                  )}
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {editingDstMissing && (
                  <p className="text-xs text-amber-500 mt-0.5">Dest plate no longer on canvas.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Dest Well</label>
                <input
                  type="text"
                  placeholder="e.g. B3"
                  value={editForm.dstWellId}
                  onChange={e => updateEditField('dstWellId', e.target.value)}
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
                  value={editForm.volume}
                  onChange={e => updateEditField('volume', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Liquid Type</label>
                <select
                  value={editForm.liquidType}
                  onChange={e => updateEditField('liquidType', e.target.value as LiquidCategory)}
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
                value={editForm.pipetteId}
                onChange={e => updateEditField('pipetteId', e.target.value)}
                className={inputCls}
              >
                {PIPETTE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Multi-dest notice */}
            {protocol.steps[editingStepIndex]?.destAddresses &&
              (protocol.steps[editingStepIndex].destAddresses?.length ?? 0) > 1 && (
              <p className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1.5">
                This step has multiple destinations. The panel shows the first destination only.
                Full multi-dest editing will be supported in a future update.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-3 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <button
              onClick={handleEditSave}
              className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={closeEdit}
              className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
