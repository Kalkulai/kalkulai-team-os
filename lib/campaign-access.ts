import { isLeonMemberId } from '@/lib/agent-access';

export function campaignViewEnabledForMember(memberId: string | null | undefined): boolean {
  return isLeonMemberId(memberId);
}
