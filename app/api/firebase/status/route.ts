import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    connected: false,
    message: 'Firestore has been decommissioned. Supabase is the primary authoritative database.',
    timestamp: new Date().toISOString(),
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Firestore has been decommissioned. Supabase is the primary authoritative database.',
  });
}

