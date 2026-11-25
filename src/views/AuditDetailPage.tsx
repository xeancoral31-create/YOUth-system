'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Lock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Printer,
  CheckCircle2,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, downloadFile } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, formatPHP } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Modal } from '@/components/Modal';

const OBSERVED_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned', 'Missing'];

export function AuditDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { hasRole } = useAuth();
  const canAudit = hasRole('admin', 'auditor');

  const [audit, setAudit] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [reconcileInv, setReconcileInv] = useState(false);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/audits/${id}`);
      setAudit(res.audit);
      setItems(res.items || []);
      setHistory(res.history || []);
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [id]);

  const isLocked = audit?.status === 'Completed';
  const editable = canAudit && !isLocked;

  const updateItemField = (itemId: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const next = { ...it, [field]: value };
        if (field === 'actual_qty') {
          const actualQty = Number(value) || 0;
          const discrepancy = actualQty - Number(it.recorded_qty);
          const actualValue = actualQty * Number(it.unit_price);
          const financialDiff = actualValue - Number(it.recorded_value);
          next.discrepancy = discrepancy;
          next.actual_value = actualValue;
          next.financial_difference = financialDiff;
        }
        return next;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest(`/api/audits/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: audit.title,
          audit_date: audit.audit_date,
          auditor_name: audit.auditor_name,
          findings: audit.findings,
          recommendations: audit.recommendations,
          remarks: audit.remarks,
          approved_by: audit.approved_by,
          items: items.map((it) => ({
            id: it.id,
            actual_qty: Number(it.actual_qty),
            observed_condition: it.observed_condition,
            remarks: it.remarks,
          })),
        }),
      });
      await loadAudit();
      toast.success('Audit counts and details saved.');
      setMsg({ type: 'ok', text: 'Audit counts and details saved.' });
    } catch (err: any) {
      toast.error(err.message);
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setSaving(true);
    setMsg(null);
    try {
      // Save any pending edits first
      await apiRequest(`/api/audits/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          findings: audit.findings,
          recommendations: audit.recommendations,
          remarks: audit.remarks,
          approved_by: audit.approved_by,
          items: items.map((it) => ({
            id: it.id,
            actual_qty: Number(it.actual_qty),
            observed_condition: it.observed_condition,
            remarks: it.remarks,
          })),
        }),
      });
      await apiRequest(`/api/audits/${id}/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          reconcile_inventory: reconcileInv,
          findings: audit.findings,
          recommendations: audit.recommendations,
          approved_by: audit.approved_by,
        }),
      });
      setFinalizeOpen(false);
      await loadAudit();
      toast.success('Audit finalized and permanently locked.');
      setMsg({ type: 'ok', text: 'Audit finalized and permanently locked.' });
    } catch (err: any) {
      toast.error(err.message);
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-8">Loading audit worksheet...</div>;
  if (!audit) return <div className="text-sm text-red-600 py-8">Audit record not found.</div>;

  const liveRecordedVal = items.reduce((s, i) => s + Number(i.recorded_value || 0), 0);
  const liveActualVal = items.reduce((s, i) => s + Number(i.actual_value || 0), 0);
  const liveFinDiff = liveActualVal - liveRecordedVal;

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <Link href="/audits" className="p-2 bg-white border border-slate-200 rounded-md hover:bg-slate-50">
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{audit.audit_ref}</h1>
              <StatusBadge status={audit.status} />
            </div>
            <p className="text-xs text-slate-500">{audit.title} • Auditor: {audit.auditor_name}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadFile(`/api/reports/audit/${id}/pdf`, `${audit.audit_ref}.pdf`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <FileDown className="w-3.5 h-3.5 text-red-600" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => downloadFile(`/api/reports/audit/${id}/docx`, `${audit.audit_ref}.docx`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            Export Word (.docx)
          </button>
          <button
            type="button"
            onClick={() => downloadFile(`/api/reports/audit/${id}/excel`, `${audit.audit_ref}.xlsx`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <Printer className="w-3.5 h-3.5" />
            Print A4
          </button>
          {editable && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-navy-700 text-white rounded-md hover:bg-navy-800"
              >
                <Save className="w-3.5 h-3.5" />
                Save Progress
              </button>
              <button
                type="button"
                onClick={() => setFinalizeOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Finalize & Lock
              </button>
            </>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-900 no-print">
          <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            <strong>Finalized & Locked:</strong> Completed on {formatDateTime(audit.finalized_at)} by{' '}
            {audit.finalized_by_name}. This record is protected against unauthorized modification.
          </span>
        </div>
      )}

      {msg && (
        <div
          className={`p-3 rounded text-xs border no-print ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
          <div className="text-[11px] text-slate-500 font-medium">Recorded Valuation</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{formatPHP(liveRecordedVal)}</div>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
          <div className="text-[11px] text-slate-500 font-medium">Actual Valuation</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{formatPHP(liveActualVal)}</div>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
          <div className="text-[11px] text-slate-500 font-medium">Financial Variance</div>
          <div
            className={`text-lg font-bold tabular-nums mt-1 ${
              liveFinDiff < 0 ? 'text-red-600' : liveFinDiff > 0 ? 'text-emerald-600' : 'text-slate-900'
            }`}
          >
            {formatPHP(liveFinDiff)}
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200">
          <div className="text-[11px] text-slate-500 font-medium">Items Audited</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{items.length}</div>
        </div>
      </div>

      {/* Audit Worksheet Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden a4-sheet">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Item</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unit Price</th>
                <th className="px-3 py-2.5 text-right font-semibold">Recorded</th>
                <th className="px-3 py-2.5 text-right font-semibold">Actual Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Discrepancy</th>
                <th className="px-3 py-2.5 text-right font-semibold">Fin. Diff</th>
                <th className="px-3 py-2.5 text-left font-semibold">Observed Condition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{it.item_name}</div>
                    <div className="text-[11px] text-slate-400">
                      {formatPHP(it.unit_price)} / {it.unit}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatPHP(it.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {it.recorded_qty} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.actual_qty}
                        onChange={(e) => updateItemField(it.id, 'actual_qty', e.target.value)}
                        className="w-20 px-2 py-1 text-right text-xs border border-slate-300 rounded tabular-nums"
                      />
                    ) : (
                      <span className="tabular-nums font-semibold">{it.actual_qty}</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      it.discrepancy < 0 ? 'text-red-600' : it.discrepancy > 0 ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {it.discrepancy > 0 ? `+${it.discrepancy}` : it.discrepancy}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      it.financial_difference < 0
                        ? 'text-red-600'
                        : it.financial_difference > 0
                        ? 'text-emerald-600'
                        : 'text-slate-600'
                    }`}
                  >
                    {formatPHP(it.financial_difference)}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select
                        value={it.observed_condition}
                        onChange={(e) => updateItemField(it.id, 'observed_condition', e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      >
                        {OBSERVED_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <StatusBadge status={it.observed_condition} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings, Recommendations & Approval */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Audit Findings, Recommendations & Sign-off</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Findings</label>
            <textarea
              rows={3}
              disabled={!editable}
              value={audit.findings || ''}
              onChange={(e) => setAudit({ ...audit, findings: e.target.value })}
              placeholder="Summarize physical count findings and variances..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Recommendations</label>
            <textarea
              rows={3}
              disabled={!editable}
              value={audit.recommendations || ''}
              onChange={(e) => setAudit({ ...audit, recommendations: e.target.value })}
              placeholder="Actionable recommendations for inventory control..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md disabled:bg-slate-50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Approving Officer Name</label>
          <input
            type="text"
            disabled={!editable}
            value={audit.approved_by || ''}
            onChange={(e) => setAudit({ ...audit, approved_by: e.target.value })}
            placeholder="e.g. Church Board Representative"
            className="w-full max-w-md px-3 py-2 text-xs border border-slate-300 rounded-md disabled:bg-slate-50"
          />
        </div>
      </div>

      {/* Audit History */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm no-print">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Audit Historical Changes</h2>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {history.map((h) => (
            <div key={h.id} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <span className="font-mono font-semibold text-navy-700 mr-2">{h.action}</span>
                <span className="text-slate-700">{h.details}</span>
              </div>
              <div className="text-slate-400 tabular-nums">
                {h.performed_by_name} • {formatDateTime(h.created_at)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Finalize Confirmation Modal */}
      <Modal
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        title="Finalize & Lock Inventory Audit"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <p>
            Once finalized, this audit will be marked <strong>Completed</strong> and permanently locked against any
            edits or deletion. All current inventory records and audit details will also be{' '}
            <strong>automatically archived to History</strong> and the active inventory will reset for the next period.
          </p>
          <label className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md">
            <input
              type="checkbox"
              checked={reconcileInv}
              onChange={(e) => setReconcileInv(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Reconcile Inventory Quantities:</strong> Automatically update active inventory stock quantities to
              match the audited actual quantities and log reconciliation transactions.
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFinalizeOpen(false)}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleFinalize}
              className="px-4 py-2 bg-emerald-700 text-white rounded-md font-medium"
            >
              {saving ? 'Finalizing...' : 'Confirm & Finalize Audit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
