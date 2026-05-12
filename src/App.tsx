import { useState, useEffect, useCallback, useRef } from 'react';
import Canvas, { type CanvasHandle } from './components/Canvas';
import Sidebar from './components/Sidebar';
import ProtocolBuilder from './components/ProtocolBuilder';
import Toolbar from './components/Toolbar';
import Toast from './components/Toast';
import type {
  Plate,
  Protocol,
  WellAddress,
  LiquidCategory,
  ToastMessage,
  SimulationResult,
} from './types';
import type { PlateType } from './types';
import { PLATE_CONFIGS, PIPETTE_PRESETS } from './types';
import { createPlate, generateId, getPlateSize } from './utils';
import { validateProtocol } from './simulator';

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
  const [selectedPipetteId, setSelectedPipetteId] = useState(PIPETTE_PRESETS[1].id);
  const [darkMode,          setDarkMode         ] = useState(false);
  const [toasts,            setToasts           ] = useState<ToastMessage[]>([]);
  const [simRunning,        setSimRunning        ] = useState(false);
  const [animatingStep,     setAnimatingStep     ] = useState(-1);
  const [simResult,         setSimResult         ] = useState<SimulationResult | null>(null);

  const canvasRef = useRef<CanvasHandle>(null);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    setToasts(prev => [...prev, { id: generateId(), message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Delete key removes selected plate; Escape clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlateId) {
        setPlates(prev => prev.filter(p => p.id !== selectedPlateId));
        setSelectedPlateId(null);
        setSelectedWell(null);
      }
      if (e.key === 'Escape') {
        setSelectedPlateId(null);
        setSelectedWell(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPlateId]);

  // Cancel any running animation when the component unmounts
  useEffect(() => () => { canvasRef.current?.cancelAnimation(); }, []);

  // ── Plate management ─────────────────────────────────────────────
  const handleAddPlate = (type: PlateType) => {
    const plate = createPlate(type, nextPlateName(plates, type), ...Object.values(findDropPosition(plates, type)) as [number, number]);
    setPlates(prev => [...prev, plate]);
  };

  const handlePlateDrop = (plateId: string, x: number, y: number) => {
    setPlates(prev => prev.map(p => p.id === plateId ? { ...p, x, y } : p));
  };

  // ── Well management ──────────────────────────────────────────────
  const handleWellClick = (plateId: string, wellId: string) => {
    setSelectedWell({ plateId, wellId });
    setSelectedPlateId(plateId);
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
            `Simulation complete — ${result.stats.totalVolumeTransferred} µL transferred in ${result.stats.completedSteps} step(s).`,
            'success',
          );
        }
      },
    );
  }, [plates, protocol.steps, addToast]);

  const handleReset = () => {
    canvasRef.current?.cancelAnimation();
    setSimRunning(false);
    setAnimatingStep(-1);
    setSimResult(null);
    // Clear all well volumes
    setPlates(prev => prev.map(p => ({
      ...p,
      wells: p.wells.map(r => r.map(w => ({ ...w, volume: 0, liquidType: 'empty' as LiquidCategory }))),
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
    setSimResult(null);
  };

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
        onToggleDark={() => setDarkMode(d => !d)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          plates={plates}
          selectedPipetteId={selectedPipetteId}
          selectedWell={selectedWell}
          darkMode={darkMode}
          onAddPlate={handleAddPlate}
          onSelectPipette={setSelectedPipetteId}
          onSetWellLiquid={handleSetWellLiquid}
        />

        <Canvas
          ref={canvasRef}
          plates={plates}
          selectedPlateId={selectedPlateId}
          animatingStepIndex={animatingStep}
          darkMode={darkMode}
          onPlateSelect={id => { setSelectedPlateId(id); if (id === null) setSelectedWell(null); }}
          onPlateDrop={handlePlateDrop}
          onWellClick={handleWellClick}
        />

        <ProtocolBuilder
          protocol={protocol}
          plates={plates}
          selectedPipetteId={selectedPipetteId}
          animatingStep={animatingStep}
          simResult={simResult}
          darkMode={darkMode}
          onProtocolChange={setProtocol}
        />
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
