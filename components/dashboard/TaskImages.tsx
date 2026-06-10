'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { uploadTaskImages } from '@/lib/task-images-client';
import { TaskImagePicker } from './TaskImagePicker';

function proxiedImageSrc(url: string): string {
  return `/api/tasks/image?url=${encodeURIComponent(url)}`;
}

export function TaskImages({
  issueId,
  imageUrls,
}: {
  issueId: string;
  imageUrls: string[];
}) {
  const router = useRouter();
  const [urls, setUrls] = useState(imageUrls);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadSelected() {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadTaskImages(issueId, files);
      setUrls((prev) => [...prev, ...uploaded]);
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bild-Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  }

  if (urls.length === 0 && files.length === 0) {
    return (
      <div className="task-images">
        <TaskImagePicker files={files} onChange={setFiles} disabled={uploading} />
        {files.length > 0 && (
          <button type="button" className="task-image-upload" onClick={uploadSelected}>
            <ImagePlus size={13} aria-hidden />
            Hochladen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="task-images">
      {urls.length > 0 && (
        <div className="task-image-grid" aria-label="Task-Bilder">
          {urls.map((url) => (
            <a key={url} href={proxiedImageSrc(url)} target="_blank" rel="noreferrer" className="task-image-thumb">
              <img src={proxiedImageSrc(url)} alt="Task-Anhang" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <div className="task-image-upload-row">
        <TaskImagePicker files={files} onChange={setFiles} disabled={uploading} />
        {files.length > 0 && (
          <button
            type="button"
            className="task-image-upload"
            onClick={uploadSelected}
            disabled={uploading}
          >
            <ImagePlus size={13} aria-hidden />
            {uploading ? 'Lädt …' : 'Hochladen'}
          </button>
        )}
      </div>
      {error && <p className="task-image-error">{error}</p>}
    </div>
  );
}
