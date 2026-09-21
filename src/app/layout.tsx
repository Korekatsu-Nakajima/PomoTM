import type { Metadata, Viewport } from "next";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "PomoTM - トマトが積み上がるポモドーロタイマー | 勉強・作業用タイマー",
  description: "集中するほどトマトが積もる！「勉強タイマー」「ポモドーロタイマー（25分/5分）」「30分タイマー」に最適なWebアプリ。可愛い物理演算とガチャ・アイテム機能で、仕事や勉強のモチベーション維持・継続を楽しくサポートします。",
  keywords: [
    "ポモドーロタイマー",
    "勉強タイマー",
    "30分タイマー",
    "作業用タイマー",
    "集中タイマー",
    "トマトタイマー",
    "ゲーミフィケーション",
    "Webタイマー",
  ],
  openGraph: {
    title: "PomoTM - トマトが積み上がるポモドーロタイマー",
    description: "集中するほどトマトが積もる！勉強や作業が楽しく継続できるポモドーロタイマーアプリ。",
    type: "website",
    locale: "ja_JP",
    siteName: "PomoTM",
  },
  twitter: {
    card: "summary_large_image",
    title: "PomoTM - トマトが積み上がるポモドーロタイマー",
    description: "集中するほどトマトが積もる！勉強や作業が楽しく継続できるポモドーロタイマーアプリ。",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [
      {
        url: "/icons/pomotm-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PomoTM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
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
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
