"use client";

import { Languages, Settings, X } from "lucide-react";
import { translations, type Language } from "@/utils/translations";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  isBreak: boolean;
};

const languageOptions: Array<{ value: Language; labelKey: "japanese" | "english" }> = [
  { value: "ja", labelKey: "japanese" },
  { value: "en", labelKey: "english" },
];

export function SettingsModal({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  isBreak,
}: SettingsModalProps) {
  if (!isOpen) return null;

  const t = translations[language];
  const closeButtonClass = isBreak
    ? "bg-white text-neutral-900 ring-neutral-300 hover:bg-neutral-100"
    : "bg-zinc-800 text-zinc-100 ring-zinc-700 hover:bg-zinc-700";

  return (
    <div
      className={`absolute inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm ${isBreak ? "bg-neutral-200/75" : "bg-neutral-950/75"}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-title" className="flex items-center gap-2 text-xl font-black">
              <Settings className={isBreak ? "text-emerald-500" : "text-red-500"} size={22} />
              {t.settings.title}
            </h2>
            <p className={`mt-1 text-sm ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>
              {t.settings.description}
            </p>
          </div>
          <button
            className={`inline-flex items-center justify-center rounded-full p-2 ring-1 ring-inset transition ${closeButtonClass}`}
            type="button"
            aria-label={t.settings.close}
            title={t.settings.close}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <fieldset className="mt-6">
          <legend className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em]">
            <Languages size={17} />
            {t.settings.language}
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {languageOptions.map((option) => {
              const selected = language === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition ${selected
                    ? isBreak
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-red-400 bg-red-400/10 text-red-200"
                    : isBreak
                      ? "border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      : "border-neutral-700 bg-neutral-950/70 text-neutral-300 hover:bg-neutral-800"}`}
                >
                  <input
                    className="h-4 w-4 accent-red-500"
                    type="radio"
                    name="pomotm-language"
                    value={option.value}
                    checked={selected}
                    onChange={() => onLanguageChange(option.value)}
                  />
                  <span>{t.settings[option.labelKey]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
