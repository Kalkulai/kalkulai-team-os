'use client';
import { Suspense } from 'react';
import { useActiveMember } from '@/lib/active-member';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function Inner() {
  const { members, activeMember, setActive } = useActiveMember();
  if (members.length === 0) {
    return (
      <span className="hidden text-xs text-muted-foreground sm:inline">Lade…</span>
    );
  }
  return (
    <Select
      value={activeMember?.id ?? ''}
      onValueChange={(v) => v && setActive(v)}
    >
      <SelectTrigger className="h-8 min-h-0 w-32 text-xs sm:w-40">
        <SelectValue placeholder="Person…">
          {activeMember?.name ?? 'Person…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
            <span className="ml-2 text-[11px] text-muted-foreground">({m.role})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GlobalMemberSwitcher() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
