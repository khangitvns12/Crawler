import { NextRequest, NextResponse } from 'next/server';
import { serverStorage } from '@/lib/server-storage';
import { generateOpdsFeed } from '@/lib/opds-generator';

export async function GET(req: NextRequest) {
  try {
    const { origin } = new URL(req.url);
    const novels = serverStorage.getAllNovels();
    const opdsXml = generateOpdsFeed(novels, origin);

    return new NextResponse(opdsXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/atom+xml;profile=opds-catalog;kind=acquisition;charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new NextResponse(`<error>${msg}</error>`, {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}
