import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiRequest } from '../api/client';
import { formatDateTime } from '../utils/format';

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ search, module: moduleFilter });
    apiRequest(`/api/system/logs?${qs.toString()}`)
      .then((res) => setLogs(res.logs || []))
      .finally(() => setLoading(false));
  }, [search, moduleFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">System Activity Logs</h1>
        <p className="text-xs text-slate-500">Complete audit trail of user logins, modifications, exports, and system events</p>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username, action, or details..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
        >
          <option value="">All Modules</option>
          <option value="Auth">Auth</option>
          <option value="Inventory">Inventory</option>
          <option value="Audits">Audits</option>
          <option value="Reports">Reports</option>
          <option value="Document Center">Document Center</option>
          <option value="Users">Users</option>
          <option value="System">System</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Timestamp</th>
                <th className="px-3 py-2.5 text-left font-semibold">User</th>
                <th className="px-3 py-2.5 text-left font-semibold">Role</th>
                <th className="px-3 py-2.5 text-left font-semibold">Module</th>
                <th className="px-3 py-2.5 text-left font-semibold">Action</th>
                <th className="px-3 py-2.5 text-left font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No activity logs found.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap tabular-nums">{formatDateTime(l.created_at)}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{l.username}</td>
                    <td className="px-3 py-2 uppercase text-[10px] font-semibold text-slate-500">{l.role}</td>
                    <td className="px-3 py-2 text-slate-700">{l.module}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-navy-700">{l.action}</td>
                    <td className="px-3 py-2 text-slate-700">{l.details}</td>
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
