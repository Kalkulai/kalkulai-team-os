export const LEON_MEMBER_ID = 'bd695d11-0632-4a0a-b1d0-db43acf46a68';

export function isLeonMemberId(memberId: string | null | undefined): boolean {
  return memberId === LEON_MEMBER_ID;
}
