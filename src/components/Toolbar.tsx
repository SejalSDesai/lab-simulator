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
  onToggleDark: () => void;
}

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
  onToggleDark,
}: ToolbarProps) {
  return (
    <header className="flex items-center gap-2 px-4 py-2 bg-indigo-700 text-white shrink-0 shadow-md">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-4">
        <span className="text-lg font-bold tracking-tight">LabSim</span>
        <span className="hidden sm:block text-indigo-300 text-xs">Liquid Handling Simulator</span>
      </div>

      {/* Protocol name */}
      <span className="text-indigo-200 text-sm truncate max-w-32">{protocol.name}</span>

      <div className="flex-1" />

      {/* Sim result badge */}
      {simResult && !simRunning && (
        <div
          className={`text-xs px-2 py-1 rounded font-medium ${
            simResult.success ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {simResult.success
            ? `✓ ${simResult.stats.totalVolumeTransferred} µL / ${simResult.stats.completedSteps} steps`
            : `✕ ${simResult.errors.length} error(s)`}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={onRun}
          disabled={simRunning}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
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
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          title="Reset well volumes to initial state"
        >
          Reset
        </button>

        <button
          onClick={onSave}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium transition-colors"
          title="Save protocol to localStorage"
        >
          Save
        </button>

        <button
          onClick={onLoad}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium transition-colors"
          title="Load protocol from localStorage"
        >
          Load
        </button>

        <button
          onClick={onClear}
          disabled={simRunning}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          title="Clear all plates from canvas"
        >
          Clear
        </button>

        <button
          onClick={onToggleDark}
          className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
          title="Toggle dark mode"
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  );
}
