import type { Metadata, Viewport } from 'next';
import React from 'react';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'BGCyouth — Inventory & Auditing Management System',
  description: 'Butuan Gospel Church Youth Inventory, Auditing, Financial Reporting & History System',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/bgcyouth-logo.jpg',
    apple: '/bgcyouth-logo.jpg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BGCyouth',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c1229',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f5f7fb] text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
