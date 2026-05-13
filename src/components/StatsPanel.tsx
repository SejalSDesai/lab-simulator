import type { Protocol, SimulationResult, LiquidCategory } from '../types';
import { PIPETTE_PRESETS, LIQUID_COLORS } from '../types';

interface StatsPanelProps {
  protocol: Protocol;
  simResult: SimulationResult;
  darkMode: boolean;
  onClose: () => void;
}

interface ComputedStats {
  liquidVolumes: Partial<Record<LiquidCategory, number>>;
  pipetteSteps: Record<string, number>;
  uniqueDestWells: number;
}

function computeStats(protocol: Protocol): ComputedStats {
  const liquidVolumes: Partial<Record<LiquidCategory, number>> = {};
  const pipetteSteps: Record<string, number> = {};
  const destWellKeys = new Set<string>();

  for (const step of protocol.steps) {
    const dests    = step.destAddresses?.length ? step.destAddresses : [step.destAddress];
    const perDest  = step.volumeMode === 'distribute' ? step.volume / dests.length : step.volume;
    const total    = perDest * dests.length;

    liquidVolumes[step.liquidType]  = (liquidVolumes[step.liquidType] ?? 0) + total;
    pipetteSteps[step.pipetteId]    = (pipetteSteps[step.pipetteId] ?? 0) + 1;
    for (const d of dests) destWellKeys.add(`${d.plateId}:${d.wellId}`);
  }

  return { liquidVolumes, pipetteSteps, uniqueDestWells: destWellKeys.size };
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

export default function StatsPanel({ protocol, simResult, darkMode: _dark, onClose }: StatsPanelProps) {
  const { stats } = simResult;
  const { liquidVolumes, pipetteSteps, uniqueDestWells } = computeStats(protocol);

  const liquidEntries = Object.entries(liquidVolumes) as [LiquidCategory, number][];
  liquidEntries.sort((a, b) => b[1] - a[1]);

  const pipetteEntries = Object.entries(pipetteSteps);
  const pipetteNames   = pipetteEntries.map(([id, count]) => {
    const pip = PIPETTE_PRESETS.find(p => p.id === id);
    return { name: pip?.name ?? id, count };
  });

  const successRate = stats.totalSteps > 0
    ? Math.round((stats.completedSteps / stats.totalSteps) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Simulation Results</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{protocol.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded font-semibold ${
                simResult.success
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {simResult.success ? '✓ Success' : '✕ Failed'}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Overview */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Overview</h3>
            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg px-4 py-1 divide-y divide-gray-100 dark:divide-gray-700">
              <StatRow label="Steps completed"     value={`${stats.completedSteps} / ${stats.totalSteps}`} />
              <StatRow label="Success rate"         value={`${successRate}%`} />
              <StatRow label="Total volume"         value={`${stats.totalVolumeTransferred.toLocaleString()} µL`} />
              <StatRow label="Unique wells filled"  value={uniqueDestWells} />
              <StatRow label="Tip changes"          value={stats.tipChanges} />
              <StatRow label="Estimated time"       value={`~${stats.estimatedDurationSeconds}s`} />
            </div>
          </section>

          {/* Liquid breakdown */}
          {liquidEntries.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Volume by Liquid Type
              </h3>
              <div className="space-y-2">
                {liquidEntries.map(([type, vol]) => {
                  const maxVol = liquidEntries[0][1];
                  const pct    = maxVol > 0 ? (vol / maxVol) * 100 : 0;
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ background: LIQUID_COLORS[type] }}
                          />
                          <span className="text-gray-700 dark:text-gray-300 capitalize">{type}</span>
                        </div>
                        <span className="text-gray-500 dark:text-gray-400">{vol.toLocaleString()} µL</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: LIQUID_COLORS[type] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pipette usage */}
          {pipetteNames.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Pipette Usage
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg px-4 py-1 divide-y divide-gray-100 dark:divide-gray-700">
                {pipetteNames.map(({ name, count }) => (
                  <StatRow key={name} label={name} value={`${count} step${count !== 1 ? 's' : ''}`} />
                ))}
              </div>
            </section>
          )}

          {/* Errors / warnings */}
          {(simResult.errors.length > 0 || simResult.warnings.length > 0) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                Issues
              </h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {simResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">{e.message}</p>
                ))}
                {simResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{w.message}</p>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
