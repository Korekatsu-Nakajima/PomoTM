import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Tomato Focus",
  description: "Tomato Focusのプライバシーポリシーです。",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="h-[100dvh] overflow-y-auto bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6 sm:py-14 lg:px-8">
      <article className="mx-auto mb-12 w-full max-w-3xl rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-black/30 sm:p-10">
        <header className="border-b border-zinc-800 pb-6">
          <p className="text-sm font-semibold tracking-[0.2em] text-red-500">
            TOMATO FOCUS
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            プライバシーポリシー
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            当サイトにおける利用者情報の取り扱いについて、以下のとおり定めます。
          </p>
        </header>

        <div className="space-y-10 py-8 text-sm leading-8 text-zinc-300 sm:text-base">
          <section aria-labelledby="advertising-heading">
            <h2
              id="advertising-heading"
              className="text-xl font-bold text-white sm:text-2xl"
            >
              1. 広告の配信について
            </h2>
            <div className="mt-4 space-y-4">
              <p>
                当サイトでは、第三者配信の広告サービス「Google AdSense」を利用・掲載する予定です。
              </p>
              <p>
                Googleを含む第三者配信事業者は、Cookie（クッキー）を使用し、訪問者が当サイトや他のウェブサイトへアクセスした際の閲覧情報に基づいて、適切な広告を配信することがあります。Cookieには氏名、住所、メールアドレス、電話番号など、個人を直接特定する情報は含まれません。
              </p>
              <p>
                広告配信に使用されるCookieの詳細や、パーソナライズ広告を無効にする方法については、
                <a
                  href="https://policies.google.com/technologies/ads?hl=ja"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-1 font-semibold text-red-400 underline decoration-red-400/40 underline-offset-4 transition-colors hover:text-red-300"
                >
                  Googleのポリシーと規約
                </a>
                をご確認ください。
              </p>
            </div>
          </section>

          <section aria-labelledby="analytics-heading">
            <h2
              id="analytics-heading"
              className="text-xl font-bold text-white sm:text-2xl"
            >
              2. アクセス解析ツールについて
            </h2>
            <div className="mt-4 space-y-4">
              <p>
                当サイトでは、利用状況の把握とサービス改善のためGoogle Analytics 4を利用します。公開環境変数に有効なMeasurement IDが設定された場合、Google tagがページビュー、セッション、流入元、端末・ブラウザ情報、IPアドレスから推定される地域等をGoogleへ送信します。Google AnalyticsはCookie等を使用することがあります。当サイト独自のカスタムイベントは実装していません。
              </p>
              <p>
                Googleによる情報の利用については、
                <a
                  href="https://policies.google.com/technologies/partner-sites?hl=ja"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-1 font-semibold text-red-400 underline decoration-red-400/40 underline-offset-4 transition-colors hover:text-red-300"
                >
                  Googleサービスを使用するサイトやアプリから収集した情報の利用
                </a>
                をご確認ください。計測を制限する場合は、
                <a
                  href="https://tools.google.com/dlpage/gaoptout?hl=ja"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mx-1 font-semibold text-red-400 underline decoration-red-400/40 underline-offset-4 transition-colors hover:text-red-300"
                >
                  Google Analyticsオプトアウトアドオン
                </a>
                も利用できます。
              </p>
            </div>
          </section>

          <section aria-labelledby="disclaimer-heading">
            <h2
              id="disclaimer-heading"
              className="text-xl font-bold text-white sm:text-2xl"
            >
              3. 免責事項
            </h2>
            <div className="mt-4 space-y-4">
              <p>
                当サイトでは、掲載する情報の正確性・安全性について十分に配慮していますが、その完全性や最新性を保証するものではありません。
              </p>
              <p>
                当サイトの情報を利用したこと、または当サイトから移動したリンク先で生じた損害・トラブルについて、当サイトは一切の責任を負いかねます。あらかじめご了承ください。
              </p>
            </div>
          </section>
        </div>

        <nav className="border-t border-zinc-800 pt-6" aria-label="ページナビゲーション">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          >
            トップページへ戻る
          </Link>
        </nav>
      </article>
    </main>
  );
}
