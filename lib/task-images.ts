export const LINEAR_UPLOADS_PREFIX = 'https://uploads.linear.app/';

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function extractImageUrls(description: string | null | undefined): string[] {
  if (!description) return [];

  const urls: string[] = [];
  for (const match of description.matchAll(MARKDOWN_IMAGE_RE)) {
    const url = match[1];
    if (url.startsWith(LINEAR_UPLOADS_PREFIX)) urls.push(url);
  }
  return urls;
}
