export function SyncPill({ label = 'Sync aktiv' }: { label?: string }) {
  return (
    <span className="hidden items-center gap-2 text-[12px] text-[var(--ink-2)] sm:inline-flex">
      <span className="relative size-[7px] flex-none rounded-full bg-[var(--ok)] shadow-[0_0_12px_var(--ok)]" />
      {label}
    </span>
  );
}
