import { NextResponse } from 'next/server';
import { getLocationTree } from '@/lib/db';

export async function GET() {
  const locations = getLocationTree();
  return NextResponse.json(locations);
}
