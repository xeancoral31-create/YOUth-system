import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Server, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getApiBase, setApiBase } from '../api/client';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { InstallAppButton } from '../components/InstallAppButton';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBase());
  const [showServerConfig, setShowServerConfig] = useState(Boolean(getApiBase()));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { canInstall, promptInstall } = usePwaInstall();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      setApiBase(serverUrl);
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200/80 overflow-hidden">
        <div className="bg-[#0d152c] px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <img
              src="/bgcyouth-logo.jpg"
              alt="BGCyouth Logo"
              className="w-11 h-11 rounded-full object-cover ring-2 ring-white/25 shrink-0"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">BGCyouth</h1>
              <p className="text-xs text-slate-300">Inventory & Auditing Management System</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Authorized Personnel Sign In</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your assigned BGC Youth organization credentials.
            </p>
          </div>

          {error && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Username or Email</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#253b80] hover:bg-[#1d2f66] disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>

          <div className="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowServerConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700"
            >
              <Server className="w-3 h-3" />
              {showServerConfig ? 'Hide Mobile / Server URL' : 'Mobile App / Custom Server URL'}
            </button>
            {canInstall && (
              <button
                type="button"
                onClick={promptInstall}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#253b80] hover:underline"
              >
                <Download className="w-3 h-3" />
                Install App
              </button>
            )}
          </div>
          {showServerConfig && (
            <div className="mt-2">
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.x.x:4000 (leave blank for web)"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            All sessions and actions are logged for official accountability.
          </div>
        </form>
      </div>
    </div>
  );
}
