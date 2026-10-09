import { GoogleGenAI } from '@google/genai';
import { TranslationGenre } from '@/types/novel';
import { cleanChapterTitle } from './chapter-utils';

/**
 * Create a GoogleGenAI client with a specific API key or environment key
 */
export function createGeminiClient(apiKey?: string): GoogleGenAI {
  const effectiveKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!effectiveKey) {
    throw new Error(
      'Chưa cấu hình Gemini API Key. Vui lòng thêm ít nhất một API Key trong phần "Gemini API Keys" trên thanh công cụ hoặc cấu hình biến môi trường GEMINI_API_KEY.'
    );
  }
  return new GoogleGenAI({
    apiKey: effectiveKey,
  });
}

// Default client using environment variable (backwards compatibility)
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'AIzaSyPlaceholderKeyForBuild',
});

export const DEFAULT_FLASH_MODEL = 'gemini-3.1-flash-lite';

export const FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-pro-preview',
];

/**
 * Normalizes deprecated model names to modern equivalents
 */
function normalizeModelName(rawModel?: string): string {
  if (!rawModel || !rawModel.trim()) return DEFAULT_FLASH_MODEL;
  const m = rawModel.trim();
  // Deprecated models in Google GenAI SDK
  if (/gemini-(1\.5|2\.0|2\.5)/i.test(m)) {
    return DEFAULT_FLASH_MODEL;
  }
  return m;
}

/**
 * Executes a generateContent call with automatic model failover if the primary model is busy (503), deprecated, or missing
 */
export async function generateContentWithModelFallback(
  client: GoogleGenAI,
  preferredModel: string | undefined,
  requestConfig: {
    contents: string;
    config?: {
      systemInstruction?: string;
      temperature?: number;
      maxOutputTokens?: number;
    };
  }
): Promise<{ text: string; modelUsed: string }> {
  const candidateModels: string[] = [];
  const normalizedPreferred = normalizeModelName(preferredModel);

  if (normalizedPreferred) {
    candidateModels.push(normalizedPreferred);
  }

  for (const m of FALLBACK_MODELS) {
    if (!candidateModels.includes(m)) {
      candidateModels.push(m);
    }
  }

  let lastError: Error | null = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const response = await client.models.generateContent({
        model,
        contents: requestConfig.contents,
        config: requestConfig.config,
      });

      return {
        text: response.text || '',
        modelUsed: model,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(errorMsg);

      const isModelError = /404|NOT_FOUND|no longer available|503|UNAVAILABLE|high demand|overloaded|spikes in demand|429|RESOURCE_EXHAUSTED|quota/i.test(errorMsg);
      if (isModelError && i < candidateModels.length - 1) {
        console.warn(`[Gemini Model Fallback] Model "${model}" gặp sự cố (${errorMsg.slice(0, 100)}), tự động chuyển sang "${candidateModels[i + 1]}"...`);
        continue;
      }

      // If last candidate or unrecoverable error, rethrow so executeWithKeyRotation can handle
      throw lastError;
    }
  }

  throw lastError || new Error('Không thể tạo nội dung từ các mô hình Gemini khả dụng.');
}

/**
 * Execute a task with automatic API key rotation and failover on 429/Quota limits or unavailable models
 */
