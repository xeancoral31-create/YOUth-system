import { ProtectedShell } from '@/components/ProtectedShell';
import { AuditDetailPage } from '@/views/AuditDetailPage';

export default function Page() {
  return (
    <ProtectedShell>
      <AuditDetailPage />
    </ProtectedShell>
  );
}
