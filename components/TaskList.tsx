'use client';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { LinearIssue } from '@/types';

const PRIORITY_LABEL: Record<number, string> = { 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };
const PRIORITY_VARIANT: Record<number, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  1: 'destructive', 2: 'default', 3: 'secondary', 4: 'outline',
};

export function TaskList({ tasks, userId }: { tasks: LinearIssue[]; userId: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());

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

  if (tasks.length === 0)
    return <p className="text-sm text-muted-foreground">Keine offenen Tasks — gut gemacht!</p>;

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
          <Checkbox checked={done.has(t.id)} onCheckedChange={() => handleCheck(t.id)} />
          <span className={`flex-1 text-sm ${done.has(t.id) ? 'line-through text-muted-foreground' : ''}`}>
            <span className="text-muted-foreground mr-1 text-xs">{t.identifier}</span>
            {t.title}
          </span>
          {t.priority > 0 && (
            <Badge variant={PRIORITY_VARIANT[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
