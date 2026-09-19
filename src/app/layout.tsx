import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tomato Focus",
  description: "A physical Pomodoro timer"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4715060765412439"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {children}
        <footer className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[70] text-xs sm:left-4">
          <Link
            href="/privacy"
            className="rounded-md bg-zinc-950/45 px-2 py-1 text-[10px] text-zinc-400 backdrop-blur-sm transition-colors hover:bg-zinc-950/70 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:text-xs"
          >
            プライバシーポリシー
          </Link>
        </footer>
      </body>
    </html>
  );
}
