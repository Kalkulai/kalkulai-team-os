'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TeamMember } from '@/types';

const ACTIVE_USER_KEY = 'team-os-active-user';

export function useActiveMember() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/members')
      .then((r) => r.json())
      .then((data: TeamMember[]) => {
        if (cancelled || data.length === 0) return;
        setMembers(data);
        const ids = new Set(data.map((m) => m.id));
        const fromUrl = params.get('member') || params.get('userId');
        const fromStorage =
          typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_USER_KEY) : null;
        const next =
          (fromUrl && ids.has(fromUrl) && fromUrl) ||
          (fromStorage && ids.has(fromStorage) && fromStorage) ||
          data[0].id;
        setActiveId(next);
        if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_USER_KEY, next);
        if (!params.get('member')) {
          const sp = new URLSearchParams(params.toString());
          sp.delete('userId');
          sp.set('member', next);
          router.replace(`${pathname}?${sp.toString()}`);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, params, router]);

  const setActive = (id: string) => {
    setActiveId(id);
    if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_USER_KEY, id);
    const sp = new URLSearchParams(params.toString());
    sp.set('member', id);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const activeMember = members.find((m) => m.id === activeId) ?? null;

  return { members, activeId, activeMember, setActive };
}
