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
const ROW_OPTIONS = ROW_LABELS.slice(0, 16) as string[];

const LIQUID_BORDER: Record<LiquidCategory, string> = {
  reagent: 'border-l-red-400',
  buffer:  'border-l-blue-400',
  sample:  'border-l-green-400',
  water:   'border-l-sky-300',
  empty:   'border-l-gray-300',
};

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
  const pipette   = PIPETTE_PRESETS.find(p => p.id === step.pipetteId);
  const isMultiCh = (pipette?.tipCount ?? 1) > 1;
  const srcPlate  = getPlateById(plates, step.sourceAddress.plateId);
  const srcName   = srcPlate?.name ?? '?';

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
  onClearSimResult: () => void;
}

interface StepFormState {
  srcPlateId:    string;
  srcWellId:     string;
  dstPlateId:    string;
  dstWellId:     string;
  volume:        string;
  pipetteId:     string;
  liquidType:    LiquidCategory;
  volumeMode:    'each' | 'distribute';
  selectionMode: SelectionMode;
  srcColumn:     string;
  dstColumn:     string;
  srcRow:        string;
  dstRow:        string;
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

function stepToForm(step: ProtocolStep): StepFormState {
  return {
    srcPlateId:    step.sourceAddress.plateId,
    srcWellId:     step.sourceAddress.wellId,
    dstPlateId:    step.destAddress.plateId,
    dstWellId:     step.destAddress.wellId,
    volume:        String(step.volume),
    pipetteId:     step.pipetteId,
    liquidType:    step.liquidType,
    volumeMode:    step.volumeMode ?? 'each',
    selectionMode: step.selectionMode ?? 'individual',
    srcColumn:     String(step.sourceColumn ?? 1),
    dstColumn:     String(step.destColumn ?? 1),
    srcRow:        step.sourceRow ?? 'A',
    dstRow:        step.destRow ?? 'A',
  };
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
  onClearSimResult,
}: ProtocolBuilderProps) {
  const [form, setForm] = useState<StepFormState>({
    ...DEFAULT_FORM,
    pipetteId:  selectedPipetteId || DEFAULT_FORM.pipetteId,
    srcPlateId: plates[0]?.id ?? '',
    dstPlateId: plates[0]?.id ?? '',
  });
  const [formError, setFormError] = useState('');

  const [editingIdx,      setEditingIdx     ] = useState<number | null>(null);
  const [editForm,        setEditForm       ] = useState<StepFormState>(DEFAULT_FORM);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  const selectedPipette = PIPETTE_PRESETS.find(p => p.id === form.pipetteId);
  const tipCount        = selectedPipette?.tipCount ?? 1;
  const isMultiChannel  = tipCount > 1;
  const isMultiDest     = selectedWells.length > 1;

  const editPipette  = PIPETTE_PRESETS.find(p => p.id === editForm.pipetteId);
  const editTipCount = editPipette?.tipCount ?? 1;
  const editIsMulti  = editTipCount > 1;

  // ── Style constants ───────────────────────────────────────────────
  const inputCls =
    'w-full text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 ' +
    'bg-white dark:bg-gray-700 dark:text-gray-200 ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-shadow';
  const labelCls = 'block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-0.5';
  const chipCls  = 'inline-block text-[10px] font-medium text-indigo-600 dark:text-indigo-400 ' +
                   'bg-indigo-50 dark:bg-indigo-900/30 rounded-full px-2 py-0.5';
  const modeBtnCls = (active: boolean) =>
    `flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
      active
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`;

  // ── Field updaters ────────────────────────────────────────────────
  const updateField = <K extends keyof StepFormState>(key: K, val: StepFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setFormError('');
  };

  const updateEditField = <K extends keyof StepFormState>(key: K, val: StepFormState[K]) => {
    setEditForm(prev => ({ ...prev, [key]: val }));
    setEditFieldErrors(prev => ({ ...prev, [key]: '' }));
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
      ...prev, selectionMode: mode,
      srcWellId: '', dstWellId: '',
      srcColumn: '1', dstColumn: '1',
      srcRow: 'A',   dstRow: 'A',
    }));
    setFormError('');
  };

  // ── Edit handlers ────────────────────────────────────────────────
  const openEdit = (step: ProtocolStep, idx: number) => {
    setEditingIdx(idx);
    setEditForm(stepToForm(step));
    setEditFieldErrors({});
  };

  const closeEdit = () => {
    setEditingIdx(null);
    setEditFieldErrors({});
  };

  const handleEditSave = () => {
    const errs: Record<string, string> = {};
    const vol = parseFloat(editForm.volume);
    if (isNaN(vol) || vol <= 0) errs.volume = 'Must be positive';
    if (!editForm.srcPlateId)   errs.srcPlateId = 'Required';
    if (!editForm.dstPlateId)   errs.dstPlateId = 'Required';

    if (editForm.selectionMode === 'individual') {
      const sp = getPlateById(plates, editForm.srcPlateId);
      const dp = getPlateById(plates, editForm.dstPlateId);
      if (sp && editForm.srcWellId && !isValidWellId(editForm.srcWellId.toUpperCase(), sp))
        errs.srcWellId = 'Invalid well';
      if (dp && editForm.dstWellId && !isValidWellId(editForm.dstWellId.toUpperCase(), dp))
        errs.dstWellId = 'Invalid well';
    }

    if (Object.keys(errs).length > 0) { setEditFieldErrors(errs); return; }

    const orig = protocol.steps[editingIdx!];
    let updated: ProtocolStep = {
      ...orig,
      volume:        vol,
      pipetteId:     editForm.pipetteId,
      liquidType:    editForm.liquidType,
      selectionMode: editForm.selectionMode,
      volumeMode:    editForm.volumeMode,
      sourceAddress: { plateId: editForm.srcPlateId, wellId: editForm.srcWellId.toUpperCase() },
      destAddress:   { plateId: editForm.dstPlateId, wellId: editForm.dstWellId.toUpperCase() },
      sourceColumn: undefined, destColumn: undefined,
      sourceRow:    undefined, destRow:    undefined,
      destAddresses: undefined,
    };

    if (editIsMulti && editForm.selectionMode === 'column') {
      const srcWells = columnToWells(parseInt(editForm.srcColumn), editTipCount, editForm.srcPlateId);
      const dstWells = columnToWells(parseInt(editForm.dstColumn), editTipCount, editForm.dstPlateId);
      updated = {
        ...updated,
        sourceAddress: srcWells[0], destAddress: dstWells[0], destAddresses: dstWells,
        sourceColumn: parseInt(editForm.srcColumn), destColumn: parseInt(editForm.dstColumn),
      };
    } else if (editIsMulti && editForm.selectionMode === 'row') {
      const srcWells = rowToWells(editForm.srcRow, editTipCount, editForm.srcPlateId);
      const dstWells = rowToWells(editForm.dstRow, editTipCount, editForm.dstPlateId);
      updated = {
        ...updated,
        sourceAddress: srcWells[0], destAddress: dstWells[0], destAddresses: dstWells,
        sourceRow: editForm.srcRow, destRow: editForm.dstRow,
      };
    }

    const steps = [...protocol.steps];
    steps[editingIdx!] = updated;
    onProtocolChange({ ...protocol, steps, updatedAt: new Date().toISOString() });
    onClearSimResult();
    closeEdit();
  };

  // ── Add step ─────────────────────────────────────────────────────
  const addStep = () => {
    const volume = parseFloat(form.volume);
    if (isNaN(volume) || volume <= 0) { setFormError('Volume must be a positive number.'); return; }

    if (isMultiChannel && form.selectionMode === 'column') {
      const srcCol   = parseInt(form.srcColumn);
      const dstCol   = parseInt(form.dstColumn);
      const srcPlate = getPlateById(plates, form.srcPlateId);
      const dstPlate = getPlateById(plates, form.dstPlateId);
      if (!srcPlate)           { setFormError('Select a source plate.'); return; }
      if (!dstPlate)           { setFormError('Select a destination plate.'); return; }
      if (!srcCol || srcCol < 1) { setFormError('Enter a valid source column.'); return; }
      if (!dstCol || dstCol < 1) { setFormError('Enter a valid destination column.'); return; }

      const srcWells = columnToWells(srcCol, tipCount, form.srcPlateId);
      const dstWells = columnToWells(dstCol, tipCount, form.dstPlateId);
      const step: ProtocolStep = {
        id: generateId(), sourceAddress: srcWells[0], destAddress: dstWells[0],
        destAddresses: dstWells, volume, pipetteId: form.pipetteId,
        liquidType: form.liquidType, selectionMode: 'column',
        sourceColumn: srcCol, destColumn: dstCol,
      };
      onProtocolChange({ ...protocol, steps: [...protocol.steps, step], updatedAt: new Date().toISOString() });
      setFormError('');
      return;
    }

    if (isMultiChannel && form.selectionMode === 'row') {
      const srcPlate = getPlateById(plates, form.srcPlateId);
      const dstPlate = getPlateById(plates, form.dstPlateId);
      if (!srcPlate)  { setFormError('Select a source plate.'); return; }
      if (!dstPlate)  { setFormError('Select a destination plate.'); return; }
      if (!form.srcRow) { setFormError('Select a source row.'); return; }
      if (!form.dstRow) { setFormError('Select a destination row.'); return; }

      const srcWells = rowToWells(form.srcRow, tipCount, form.srcPlateId);
      const dstWells = rowToWells(form.dstRow, tipCount, form.dstPlateId);
      const step: ProtocolStep = {
        id: generateId(), sourceAddress: srcWells[0], destAddress: dstWells[0],
        destAddresses: dstWells, volume, pipetteId: form.pipetteId,
        liquidType: form.liquidType, selectionMode: 'row',
        sourceRow: form.srcRow, destRow: form.dstRow,
      };
      onProtocolChange({ ...protocol, steps: [...protocol.steps, step], updatedAt: new Date().toISOString() });
      setFormError('');
      return;
    }

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
      id: generateId(),
      sourceAddress: { plateId: form.srcPlateId, wellId: form.srcWellId.toUpperCase() },
      destAddress: dstWells[0],
      volume, pipetteId: form.pipetteId, liquidType: form.liquidType, selectionMode: 'individual',
    };
    if (dstWells.length > 1) { step.destAddresses = dstWells; step.volumeMode = form.volumeMode; }

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

  // ── Shared form body (used by both Add and Edit panels) ───────────
  function FormBody({
    f, update, onPipChange, onModeChange, errors, isMultiCh, tc, showMultiDest,
  }: {
    f: StepFormState;
    update: <K extends keyof StepFormState>(k: K, v: StepFormState[K]) => void;
    onPipChange: (id: string) => void;
    onModeChange: (m: SelectionMode) => void;
    errors: Record<string, string>;
    isMultiCh: boolean;
    tc: number;
    showMultiDest: boolean;
  }) {
    return (
      <>
        {/* Pipette */}
        <div>
          <label className={labelCls}>Pipette</label>
          <select value={f.pipetteId} onChange={e => onPipChange(e.target.value)} className={inputCls}>
            {PIPETTE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Selection mode — multi-channel only */}
        {isMultiCh && (
          <div>
            <label className={labelCls}>Selection Mode</label>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700/80 rounded-lg">
              <button className={modeBtnCls(f.selectionMode === 'column')}     onClick={() => onModeChange('column')}>Column</button>
              <button className={modeBtnCls(f.selectionMode === 'row')}        onClick={() => onModeChange('row')}>Row</button>
              <button className={modeBtnCls(f.selectionMode === 'individual')} onClick={() => onModeChange('individual')}>Individual</button>
            </div>
          </div>
        )}

        {/* Column mode */}
        {isMultiCh && f.selectionMode === 'column' && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select value={f.srcPlateId} onChange={e => update('srcPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Col</label>
                <input type="number" min={1} max={24} value={f.srcColumn} onChange={e => update('srcColumn', e.target.value)} className={inputCls} />
              </div>
            </div>
            {f.srcColumn && <span className={chipCls}>{columnPreview(f.srcColumn, tc)}</span>}

            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Dest Plate</label>
                <select value={f.dstPlateId} onChange={e => update('dstPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dest Col</label>
                <input type="number" min={1} max={24} value={f.dstColumn} onChange={e => update('dstColumn', e.target.value)} className={inputCls} />
              </div>
            </div>
            {f.dstColumn && <span className={chipCls}>{columnPreview(f.dstColumn, tc)}</span>}
          </>
        )}

        {/* Row mode */}
        {isMultiCh && f.selectionMode === 'row' && (
          <>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select value={f.srcPlateId} onChange={e => update('srcPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Row</label>
                <select value={f.srcRow} onChange={e => update('srcRow', e.target.value)} className={inputCls}>
                  {ROW_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {f.srcRow && <span className={chipCls}>{rowPreview(f.srcRow, tc)}</span>}

            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Dest Plate</label>
                <select value={f.dstPlateId} onChange={e => update('dstPlateId', e.target.value)} className={inputCls}>
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Dest Row</label>
                <select value={f.dstRow} onChange={e => update('dstRow', e.target.value)} className={inputCls}>
                  {ROW_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            {f.dstRow && <span className={chipCls}>{rowPreview(f.dstRow, tc)}</span>}
          </>
        )}

        {/* Individual mode */}
        {(!isMultiCh || f.selectionMode === 'individual') && (
          <>
            {!showMultiDest && plates.length < 2 && (
              <p className="text-xs text-amber-500 italic">Add at least 2 plates to the canvas first.</p>
            )}

            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className={labelCls}>Source Plate</label>
                <select
                  value={f.srcPlateId}
                  onChange={e => update('srcPlateId', e.target.value)}
                  className={`${inputCls} ${errors.srcPlateId ? 'border-red-400' : ''}`}
                >
                  <option value="">— plate —</option>
                  {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Source Well</label>
                <input
                  type="text" placeholder="e.g. A1" maxLength={4}
                  value={f.srcWellId}
                  onChange={e => update('srcWellId', e.target.value)}
                  className={`${inputCls} ${errors.srcWellId ? 'border-red-400' : ''}`}
                />
                {errors.srcWellId && <p className="text-[10px] text-red-500 mt-0.5">{errors.srcWellId}</p>}
              </div>
            </div>

            {showMultiDest ? (
              <div className="space-y-1">
                <label className={labelCls}>Destination</label>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-medium">
                    {selectedWells.length} wells selected
                  </span>
                  <select
                    value={f.volumeMode}
                    onChange={e => update('volumeMode', e.target.value as 'each' | 'distribute')}
                    className={`${inputCls} flex-1`}
                  >
                    <option value="each">Per well</option>
                    <option value="distribute">Distribute</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {f.volumeMode === 'each'
                    ? `Each of the ${selectedWells.length} wells gets ${f.volume} µL`
                    : `${f.volume} µL split: ~${(parseFloat(f.volume) / selectedWells.length || 0).toFixed(1)} µL/well`}
                </p>
                {isMultiCh && selectedWells.length !== tc && (
                  <p className="text-xs text-amber-500">
                    Select exactly {tc} wells for this pipette ({selectedWells.length} selected).
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className={labelCls}>Dest Plate</label>
                  <select
                    value={f.dstPlateId}
                    onChange={e => update('dstPlateId', e.target.value)}
                    className={`${inputCls} ${errors.dstPlateId ? 'border-red-400' : ''}`}
                  >
                    <option value="">— plate —</option>
                    {plates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Dest Well</label>
                  <input
                    type="text" placeholder="e.g. B3" maxLength={4}
                    value={f.dstWellId}
                    onChange={e => update('dstWellId', e.target.value)}
                    className={`${inputCls} ${errors.dstWellId ? 'border-red-400' : ''}`}
                  />
                  {errors.dstWellId && <p className="text-[10px] text-red-500 mt-0.5">{errors.dstWellId}</p>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Volume + liquid */}
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Volume (µL)</label>
            <input
              type="number" min={0.1} step={0.1}
              value={f.volume}
              onChange={e => update('volume', e.target.value)}
              className={`${inputCls} ${errors.volume ? 'border-red-400' : ''}`}
            />
            {errors.volume && <p className="text-[10px] text-red-500 mt-0.5">{errors.volume}</p>}
          </div>
          <div>
            <label className={labelCls}>Liquid Type</label>
            <select value={f.liquidType} onChange={e => update('liquidType', e.target.value as LiquidCategory)} className={inputCls}>
              {LIQUID_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </>
    );
  }

  return (
    <aside className="w-72 shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col text-sm text-gray-700 dark:text-gray-300 overflow-hidden relative">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Protocol Builder</h2>
          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-full px-2 py-0.5">
            {protocol.steps.length} step{protocol.steps.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto py-2">
        {protocol.steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3 text-xl text-gray-300 dark:text-gray-600 font-light">
              +
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">No steps yet</p>
            <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Use the form below to add a transfer step.</p>
          </div>
        )}

        {protocol.steps.map((step, idx) => {
          const isAnimating = idx === animatingStep;
          const stepError   = simResult?.errors.find(e => e.stepIndex === idx);
          const stepWarn    = simResult?.warnings.find(e => e.stepIndex === idx);
          const pipette     = PIPETTE_PRESETS.find(p => p.id === step.pipetteId);
          const borderColor = LIQUID_BORDER[step.liquidType] ?? 'border-l-gray-300';

          return (
            <div
              key={step.id}
              className={`mx-2 mb-1.5 px-2 py-2 rounded-lg border-l-4 border border-gray-200 dark:border-gray-700 text-xs transition-all group ${borderColor} ${
                isAnimating
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700'
                  : stepError
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-750'
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Step badge */}
                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isAnimating
                    ? 'bg-amber-400 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {isAnimating ? '▶' : idx + 1}
                </span>

                <span className="flex-1 leading-relaxed break-words min-w-0">
                  {stepDescription(step, plates)}
                </span>

                {/* Edit + Delete — hover reveal */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(step, idx)}
                    disabled={animatingStep >= 0}
                    className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-30 transition-colors text-sm"
                    title="Edit step"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => removeStep(step.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-base leading-none"
                    title="Delete step"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1 ml-7 text-gray-400 dark:text-gray-500">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: LIQUID_COLORS[step.liquidType] }} />
                <span>{step.liquidType}</span>
                <span>·</span>
                <span className="truncate">{pipette?.name ?? step.pipetteId}</span>
              </div>

              {stepError && <p className="mt-1 ml-7 text-red-500 dark:text-red-400">{stepError.message}</p>}
              {!stepError && stepWarn && <p className="mt-1 ml-7 text-amber-500 dark:text-amber-400">{stepWarn.message}</p>}
            </div>
          );
        })}
      </div>

      {/* Simulation summary */}
      {simResult?.success && (
        <div className="mx-2 mb-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-xs">
          <p className="font-semibold text-green-700 dark:text-green-400 mb-1">Simulation Complete</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-green-600 dark:text-green-500">
            <span>Volume:</span>     <span className="font-medium">{simResult.stats.totalVolumeTransferred} µL</span>
            <span>Steps:</span>      <span className="font-medium">{simResult.stats.completedSteps}</span>
            <span>Tip changes:</span><span className="font-medium">{simResult.stats.tipChanges}</span>
            <span>Duration:</span>   <span className="font-medium">{simResult.stats.estimatedDurationSeconds}s</span>
          </div>
        </div>
      )}

      {/* Add step form */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-2 shrink-0 bg-gray-50 dark:bg-gray-800/80">
        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Add Transfer Step</p>

        <FormBody
          f={form}
          update={updateField}
          onPipChange={handlePipetteChange}
          onModeChange={handleSelectionModeChange}
          errors={{}}
          isMultiCh={isMultiChannel}
          tc={tipCount}
          showMultiDest={isMultiDest}
        />

        {formError && <p className="text-xs text-red-500">{formError}</p>}

        <button
          onClick={addStep}
          disabled={plates.length < 1}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
        >
          + Add Step
        </button>
      </div>

      {/* Edit panel — slides over the full aside */}
      {editingIdx !== null && (
        <div className="absolute inset-0 bg-white dark:bg-gray-800 flex flex-col z-10">
          {/* Edit header */}
          <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800 shrink-0 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-indigo-800 dark:text-indigo-200 text-sm">Edit Step {editingIdx + 1}</h3>
              <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-0.5">Changes will clear simulation results.</p>
            </div>
            <button
              onClick={closeEdit}
              className="w-7 h-7 rounded-full flex items-center justify-center text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors text-lg leading-none mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Edit form body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            <FormBody
              f={editForm}
              update={updateEditField}
              onPipChange={(id) => {
                const pip = PIPETTE_PRESETS.find(p => p.id === id);
                setEditForm(prev => ({
                  ...prev, pipetteId: id,
                  selectionMode: (pip?.tipCount ?? 1) > 1 ? prev.selectionMode : 'individual',
                }));
              }}
              onModeChange={(mode) => {
                setEditForm(prev => ({
                  ...prev, selectionMode: mode,
                  srcWellId: '', dstWellId: '',
                  srcColumn: '1', dstColumn: '1',
                  srcRow: 'A',   dstRow: 'A',
                }));
              }}
              errors={editFieldErrors}
              isMultiCh={editIsMulti}
              tc={editTipCount}
              showMultiDest={false}
            />
          </div>

          {/* Edit footer */}
          <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0 bg-gray-50 dark:bg-gray-800/80">
            <button
              onClick={handleEditSave}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              Save Changes
            </button>
            <button
              onClick={closeEdit}
              className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
