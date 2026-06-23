import { describe, expect, it } from 'vitest';
import { imageFilesFromClipboardItems, imageFilesFromFileList } from '@/lib/task-image-selection';

function makeFile(name: string, type: string): File {
  return new File(['content'], name, { type });
}

function clipboardItems(files: Array<File | null>, kinds?: string[]): DataTransferItemList {
  const items = files.map((file, index) => ({
    kind: kinds?.[index] ?? 'file',
    type: file?.type ?? 'text/plain',
    getAsFile: () => file,
  }));
  return Object.assign(items, { item: (index: number) => items[index] ?? null }) as unknown as DataTransferItemList;
}

describe('imageFilesFromFileList', () => {
  it('keeps only image files while preserving order', () => {
    const png = makeFile('first.png', 'image/png');
    const text = makeFile('notes.txt', 'text/plain');
    const jpeg = makeFile('second.jpg', 'image/jpeg');

    expect(imageFilesFromFileList([png, text, jpeg])).toEqual([png, jpeg]);
  });

  it('returns an empty array for null or empty file input', () => {
    expect(imageFilesFromFileList(null)).toEqual([]);
    expect(imageFilesFromFileList([])).toEqual([]);
  });
});

describe('imageFilesFromClipboardItems', () => {
  it('extracts image files from clipboard items in order', () => {
    const png = makeFile('clipboard.png', 'image/png');
    const jpeg = makeFile('clipboard.jpg', 'image/jpeg');
    const text = makeFile('clipboard.txt', 'text/plain');

    expect(imageFilesFromClipboardItems(clipboardItems([png, text, jpeg]))).toEqual([png, jpeg]);
  });

  it('ignores non-file clipboard items and empty file items', () => {
    const png = makeFile('clipboard.png', 'image/png');

    expect(imageFilesFromClipboardItems(clipboardItems([png, null], ['file', 'string']))).toEqual([png]);
  });

  it('returns an empty array for null clipboard items', () => {
    expect(imageFilesFromClipboardItems(null)).toEqual([]);
  });
});
