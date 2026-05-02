import { NextResponse } from 'next/server';
import { getAllMembers } from '@/lib/supabase';

export async function GET() {
  const members = await getAllMembers();
  return NextResponse.json(members);
}
