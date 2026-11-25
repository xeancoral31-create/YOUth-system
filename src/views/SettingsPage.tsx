'use client';

import React, { useEffect, useState } from 'react';
import { User, KeyRound, Building2, History, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';

type TabKey = 'profile' | 'security' | 'organization' | 'activity';

export function SettingsPage() {
  const { user, refreshUser, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [tab, setTab] = useState<TabKey>('profile');

  // Profile state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [position, setPosition] = useState(user?.position || '');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  // Organization settings state
  const [orgSettings, setOrgSettings] = useState({
    organization_name: '',
    barangay_location: '',
    default_approving_officer: '',
    default_min_stock_level: '5',
    report_footer_note: '',
  });
  const [orgMsg, setOrgMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);

  // My activity logs
  const [myLogs, setMyLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setPosition(user.position || '');
    }
  }, [user]);

  useEffect(() => {
    apiRequest('/api/system/settings')
      .then((res) => {
        if (res.settings) {
          setOrgSettings((prev) => ({ ...prev, ...res.settings }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'activity') {
      setLoadingLogs(true);
      apiRequest('/api/system/my-logs')
        .then((res) => setMyLogs(res.logs || []))
        .finally(() => setLoadingLogs(false));
    }
  }, [tab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ full_name: fullName, email, position }),
      });
      await refreshUser();
      toast.success('Profile information updated.');
      setProfileMsg({ type: 'ok', text: 'Profile information updated successfully.' });
    } catch (err: any) {
      setProfileMsg({ type: 'err', text: err.message || 'Failed to update profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'err', text: 'New password and confirmation do not match.' });
      return;
    }
    setSavingPw(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password updated successfully.');
      setPwMsg({ type: 'ok', text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err.message || 'Failed to update password.' });
    } finally {
      setSavingPw(false);
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgMsg(null);
    setSavingOrg(true);
    try {
      const res = await apiRequest('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify(orgSettings),
      });
      if (res.settings) setOrgSettings((prev) => ({ ...prev, ...res.settings }));
      toast.success('Organization and report settings saved.');
      setOrgMsg({ type: 'ok', text: 'Organization and report settings saved.' });
    } catch (err: any) {
      setOrgMsg({ type: 'err', text: err.message || 'Failed to save settings.' });
    } finally {
      setSavingOrg(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'profile', label: 'Account & Profile', icon: User },
    { key: 'security', label: 'Security & Password', icon: KeyRound },
    { key: 'organization', label: 'Organization & Reports', icon: Building2 },
    { key: 'activity', label: 'My Activity', icon: History },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">System & Account Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your account profile, password security, organization defaults, and recent session activity
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Settings Navigation Rail */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-2 h-fit space-y-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left ${
                  active
                    ? 'bg-[#253b80] text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings Panel */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5 max-w-2xl">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">Account & Profile Details</h2>
                <p className="text-xs text-slate-500">Update your official display name, email, and organizational designation.</p>
              </div>

              {profileMsg && (
                <div
                  className={`p-3 rounded text-xs border flex items-center gap-2 ${
                    profileMsg.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {profileMsg.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{profileMsg.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Username</label>
                  <input
                    type="text"
                    disabled
                    value={user?.username || ''}
                    className="w-full px-3 py-2 text-sm bg-slate-50 text-slate-500 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Assigned Role</label>
                  <input
                    type="text"
                    disabled
                    value={(user?.role || '').toUpperCase()}
                    className="w-full px-3 py-2 text-sm bg-slate-50 text-slate-500 border border-slate-200 rounded-md font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Position / Designation</label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. BGC Youth Secretary, Inventory Auditor"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 text-xs font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-md disabled:opacity-60"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}

          {tab === 'security' && (
            <form onSubmit={handlePasswordChange} className="space-y-5 max-w-lg">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">Security & Password</h2>
                <p className="text-xs text-slate-500">
                  Update your account password. Use at least 8 characters with letters and numbers.
                </p>
              </div>

              {pwMsg && (
                <div
                  className={`p-3 rounded text-xs border flex items-center gap-2 ${
                    pwMsg.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {pwMsg.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{pwMsg.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">New Password (min 8 characters) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-700"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPw}
                  className="px-5 py-2 text-xs font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-md disabled:opacity-60"
                >
                  {savingPw ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}

          {tab === 'organization' && (
            <form onSubmit={handleSaveOrg} className="space-y-5 max-w-2xl">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">Organization & Report Defaults</h2>
                <p className="text-xs text-slate-500">
                  {isAdmin
                    ? 'Configure official organization metadata and inventory alert defaults.'
                    : 'View official organization metadata (only Administrators can modify these settings).'}
                </p>
              </div>

              {orgMsg && (
                <div
                  className={`p-3 rounded text-xs border flex items-center gap-2 ${
                    orgMsg.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {orgMsg.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  <span>{orgMsg.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Organization Name</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={orgSettings.organization_name}
                    onChange={(e) => setOrgSettings({ ...orgSettings, organization_name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Church / Location</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={orgSettings.barangay_location}
                    onChange={(e) => setOrgSettings({ ...orgSettings, barangay_location: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Approving Officer</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={orgSettings.default_approving_officer}
                    onChange={(e) => setOrgSettings({ ...orgSettings, default_approving_officer: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Default Low-Stock Threshold</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!isAdmin}
                    value={orgSettings.default_min_stock_level}
                    onChange={(e) => setOrgSettings({ ...orgSettings, default_min_stock_level: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Official Report Footer Note</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={orgSettings.report_footer_note}
                    onChange={(e) => setOrgSettings({ ...orgSettings, report_footer_note: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-50"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingOrg}
                    className="px-5 py-2 text-xs font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-md disabled:opacity-60"
                  >
                    {savingOrg ? 'Saving...' : 'Save Organization Settings'}
                  </button>
                </div>
              )}
            </form>
          )}

          {tab === 'activity' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h2 className="text-base font-semibold text-slate-900">My Recent Account Activity</h2>
                <p className="text-xs text-slate-500">Recent logins and actions recorded under your account.</p>
              </div>
              {loadingLogs ? (
                <p className="text-xs text-slate-500 py-4">Loading account activity...</p>
              ) : myLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">No activity recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 text-left">
                      <tr>
                        <th className="py-2 font-semibold">Timestamp</th>
                        <th className="py-2 font-semibold">Module</th>
                        <th className="py-2 font-semibold">Action</th>
                        <th className="py-2 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2.5 text-slate-500 whitespace-nowrap tabular-nums">
                            {formatDateTime(l.created_at)}
                          </td>
                          <td className="py-2.5 text-slate-700">{l.module}</td>
                          <td className="py-2.5 font-mono text-[11px] text-navy-700">{l.action}</td>
                          <td className="py-2.5 text-slate-700">{l.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
