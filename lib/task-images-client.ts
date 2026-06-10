export async function uploadTaskImages(issueId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];

  const form = new FormData();
  files.forEach((file) => form.append('images', file));

  const res = await fetch(`/api/tasks/${encodeURIComponent(issueId)}/images`, {
    method: 'POST',
    body: form,
  });
  const data = (await res.json().catch(() => null)) as { imageUrls?: string[]; error?: string } | null;
  if (!res.ok) {
    throw new Error(data?.error ?? `Bild-Upload fehlgeschlagen (HTTP ${res.status})`);
  }
  return data?.imageUrls ?? [];
}
