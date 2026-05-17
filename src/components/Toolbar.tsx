import type { Protocol, SimulationResult } from '../types';

interface ToolbarProps {
  protocol: Protocol;
  simRunning: boolean;
  simResult: SimulationResult | null;
  darkMode: boolean;
  onRun: () => void;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onExportCSV: () => void;
  onImport: () => void;
  onShowStats: () => void;
  onToggleDark: () => void;
}

const ghostBtn = 'px-3 py-1.5 rounded text-sm font-medium transition-colors bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed';
const divider  = 'w-px h-5 bg-white/20 mx-1 shrink-0';

export default function Toolbar({
  protocol,
  simRunning,
  simResult,
  darkMode,
  onRun,
  onReset,
  onSave,
  onLoad,
  onClear,
  onExportCSV,
  onImport,
  onShowStats,
  onToggleDark,
}: ToolbarProps) {
  return (
    <header className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-900 to-indigo-700 text-white shrink-0 shadow-lg">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-3">
        <span className="text-base font-bold tracking-tight">LabSim</span>
        <span className="hidden md:block text-indigo-300 text-xs">Liquid Handling Simulator</span>
      </div>

      {/* Protocol name */}
      <span className="text-indigo-200 text-xs truncate max-w-28 hidden sm:block">{protocol.name}</span>

      <div className="flex-1" />

      {/* Sim result badge */}
      {simResult && !simRunning && (
        <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
          simResult.success
            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
            : 'bg-red-500/20 text-red-200 border border-red-500/30'
        }`}>
          {simResult.success
            ? `✓ ${simResult.stats.totalVolumeTransferred} µL · ${simResult.stats.completedSteps} steps`
            : `✕ ${simResult.errors.length} error(s)`}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {/* Run / Reset */}
        <button
          onClick={onRun}
          disabled={simRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors shadow-sm shadow-emerald-900/30"
        >
          {simRunning ? (
            <>
              <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
              Running…
            </>
          ) : '▶ Run'}
        </button>

        <button
          onClick={onReset}
          disabled={simRunning}
          className={ghostBtn}
          title="Reset well volumes"
        >
          Reset
        </button>

        <span className={divider} />

        {/* Persistence */}
        <button onClick={onSave} className={ghostBtn} title="Save to browser storage">Save</button>
        <button onClick={onLoad} className={ghostBtn} title="Load from browser storage">Load</button>
        <button onClick={onImport} disabled={simRunning} className={ghostBtn} title="Import from CSV / JSON / Excel">Import</button>

        <span className={divider} />

        {/* Export / Stats */}
        <button onClick={onExportCSV} disabled={simRunning} className={ghostBtn} title="Export as CSV">CSV</button>
        <button
          onClick={onShowStats}
          disabled={!simResult}
          className={ghostBtn}
          title="View simulation statistics"
        >
          Stats
        </button>

        <span className={divider} />

        {/* Danger + theme */}
        <button
          onClick={onClear}
          disabled={simRunning}
          className="px-3 py-1.5 rounded text-sm font-medium transition-colors bg-red-500/70 hover:bg-red-500 active:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Clear all plates"
        >
          Clear
        </button>

        <button
          onClick={onToggleDark}
          className="px-2 py-1.5 rounded text-sm transition-colors bg-white/10 hover:bg-white/20"
          title="Toggle dark mode"
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  );
}
