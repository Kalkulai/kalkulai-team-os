import { isFelixMemberId } from '@/lib/agent-access';

/**
 * "Build 1"-Backlog: neu angelegte Projekt-Steps werden geparkt statt sofort
 * im Kanban-Board zu erscheinen. Aktuell nur fuer Felix aktiv.
 */
export function backlogEnabledForMember(memberId: string | null | undefined): boolean {
  return isFelixMemberId(memberId);
}

/** Default-Status fuer neu angelegte Steps. 'backlog' wenn Feature aktiv, sonst null. */
export function defaultStepStatus(
  memberId: string | null | undefined,
): 'backlog' | null {
  return backlogEnabledForMember(memberId) ? 'backlog' : null;
}
