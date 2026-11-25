import { ProtectedShell } from '@/components/ProtectedShell';
import { BackupPage } from '@/views/BackupPage';

export default function Page() {
  return (
    <ProtectedShell>
      <BackupPage />
    </ProtectedShell>
  );
}
