import { ProtectedShell } from '@/components/ProtectedShell';
import { AuditsPage } from '@/views/AuditsPage';

export default function Page() {
  return (
    <ProtectedShell>
      <AuditsPage />
    </ProtectedShell>
  );
}
