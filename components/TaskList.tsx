'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { LinearIssue } from '@/types';

const PRIORITY_LABEL: Record<number, string> = { 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };
const PRIORITY_VARIANT: Record<number, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  1: 'destructive', 2: 'default', 3: 'secondary', 4: 'outline',
};

export function TaskList({ tasks, userId }: { tasks: LinearIssue[]; userId: string }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCheck(id: string) {
    setDone((prev) => new Set(prev).add(id));
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ issueId: id, userId }),
      });
      if (!res.ok) throw new Error('Fehler beim Abschließen');
    } catch {
      setDone((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ title, userId }),
      });
      if (!res.ok) throw new Error('Linear-API antwortete mit ' + res.status);
      setDraft('');
      router.refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Neuen Task hinzufügen…"
          disabled={creating}
          className="min-h-[44px] flex-1 rounded-lg border border-foreground/[0.08] bg-card/60 px-3 text-sm backdrop-blur-md outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/[0.2] focus:bg-card/80 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={creating || !draft.trim()}
          className="min-h-[44px] shrink-0 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          {creating ? '…' : '+'}
        </button>
      </form>
      {createError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{createError}</p>
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine offenen Tasks — leg den ersten oben an.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {tasks.map((t) => {
            const isDone = done.has(t.id);
            return (
              <li key={t.id}>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06]">
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() => handleCheck(t.id)}
                    className="size-5"
                  />
                  <span className={`flex-1 text-sm leading-snug ${isDone ? 'text-muted-foreground line-through' : ''}`}>
                    <span className="mr-1 text-xs tabular-nums text-muted-foreground">{t.identifier}</span>
                    {t.title}
                  </span>
                  {t.priority > 0 && (
                    <Badge variant={PRIORITY_VARIANT[t.priority]} className="shrink-0 text-[10px]">
                      {PRIORITY_LABEL[t.priority]}
                    </Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
