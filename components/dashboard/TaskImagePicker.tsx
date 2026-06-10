'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

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

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    const images = Array.from(selected).filter((file) => file.type.startsWith('image/'));
    if (images.length > 0) onChange([...files, ...images]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="task-image-picker">
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
