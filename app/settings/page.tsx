'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TeamMember } from '@/types';

export default function SettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [tasksTarget, setTasksTarget] = useState(5);
  const [callsTarget, setCallsTarget] = useState(10);
  const [bugsTarget, setBugsTarget] = useState(3);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((data: TeamMember[]) => {
        setMembers(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError('Teammitglieder konnten nicht geladen werden'));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/kpi/set-target?userId=${selectedId}`)
      .then((r) => r.json())
      .then((t: { tasks_target: number; calls_target: number; bugs_target: number }) => {
        setTasksTarget(t.tasks_target);
        setCallsTarget(t.calls_target);
        setBugsTarget(t.bugs_target);
      })
      .catch(() => {});
  }, [selectedId]);

  const selectedMember = members.find((m) => m.id === selectedId);

  async function handleSave() {
    if (!selectedId) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/kpi/set-target', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({
          userId: selectedId,
          tasks_target: tasksTarget,
          calls_target: callsTarget,
          bugs_target: bugsTarget,
        }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  function handleNumberInput(setter: (n: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (!Number.isNaN(n)) setter(n);
    };
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <Card>
        <CardHeader>
          <CardTitle>KPI-Ziele diese Woche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="member-select">Person</Label>
            <Select
              value={selectedId}
              onValueChange={(v) => { if (v !== null) setSelectedId(v); }}
              disabled={members.length === 0}
            >
              <SelectTrigger id="member-select">
                <SelectValue
                  placeholder={
                    members.length === 0 ? 'Lade Teammitglieder…' : 'Person auswählen…'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="tasks-target" className="flex-1">
              Tasks / Features
            </Label>
            <Input
              id="tasks-target"
              type="number"
              min={0}
              value={tasksTarget}
              onChange={handleNumberInput(setTasksTarget)}
              className="w-24"
            />
          </div>

          {selectedMember?.role === 'sales' && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="calls-target" className="flex-1">
                Sales Calls
              </Label>
              <Input
                id="calls-target"
                type="number"
                min={0}
                value={callsTarget}
                onChange={handleNumberInput(setCallsTarget)}
                className="w-24"
              />
            </div>
          )}

          {selectedMember?.role === 'dev' && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="bugs-target" className="flex-1">
                Bugs gefixt
              </Label>
              <Input
                id="bugs-target"
                type="number"
                min={0}
                value={bugsTarget}
                onChange={handleNumberInput(setBugsTarget)}
                className="w-24"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button
            onClick={handleSave}
            className="w-full"
            disabled={saving || !selectedId}
          >
            {saving ? 'Wird gespeichert…' : saved ? 'Gespeichert ✓' : 'Speichern'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedMember ? (
            <>
              <p className="text-sm text-muted-foreground">
                {selectedMember.google_calendar_email
                  ? `Verbunden mit ${selectedMember.google_calendar_email}`
                  : 'Noch nicht verbunden — Briefing nutzt Fallback-Kalender.'}
              </p>
              <a
                href={`/api/oauth/google/start?userId=${selectedMember.id}`}
                className="inline-block"
              >
                <Button variant="secondary" type="button">
                  {selectedMember.google_calendar_email
                    ? 'Anderen Account verbinden'
                    : 'Mit Google Calendar verbinden'}
                </Button>
              </a>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Person auswählen, um Calendar zu verbinden.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
