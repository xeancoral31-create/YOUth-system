import { ProtectedShell } from '@/components/ProtectedShell';
import { DashboardPage } from '@/views/DashboardPage';

export default function Page() {
  return (
    <ProtectedShell>
      <DashboardPage />
    </ProtectedShell>
  );
}
