import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-semibold">Page not found</p>
      <Link href="/" className="text-xs text-accent hover:underline">
        Back to the overview
      </Link>
    </main>
  );
}
