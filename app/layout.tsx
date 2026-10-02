import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'NovelFlow - Cào & Dịch Truyện AI, Xuất EPUB & API',
  description: 'Nền tảng cào truyện đa nguồn có hỗ trợ Cookie VIP, dịch thuật tiểu thuyết bằng AI Gemini, xuất sách định dạng EPUB chuẩn và cung cấp REST API / OPDS tích hợp cho các ứng dụng đọc truyện.',
  openGraph: {
    title: 'NovelFlow - Cào & Dịch Truyện AI, Xuất EPUB & API',
    description: 'Nền tảng cào truyện đa nguồn có hỗ trợ Cookie VIP, dịch thuật tiểu thuyết bằng AI Gemini, xuất sách định dạng EPUB chuẩn và cung cấp REST API / OPDS tích hợp cho các ứng dụng đọc truyện.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NovelFlow - Cào & Dịch Truyện AI, Xuất EPUB & API',
    description: 'Nền tảng cào truyện đa nguồn có hỗ trợ Cookie VIP, dịch thuật tiểu thuyết bằng AI Gemini, xuất sách định dạng EPUB chuẩn và cung cấp REST API / OPDS tích hợp cho các ứng dụng đọc truyện.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
