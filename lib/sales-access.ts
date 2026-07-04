import { LEON_MEMBER_ID } from '@/lib/agent-access';

export const PAUL_MEMBER_ID = '24d43f6d-4a7e-458b-a119-84ecb8e6616f';

export function salesOsEnabledForMember(memberId: string | null | undefined): boolean {
  return memberId === PAUL_MEMBER_ID || memberId === LEON_MEMBER_ID;
}
