import type { Metadata } from "next";
import Link from "next/link";

import { translations } from "@/utils/translations";

export const metadata: Metadata = {
  title: "利用規約 | PomoTM",
  description: "PomoTMの利用規約です。",
};

const terms = translations.ja.legal.terms;
const updatedLabel = translations.ja.legal.updatedLabel;

export default function TermsPage() {
  return (
    <main className="h-[100dvh] overflow-y-auto bg-zinc-950 px-4 py-10 text-zinc-100 sm:px-6 sm:py-14 lg:px-8">
      <article className="mx-auto mb-12 w-full max-w-3xl rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-black/30 sm:p-10">
        <header className="border-b border-zinc-800 pb-6">
          <p className="text-sm font-semibold tracking-[0.2em] text-red-500">
            POMOTM
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {terms.title}
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            {terms.introduction}
          </p>
          <p className="mt-3 text-xs text-zinc-500 sm:text-sm">
            {updatedLabel}: {terms.updatedAt}
          </p>
        </header>

        <div className="space-y-10 py-8 text-sm leading-8 text-zinc-300 sm:text-base">
          {terms.sections.map((section, sectionIndex) => {
            const headingId = `terms-section-${sectionIndex + 1}`;

            return (
              <section key={headingId} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="text-xl font-bold text-white sm:text-2xl"
                >
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={`${headingId}-paragraph-${paragraphIndex + 1}`}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <nav
          className="border-t border-zinc-800 pt-6"
          aria-label="ページナビゲーション"
        >
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
