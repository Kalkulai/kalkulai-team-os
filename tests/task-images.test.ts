import { describe, expect, it } from 'vitest';
import { extractImageUrls } from '@/lib/task-images';

describe('extractImageUrls', () => {
  it('extracts multiple Linear upload markdown images in order', () => {
    const description = [
      'Context',
      '![first.png](https://uploads.linear.app/abc/first.png)',
      'middle',
      '![second.png](https://uploads.linear.app/def/second.png)',
    ].join('\n');

    expect(extractImageUrls(description)).toEqual([
      'https://uploads.linear.app/abc/first.png',
      'https://uploads.linear.app/def/second.png',
    ]);
  });

  it('ignores non-Linear image URLs and handles footer comments', () => {
    const description = [
      '![external](https://example.com/image.png)',
      '![linear](https://uploads.linear.app/team/image.jpg)',
      '<!-- team-task:{"groupId":"g1","assignees":["u1"]} -->',
    ].join('\n\n');

    expect(extractImageUrls(description)).toEqual([
      'https://uploads.linear.app/team/image.jpg',
    ]);
  });

  it('returns an empty array for null or empty descriptions', () => {
    expect(extractImageUrls(null)).toEqual([]);
    expect(extractImageUrls('')).toEqual([]);
  });
});
