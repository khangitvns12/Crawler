import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-slate-100">
      <h1 className="text-6xl font-extrabold text-amber-500">404</h1>
      <h2 className="mt-4 text-2xl font-bold">Không tìm thấy trang</h2>
      <p className="mt-2 text-sm text-slate-400">
        Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all"
      >
        Trở về Thư viện
      </Link>
    </div>
  );
}
