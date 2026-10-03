/**
 * Utility for safe HTTP requests and response parsing.
 * Completely eliminates "SyntaxError: Unexpected token '<', '<!DOCTYPE ...' is not valid JSON"
 * when APIs return HTML error pages (e.g. 404, 500, 502, 504 from Nginx or Next.js).
 */

export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  rawText?: string;
}

/**
 * Safely parse a fetch Response object without throwing SyntaxError on HTML or non-JSON payloads.
 */
export async function safeResponseJson<T = any>(res: Response): Promise<SafeJsonResult<T>> {
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';

  try {
    const rawText = await res.text();
    const trimmed = rawText.trim();

    // Check if response is clearly an HTML document or error page
    if (trimmed.startsWith('<') || contentType.includes('text/html')) {
      // Try to extract title from HTML for a readable error message
      const titleMatch = trimmed.match(/<title>([^<]*)<\/title>/i);
      const htmlTitle = titleMatch ? titleMatch[1].trim() : '';

      return {
        ok: false,
        status,
        rawText,
        error: htmlTitle
          ? `Lỗi máy chủ (${status}): ${htmlTitle}`
          : `Máy chủ phản hồi trang web HTML (mã ${status}) thay vì dữ liệu JSON`,
      };
    }

    if (!trimmed) {
      return {
        ok: res.ok,
        status,
        data: undefined,
        error: !res.ok ? `Máy chủ phản hồi rỗng (mã ${status})` : undefined,
      };
    }

    // Attempt to parse JSON safely
    try {
      const parsed = JSON.parse(trimmed) as T;
      const parsedAny = parsed as any;
      const apiError = parsedAny?.error || parsedAny?.message;

      return {
        ok: res.ok,
        status,
        data: parsed,
        error: !res.ok ? (apiError ? String(apiError) : `Lỗi mã ${status}`) : undefined,
      };
    } catch {
      return {
        ok: false,
        status,
        rawText,
        error: `Phản hồi từ máy chủ không phải định dạng JSON hợp lệ (mã ${status})`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status,
      error: `Lỗi kết nối hoặc đọc phản hồi: ${msg}`,
    };
  }
}

/**
 * Drop-in wrapper around fetch that safely catches network exceptions and JSON parsing errors.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeJsonResult<T>> {
  try {
    const res = await fetch(input, init);
    return await safeResponseJson<T>(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      error: `Lỗi mạng khi kết nối máy chủ: ${msg}`,
    };
  }
}
