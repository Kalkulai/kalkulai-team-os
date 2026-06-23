'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { imageFilesFromClipboardItems, imageFilesFromFileList } from '@/lib/task-image-selection';

interface Preview {
  file: File;
  url: string;
}

export function TaskImagePicker({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo<Preview[]>(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  function addFiles(selected: FileList | File[] | null) {
    const images = imageFilesFromFileList(selected);
    if (images.length > 0) onChange([...files, ...images]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const images = imageFilesFromClipboardItems(event.clipboardData?.items ?? null);
    if (images.length === 0) return;
    event.preventDefault();
    onChange([...files, ...images]);
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div
      className="task-image-picker"
      onPaste={handlePaste}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-label="Task-Bilder hinzufügen oder einfügen"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => addFiles(event.target.files)}
      />
      <button
        type="button"
        className="task-image-add"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Bild anhängen"
      >
        <ImagePlus size={13} aria-hidden />
        <span>Bild</span>
      </button>
      <span className="task-image-paste-hint">Cmd+V</span>
      {previews.length > 0 && (
        <div className="task-image-drafts" aria-label="Ausgewählte Bilder">
          {previews.map((preview, index) => (
            <span key={`${preview.file.name}-${index}`} className="task-image-draft">
              <img src={preview.url} alt={preview.file.name} />
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={disabled}
                aria-label={`${preview.file.name} entfernen`}
                title="Entfernen"
              >
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
