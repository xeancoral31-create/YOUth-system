'use client';

import { useEffect, useState } from 'react';
import {
  Archive,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Trash2,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, formatPHP } from '@/lib/format';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const TRIGGER_BADGE: Record<string, string> = {
  'Print Report': 'bg-blue-50 text-blue-700 border-blue-200',
  'Audit Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Weekly Sunday Reset': 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export function HistoryPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [archives, setArchives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [triggerType, setTriggerType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeHidden, setIncludeHidden] = useState(false);

  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [detailsCache, setDetailsCache] = useState<Record<number, { archive: any; items: any[] }>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);

  const [modalDetail, setModalDetail] = useState<{ archive: any; items: any[] } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search,
        trigger_type: triggerType,
        date_from: dateFrom,
        date_to: dateTo,
        include_hidden: includeHidden ? 'true' : 'false',
      });
      const res = await apiRequest(`/api/history?${qs.toString()}`);
      setArchives(res.archives || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load history archives.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [search, triggerType, dateFrom, dateTo, includeHidden]);

  const fetchDetail = async (id: number) => {
    if (detailsCache[id]) return detailsCache[id];
    setLoadingDetailId(id);
    try {
      const res = await apiRequest(`/api/history/${id}`);
      setDetailsCache((prev) => ({ ...prev, [id]: res }));
      return res;
    } finally {
      setLoadingDetailId(null);
    }
  };

  const toggleExpand = async (id: number) => {
    const next = !expandedIds[id];
    setExpandedIds((prev) => ({ ...prev, [id]: next }));
    if (next) {
      await fetchDetail(id);
    }
  };

  const openModalDetail = async (id: number) => {
    try {
      const res = await fetchDetail(id);
      setModalDetail(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load archive details.');
    }
  };

  const handleToggleVisibility = async (archive: any) => {
    try {
      const nextHidden = !archive.is_hidden;
      await apiRequest(`/api/history/${archive.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ is_hidden: nextHidden }),
      });
      toast.success(nextHidden ? 'Record hidden from default view.' : 'Record restored to default view.');
      await loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visibility.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/history/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(`Permanently deleted archive "${deleteTarget.archive_ref}".`);
      setDeleteTarget(null);
      await loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete historical record.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory Reset & History Archives</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable historical snapshots automatically saved before inventory resets (Print, Audit Completion, or Weekly Sunday Reset)
          </p>
        </div>
        {isAdmin && (
          <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer shadow-sm">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
            />
            Show Hidden Records
          </label>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name, archive ref, period, or user..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
          />
        </div>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
        >
          <option value="">All Activity Types</option>
          <option value="Print Report">Print Report</option>
          <option value="Audit Completed">Audit Completed</option>
          <option value="Weekly Sunday Reset">Weekly Sunday Reset</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 shrink-0">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="From Date"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 shrink-0">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="To Date"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
      </div>

      {/* History Entries */}
      {loading ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200/80 text-center text-xs text-slate-500">
          Loading archived inventory history...
        </div>
      ) : archives.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/80 text-center text-xs text-slate-500">
          <Archive className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          No archived inventory records match your filters yet.
        </div>
      ) : (
        <div className="space-y-3">
          {archives.map((arch) => {
            const isExpanded = Boolean(expandedIds[arch.id]);
            const detail = detailsCache[arch.id];
            const badgeCls = TRIGGER_BADGE[arch.trigger_type] || 'bg-slate-100 text-slate-700 border-slate-200';

            return (
              <div
                key={arch.id}
                className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${
                  arch.is_hidden ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'
                }`}
              >
                <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-navy-900">{arch.archive_ref}</span>
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded border ${badgeCls}`}>
                        {arch.trigger_type}
                      </span>
                      {arch.audit_ref && (
                        <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-200">
                          Audit: {arch.audit_ref}
                        </span>
                      )}
                      {Boolean(arch.is_hidden) && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 rounded">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">Period:</span> {arch.period_label} •{' '}
                      <span className="font-medium text-slate-800">Archived:</span> {formatDateTime(arch.archived_at)} •{' '}
                      <span className="font-medium text-slate-800">By:</span> {arch.performed_by_name}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <div className="text-[10px] uppercase text-slate-400 font-semibold">Items</div>
                        <div className="font-bold text-slate-900 tabular-nums">{arch.registered_item_count}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-slate-400 font-semibold">Total Value</div>
                        <div className="font-bold text-navy-900 tabular-nums">
                          {formatPHP(arch.total_inventory_value)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(arch.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openModalDetail(arch.id)}
                        className="p-1.5 text-slate-600 hover:text-navy-800 hover:bg-slate-100 rounded-md"
                        title="View Full Snapshot"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(arch)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md"
                            title={arch.is_hidden ? 'Unhide from default view' : 'Hide from default view'}
                          >
                            {arch.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(arch)}
                            className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-md"
                            title="Permanently Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expandable Snapshot Table */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                    {loadingDetailId === arch.id && !detail ? (
                      <div className="text-xs text-slate-500 py-4 text-center">Loading archived items...</div>
                    ) : !detail || detail.items.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        No active inventory items were present at the time of this snapshot.
                      </div>
                    ) : (
                      <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                            <tr>
                              <th className="px-3 py-2 text-left">Item Name</th>
                              <th className="px-3 py-2 text-right">Quantity</th>
                              <th className="px-3 py-2 text-right">Unit Price</th>
                              <th className="px-3 py-2 text-right">Total Value</th>
                              <th className="px-3 py-2 text-left">Supplier/Source</th>
                              <th className="px-3 py-2 text-left">Purchase Date</th>
                              <th className="px-3 py-2 text-left">Condition</th>
                              <th className="px-3 py-2 text-left">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.items.map((it: any) => (
                              <tr key={it.id}>
                                <td className="px-3 py-2 font-medium text-slate-900">{it.item_name}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {it.quantity} {it.unit}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatPHP(it.unit_price)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                  {formatPHP(it.total_value)}
                                </td>
                                <td className="px-3 py-2 text-slate-600">{it.supplier || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 tabular-nums">{it.date_purchased || '-'}</td>
                                <td className="px-3 py-2 text-slate-700">{it.condition}</td>
                                <td className="px-3 py-2 text-slate-500">{it.description || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full Snapshot Modal */}
      <Modal
        open={Boolean(modalDetail)}
        onClose={() => setModalDetail(null)}
        title={`Archived Snapshot — ${modalDetail?.archive?.archive_ref || ''}`}
        subtitle={`Period: ${modalDetail?.archive?.period_label || ''} • Archived on ${formatDateTime(
          modalDetail?.archive?.archived_at
        )}`}
        size="xl"
      >
        {modalDetail && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Activity Trigger</div>
                <div className="font-bold text-slate-900 mt-0.5">{modalDetail.archive.trigger_type}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Archived By</div>
                <div className="font-bold text-slate-900 mt-0.5">{modalDetail.archive.performed_by_name}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Registered Items</div>
                <div className="font-bold text-slate-900 mt-0.5 tabular-nums">
                  {modalDetail.archive.registered_item_count}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Total Valuation</div>
                <div className="font-bold text-navy-900 mt-0.5 tabular-nums">
                  {formatPHP(modalDetail.archive.total_inventory_value)}
                </div>
              </div>
            </div>

            {modalDetail.archive.audit_details?.audit_ref && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1">
                <div className="font-bold text-emerald-900">
                  Audit Details: {modalDetail.archive.audit_details.audit_ref} —{' '}
                  {modalDetail.archive.audit_details.title}
                </div>
                <div className="text-emerald-800">
                  Auditor: {modalDetail.archive.audit_details.auditor_name} • Financial Variance:{' '}
                  {formatPHP(modalDetail.archive.audit_details.total_financial_difference || 0)}
                </div>
                {modalDetail.archive.audit_details.findings && (
                  <div className="text-emerald-800">Findings: {modalDetail.archive.audit_details.findings}</div>
                )}
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Item Name</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Total Value</th>
                    <th className="px-3 py-2 text-left">Supplier/Source</th>
                    <th className="px-3 py-2 text-left">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modalDetail.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        No items in this snapshot.
                      </td>
                    </tr>
                  ) : (
                    modalDetail.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-medium">{it.item_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPHP(it.unit_price)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {formatPHP(it.total_value)}
                        </td>
                        <td className="px-3 py-2">{it.supplier || '-'}</td>
                        <td className="px-3 py-2">{it.condition}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Permanently Delete Historical Record"
        message={`Are you sure you want to permanently delete "${deleteTarget?.archive_ref}" (${deleteTarget?.period_label})? This will not affect active inventory or dashboard totals, but the archived snapshot cannot be recovered.`}
        confirmLabel="Delete Permanently"
        loading={deleting}
      />
    </div>
  );
}