export async function executeWithKeyRotation<T>(
  apiKeys: string[] | undefined,
  singleKey: string | undefined,
  taskFn: (client: GoogleGenAI, keyUsed: string) => Promise<T>
): Promise<T> {
  const candidateKeys: string[] = [];

  if (apiKeys && Array.isArray(apiKeys)) {
    for (const k of apiKeys) {
      if (k && typeof k === 'string' && k.trim()) {
        candidateKeys.push(k.trim());
      }
    }
  }

  if (candidateKeys.length === 0 && singleKey && singleKey.trim()) {
    candidateKeys.push(singleKey.trim());
  }

  // Also append environment variable as final fallback if not already in pool
  if (process.env.GEMINI_API_KEY && !candidateKeys.includes(process.env.GEMINI_API_KEY.trim())) {
    candidateKeys.push(process.env.GEMINI_API_KEY.trim());
  }

  if (candidateKeys.length === 0) {
    throw new Error(
      'Không tìm thấy API Key nào khả dụng. Vui lòng vào nút "Gemini API Keys" trên giao diện để thêm ít nhất một key.'
    );
  }

  let lastError: Error | null = null;

  for (let idx = 0; idx < candidateKeys.length; idx++) {
    const currentKey = candidateKeys[idx];
    const client = createGeminiClient(currentKey);

    try {
      return await taskFn(client, currentKey);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(errorMsg);

      const isQuotaLimit = /429|RESOURCE_EXHAUSTED|quota|rate limit|Too Many Requests/i.test(errorMsg);
      const isInvalidKey = /API_KEY_INVALID|INVALID_ARGUMENT|unauthorized|401|UNAUTHENTICATED|invalid authentication|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(errorMsg);
      const isUnavailable = /503|UNAVAILABLE|high demand|overloaded/i.test(errorMsg);

      if ((isQuotaLimit || isInvalidKey || isUnavailable) && idx < candidateKeys.length - 1) {
        console.warn(
          `[Gemini Rotation] Key ${idx + 1}/${candidateKeys.length} gặp sự cố (${
            isQuotaLimit ? 'Hết Quota/429' : isUnavailable ? '503 Quá tải' : 'Key Lỗi/401'
          }), tự động chuyển sang Key tiếp theo...`
        );
        continue;
      }

      // If this was the last key and it's an auth or quota error, provide clean guidance
      if (idx === candidateKeys.length - 1) {
        if (isInvalidKey) {
          throw new Error('Gemini API Key không hợp lệ hoặc chưa được cấu hình. Vui lòng nhấn nút "Gemini API Keys" trên thanh công cụ để thêm API Key mới (Key sẽ tự động lưu vào Supabase).');
        }
        if (isQuotaLimit) {
          throw new Error('Các Gemini API Key đều đã đạt giới hạn hạn mức (Quota 429). Bạn có thể thêm thêm key phụ tại nút "Gemini API Keys" để tự động xoay vòng.');
        }
      }
    }
  }

  throw lastError || new Error('Tất cả Gemini API Keys đều thất bại khi thực hiện yêu cầu.');
}

export interface TranslateOptions {
  title?: string;
  content: string;
  sourceLang?: string;
  targetLang?: string;
  genre?: TranslationGenre;
  glossary?: Record<string, string>;
  modelName?: string;
  apiKey?: string;
  apiKeys?: string[];
}

export interface TranslationResult {
  translatedTitle: string;
  translatedContent: string;
  keyUsed?: string;
}

const GENRE_PROMPTS: Record<TranslationGenre, string> = {
  xianxia: `Bạn là dịch giả chuyên nghiệp tiểu thuyết Tiên Hiệp, Kiếm Hiệp, Huyền Huyễn phương Đông.
- Sử dụng chuẩn từ vựng Hán Việt chuẩn mực, lưu loát, hào sảng (ví dụ: Đạo hữu, Trúc Cơ, Kim Đan, Nguyên Anh, Tông môn, Trưởng lão, Pháp bảo, Thần thông, Độ kiếp, Tự bạo, Bản tọa...).
- Giữ vững cấu trúc câu văn gãy gọn, giàu chất kiếm hiệp cổ phong, tuyệt đối tránh dịch thô kiểu Google Translate.`,
  
  modern: `Bạn là dịch giả chuyên nghiệp tiểu thuyết Đô thị, Ngôn tình, Hiện đại, Trinh thám.
- Văn phong tự nhiên, đời thường, giàu cảm xúc, hợp với thị hiếu độc giả hiện đại Việt Nam.
- Đại từ xưng hô linh hoạt, hợp ngữ cảnh (tôi - bạn, anh - em, hắn - gã, cậu - tớ).`,

  lightnovel: `Bạn là dịch giả chuyên nghiệp Light Novel Nhật Bản.
- Giữ được phong thái dí dỏm, nội tâm sinh động, đặc trưng của thể loại Light Novel.
- Chuyển ngữ mượt mà các hậu tố xưng hô kính ngữ hoặc giải nghĩa phù hợp (Senpai, Kouhai, Sensei, Ojou-sama...).`,

  webnovel: `Bạn là dịch giả chuyên nghiệp Web Novel Kỳ ảo phương Tây (High Fantasy / Sci-Fi / LitRPG).
- Thuật ngữ ma thuật, tước hiệu quý tộc, thông số hệ thống (Status, Skill, Level) được dịch chuẩn xác, sang trọng.`,

  general: `Bạn là dịch giả văn học giàu kinh nghiệm. Dịch sát nghĩa gốc nhưng văn phong tiếng Việt lưu loát, tự nhiên, văn minh.`,
};

