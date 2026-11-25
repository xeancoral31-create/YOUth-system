import { ProtectedShell } from '@/components/ProtectedShell';
import { InventoryPage } from '@/views/InventoryPage';

export default function Page() {
  return (
    <ProtectedShell>
      <InventoryPage />
    </ProtectedShell>
  );
}
