import type { NotionInsight } from '@/types';

async function notionPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN!}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 300 },
  });
  return res.json() as Promise<T>;
}

export async function getUnprocessedInsights(): Promise<NotionInsight[]> {
  const data = await notionPost<{
    results: Array<{
      id: string;
      created_time: string;
      properties: {
        Conversation?: { title?: Array<{ plain_text: string }> };
        Summary?: { rich_text: Array<{ plain_text: string }> };
      };
    }>;
  }>(`/databases/${process.env.NOTION_TRANSCRIPTS_DB_ID!}/query`, {
    filter: { property: 'Summary', rich_text: { is_empty: true } },
    page_size: 50,
  });

  return (data.results ?? []).map((page) => ({
    id: page.id,
    title: page.properties.Conversation?.title?.[0]?.plain_text ?? '(kein Titel)',
    createdAt: page.created_time,
    processed: false,
  }));
}

export async function countUnprocessedInsights(): Promise<number> {
  const insights = await getUnprocessedInsights();
  return insights.length;
}
