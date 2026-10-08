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

    const { apiKey, modelName = 'gemini-3.1-flash-lite' } = body as { apiKey: string; modelName?: string };

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

      const candidateTestModels = [
        modelName,
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

      let lastApiError: unknown = null;
      let activeModel: string | null = null;

      for (let i = 0; i < candidateTestModels.length; i++) {
        const testModel = candidateTestModels[i];
        try {
          const response = await client.models.generateContent({
            model: testModel,
            contents: 'Hi',
            config: {
              maxOutputTokens: 5,
            },
          });

          if (response && response.text !== undefined) {
            activeModel = testModel;
            break;
          }
        } catch (mErr: unknown) {
          lastApiError = mErr;
          const msg = mErr instanceof Error ? mErr.message : String(mErr);
          const isBusyOrNotFound = /404|NOT_FOUND|503|UNAVAILABLE|high demand|overloaded/i.test(msg);
          if (isBusyOrNotFound && i < candidateTestModels.length - 1) {
            continue;
          }
          break;
        }
      }

      if (activeModel) {
        return NextResponse.json({
          success: true,
          valid: true,
          message: `API Key hợp lệ và hoạt động tốt (đã xác thực qua ${activeModel})!`,
          model: activeModel,
        });
      }

      throw lastApiError || new Error('Không thể xác thực API Key với các mô hình Gemini.');
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
