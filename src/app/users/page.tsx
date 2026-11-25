import { ProtectedShell } from '@/components/ProtectedShell';
import { UsersPage } from '@/views/UsersPage';

export default function Page() {
  return (
    <ProtectedShell>
      <UsersPage />
    </ProtectedShell>
  );
}
