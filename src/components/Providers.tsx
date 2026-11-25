'use client';

import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && !window.location.protocol.startsWith('capacitor')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <AuthProvider>
      <Toaster position="top-right" richColors closeButton />
      {children}
    </AuthProvider>
  );
}
