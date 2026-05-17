import { useState } from 'react';
import type {
  Plate,
  Protocol,
  ProtocolStep,
  LiquidCategory,
  SimulationResult,
  WellAddress,
  SelectionMode,
} from '../types';
import { PIPETTE_PRESETS, LIQUID_COLORS, ROW_LABELS } from '../types';
import { generateId, isValidWellId, getPlateById } from '../utils';

const LIQUID_OPTIONS: LiquidCategory[] = ['reagent', 'buffer', 'sample', 'water'];
const ROW_OPTIONS = ROW_LABELS.slice(0, 16) as string[]; // A–P

// ── Multi-channel helpers ────────────────────────────────────────────

function columnToWells(col: number, tipCount: number, plateId: string): WellAddress[] {
  return ROW_LABELS.slice(0, tipCount).map(row => ({ plateId, wellId: `${row}${col}` }));
}

function rowToWells(row: string, tipCount: number, plateId: string): WellAddress[] {
  return Array.from({ length: tipCount }, (_, i) => ({ plateId, wellId: `${row}${i + 1}` }));
}

function columnPreview(col: string, tipCount: number): string {
  const n = parseInt(col);
  if (!n || tipCount < 1) return '';
  return `${ROW_LABELS[0]}${n}–${ROW_LABELS[tipCount - 1]}${n} (${tipCount} wells)`;
}

function rowPreview(row: string, tipCount: number): string {
  if (!row || tipCount < 1) return '';
  return `${row}1–${row}${tipCount} (${tipCount} wells)`;
}

// ── Step description ─────────────────────────────────────────────────

function stepDescription(step: ProtocolStep, plates: Plate[]): string {
  const pipette    = PIPETTE_PRESETS.find(p => p.id === step.pipetteId);
  const isMultiCh  = (pipette?.tipCount ?? 1) > 1;
  const srcPlate   = getPlateById(plates, step.sourceAddress.plateId);
  const srcName    = srcPlate?.name ?? '?';

  if (isMultiCh) {
    const pipName = pipette?.name ?? step.pipetteId;
    if (step.selectionMode === 'column' && step.sourceColumn && step.destColumn) {
      return `${pipName} · Col ${step.sourceColumn} → Col ${step.destColumn}  ·  ${step.volume} µL`;
    }
    if (step.selectionMode === 'row' && step.sourceRow && step.destRow) {
      return `${pipName} · Row ${step.sourceRow} → Row ${step.destRow}  ·  ${step.volume} µL`;
    }
    const n = step.destAddresses?.length ?? 1;
    return `${pipName} · ${n} wells  ·  ${step.volume} µL`;
  }

  const src = `${srcName} ${step.sourceAddress.wellId}`;

  if (step.destAddresses && step.destAddresses.length > 1) {
    const n    = step.destAddresses.length;
    const mode = step.volumeMode === 'distribute' ? `÷${n}` : `×${n}`;
    return `${src} → ${n} wells  ·  ${step.volume} µL ${mode}`;
  }

  const dstPlate = getPlateById(plates, step.destAddress.plateId);
  const dst      = `${dstPlate?.name ?? '?'} ${step.destAddress.wellId}`;
  return `${src} → ${dst}  ·  ${step.volume} µL`;
}

// ── Component ────────────────────────────────────────────────────────

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
  selectionMode: SelectionMode;
  srcColumn: string;
  dstColumn: string;
  srcRow: string;
  dstRow: string;
}

