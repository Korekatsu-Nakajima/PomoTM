import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
