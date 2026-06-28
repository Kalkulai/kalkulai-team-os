import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { buildGoogleAuth } from '@/lib/google-sheets';

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadDataToBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'string') {
    return Buffer.from(data);
  }
  if (data instanceof Readable) {
    return streamToBuffer(data);
  }
  throw new Error('Drive-Datei konnte nicht als Buffer gelesen werden');
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const auth = buildGoogleAuth(DRIVE_READONLY_SCOPE);
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    {
      fileId,
      alt: 'media',
    },
    { responseType: 'arraybuffer' },
  );

  return downloadDataToBuffer(res.data);
}
