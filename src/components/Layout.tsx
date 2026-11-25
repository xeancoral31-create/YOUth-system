'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  FileBarChart2,
  FolderArchive,
  History,
  Users,
  DatabaseBackup,
  Archive,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  ChevronRight,
  UserCheck,
  Download,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory Items',
  '/audits': 'Inventory Audits',
  '/reports': 'Reports & Financial',
  '/documents': 'Document Center',
  '/history': 'History Archives',
  '/logs': 'Activity Logs',
  '/users': 'User Accounts',
  '/backup': 'Backup & Recovery',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { canInstall, promptInstall } = usePwaInstall();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { to: '/inventory', label: 'Inventory Items', icon: Package, show: true },
    { to: '/audits', label: 'Inventory Audits', icon: ClipboardCheck, show: true },
    { to: '/reports', label: 'Reports & Financial', icon: FileBarChart2, show: true },
    { to: '/documents', label: 'Document Center', icon: FolderArchive, show: true },
    { to: '/history', label: 'History', icon: Archive, show: hasRole('admin', 'auditor') },
    { to: '/logs', label: 'Activity Logs', icon: History, show: hasRole('admin', 'auditor') },
    { to: '/users', label: 'User Accounts', icon: Users, show: hasRole('admin') },
    { to: '/backup', label: 'Backup & Recovery', icon: DatabaseBackup, show: hasRole('admin') },
    { to: '/settings', label: 'Settings', icon: Settings, show: true },
  ].filter((item) => item.show);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = (user?.full_name || user?.username || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const pageTitle = pathname?.startsWith('/audits/')
    ? 'Audit Worksheet'
    : PAGE_TITLES[pathname || '/'] || 'Dashboard';

  return (
    <div className="min-h-screen flex bg-[#f5f7fb]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden no-print"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 text-slate-100 flex flex-col overflow-hidden transition-transform lg:sticky lg:top-0 lg:h-screen shrink-0 lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(180deg, #0c1229 0%, #121a3b 50%, #0a1026 100%)',
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 256 760"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-30"
        >
          <defs>
            <linearGradient id="bgcSidebarWave1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b4cca" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#1e295b" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="bgcSidebarWave2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d="M0,470 C75,435 165,520 256,475 L256,760 L0,760 Z" fill="url(#bgcSidebarWave1)" />
          <path d="M0,565 C90,605 170,515 256,560 L256,760 L0,760 Z" fill="url(#bgcSidebarWave2)" />
        </svg>

        <div className="relative z-10 px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/bgcyouth-logo.jpg"
              alt="BGCyouth Logo"
              className="w-10 h-10 rounded-full object-cover ring-2 ring-white/20 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-white">BGCyouth</div>
              <div className="text-[10px] text-slate-400 leading-tight">Butuan Gospel Church Youth System</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.to === '/' ? pathname === '/' : pathname?.startsWith(item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#3b4cca] to-[#283799] text-white shadow-[0_4px_14px_rgba(45,62,168,0.45)]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative z-10 p-4 border-t border-white/10 bg-black/25 backdrop-blur-[2px] space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4f46e5] to-[#312e81] border border-indigo-400/40 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user?.full_name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="capitalize truncate">{user?.role}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200/80 px-4 lg:px-7 flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:bg-slate-100 rounded-md mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="font-medium text-slate-700">{pageTitle}</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            {canInstall && (
              <button
                type="button"
                onClick={promptInstall}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#253b80] hover:bg-[#1d2f66] rounded-lg shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}
            <span className="hidden sm:inline">
              Securely signed in as <span className="font-semibold text-slate-800">{user?.username}</span>
            </span>
            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-7 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
