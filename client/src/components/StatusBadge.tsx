export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    New: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Good: 'bg-blue-50 text-blue-700 border-blue-200',
    'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
    Fair: 'bg-amber-50 text-amber-700 border-amber-200',
    Draft: 'bg-slate-100 text-slate-700 border-slate-200',
    Inactive: 'bg-slate-100 text-slate-600 border-slate-200',
    'Needs Repair': 'bg-orange-50 text-orange-700 border-orange-200',
    Damaged: 'bg-red-50 text-red-700 border-red-200',
    Condemned: 'bg-red-100 text-red-800 border-red-300',
    Missing: 'bg-red-100 text-red-800 border-red-300',
  };

  const cls = styles[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${cls}`}>
      {status}
    </span>
  );
}
