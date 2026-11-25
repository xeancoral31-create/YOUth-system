import { ProtectedShell } from '@/components/ProtectedShell';
import { ActivityLogsPage } from '@/views/ActivityLogsPage';

export default function Page() {
  return (
    <ProtectedShell>
      <ActivityLogsPage />
    </ProtectedShell>
  );
}
