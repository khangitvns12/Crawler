import { NextResponse } from 'next/server';
import { validateFirestoreConnection } from '@/lib/firebase';
import { serverStorage } from '@/lib/server-storage';
import firebaseConfig from '@/firebase-applet-config.json';

export async function GET() {
  try {
    const isConnected = await validateFirestoreConnection();
    const novels = serverStorage.getAllNovels();
    return NextResponse.json({
      success: true,
      connected: isConnected,
      projectId: firebaseConfig.projectId,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
      novelsCount: novels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      connected: false,
      error: msg,
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    await serverStorage.hydrateFromFirestore();
    const novels = serverStorage.getAllNovels();
    return NextResponse.json({
      success: true,
      message: 'Đã đồng bộ dữ liệu từ Firebase Cloud Firestore thành công!',
      count: novels.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
