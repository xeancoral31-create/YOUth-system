'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Upload, ShieldCheck } from 'lucide-react';
import { apiRequest, downloadFile } from '@/api/client';
import { formatBytes, formatDateTime } from '@/lib/format';

export function BackupPage() {
  const [integrity, setIntegrity] = useState('');
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/system/backups');
      setIntegrity(res.integrity);
      setBackups(res.backups || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async () => {
    setMsg(null);
    try {
      await apiRequest('/api/system/backups', { method: 'POST' });
      setMsg({ type: 'ok', text: 'Database backup created successfully.' });
      await loadBackups();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('Restore database from this backup file? A pre-restore safety backup will be created automatically.')) {
      return;
    }
    const fd = new FormData();
    fd.append('backup', file);
    setMsg(null);
    try {
      const res = await apiRequest('/api/system/restore', { method: 'POST', body: fd });
      setMsg({ type: 'ok', text: res.message });
      await loadBackups();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Database Backup & Recovery</h1>
          <p className="text-xs text-slate-500">Integrity verification, live SQLite snapshots, and safe recovery</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-medium cursor-pointer hover:bg-slate-50">
            <Upload className="w-3.5 h-3.5" />
            Restore (.db)
            <input type="file" accept=".db" onChange={handleRestore} className="hidden" />
          </label>
          <button
            type="button"
            onClick={handleCreateBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#253b80] hover:bg-[#1d2f66] text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
          >
            <DatabaseBackup className="w-4 h-4" />
            Create Backup Now
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded text-xs border ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-emerald-600" />
        <div>
          <span className="font-semibold text-slate-800">SQLite Database Integrity Check: </span>
          <span className="font-mono uppercase text-emerald-700 font-bold">{integrity || 'Checking...'}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Backup Filename</th>
              <th className="px-3 py-2.5 text-right font-semibold">Size</th>
              <th className="px-3 py-2.5 text-left font-semibold">Created At</th>
              <th className="px-3 py-2.5 text-right font-semibold">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Loading backups...
                </td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No backups created yet. Click <strong>Create Backup Now</strong> to generate a snapshot.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.file_name}>
                  <td className="px-3 py-2.5 font-mono text-slate-800">{b.file_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatBytes(b.size)}</td>
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums">{formatDateTime(b.created_at)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => downloadFile(`/api/system/backups/${b.file_name}/download`, b.file_name)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