/**
 * Translate a chapter using Gemini API with auto key rotation and model fallback
 */
export async function translateChapter(options: TranslateOptions): Promise<TranslationResult> {
  const {
    title = '',
    content,
    sourceLang = 'Tự động nhận diện',
    targetLang = 'Tiếng Việt',
    genre = 'general',
    glossary = {},
    modelName = DEFAULT_FLASH_MODEL,
    apiKey,
    apiKeys,
  } = options;

  let glossaryInstruction = '';
  const glossaryEntries = Object.entries(glossary);
  if (glossaryEntries.length > 0) {
    glossaryInstruction = `
[BẢNG TỪ ĐIỂN THUẬT NGỮ BẮT BUỘC TUÂN THỦ (Glossary)]:
Khi gặp các từ gốc bên dưới, BẮT BUỘC phải dịch chính xác theo thuật ngữ tương ứng đã chỉ định:
${glossaryEntries.map(([k, v]) => `- "${k}" => "${v}"`).join('\n')}
`;
  }

  const systemInstruction = `Bạn là một dịch giả tiểu thuyết cao cấp, có năng lực dịch thuật văn học xuất sắc từ nhiều ngôn ngữ (Trung Quốc, Nhật Bản, Hàn Quốc, Tiếng Anh) sang ${targetLang}.
${GENRE_PROMPTS[genre] || GENRE_PROMPTS.general}
${glossaryInstruction}

QUY TẮC CỐT LÕI:
1. Luôn dịch cả TIÊU ĐỀ và TOÀN BỘ NỘI DUNG.
2. Giữ nguyên cấu trúc phân đoạn (các đoạn ngắt dòng, xuống hàng tương ứng với bản gốc).
3. Không thêm bớt lời bình, không thêm "Ghi chú của dịch giả" trừ khi bản gốc có.
4. Trả về đúng định dạng yêu cầu để hệ thống trích xuất tự động:
===TITLE_START===
[Tiêu đề chương đã dịch]
===TITLE_END===
===CONTENT_START===
[Toàn bộ nội dung chương đã dịch mượt mà]
===CONTENT_END===`;

  const userPrompt = `Hãy dịch chương truyện sau từ [${sourceLang}] sang [${targetLang}]:

[TIÊU ĐỀ GỐC]: ${title}

[NỘI DUNG GỐC]:
${content}`;

  return executeWithKeyRotation(apiKeys, apiKey, async (client, keyUsed) => {
    try {
      const { text: outputText, modelUsed } = await generateContentWithModelFallback(
        client,
        modelName || DEFAULT_FLASH_MODEL,
        {
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.3,
          },
        }
      );

      // Parse the structured format
      let translatedTitle = cleanChapterTitle(title);
      let translatedContent = outputText;

      const titleMatch = outputText.match(/===TITLE_START===([\s\S]*?)===TITLE_END===/);
      if (titleMatch && titleMatch[1]) {
        translatedTitle = cleanChapterTitle(titleMatch[1].trim());
      }

      const contentMatch = outputText.match(/===CONTENT_START===([\s\S]*?)===CONTENT_END===/);
      if (contentMatch && contentMatch[1]) {
        translatedContent = contentMatch[1].trim();
      } else {
        // If markers were missed by the model, clean output
        translatedContent = outputText
          .replace(/===TITLE_START===[\s\S]*?===TITLE_END===/g, '')
          .replace(/===(CONTENT_START|CONTENT_END)===/g, '')
          .trim();
      }

      return {
        translatedTitle,
        translatedContent,
        keyUsed: `${keyUsed.substring(0, 8)}...${keyUsed.substring(keyUsed.length - 4)} (${modelUsed})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Lỗi dịch thuật Gemini: ${msg}`);
    }
  });
}

export interface NovelMetadataTranslationOptions {
  title: string;
  description?: string;
  author?: string;
  sourceLang?: string;
  targetLang?: string;
  genre?: TranslationGenre;
  glossary?: Record<string, string>;
  modelName?: string;
  apiKey?: string;
  apiKeys?: string[];
}

export interface NovelMetadataTranslationResult {
  translatedTitle: string;
  translatedDescription?: string;
  translatedAuthor?: string;
  keyUsed?: string;
}

