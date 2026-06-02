'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TeamMember } from '@/types';

export const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';
const LEGACY_LS_KEY = 'team-os-active-user';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function useActiveMember(options?: { details?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch(options?.details ? '/api/team-members' : '/api/members')
      .then((r) => r.json())
      .then((data: TeamMember[]) => {
        if (cancelled || data.length === 0) return;
        setMembers(data);
        const ids = new Set(data.map((m) => m.id));
        const fromUrl = params.get('member') || params.get('userId');
        const fromCookie = readCookie(ACTIVE_MEMBER_COOKIE);
        const fromStorage =
          typeof window !== 'undefined' ? window.localStorage.getItem(LEGACY_LS_KEY) : null;
        const next =
          (fromUrl && ids.has(fromUrl) && fromUrl) ||
          (fromCookie && ids.has(fromCookie) && fromCookie) ||
          (fromStorage && ids.has(fromStorage) && fromStorage) ||
          data[0].id;
        setActiveId(next);
        writeCookie(ACTIVE_MEMBER_COOKIE, next);
        if (typeof window !== 'undefined') window.localStorage.setItem(LEGACY_LS_KEY, next);
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
  }, [options?.details, pathname, params, router]);

  const setActive = (id: string) => {
    setActiveId(id);
    writeCookie(ACTIVE_MEMBER_COOKIE, id);
    if (typeof window !== 'undefined') window.localStorage.setItem(LEGACY_LS_KEY, id);
    const sp = new URLSearchParams(params.toString());
    sp.set('member', id);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const activeMember = members.find((m) => m.id === activeId) ?? null;

  return { members, activeId, activeMember, setActive };
}