const DEFAULT_FORM: StepFormState = {
  srcPlateId:    '',
  srcWellId:     '',
  dstPlateId:    '',
  dstWellId:     '',
  volume:        '50',
  pipetteId:     'p200',
  liquidType:    'sample',
  volumeMode:    'each',
  selectionMode: 'individual',
  srcColumn:     '1',
  dstColumn:     '1',
  srcRow:        'A',
  dstRow:        'A',
};

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

  const selectedPipette = PIPETTE_PRESETS.find(p => p.id === form.pipetteId);
  const tipCount        = selectedPipette?.tipCount ?? 1;
  const isMultiChannel  = tipCount > 1;
  const isMultiDest     = selectedWells.length > 1;

  const updateField = <K extends keyof StepFormState>(key: K, value: StepFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFormError('');
  };

  const handlePipetteChange = (pipetteId: string) => {
    const pip = PIPETTE_PRESETS.find(p => p.id === pipetteId);
    setForm(prev => ({
      ...prev,
      pipetteId,
      selectionMode: (pip?.tipCount ?? 1) > 1 ? prev.selectionMode : 'individual',
      srcWellId: '',
      dstWellId: '',
    }));
    setFormError('');
  };

  const handleSelectionModeChange = (mode: SelectionMode) => {
    setForm(prev => ({
      ...prev,
      selectionMode: mode,
      srcWellId: '',
      dstWellId: '',
      srcColumn: '1',
      dstColumn: '1',
      srcRow: 'A',
      dstRow: 'A',
    }));
    setFormError('');
  };

  const addStep = () => {
    const volume = parseFloat(form.volume);
    if (isNaN(volume) || volume <= 0) { setFormError('Volume must be a positive number.'); return; }

    if (isMultiChannel && form.selectionMode === 'column') {
      const srcCol = parseInt(form.srcColumn);
      const dstCol = parseInt(form.dstColumn);
      const srcPlate = getPlateById(plates, form.srcPlateId);
      const dstPlate = getPlateById(plates, form.dstPlateId);
      if (!srcPlate) { setFormError('Select a source plate.'); return; }
      if (!dstPlate) { setFormError('Select a destination plate.'); return; }
      if (!srcCol || srcCol < 1) { setFormError('Enter a valid source column.'); return; }
      if (!dstCol || dstCol < 1) { setFormError('Enter a valid destination column.'); return; }

      const srcWells = columnToWells(srcCol, tipCount, form.srcPlateId);
      const dstWells = columnToWells(dstCol, tipCount, form.dstPlateId);

      const step: ProtocolStep = {
        id:            generateId(),
        sourceAddress: srcWells[0],
        destAddress:   dstWells[0],
        destAddresses: dstWells,
        volume,
        pipetteId:     form.pipetteId,
        liquidType:    form.liquidType,
        selectionMode: 'column',
        sourceColumn:  srcCol,
        destColumn:    dstCol,
      };
      onProtocolChange({ ...protocol, steps: [...protocol.steps, step], updatedAt: new Date().toISOString() });
      setFormError('');
      return;
    }

    if (isMultiChannel && form.selectionMode === 'row') {
      const srcPlate = getPlateById(plates, form.srcPlateId);
      const dstPlate = getPlateById(plates, form.dstPlateId);
      if (!srcPlate) { setFormError('Select a source plate.'); return; }
      if (!dstPlate) { setFormError('Select a destination plate.'); return; }
      if (!form.srcRow) { setFormError('Select a source row.'); return; }
      if (!form.dstRow) { setFormError('Select a destination row.'); return; }

      const srcWells = rowToWells(form.srcRow, tipCount, form.srcPlateId);
      const dstWells = rowToWells(form.dstRow, tipCount, form.dstPlateId);

      const step: ProtocolStep = {
        id:            generateId(),
        sourceAddress: srcWells[0],
        destAddress:   dstWells[0],
        destAddresses: dstWells,
        volume,
        pipetteId:     form.pipetteId,
        liquidType:    form.liquidType,
        selectionMode: 'row',
        sourceRow:     form.srcRow,
        destRow:       form.dstRow,
      };
      onProtocolChange({ ...protocol, steps: [...protocol.steps, step], updatedAt: new Date().toISOString() });
      setFormError('');
      return;
    }

    // Individual mode (single-channel or multi-channel individual)
    const srcPlate = getPlateById(plates, form.srcPlateId);
    if (!srcPlate) { setFormError('Select a source plate.'); return; }
    if (!form.srcWellId || !isValidWellId(form.srcWellId.toUpperCase(), srcPlate)) {
      setFormError(`"${form.srcWellId}" is not a valid well in ${srcPlate.name}.`);
      return;
    }

    if (isMultiChannel && isMultiDest && selectedWells.length !== tipCount) {
      setFormError(`Select exactly ${tipCount} destination wells for this pipette (${selectedWells.length} selected).`);
      return;
    }

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
      selectionMode: 'individual',
    };

    if (dstWells.length > 1) {
      step.destAddresses = dstWells;
      step.volumeMode    = form.volumeMode;
    }

    onProtocolChange({ ...protocol, steps: [...protocol.steps, step], updatedAt: new Date().toISOString() });
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
  const labelCls  = 'block text-xs text-gray-500 dark:text-gray-400 mb-0.5';
  const modeBtnCls = (active: boolean) =>
    `flex-1 py-1 text-xs font-medium rounded transition-colors ${
      active
        ? 'bg-indigo-600 text-white'
        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`;

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

        {/* Pipette */}
        <div>
          <label className={labelCls}>Pipette</label>
          <select
            value={form.pipetteId}
            onChange={e => handlePipetteChange(e.target.value)}
            className={inputCls}
          >
            {PIPETTE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Selection mode — only for multi-channel pipettes */}
        {isMultiChannel && (
          <div>
            <label className={labelCls}>Selection Mode</label>
            <div className="flex gap-1">
              <button className={modeBtnCls(form.selectionMode === 'column')}    onClick={() => handleSelectionModeChange('column')}>Column</button>
              <button className={modeBtnCls(form.selectionMode === 'row')}       onClick={() => handleSelectionModeChange('row')}>Row</button>
              <button className={modeBtnCls(form.selectionMode === 'individual')} onClick={() => handleSelectionModeChange('individual')}>Individual</button>
            </div>
          </div>
        )}

        {/* Column mode inputs */}
        {isMultiChannel && form.selectionMode === 'column' && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select value={form.srcPlateId} onChange={e => updateField('srcPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Column</label>
                <input
                  type="number" min={1} max={24}
                  value={form.srcColumn}
                  onChange={e => updateField('srcColumn', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {form.srcColumn && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 -mt-1">
                {columnPreview(form.srcColumn, tipCount)}
              </p>
            )}

            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Dest Plate</label>
                <select value={form.dstPlateId} onChange={e => updateField('dstPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dest Column</label>
                <input
                  type="number" min={1} max={24}
                  value={form.dstColumn}
                  onChange={e => updateField('dstColumn', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {form.dstColumn && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 -mt-1">
                {columnPreview(form.dstColumn, tipCount)}
              </p>
            )}
          </>
        )}

        {/* Row mode inputs */}
        {isMultiChannel && form.selectionMode === 'row' && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select value={form.srcPlateId} onChange={e => updateField('srcPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Row</label>
                <select value={form.srcRow} onChange={e => updateField('srcRow', e.target.value)} className={inputCls}>
                  {ROW_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {form.srcRow && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 -mt-1">
                {rowPreview(form.srcRow, tipCount)}
              </p>
            )}

            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Dest Plate</label>
                <select value={form.dstPlateId} onChange={e => updateField('dstPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dest Row</label>
                <select value={form.dstRow} onChange={e => updateField('dstRow', e.target.value)} className={inputCls}>
                  {ROW_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {form.dstRow && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 -mt-1">
                {rowPreview(form.dstRow, tipCount)}
              </p>
            )}
          </>
        )}

        {/* Individual mode (single-channel or multi-channel individual) */}
        {(!isMultiChannel || form.selectionMode === 'individual') && (
          <>
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
                <select value={form.srcPlateId} onChange={e => updateField('srcPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Well</label>
                <input
                  type="text" placeholder="e.g. A1"
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
                {isMultiChannel && selectedWells.length !== tipCount && (
                  <p className="text-xs text-amber-500">
                    Select exactly {tipCount} wells for this pipette ({selectedWells.length} selected).
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className={labelCls}>Dest Plate</label>
                  <select value={form.dstPlateId} onChange={e => updateField('dstPlateId', e.target.value)} className={inputCls}>
                    <option value="">— plate —</option>
                    {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Dest Well</label>
                  <input
                    type="text" placeholder="e.g. B3"
                    value={form.dstWellId}
                    onChange={e => updateField('dstWellId', e.target.value)}
                    className={inputCls}
                    maxLength={4}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Volume + liquid — always shown */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Volume (µL)</label>
            <input
              type="number" min={0.1} step={0.1}
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
