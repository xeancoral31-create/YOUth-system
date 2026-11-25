import { ProtectedShell } from '@/components/ProtectedShell';
import { HistoryPage } from '@/views/HistoryPage';

export default function Page() {
  return (
    <ProtectedShell>
      <HistoryPage />
    </ProtectedShell>
  );
}