/**
 * Translate novel title, author, and description using Gemini API with auto key rotation and model fallback
 */
export async function translateNovelMetadata(
  options: NovelMetadataTranslationOptions
): Promise<NovelMetadataTranslationResult> {
  const {
    title,
    description = '',
    author = '',
    sourceLang = 'Tự động nhận diện',
    targetLang = 'Tiếng Việt',
    genre = 'xianxia',
    glossary = {},
    modelName = DEFAULT_FLASH_MODEL,
    apiKey,
    apiKeys,
  } = options;

  let glossaryInstruction = '';
  const glossaryEntries = Object.entries(glossary);
  if (glossaryEntries.length > 0) {
    glossaryInstruction = `
[BẢNG TỪ ĐIỂN THUẬT NGỮ BẮT BUỘC TUÂN THỦ]:
${glossaryEntries.map(([k, v]) => `- "${k}" => "${v}"`).join('\n')}
`;
  }

  const systemInstruction = `Bạn là một dịch giả tiểu thuyết văn học cao cấp, chuyên dịch tiêu đề tác phẩm, tên tác giả và văn án giới thiệu từ [${sourceLang}] sang [${targetLang}].
${GENRE_PROMPTS[genre] || GENRE_PROMPTS.general}
${glossaryInstruction}

QUY TẮC CỐT LÕI:
1. Dịch TÊN TRUYỆN: Chuyển ngữ chuẩn xác, thanh thoát, cuốn hút độc giả. Với truyện tiếng Trung, dùng âm Hán-Việt chuẩn mực (ví dụ: 万古第一神 -> Vạn Cổ Đệ Nhất Thần, 斗破苍穹 -> Đấu Phá Thương Khung, 剑来 -> Kiếm Lai). Tuyệt đối không dịch thô ngữ nghĩa từng chữ.
2. Dịch TÊN TÁC GIẢ: Dùng âm Hán-Việt nếu là tiếng Trung, hoặc giữ nguyên/phiên âm quốc tế.
3. Dịch MÔ TẢ/VĂN ÁN: Dịch mượt mà, lưu loát, truyền tải trọn vẹn sức hấp dẫn của cốt truyện.
4. Trả về đúng định dạng chuẩn để bóc tách:
===TITLE_START===
[Tên truyện đã dịch sang tiếng Việt]
===TITLE_END===
===AUTHOR_START===
[Tên tác giả đã dịch sang tiếng Việt]
===AUTHOR_END===
===DESC_START===
[Mô tả truyện đã dịch sang tiếng Việt]
===DESC_END===`;

  const userPrompt = `Hãy dịch thông tin bộ truyện sau sang [${targetLang}]:
TÊN TRUYỆN GỐC: ${title}
${author ? `TÁC GIẢ GỐC: ${author}` : ''}
${description ? `MÔ TẢ GỐC:\n${description}` : ''}`;

  return executeWithKeyRotation(apiKeys, apiKey, async (client, keyUsed) => {
    try {
      const { text: outputText, modelUsed } = await generateContentWithModelFallback(
        client,
        modelName || DEFAULT_FLASH_MODEL,
        {
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.3,
          },
        }
      );

      let translatedTitle = title;
      let translatedAuthor = author;
      let translatedDescription = description;

      const titleMatch = outputText.match(/===TITLE_START===([\s\S]*?)===TITLE_END===/);
      if (titleMatch && titleMatch[1]) {
        translatedTitle = titleMatch[1].trim();
      } else {
        const lines = outputText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines[0].length < 200) {
          translatedTitle = lines[0].replace(/^#+\s*/, '').replace(/^[*\s]+|[*\s]+$/g, '').trim();
        }
      }

      const authorMatch = outputText.match(/===AUTHOR_START===([\s\S]*?)===AUTHOR_END===/);
      if (authorMatch && authorMatch[1]) {
        translatedAuthor = authorMatch[1].trim();
      }

      const descMatch = outputText.match(/===DESC_START===([\s\S]*?)===DESC_END===/);
      if (descMatch && descMatch[1]) {
        translatedDescription = descMatch[1].trim();
      }

      return {
        translatedTitle,
        translatedAuthor,
        translatedDescription,
        keyUsed: `${keyUsed.substring(0, 8)}...${keyUsed.substring(keyUsed.length - 4)} (${modelUsed})`,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Lỗi dịch thông tin truyện Gemini: ${msg}`);
    }
  });
}
