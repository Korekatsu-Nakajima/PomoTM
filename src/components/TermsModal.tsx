"use client";

import { FileText, X } from "lucide-react";
import { translations, type Language } from "@/utils/translations";

type TermsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isBreak: boolean;
  language: Language;
};

export function TermsModal({ isOpen, onClose, isBreak, language }: TermsModalProps) {
  if (!isOpen) return null;

  const t = translations[language];
  const document = t.legal.terms;
  const panelClass = isBreak
    ? "border-neutral-300 bg-white text-neutral-950"
    : "border-neutral-700 bg-neutral-900 text-white";
  const mutedClass = isBreak ? "text-neutral-600" : "text-neutral-400";
  const closeClass = isBreak
    ? "border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
    : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700";

  return (
    <div
      className={`absolute inset-0 z-[90] grid place-items-center overflow-y-auto p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/90" : "bg-neutral-950/90"}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${panelClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`flex shrink-0 items-start justify-between gap-4 border-b p-5 sm:p-6 ${isBreak ? "border-neutral-200" : "border-neutral-700"}`}>
          <div>
            <h2 id="terms-modal-title" className="flex items-center gap-2 text-xl font-black sm:text-2xl">
              <FileText className={isBreak ? "text-emerald-500" : "text-red-400"} size={23} />
              {document.title}
            </h2>
            <p className={`mt-2 text-xs ${mutedClass}`}>
              {t.legal.updatedLabel}: {document.updatedAt}
            </p>
          </div>
          <button
            type="button"
            className={`inline-flex shrink-0 items-center justify-center rounded-full border p-2 transition ${closeClass}`}
            aria-label={t.legal.close}
            title={t.legal.close}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <p className={`text-sm leading-7 sm:text-base ${mutedClass}`}>{document.introduction}</p>
          <div className="mt-7 space-y-7">
            {document.sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-base font-black sm:text-lg">{section.title}</h3>
                <div className={`mt-2 space-y-3 text-sm leading-7 sm:text-base ${mutedClass}`}>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className={`shrink-0 border-t p-4 sm:px-6 ${isBreak ? "border-neutral-200" : "border-neutral-700"}`}>
          <button
            type="button"
            className={`w-full rounded-2xl border px-4 py-2.5 text-sm font-bold transition ${closeClass}`}
            onClick={onClose}
          >
            {t.legal.close}
          </button>
        </footer>
      </section>
    </div>
  );
}
