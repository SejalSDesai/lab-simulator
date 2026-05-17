import { useState, useEffect, useCallback, useRef } from 'react';
import Canvas, { type CanvasHandle } from './components/Canvas';
import Sidebar from './components/Sidebar';
import ProtocolBuilder from './components/ProtocolBuilder';
import Toolbar from './components/Toolbar';
import Toast from './components/Toast';
import ProtocolImporter from './components/ProtocolImporter';
import ImportReviewScreen from './components/ImportReviewScreen';
import StatsPanel from './components/StatsPanel';
import type {
  Plate,
  Protocol,
  ProtocolStep,
  WellAddress,
  LiquidCategory,
  ToastMessage,
  SimulationResult,
} from './types';
import type { PlateType } from './types';
import { PLATE_CONFIGS, PIPETTE_PRESETS, RESERVOIR_MAX_VOLUME } from './types';
import { createPlate, generateId, getPlateSize } from './utils';
import { validateProtocol } from './simulator';
import { generateCSV, downloadCSV } from './utils/csvExport';
import type { SetupPlan } from './utils/protocolAnalyzer';

const STORAGE_KEY = 'lab-simulator-protocol';

function defaultProtocol(): Protocol {
  return {
    id: generateId(),
    name: 'Untitled Protocol',
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function nextPlateName(plates: Plate[], type: PlateType): string {
  const count = plates.filter(p => p.type === type).length + 1;
  return `${PLATE_CONFIGS[type].label} ${count}`;
}

function findDropPosition(plates: Plate[], type: PlateType): { x: number; y: number } {
  const size   = getPlateSize(type);
  const offset = plates.length * 40;
  return { x: 40 + (offset % 480), y: 40 + Math.floor(offset / 480) * (size.height + 20) };
}

export default function App() {
  const [plates,            setPlates           ] = useState<Plate[]>([]);
  const [protocol,          setProtocol         ] = useState<Protocol>(defaultProtocol);
  const [selectedPlateId,   setSelectedPlateId  ] = useState<string | null>(null);
  const [selectedWell,      setSelectedWell     ] = useState<WellAddress | null>(null);
  const [selectedWells,     setSelectedWells    ] = useState<WellAddress[]>([]);
  const [selectedPipetteId, setSelectedPipetteId] = useState(PIPETTE_PRESETS[1].id);
  const [darkMode,          setDarkMode         ] = useState(false);
  const [toasts,            setToasts           ] = useState<ToastMessage[]>([]);
  const [simRunning,        setSimRunning        ] = useState(false);
  const [animatingStep,     setAnimatingStep     ] = useState(-1);
  const [simResult,         setSimResult         ] = useState<SimulationResult | null>(null);

  // ── Import / Review / Stats overlay state ─────────────────────────────────
  const [showImporter,   setShowImporter  ] = useState(false);
  const [showReview,     setShowReview    ] = useState(false);
  const [importPlan,     setImportPlan    ] = useState<SetupPlan | null>(null);
  const [importFilename, setImportFilename] = useState('');
  const [showStats,      setShowStats     ] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    setToasts(prev => [...prev, { id: generateId(), message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlateId) {
        setPlates(prev => prev.filter(p => p.id !== selectedPlateId));
        setSelectedPlateId(null);
        setSelectedWell(null);
        setSelectedWells([]);
      }
      if (e.key === 'Escape') {
        setSelectedPlateId(null);
        setSelectedWell(null);
        setSelectedWells([]);
        setShowImporter(false);
        setShowReview(false);
        setShowStats(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPlateId]);

  useEffect(() => () => { canvasRef.current?.cancelAnimation(); }, []);

  // ── Plate management ─────────────────────────────────────────────
  const handleAddPlate = (type: PlateType) => {
    const pos   = findDropPosition(plates, type);
    const plate = createPlate(type, nextPlateName(plates, type), pos.x, pos.y);
    setPlates(prev => [...prev, plate]);
  };

  const handlePlateDrop = (plateId: string, x: number, y: number) => {
    setPlates(prev => prev.map(p => p.id === plateId ? { ...p, x, y } : p));
  };

  // ── Well management ──────────────────────────────────────────────
  const handleWellClick = (
    plateId: string,
    wellId: string,
    modifiers: { shift: boolean; ctrl: boolean },
  ) => {
    const address = { plateId, wellId };
    if (modifiers.shift || modifiers.ctrl) {
      setSelectedWells(prev => {
        const exists = prev.some(w => w.plateId === plateId && w.wellId === wellId);
        return exists
          ? prev.filter(w => !(w.plateId === plateId && w.wellId === wellId))
          : [...prev, address];
      });
    } else {
      setSelectedWell(address);
      setSelectedWells([address]);
      setSelectedPlateId(plateId);
    }
  };

  const handleWellsSelect = (wells: WellAddress[]) => {
    setSelectedWells(wells);
    if (wells.length === 1) setSelectedWell(wells[0]);
  };

  const handleSetWellLiquid = (address: WellAddress, volume: number, liquid: LiquidCategory) => {
    setPlates(prev => prev.map(plate => {
      if (plate.id !== address.plateId) return plate;
      return {
        ...plate,
        wells: plate.wells.map(row => row.map(well =>
          well.id === address.wellId
            ? { ...well, volume: Math.min(Math.max(0, volume), well.maxVolume), liquidType: liquid }
            : well
        )),
      };
    }));
  };

  // ── Simulation ────────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    if (plates.length === 0)         { addToast('Add plates to the canvas first.', 'warning'); return; }
    if (protocol.steps.length === 0) { addToast('Add protocol steps first.',        'warning'); return; }

    const errors   = validateProtocol(protocol.steps, plates, PIPETTE_PRESETS);
    const blocking = errors.filter(e => e.severity === 'error');

    if (blocking.length > 0) {
      addToast(`${blocking.length} validation error(s) — fix them before running.`, 'error');
      setSimResult({
        success: false,
        errors: blocking,
        warnings: errors.filter(e => e.severity === 'warning'),
        stats: { totalVolumeTransferred: 0, totalSteps: protocol.steps.length, completedSteps: 0, estimatedDurationSeconds: 0, tipChanges: 0 },
      });
      return;
    }

    setSimRunning(true);
    setSimResult(null);
    setAnimatingStep(0);

    canvasRef.current?.runAnimation(
      protocol.steps,
      plates,
      (idx) => setAnimatingStep(idx),
      (updatedPlates) => setPlates(updatedPlates),
      (result) => {
        setSimRunning(false);
        setAnimatingStep(-1);
        setSimResult(result);
        if (result.success) {
          addToast(
            `Simulation complete — ${result.stats.totalVolumeTransferred} µL in ${result.stats.completedSteps} step(s). Click Stats to review.`,
            'success',
          );
          setShowStats(true);
        }
      },
    );
  }, [plates, protocol.steps, addToast]);

  const handleReset = () => {
    canvasRef.current?.cancelAnimation();
    setSimRunning(false);
    setAnimatingStep(-1);
    setSimResult(null);
    setPlates(prev => prev.map(p => ({
      ...p,
      wells: p.wells.map(r => r.map(w =>
        w.maxVolume >= RESERVOIR_MAX_VOLUME
          ? w
          : { ...w, volume: 0, liquidType: 'empty' as LiquidCategory }
      )),
    })));
    addToast('Well volumes reset.', 'info');
  };

  // ── Persistence ───────────────────────────────────────────────────
  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ protocol, plates }));
      addToast('Protocol saved to browser storage.', 'success');
    } catch {
      addToast('Failed to save.', 'error');
    }
  };

  const handleLoad = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { addToast('No saved protocol found.', 'warning'); return; }
      const parsed = JSON.parse(raw) as { protocol: Protocol; plates: Plate[] };
      setProtocol(parsed.protocol);
      setPlates(parsed.plates);
      setSimResult(null);
      addToast('Protocol loaded.', 'success');
    } catch {
      addToast('Failed to load — data may be corrupt.', 'error');
    }
  };

  const handleClear = () => {
    setPlates([]);
    setSelectedPlateId(null);
    setSelectedWell(null);
    setSelectedWells([]);
    setSimResult(null);
  };

  const handleExportCSV = () => {
    if (protocol.steps.length === 0) { addToast('No steps to export.', 'warning'); return; }
    const date    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const content = generateCSV(protocol, plates, PIPETTE_PRESETS, simResult);
    downloadCSV(content, `protocol-${date}.csv`);
    addToast('Protocol exported as CSV.', 'success');
  };

  // ── Smart Import ──────────────────────────────────────────────────

  /** Called by ProtocolImporter once the file is parsed and the plan is built. */
  const handlePlanReady = (plan: SetupPlan, filename: string) => {
    setImportPlan(plan);
    setImportFilename(filename);
    setShowImporter(false);
    setShowReview(true);
  };

  /**
   * Called by ImportReviewScreen when user clicks "Approve & Load".
   * Creates plates, fills wells, and adds protocol steps — all at once.
   */
  const handleApproveImport = useCallback((plan: SetupPlan, replace: boolean) => {
    // ── 1. Build tempId → plate ID mapping ──────────────────────────────────
    const tempIdToPlateId = new Map<string, string>();
    const newPlatesArr: Plate[] = [];

    // Use a running list so findDropPosition offsets correctly for each new plate
    let runningPlates = [...plates];

    for (const spec of plan.plates) {
      if (spec.matchedPlateId) {
        tempIdToPlateId.set(spec.tempId, spec.matchedPlateId);
      } else {
        const pos      = findDropPosition(runningPlates, spec.plateType);
        const newPlate = createPlate(spec.plateType, spec.name, pos.x, pos.y);
        tempIdToPlateId.set(spec.tempId, newPlate.id);
        newPlatesArr.push(newPlate);
        runningPlates = [...runningPlates, newPlate];
      }
    }

    // ── 2. Apply plates and fills atomically ─────────────────────────────────
    setPlates(prev => {
      const combined = [...prev, ...newPlatesArr];

      return combined.map(plate => {
        const fillsForPlate = plan.fills.filter(
          f => tempIdToPlateId.get(f.plateTempId) === plate.id,
        );
        if (fillsForPlate.length === 0) return plate;

        return {
          ...plate,
          wells: plate.wells.map(row =>
            row.map(well => {
              const fill = fillsForPlate.find(f => f.wellId === well.id);
              if (!fill) return well;
              return {
                ...well,
                volume:    Math.min(fill.volume, well.maxVolume),
                liquidType: fill.liquidType,
              };
            }),
          ),
        };
      });
    });

    // ── 3. Convert raw steps → ProtocolStep using resolved plate IDs ─────────
    const nameLowerToTempId = new Map(plan.plates.map(p => [p.name.toLowerCase(), p.tempId]));

    const newSteps: ProtocolStep[] = plan.steps
      .map((raw): ProtocolStep | null => {
        const srcTempId  = nameLowerToTempId.get(raw.sourcePlateName.toLowerCase());
        const dstTempId  = nameLowerToTempId.get(raw.destPlateName.toLowerCase());
        const srcPlateId = srcTempId ? tempIdToPlateId.get(srcTempId) : undefined;
        const dstPlateId = dstTempId ? tempIdToPlateId.get(dstTempId) : undefined;
        if (!srcPlateId || !dstPlateId) return null;

        // Reservoir wells always resolve to "A1" (the single well)
        const srcSpec  = plan.plates.find(p => p.tempId === srcTempId);
        const srcWellId = srcSpec?.plateType === 'reservoir' ? 'A1' : raw.sourceWell;

        return {
          id:            generateId(),
          sourceAddress: { plateId: srcPlateId, wellId: srcWellId },
          destAddress:   { plateId: dstPlateId, wellId: raw.destWell },
          volume:        raw.volume,
          pipetteId:     raw.pipetteId,
          liquidType:    raw.liquidType,
        };
      })
      .filter((s): s is ProtocolStep => s !== null);

    setProtocol(prev => ({
      ...prev,
      steps:     replace ? newSteps : [...prev.steps, ...newSteps],
      updatedAt: new Date().toISOString(),
    }));

    setShowReview(false);
    setImportPlan(null);

    addToast(
      `Import complete: ${newPlatesArr.length} plate(s) created, ${plan.fills.length} well(s) filled, ${newSteps.length} step(s) added. Click ▶ Run to simulate.`,
      'success',
    );
  }, [plates, addToast]);

  return (
    <div className={`flex flex-col h-screen ${darkMode ? 'dark' : ''}`}>
      <Toolbar
        protocol={protocol}
        simRunning={simRunning}
        simResult={simResult}
        darkMode={darkMode}
        onRun={handleRun}
        onReset={handleReset}
        onSave={handleSave}
        onLoad={handleLoad}
        onClear={handleClear}
        onExportCSV={handleExportCSV}
        onImport={() => setShowImporter(true)}
        onShowStats={() => setShowStats(true)}
        onToggleDark={() => setDarkMode(d => !d)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          plates={plates}
          selectedPipetteId={selectedPipetteId}
          selectedWell={selectedWell}
          selectedWells={selectedWells}
          darkMode={darkMode}
          onAddPlate={handleAddPlate}
          onSelectPipette={setSelectedPipetteId}
          onSetWellLiquid={handleSetWellLiquid}
        />

        <Canvas
          ref={canvasRef}
          plates={plates}
          selectedPlateId={selectedPlateId}
          selectedWells={selectedWells}
          animatingStepIndex={animatingStep}
          darkMode={darkMode}
          onPlateSelect={id => { setSelectedPlateId(id); if (id === null) setSelectedWell(null); }}
          onPlateDrop={handlePlateDrop}
          onWellClick={handleWellClick}
          onWellsSelect={handleWellsSelect}
        />

        <ProtocolBuilder
          protocol={protocol}
          plates={plates}
          selectedPipetteId={selectedPipetteId}
          selectedWells={selectedWells}
          animatingStep={animatingStep}
          simResult={simResult}
          darkMode={darkMode}
          onProtocolChange={setProtocol}
          onClearSimResult={() => setSimResult(null)}
        />
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* ── Overlays ──────────────────────────────────────────────── */}
      {showImporter && (
        <ProtocolImporter
          plates={plates}
          darkMode={darkMode}
          onPlanReady={handlePlanReady}
          onClose={() => setShowImporter(false)}
        />
      )}

      {showReview && importPlan && (
        <ImportReviewScreen
          plan={importPlan}
          filename={importFilename}
          existingPlates={plates}
          darkMode={darkMode}
          onApprove={handleApproveImport}
          onClose={() => { setShowReview(false); setImportPlan(null); }}
        />
      )}

      {showStats && simResult && (
        <StatsPanel
          protocol={protocol}
          simResult={simResult}
          darkMode={darkMode}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  );
}
