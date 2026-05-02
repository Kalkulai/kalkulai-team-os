import { Progress } from '@/components/ui/progress';

export function KpiBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
  const colorClass = pct >= 100 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={colorClass}>{actual}/{target}</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
