import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Dữ liệu yêu cầu không phải định dạng JSON hợp lệ' },
        { status: 400 }
      );
    }

    const { apiKey, modelName = 'gemini-3.8-flash' } = body as { apiKey: string; modelName?: string };

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return NextResponse.json(
        { success: false, valid: false, error: 'API Key không hợp lệ hoặc quá ngắn' },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();

    try {
      const client = new GoogleGenAI({
        apiKey: trimmedKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Quick test ping with minimal token cost
      const response = await client.models.generateContent({
        model: modelName,
        contents: 'Hi',
        config: {
          maxOutputTokens: 5,
        },
      });

      if (response && response.text !== undefined) {
        return NextResponse.json({
          success: true,
          valid: true,
          message: 'API Key hợp lệ và hoạt động tốt!',
          model: modelName,
        });
      }

      return NextResponse.json({
        success: true,
        valid: true,
        message: 'API Key kết nối thành công!',
      });
    } catch (apiError: unknown) {
      const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);

      const isQuota = /429|RESOURCE_EXHAUSTED|quota|rate limit|Too Many Requests/i.test(errorMsg);
      const isInvalid = /API_KEY_INVALID|INVALID_ARGUMENT|unauthorized|400|403|Forbidden|Bad Request/i.test(errorMsg);

      return NextResponse.json({
        success: false,
        valid: false,
        isQuota,
        isInvalid,
        error: isQuota
          ? 'API Key đã vượt quá hạn mức miễn phí (Rate Limit / Quota Exceeded 429).'
          : isInvalid
          ? 'API Key không hợp lệ hoặc đã bị vô hiệu hóa bởi Google Cloud.'
          : `Lỗi kết nối Gemini: ${errorMsg}`,
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
