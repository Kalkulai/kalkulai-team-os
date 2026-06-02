import { cookies } from 'next/headers';
import { AgentCockpit } from '@/components/agents/AgentCockpit';
import { isLeonMemberId, LEON_MEMBER_ID } from '@/lib/agent-access';
import { buildDailyBriefing } from '@/lib/aggregator';
import { listLiveAgentSessionsForUser } from '@/lib/agent-sessions';
import { currentWeekStart, getAllMembers } from '@/lib/supabase';
import { listUserKpis } from '@/lib/kpis';
import { buildAgentProjectWorkstreams, buildAgentWorkstreams } from '@/lib/agent-workstreams';

const ACTIVE_MEMBER_COOKIE = 'kalkulai-active-member';

export const dynamic = 'force-dynamic';

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const [members, params, cookieStore] = await Promise.all([
    getAllMembers(),
    searchParams,
    cookies(),
  ]);

  if (!members.length) {
    return <AccessPanel title="Keine Mitglieder" body="Team-OS hat noch keine Teammitglieder geladen." />;
  }

  const fromCookie = cookieStore.get(ACTIVE_MEMBER_COOKIE)?.value;
  const activeMember =
    members.find((m) => m.id === params.member) ??
    members.find((m) => m.id === fromCookie) ??
    members[0];

  if (!isLeonMemberId(activeMember.id)) {
    return (
      <AccessPanel
        title="Agent Cockpit ist im Test"
        body="Diese Ansicht ist aktuell nur im Leon-Profil sichtbar. Wechsle oben im Profilmenü zu Leon, um die lokale Cockpit-Testversion zu öffnen."
      />
    );
  }

  const [briefing, kpis, sessions] = await Promise.all([
    buildDailyBriefing(activeMember),
    listUserKpis(activeMember.id, currentWeekStart()),
    listLiveAgentSessionsForUser(LEON_MEMBER_ID, 60),
  ]);

  const projects = kpis.filter((k) => k.type === 'project');
  const steps = kpis.filter((k) => k.type === 'step');
  const workstreams = buildAgentWorkstreams({
    issues: briefing.tasks,
    steps,
    projects,
    sessions,
  });
  const projectWorkstreams = buildAgentProjectWorkstreams({
    projects,
    steps,
    sessions,
  });

  return (
    <AgentCockpit
      memberId={activeMember.id}
      workstreams={workstreams}
      projectWorkstreams={projectWorkstreams}
    />
  );
}

function AccessPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="glass card-rise mx-auto mt-8 max-w-[760px] overflow-hidden p-7">
      <div className="relative z-[1]">
        <p className="ovr mb-2">Agents</p>
        <h1 className="text-[24px] font-semibold leading-tight text-[var(--ink-1)]">{title}</h1>
        <p className="mt-3 max-w-[580px] text-[14px] leading-6 text-[var(--ink-3)]">{body}</p>
      </div>
    </section>
  );
}
