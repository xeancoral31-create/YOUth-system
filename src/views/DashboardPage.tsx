'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  BarChart3,
  Package,
  Coins,
  CheckCircle2,
  Clock,
  ArrowRight,
  Calendar,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiRequest } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime, formatPHP } from '@/lib/format';

export function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiRequest('/api/dashboard');
      setData(res);
      setError('');
      if (isManual) toast.success('Dashboard synchronized with database.');
    } catch (err: any) {
      setError(err.message);
      if (isManual) toast.error(err.message || 'Failed to refresh dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard(false);
  }, []);

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-12 bg-slate-200 rounded-lg w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-slate-200" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-xl border border-slate-200" />
      </div>
    );
  }
  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>;
  }

  const inv = data.inventory;
  const aud = data.audits;
  const recentItems = data.recentItems || [];
  const recentActivities = data.recentActivities || [];

  const nowFormatted = new Date().toLocaleString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Greeting & Date/Refresh Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome back, {user?.full_name || user?.username}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Here is the live overview of your BGC Youth Inventory & Auditing System today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="tabular-nums">{nowFormatted}</span>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 4 KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Registered Items</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{inv.total_items}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Active inventory records</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Inventory Value</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{formatPHP(inv.total_value)}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Recorded valuation</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Completed Audits</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{aud.completed_audits}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Finalized records</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Pending Audits</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{aud.pending_audits}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Draft & in-progress</div>
          </div>
        </div>
      </div>

      {/* Middle 2-Column Row: Valuation Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-navy-700" />
              <h2 className="text-sm font-semibold text-slate-900">Inventory Valuation Overview</h2>
            </div>
            <span className="text-[11px] text-slate-400">Live database values (₱)</span>
          </div>
          {recentItems.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center text-xs text-slate-500">
              <Package className="w-8 h-8 text-slate-300 mb-2" />
              <div className="font-medium text-slate-700">No inventory data available yet.</div>
              <div className="text-slate-400 mt-0.5">Add items in Inventory Items to see valuation distribution.</div>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recentItems} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="item_name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₱${Number(v).toLocaleString('en-PH')}`}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatPHP(Number(value)), 'Total Value']}
                    contentStyle={{
                      fontSize: '12px',
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Bar dataKey="total_value" fill="#253b80" radius={[5, 5, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-navy-700" />
              <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
            </div>
            {hasRole('admin', 'auditor') && (
              <Link href="/logs" className="text-xs font-medium text-indigo-700 hover:underline inline-flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          {recentActivities.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-8">
              No recent activity recorded.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentActivities.slice(0, 5).map((log: any) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{log.action}</div>
                    <div className="text-[11px] text-slate-500 truncate">{log.details || log.module}</div>
                  </div>
                  <div className="text-[11px] text-slate-400 whitespace-nowrap tabular-nums text-right">
                    <div>{formatDateTime(log.created_at)}</div>
                    <div className="text-slate-500">{log.username}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card: Recently Registered Items */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recently Registered Items</h2>
          <Link
            href="/inventory"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#253b80] hover:bg-[#1d2f66] rounded-lg transition-colors"
          >
            View All Items <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="px-5 py-2.5 text-left font-semibold">Item</th>
                <th className="px-5 py-2.5 text-left font-semibold">Quantity</th>
                <th className="px-5 py-2.5 text-left font-semibold">Value</th>
                <th className="px-5 py-2.5 text-left font-semibold">Date Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                    No inventory items recorded yet.
                  </td>
                </tr>
              ) : (
                recentItems.map((it: any) => (
                  <tr key={it.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{it.item_name}</td>
                    <td className="px-5 py-3 text-slate-700 tabular-nums">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="px-5 py-3 text-slate-800 tabular-nums font-semibold">{formatPHP(it.total_value)}</td>
                    <td className="px-5 py-3 text-slate-500 tabular-nums">{formatDateTime(it.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
