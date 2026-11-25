import { ProtectedShell } from '@/components/ProtectedShell';
import { DocumentCenterPage } from '@/views/DocumentCenterPage';

export default function Page() {
  return (
    <ProtectedShell>
      <DocumentCenterPage />
    </ProtectedShell>
  );
}
