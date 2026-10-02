import { GoogleGenAI } from '@google/genai';
import { TranslationGenre } from '@/types/novel';
import { cleanChapterTitle } from './chapter-utils';

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface TranslateOptions {
  title?: string;
  content: string;
  sourceLang?: string;
  targetLang?: string;
  genre?: TranslationGenre;
  glossary?: Record<string, string>;
  modelName?: string;
}

export interface TranslationResult {
  translatedTitle: string;
  translatedContent: string;
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
 * Translate a chapter using Gemini API
 */
export async function translateChapter(options: TranslateOptions): Promise<TranslationResult> {
  const {
    title = '',
    content,
    sourceLang = 'Tự động nhận diện',
    targetLang = 'Tiếng Việt',
    genre = 'general',
    glossary = {},
    modelName = 'gemini-3.8-flash',
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

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    const outputText = response.text || '';

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
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Lỗi dịch thuật Gemini: ${msg}`);
  }
}
