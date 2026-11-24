import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatPHP } from '../utils/format';

export function ReportsPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [mode, setMode] = useState<'consolidated' | 'individual'>('consolidated');
  const [consolidated, setConsolidated] = useState<any>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string>('');
  const [individualAudit, setIndividualAudit] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const loadConsolidated = async () => {
    const res = await apiRequest('/api/reports/consolidated');
    setConsolidated(res);
    if (res.audits?.length > 0 && !selectedAuditId) {
      setSelectedAuditId(String(res.audits[0].id));
    }
  };

  useEffect(() => {
    loadConsolidated().finally(() => setLoading(false));
  }, []);

  const handlePrintAndArchive = async () => {
    if (!isAdmin || mode !== 'consolidated') {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const res = await apiRequest('/api/reports/print-archive', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      // Print the currently rendered A4 report first, then refresh active inventory state
      window.print();
      if (!res.skippedEmpty && !res.alreadyArchived) {
        toast.success(`Archived ${res.archivedItemCount} item(s) to History and reset active inventory.`);
      } else if (res.alreadyArchived) {
        toast.info('This inventory snapshot was already archived to History.');
      }
      await loadConsolidated();
    } catch (err: any) {
      toast.error(err.message || 'Inventory could not be reset because historical records were not saved.');
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    if (mode === 'individual' && selectedAuditId) {
      apiRequest(`/api/audits/${selectedAuditId}`).then(setIndividualAudit);
    }
  }, [mode, selectedAuditId]);

  const handleDownload = async (url: string, filename: string, label: string) => {
    try {
      await downloadFile(url, filename);
      toast.success(`${label} downloaded and archived to Document Center.`);
    } catch (err: any) {
      toast.error(err.message || `Failed to export ${label}.`);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-8">Loading report data...</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Reports & Financial Summary</h1>
          <p className="text-xs text-slate-500">
            Official A4 reports with Philippine Peso (₱) formatting, editable Word (.docx), PDF, and Excel exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setMode('consolidated')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                mode === 'consolidated' ? 'bg-navy-900 text-white' : 'text-slate-700'
              }`}
            >
              Consolidated Summary
            </button>
            <button
              type="button"
              onClick={() => setMode('individual')}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                mode === 'individual' ? 'bg-navy-900 text-white' : 'text-slate-700'
              }`}
            >
              Individual Audit
            </button>
          </div>

          {mode === 'individual' && (
            <select
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {consolidated?.audits?.length === 0 ? (
                <option value="">No audits available</option>
              ) : (
                consolidated?.audits?.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.audit_ref} — {a.title}
                  </option>
                ))
              )}
            </select>
          )}

          <button
            type="button"
            onClick={() =>
              mode === 'consolidated'
                ? handleDownload('/api/reports/consolidated/docx', 'BGCyouth_Financial_Summary.docx', 'Word (.docx)')
                : selectedAuditId &&
                  handleDownload(`/api/reports/audit/${selectedAuditId}/docx`, 'Audit_Report.docx', 'Word (.docx)')
            }
            disabled={mode === 'individual' && !selectedAuditId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            Export Word (.docx)
          </button>

          <button
            type="button"
            onClick={() =>
              mode === 'consolidated'
                ? handleDownload('/api/reports/consolidated/pdf', 'BGCyouth_Financial_Summary.pdf', 'PDF Report')
                : selectedAuditId &&
                  handleDownload(`/api/reports/audit/${selectedAuditId}/pdf`, 'Audit_Report.pdf', 'PDF Report')
            }
            disabled={mode === 'individual' && !selectedAuditId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5 text-red-600" />
            Download PDF
          </button>

          <button
            type="button"
            onClick={() =>
              mode === 'consolidated'
                ? handleDownload('/api/reports/consolidated/excel', 'BGCyouth_Inventory_Financial.xlsx', 'Excel (.xlsx)')
                : selectedAuditId &&
                  handleDownload(`/api/reports/audit/${selectedAuditId}/excel`, 'Audit_Report.xlsx', 'Excel (.xlsx)')
            }
            disabled={mode === 'individual' && !selectedAuditId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export Excel
          </button>

          <button
            type="button"
            disabled={printing}
            onClick={handlePrintAndArchive}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-navy-900 text-white rounded-md hover:bg-navy-800 disabled:opacity-60"
          >
            <Printer className="w-3.5 h-3.5" />
            {printing ? 'Archiving...' : 'Print A4'}
          </button>
        </div>
      </div>

      {/* Official A4 Preview Sheet */}
      <div className="a4-sheet bg-white border border-slate-200 shadow-sm rounded-lg p-8 max-w-[210mm] mx-auto space-y-6">
        <div className="flex items-center justify-center gap-4 border-b-2 border-navy-900 pb-4">
          <img
            src="/bgcyouth-logo.jpg"
            alt="BGCyouth Logo"
            className="w-14 h-14 rounded-full object-cover border border-slate-300 shrink-0"
          />
          <div className="text-center">
            <div className="text-[11px] font-semibold tracking-wider text-navy-700 uppercase">
              {consolidated?.settings?.organization_name || 'Butuan Gospel Church • BGC Youth Ministry'}
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">BGCyouth MANAGEMENT SYSTEM</h2>
            <div className="text-sm font-bold text-navy-800 mt-0.5">
              {mode === 'consolidated'
                ? 'CONSOLIDATED INVENTORY & FINANCIAL SUMMARY REPORT'
                : `OFFICIAL INVENTORY AUDIT REPORT — ${individualAudit?.audit?.audit_ref || ''}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Generated: {new Date().toLocaleString('en-PH')} • Prepared By: {user?.full_name}
            </div>
          </div>
        </div>

        {mode === 'consolidated' && consolidated && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Registered Items</div>
                <div className="text-base font-bold tabular-nums">{consolidated.totals.totalItems}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Total Stock Units</div>
                <div className="text-base font-bold tabular-nums">{consolidated.totals.totalUnits}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Total Valuation</div>
                <div className="text-base font-bold tabular-nums text-navy-900">
                  {formatPHP(consolidated.totals.totalInventoryValue)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Net Audit Variance</div>
                <div className="text-base font-bold tabular-nums">
                  {formatPHP(consolidated.totals.totalFinancialDifference)}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Inventory Valuation Schedule
              </h3>
              <table className="w-full text-xs border border-slate-300">
                <thead className="bg-navy-900 text-white">
                  <tr>
                    <th className="px-2.5 py-2 text-left">Item Name</th>
                    <th className="px-2.5 py-2 text-right">Quantity</th>
                    <th className="px-2.5 py-2 text-right">Unit Price</th>
                    <th className="px-2.5 py-2 text-right">Total Value</th>
                    <th className="px-2.5 py-2 text-left">Supplier/Source</th>
                    <th className="px-2.5 py-2 text-left">Condition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {consolidated.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                        No inventory items recorded.
                      </td>
                    </tr>
                  ) : (
                    consolidated.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="px-2.5 py-1.5 font-medium">{it.item_name}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                          {it.quantity} {it.unit}
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{formatPHP(it.unit_price)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">
                          {formatPHP(it.total_value)}
                        </td>
                        <td className="px-2.5 py-1.5">{it.supplier || '-'}</td>
                        <td className="px-2.5 py-1.5">{it.condition}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {consolidated.items.length > 0 && (
                  <tfoot className="bg-slate-50 border-t border-slate-300 font-bold">
                    <tr>
                      <td colSpan={3} className="px-2.5 py-2 text-right text-slate-700">
                        GRAND TOTAL VALUATION:
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-navy-900">
                        {formatPHP(consolidated.totals.totalInventoryValue)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}

        {mode === 'individual' && individualAudit && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Audit Date</div>
                <div className="font-bold">{individualAudit.audit.audit_date}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Auditor</div>
                <div className="font-bold">{individualAudit.audit.auditor_name}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Actual Valuation</div>
                <div className="font-bold tabular-nums">{formatPHP(individualAudit.audit.total_actual_value)}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-slate-500">Financial Variance</div>
                <div className="font-bold tabular-nums">
                  {formatPHP(individualAudit.audit.total_financial_difference)}
                </div>
              </div>
            </div>

            <table className="w-full text-xs border border-slate-300">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="px-2.5 py-2 text-left">Item Name</th>
                  <th className="px-2.5 py-2 text-right">Recorded</th>
                  <th className="px-2.5 py-2 text-right">Actual</th>
                  <th className="px-2.5 py-2 text-right">Diff</th>
                  <th className="px-2.5 py-2 text-right">Fin. Diff</th>
                  <th className="px-2.5 py-2 text-left">Condition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {individualAudit.items.map((it: any) => (
                  <tr key={it.id}>
                    <td className="px-2.5 py-1.5 font-medium">{it.item_name}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{it.recorded_qty}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{it.actual_qty}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">
                      {it.discrepancy > 0 ? `+${it.discrepancy}` : it.discrepancy}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{formatPHP(it.financial_difference)}</td>
                    <td className="px-2.5 py-1.5">{it.observed_condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-2 text-xs">
              <div>
                <span className="font-bold text-slate-800">Findings: </span>
                <span className="text-slate-700">{individualAudit.audit.findings || 'None recorded.'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-800">Recommendations: </span>
                <span className="text-slate-700">{individualAudit.audit.recommendations || 'None recorded.'}</span>
              </div>
            </div>
          </>
        )}

        {/* Official Signature / Approval Section */}
        <div className="grid grid-cols-3 gap-6 pt-10 text-xs">
          <div>
            <div className="text-slate-500 mb-8">Prepared By:</div>
            <div className="border-t border-slate-700 pt-1 font-bold text-slate-900">
              {mode === 'individual' ? individualAudit?.audit?.auditor_name : user?.full_name}
            </div>
            <div className="text-[10px] text-slate-500">Authorized Personnel</div>
          </div>
          <div>
            <div className="text-slate-500 mb-8">Verified By:</div>
            <div className="border-t border-slate-700 pt-1 font-bold text-slate-900">
              {mode === 'individual' ? individualAudit?.audit?.finalized_by_name || 'Pending' : 'Inventory Auditor'}
            </div>
            <div className="text-[10px] text-slate-500">BGC Youth Audit Committee</div>
          </div>
          <div>
            <div className="text-slate-500 mb-8">Approved By:</div>
            <div className="border-t border-slate-700 pt-1 font-bold text-slate-900">
              {mode === 'individual'
                ? individualAudit?.audit?.approved_by || consolidated?.settings?.default_approving_officer || 'Church Board'
                : consolidated?.settings?.default_approving_officer || 'Church Board'}
            </div>
            <div className="text-[10px] text-slate-500">Butuan Gospel Church Board</div>
          </div>
        </div>
      </div>
    </div>
  );
}
