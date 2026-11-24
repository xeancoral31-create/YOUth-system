import React, { useEffect, useState } from 'react';
import { Plus, Edit2 } from 'lucide-react';
import { apiRequest } from '../api/client';
import { Modal } from '../components/Modal';
import { StatusBadge } from '../components/StatusBadge';

export function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    role: 'staff',
    position: '',
    is_active: true,
  });
  const [error, setError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/users');
      setUsers(res.users || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', full_name: '', email: '', password: '', role: 'staff', position: '', is_active: true });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (u: any) => {
    setEditing(u);
    setForm({
      username: u.username,
      full_name: u.full_name,
      email: u.email,
      password: '',
      role: u.role,
      position: u.position || '',
      is_active: Boolean(u.is_active),
    });
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        const payload: any = {
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          position: form.position,
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        await apiRequest(`/api/users/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(form) });
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User Accounts & Role Access</h1>
          <p className="text-xs text-slate-500">Manage authorized BGCyouth personnel and role-based permissions</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#253b80] hover:bg-[#1d2f66] text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User Account
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Username</th>
              <th className="px-3 py-2.5 text-left font-semibold">Full Name</th>
              <th className="px-3 py-2.5 text-left font-semibold">Email</th>
              <th className="px-3 py-2.5 text-left font-semibold">Position</th>
              <th className="px-3 py-2.5 text-left font-semibold">Role</th>
              <th className="px-3 py-2.5 text-left font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading accounts...
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-navy-800">{u.username}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-900">{u.full_name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.email}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.position || '-'}</td>
                  <td className="px-3 py-2.5 uppercase font-semibold text-[11px] text-slate-700">{u.role}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={u.is_active ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User Account' : 'Create User Account'} size="md">
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded">{error}</div>}
          {!editing && (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Username *</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          )}
          <div>
            <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
              >
                <option value="admin">Admin</option>
                <option value="auditor">Auditor</option>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Position</label>
              <input
                type="text"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              {editing ? 'Reset Password (leave blank to keep current)' : 'Password (min 8 characters) *'}
            </label>
            <input
              type="password"
              required={!editing}
              minLength={editing ? undefined : 8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md"
            />
          </div>
          {editing && (
            <label className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span>Account Active</span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-navy-700 text-white rounded-md font-medium">
              Save Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
