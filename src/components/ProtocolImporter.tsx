import { useState, useRef } from 'react';
import type { Plate } from '../types';
import {
  detectFormat,
  parseCSV, parseJSON, parsePlainText, parseExcel,
} from '../utils/protocolParser';
import type { FileFormat } from '../utils/protocolParser';
import { analyzeProtocol } from '../utils/protocolAnalyzer';
import type { SetupPlan } from '../utils/protocolAnalyzer';

interface ProtocolImporterProps {
  plates: Plate[];
  darkMode: boolean;
  onPlanReady: (plan: SetupPlan, filename: string) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'parsing' | 'error';

const FORMAT_LABELS: Record<FileFormat, string> = {
  csv:   'CSV',
  json:  'JSON',
  excel: 'Excel (.xlsx / .xls)',
  text:  'Plain text',
};

const EXAMPLE_CSV = `# Example protocol CSV
Step,Source Plate,Source Well,Dest Plate,Dest Well,Volume (µL),Liquid Type,Pipette
1,Reagent Reservoir 1,A1,96-Well Plate 1,A1,50,reagent,p200
2,Reagent Reservoir 1,A1,96-Well Plate 1,A2,50,reagent,p200
3,96-Well Plate 1,A1,96-Well Plate 2,B1,25,reagent,p200`;

export default function ProtocolImporter({
  plates,
  darkMode: _dark,
  onPlanReady,
  onClose,
}: ProtocolImporterProps) {
  const [phase,      setPhase     ] = useState<Phase>('idle');
  const [isDragging, setIsDragging] = useState(false);
  const [errors,     setErrors    ] = useState<string[]>([]);
  const [lastFormat, setLastFormat] = useState<FileFormat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function processFile(file: File) {
    setPhase('parsing');
    setErrors([]);
    const fmt = detectFormat(file.name);
    setLastFormat(fmt);

    let result: { steps: ReturnType<typeof parseCSV>['steps']; errors: string[] };

    try {
      if (fmt === 'excel') {
        result = await parseExcel(await file.arrayBuffer());
      } else {
        const text = await file.text();
        if (fmt === 'csv')       result = parseCSV(text);
        else if (fmt === 'json') result = parseJSON(text);
        else                     result = parsePlainText(text);
      }
    } catch (err) {
      setErrors([`Unexpected error reading file: ${err instanceof Error ? err.message : String(err)}`]);
      setPhase('error');
      return;
    }

    if (result.steps.length === 0) {
      setErrors(result.errors.length > 0 ? result.errors : ['No transfer steps were found in the file.']);
      setPhase('error');
      return;
    }

    const plan = analyzeProtocol(result.steps, plates);
    onPlanReady(plan, file.name);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file).catch(console.error);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file).catch(console.error);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-sm text-gray-700 dark:text-gray-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">Import Protocol</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Plates and wells are created automatically
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Parsing spinner */}
          {phase === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Parsing {lastFormat ? FORMAT_LABELS[lastFormat] : 'file'}…
              </p>
            </div>
          )}

          {/* Idle — drop zone */}
          {(phase === 'idle' || phase === 'error') && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl py-10 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <div className="text-3xl mb-2 select-none">📂</div>
                <p className="font-medium text-gray-600 dark:text-gray-300">Drop a file or click to browse</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  CSV · JSON · Excel (.xlsx) · Plain text
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,.xlsx,.xls,.txt,.tsv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Error list */}
              {errors.length > 0 && (
                <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700 space-y-0.5">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                    Could not parse file
                  </p>
                  {errors.slice(0, 6).map((e, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">• {e}</p>
                  ))}
                  {errors.length > 6 && (
                    <p className="text-xs text-red-400 italic">…and {errors.length - 6} more</p>
                  )}
                </div>
              )}

              {/* Supported formats */}
              <details className="text-xs text-gray-400 dark:text-gray-500">
                <summary className="cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 select-none">
                  Supported formats &amp; example
                </summary>
                <div className="mt-2 space-y-2 text-gray-500 dark:text-gray-400">
                  <p><strong>CSV</strong> — header row with: Source Plate, Source Well, Dest Plate, Dest Well, Volume, Liquid Type, Pipette</p>
                  <p><strong>JSON</strong> — <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{ "steps": [...] }'}</code></p>
                  <p><strong>Plain text</strong> — <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Transfer 50µL from Plate1 A1 to Plate2 B1 (Buffer, P200)</code></p>
                  <pre className="bg-gray-50 dark:bg-gray-700/60 rounded p-2 overflow-x-auto whitespace-pre text-xs leading-relaxed">
                    {EXAMPLE_CSV}
                  </pre>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
