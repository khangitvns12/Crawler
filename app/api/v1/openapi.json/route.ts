import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);

  const openApiDoc = {
    openapi: '3.0.3',
    info: {
      title: 'NovelFlow External Reader API',
      description: 'API tích hợp danh sách tiểu thuyết, chương truyện và xuất EPUB cho các ứng dụng đọc truyện bên thứ ba (Moon+ Reader, LNReader, Tachiyomi, v.v.).',
      version: '1.0.0',
    },
    servers: [
      {
        url: origin,
        description: 'Server hiện tại',
      },
    ],
    paths: {
      '/api/v1/novels': {
        get: {
          summary: 'Lấy danh sách tất cả tiểu thuyết đã lưu trữ trong thư viện',
          responses: {
            '200': {
              description: 'Danh sách tiểu thuyết',
            },
          },
        },
      },
      '/api/v1/novels/{id}': {
        get: {
          summary: 'Lấy chi tiết tiểu thuyết và mục lục danh sách các chương',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Chi tiết tiểu thuyết và các chương',
            },
            '404': {
              description: 'Không tìm thấy truyện',
            },
          },
        },
      },
      '/api/v1/novels/{id}/chapters/{chapterNum}': {
        get: {
          summary: 'Lấy nội dung văn bản một chương cụ thể để ứng dụng đọc truyện render',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'chapterNum',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'format',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['translated', 'original', 'both'],
                default: 'translated',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Nội dung chương văn bản thuần túy kèm phân trang',
            },
          },
        },
      },
      '/api/v1/novels/{id}/epub': {
        get: {
          summary: 'Tải trực tiếp file ebook định dạng EPUB chuẩn của tiểu thuyết',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'type',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['translated', 'original', 'both'],
                default: 'translated',
              },
            },
          ],
          responses: {
            '200': {
              description: 'File EPUB binary (application/epub+zip)',
            },
          },
        },
      },
      '/api/v1/opds': {
        get: {
          summary: 'Feed chuẩn OPDS 1.2 Catalog Atom XML cho Moon+ Reader, FBReader, Aldiko',
          responses: {
            '200': {
              description: 'Atom XML OPDS feed',
            },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiDoc, {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}
