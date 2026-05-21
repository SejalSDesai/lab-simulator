import { useState } from 'react';

const STORAGE_KEY = 'labsim-visitor-email';
const FORMSPREE_URL = 'https://formspree.io/f/xbdbgwlo';

interface EmailGateProps {
  onUnlock: () => void;
}

export default function EmailGate({ onUnlock }: EmailGateProps) {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error('Submission failed');

      localStorage.setItem(STORAGE_KEY, email);
      onUnlock();
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-indigo-800">
      <div className="w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 px-8 py-6 text-center">
          <p className="text-xl font-bold text-white tracking-tight">LabSim</p>
          <p className="text-indigo-300 text-xs mt-1">Liquid Handling Simulator</p>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-gray-800 font-semibold text-sm">Enter your email to continue</p>
            <p className="text-gray-400 text-xs">No password needed. One-time only.</p>
          </div>

          <input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-shadow"
          />

          {error && (
            <p className="text-red-500 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Submitting…' : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Returns the stored email if the visitor has already submitted, else null. */
export function getStoredEmail(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}
