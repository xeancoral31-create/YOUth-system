import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  SlidersHorizontal,
  History,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatPHP } from '../utils/format';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

const CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned'];

const EMPTY_FORM = {
  item_code: '',
  item_name: '',
  description: '',
  category: '',
  quantity: '',
  unit: '',
  unit_price: '',
  min_stock_level: '',
  supplier: '',
  date_purchased: '',
  condition: '',
  remarks: '',
};

export function InventoryPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'staff');

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & sorting
  const [search, setSearch] = useState('');
  const [filterCond, setFilterCond] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Adjustment modal
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [adjType, setAdjType] = useState('Stock In');
  const [adjQty, setAdjQty] = useState('');
  const [adjRef, setAdjRef] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState('');

  // History modal
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        search,
        condition: filterCond,
        stock_status: filterStock,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      const res = await apiRequest(`/api/inventory?${qs.toString()}`);
      setItems(res.items);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [search, filterCond, filterStock, sortBy, sortDir]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setForm({
      item_code: item.item_code || '',
      item_name: item.item_name || '',
      description: item.description || '',
      category: item.category || '',
      quantity: String(item.quantity),
      unit: item.unit || '',
      unit_price: String(item.unit_price),
      min_stock_level: String(item.min_stock_level),
      supplier: item.supplier || '',
      date_purchased: item.date_purchased || '',
      condition: item.condition || '',
      remarks: item.remarks || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const calculatedTotal =
    (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
        min_stock_level: form.min_stock_level === '' ? 5 : Number(form.min_stock_level),
      };
      if (editingId) {
        await apiRequest(`/api/inventory/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated "${form.item_name.trim()}".`);
      } else {
        await apiRequest('/api/inventory', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Added "${form.item_name.trim()}" to inventory.`);
      }
      setFormOpen(false);
      await loadInventory();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Name',
      'Quantity',
      'Unit',
      'Unit Price (PHP)',
      'Total Value (PHP)',
      'Condition',
      'Supplier/Source',
      'Purchase Date',
      'Description',
    ];
    const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = items.map((it) =>
      [
        it.item_name,
        it.quantity,
        it.unit,
        Number(it.unit_price).toFixed(2),
        Number(it.total_value).toFixed(2),
        it.condition,
        it.supplier || '',
        it.date_purchased || '',
        it.description || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = [headers.map(escapeCsv).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BGCyouth_Inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} item(s) to CSV.`);
  };

  const handleDelete = (item: any) => {
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/inventory/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success(`Deleted "${deleteTarget.item_name}" from active inventory.`);
      setDeleteTarget(null);
      await loadInventory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete item.');
    } finally {
      setDeleting(false);
    }
  };

  const openAdjustModal = (item: any) => {
    setAdjustItem(item);
    setAdjType('Stock In');
    setAdjQty('');
    setAdjRef('');
    setAdjReason('');
    setAdjError('');
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError('');
    try {
      await apiRequest(`/api/inventory/${adjustItem.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          adjustment_type: adjType,
          quantity_change: Number(adjQty),
          reference_no: adjRef,
          reason: adjReason,
        }),
      });
      toast.success(`Stock adjusted for "${adjustItem.item_name}".`);
      setAdjustItem(null);
      await loadInventory();
    } catch (err: any) {
      setAdjError(err.message);
    }
  };

  const openHistoryModal = async (item: any) => {
    setHistoryItem(item);
    try {
      const res = await apiRequest(`/api/inventory/${item.id}`);
      setTransactions(res.transactions || []);
    } catch {
      setTransactions([]);
    }
  };

  const totalDisplayedValue = items.reduce((sum, i) => sum + Number(i.total_value || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory Items</h1>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Manage active inventory records. The same item may be listed more than once when its unit price differs;
            identical name, unit, and price combinations are blocked to prevent accidental duplicates.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#253b80] hover:bg-[#1d2f66] text-white text-xs font-medium rounded-lg shrink-0 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add item
          </button>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-xs">{error}</div>}

      {/* Main Item Management Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item name or supplier..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterCond}
              onChange={(e) => setFilterCond(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="">All Conditions</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md shrink-0"
              title="Export visible records to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-white border-b border-slate-200 text-slate-500 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort('item_name')}>
                  Name
                </th>
                <th className="px-4 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort('quantity')}>
                  Quantity
                </th>
                <th className="px-4 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort('unit_price')}>
                  Unit Price
                </th>
                <th className="px-4 py-3 text-left font-semibold cursor-pointer" onClick={() => toggleSort('total_value')}>
                  Total Value
                </th>
                <th className="px-4 py-3 text-left font-semibold">Condition</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading inventory records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No inventory items found. Click <strong>+ Add item</strong> to manually register an item.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isOut = item.quantity <= 0;
                  const isLow = item.quantity > 0 && item.quantity <= item.min_stock_level;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.item_name}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span
                          className={
                            isOut ? 'text-red-600 font-semibold' : isLow ? 'text-amber-600 font-semibold' : 'text-slate-700'
                          }
                        >
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatPHP(item.unit_price)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-800 font-medium">{formatPHP(item.total_value)}</td>
                      <td className="px-4 py-3 text-slate-700">{item.condition}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="text-slate-700 hover:text-navy-900 font-medium"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(item)}
                                className="text-red-600 hover:text-red-800 font-medium"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => openAdjustModal(item)}
                                className="text-slate-400 hover:text-amber-700"
                                title="Adjust Stock"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openHistoryModal(item)}
                            className="text-slate-400 hover:text-navy-700"
                            title="Transaction History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-xs">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-slate-600">
                    Total Valuation ({items.length} item{items.length !== 1 ? 's' : ''}):
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-navy-900">{formatPHP(totalDisplayedValue)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Manual Item Registration / Edit Modal (Clean 2-column layout matching specification) */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit inventory item' : 'Add inventory item'}
        size="lg"
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Item name</label>
              <input
                type="text"
                required
                value={form.item_name}
                onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                placeholder="Enter item name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
              <select
                required
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-navy-700"
              >
                <option value="">Select condition...</option>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700 tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
              <input
                type="text"
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="pcs"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unit price ₱</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                placeholder="0"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700 tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Purchase date</label>
              <input
                type="date"
                value={form.date_purchased}
                onChange={(e) => setForm({ ...form, date_purchased: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Supplier/source</label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="Enter supplier or source"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Item details or specifications"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
              />
            </div>
          </div>

          <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700">
            Calculated total: <span className="font-bold text-slate-900 tabular-nums">{formatPHP(calculatedTotal)}</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-md disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={Boolean(adjustItem)}
        onClose={() => setAdjustItem(null)}
        title={`Stock Adjustment — ${adjustItem?.item_name || ''}`}
        subtitle={`Current Stock: ${adjustItem?.quantity ?? 0} ${adjustItem?.unit ?? ''}`}
        size="md"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          {adjError && <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded">{adjError}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Adjustment Type *</label>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md bg-white"
            >
              <option value="Stock In">Stock In (Add Quantity)</option>
              <option value="Stock Out">Stock Out (Deduct Quantity)</option>
              <option value="Damage Write-Off">Damage Write-Off (Deduct)</option>
              <option value="Adjustment">Direct Count Set (Set Exact Quantity)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {adjType === 'Adjustment' ? 'New Exact Quantity *' : 'Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reference No.</label>
              <input
                type="text"
                value={adjRef}
                onChange={(e) => setAdjRef(e.target.value)}
                placeholder="RIS / Slip No."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Reason / Justification *</label>
            <textarea
              rows={2}
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Explain the stock movement or adjustment"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdjustItem(null)}
              className="px-4 py-2 text-xs bg-slate-100 rounded-md text-slate-700"
            >
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs bg-navy-700 text-white rounded-md font-medium">
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* Transaction History Modal */}
      <Modal
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
        title={`Transaction History — ${historyItem?.item_name || ''}`}
        size="xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Prev</th>
                <th className="px-3 py-2 text-right">Change</th>
                <th className="px-3 py-2 text-right">New Qty</th>
                <th className="px-3 py-2 text-right">Value After</th>
                <th className="px-3 py-2 text-left">Reason / Ref</th>
                <th className="px-3 py-2 text-left">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No transactions recorded for this item.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 tabular-nums">
                      {formatDateTime(t.created_at)}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{t.transaction_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.previous_qty}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        t.change_qty > 0 ? 'text-emerald-600' : t.change_qty < 0 ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      {t.change_qty > 0 ? `+${t.change_qty}` : t.change_qty}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{t.new_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPHP(t.total_value_after)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {t.reason} {t.reference_no ? `(${t.reference_no})` : ''}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{t.performed_by_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Inventory Item"
        message={`Are you sure you want to delete "${deleteTarget?.item_name}" from active inventory? This action will be recorded in the transaction and activity logs.`}
        confirmLabel="Delete Item"
        loading={deleting}
      />
    </div>
  );
}
