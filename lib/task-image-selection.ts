function isImageFile(file: File | null | undefined): file is File {
  return !!file && file.type.startsWith('image/');
}

export function imageFilesFromFileList(files: FileList | File[] | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(isImageFile);
}

export function imageFilesFromClipboardItems(items: DataTransferItemList | null): File[] {
  if (!items) return [];

  return Array.from({ length: items.length }, (_, index) => items[index] ?? null)
    .filter((item): item is DataTransferItem => item?.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(isImageFile);
}
