'use client';
import { useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TeamMember } from '@/types';

export function MemberSwitcher({ members, currentId }: { members: TeamMember[]; currentId: string }) {
  const router = useRouter();

  return (
    <Select value={currentId} onValueChange={(id) => router.push(`/dashboard?member=${id}`)}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Person…">
          {members.find((m) => m.id === currentId)?.name ?? 'Person…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
