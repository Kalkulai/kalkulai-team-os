import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

describe('task image UI wiring', () => {
  it('saves pending task edit images through the modal save action', () => {
    const modal = source('components/dashboard/TaskEditModal.tsx');

    expect(modal).toContain("import { uploadTaskImages } from '@/lib/task-images-client';");
    expect(modal).toContain('const [imageFiles, setImageFiles]');
    expect(modal).toContain('await uploadTaskImages(task.id, imageFiles)');
    expect(modal).toContain('onSaved({ title: t, dueDate: due, meta, priority: quadrantToPriority(meta.important, meta.urgent), imageUrls: nextImageUrls })');
  });

  it('renders task images directly on Kanban cards', () => {
    const card = source('components/dashboard/KanbanCard.tsx');

    expect(card).toContain('const imageUrls = task.imageUrls ?? [];');
    expect(card).toContain('kanban-card-image-strip');
    expect(card).toContain('proxiedTaskImageSrc(url)');
  });
});
