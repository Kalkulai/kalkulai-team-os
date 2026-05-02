'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  const [tasksTarget, setTasksTarget] = useState(6);
  const [callsTarget, setCallsTarget] = useState(10);
  const [bugsTarget, setBugsTarget] = useState(3);
  const [userId, setUserId] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!userId.trim()) { setError('User-ID ist erforderlich'); return; }
    try {
      const res = await fetch('/api/kpi/set-target', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ userId, tasks_target: tasksTarget, calls_target: callsTarget, bugs_target: bugsTarget }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <Card>
        <CardHeader><CardTitle>KPI-Ziele diese Woche</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>User-ID (aus Supabase team_members.id)</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid..." />
          </div>
          {[
            { label: 'Tasks / Features', value: tasksTarget, set: setTasksTarget },
            { label: 'Sales Calls', value: callsTarget, set: setCallsTarget },
            { label: 'Bugs gefixt', value: bugsTarget, set: setBugsTarget },
          ].map(({ label, value, set }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <Label className="flex-1">{label}</Label>
              <Input
                type="number" min={0} value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="w-24"
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleSave} className="w-full" disabled={!userId.trim()}>
            {saved ? 'Gespeichert ✓' : 'Speichern'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
