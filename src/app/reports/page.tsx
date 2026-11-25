import { ProtectedShell } from '@/components/ProtectedShell';
import { ReportsPage } from '@/views/ReportsPage';

export default function Page() {
  return (
    <ProtectedShell>
      <ReportsPage />
    </ProtectedShell>
  );
}
