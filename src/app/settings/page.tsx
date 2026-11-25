import { ProtectedShell } from '@/components/ProtectedShell';
import { SettingsPage } from '@/views/SettingsPage';

export default function Page() {
  return (
    <ProtectedShell>
      <SettingsPage />
    </ProtectedShell>
  );
}
