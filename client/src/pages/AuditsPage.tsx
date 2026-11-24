import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, Lock } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPHP } from '../utils/format';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';

export function AuditsPage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const canAudit = hasRole('admin', 'auditor');

  const [audits, setAudits] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [auditRef, setAuditRef] = useState('');
  const [title, setTitle] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [includeAll, setIncludeAll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAudits = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/audits');
      setAudits(res.audits || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudits();
  }, []);

  const openCreateModal = async () => {
    setFormError('');
    setAuditRef('');
    setTitle('');
    setAuditDate(new Date().toISOString().slice(0, 10));
    setAuditorName(user?.full_name || '');
    setRemarks('');
    setIncludeAll(true);
    setSelectedIds([]);
    try {
      const inv = await apiRequest('/api/inventory');
      setInventoryItems(inv.items || []);
    } catch {
      setInventoryItems([]);
    }
    setCreateOpen(true);
  };

  const toggleItemSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await apiRequest('/api/audits', {
        method: 'POST',
        body: JSON.stringify({
          audit_ref: auditRef,
          title,
          audit_date: auditDate,
          auditor_name: auditorName,
          remarks,
          include_all_items: includeAll,
          item_ids: includeAll ? [] : selectedIds,
        }),
      });
      setCreateOpen(false);
      navigate(`/audits/${res.audit.id}`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create audit.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (audit: any) => {
    if (!window.confirm(`Delete audit "${audit.audit_ref}"? Only unfinalized audits can be deleted.`)) return;
    try {
      await apiRequest(`/api/audits/${audit.id}`, { method: 'DELETE' });
      await loadAudits();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory Auditing</h1>
          <p className="text-xs text-slate-500">
            Physical count verification, discrepancy calculation, financial variance, and audit finalization
          </p>
        </div>
        {canAudit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#253b80] hover:bg-[#1d2f66] text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create New Audit
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Audit Ref</th>
                <th className="px-3 py-2.5 text-left font-semibold">Title</th>
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold">Auditor</th>
                <th className="px-3 py-2.5 text-right font-semibold">Items</th>
                <th className="px-3 py-2.5 text-right font-semibold">Discrepancies</th>
                <th className="px-3 py-2.5 text-right font-semibold">Fin. Variance</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Loading audit records...
                  </td>
                </tr>
              ) : audits.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No inventory audits recorded yet.
                  </td>
                </tr>
              ) : (
                audits.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-mono font-semibold text-navy-800">{a.audit_ref}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{a.title}</td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums">{a.audit_date}</td>
                    <td className="px-3 py-2.5 text-slate-700">{a.auditor_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{a.total_items}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="text-red-600">{a.shortage_count} S</span> /{' '}
                      <span className="text-emerald-600">{a.excess_count} E</span>
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                        a.total_financial_difference < 0
                          ? 'text-red-600'
                          : a.total_financial_difference > 0
                          ? 'text-emerald-600'
                          : 'text-slate-700'
                      }`}
                    >
                      {formatPHP(a.total_financial_difference)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center gap-1">
                        <StatusBadge status={a.status} />
                        {a.status === 'Completed' && <Lock className="w-3 h-3 text-slate-400" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to={`/audits/${a.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy-700 bg-navy-50 hover:bg-navy-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Open
                        </Link>
                        {canAudit && a.status !== 'Completed' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(a)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                            title="Delete Draft Audit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create New Inventory Audit" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Audit Reference Number *</label>
              <input
                type="text"
                required
                value={auditRef}
                onChange={(e) => setAuditRef(e.target.value)}
                placeholder="e.g. AUD-2026-Q4-01"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Audit Date *</label>
              <input
                type="date"
                required
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Audit Title / Period *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 Physical Inventory Verification"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lead Auditor Name *</label>
              <input
                type="text"
                required
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-3 bg-slate-50 space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-800">
              <input
                type="checkbox"
                checked={includeAll}
                onChange={(e) => setIncludeAll(e.target.checked)}
              />
              Include all registered inventory items ({inventoryItems.length} item{inventoryItems.length !== 1 ? 's' : ''})
            </label>

            {!includeAll && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 bg-white rounded p-2 space-y-1">
                {inventoryItems.length === 0 ? (
                  <p className="text-xs text-slate-500 p-2">No inventory items available.</p>
                ) : (
                  inventoryItems.map((it) => (
                    <label key={it.id} className="flex items-center justify-between text-xs py-1 px-2 hover:bg-slate-50 rounded">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(it.id)}
                          onChange={() => toggleItemSelect(it.id)}
                        />
                        <span className="font-medium">{it.item_name}</span>
                        <span className="text-slate-400">({formatPHP(it.unit_price)})</span>
                      </span>
                      <span className="tabular-nums text-slate-600">{it.quantity} {it.unit}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs bg-slate-100 text-slate-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || inventoryItems.length === 0}
              className="px-4 py-2 text-xs bg-navy-700 text-white rounded-md font-medium disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Audit'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
