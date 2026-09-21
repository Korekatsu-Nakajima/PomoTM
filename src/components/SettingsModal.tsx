"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, reload, signOut, type User } from "firebase/auth";
import { Languages, LogIn, LogOut, Settings, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { PrivacyModal } from "@/components/PrivacyModal";
import { TermsModal } from "@/components/TermsModal";
import { auth } from "@/lib/firebase";
import { translations, type Language } from "@/utils/translations";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  isBreak: boolean;
  onOpenAuth: () => void;
};

const languageOptions: Array<{ value: Language; labelKey: "japanese" | "english" }> = [
  { value: "ja", labelKey: "japanese" },
  { value: "en", labelKey: "english" },
];

const accountCopy = {
  ja: {
    title: "アカウント設定",
    guestDescription: "ゲストのままでも、タイマーと基本ゲーム機能はすべて利用できます。",
    login: "ログイン / アカウント作成",
    signedIn: "ログイン中",
    logout: "ログアウト",
    logoutError: "ログアウトに失敗しました。もう一度お試しください。",
    processing: "処理中…",
  },
  en: {
    title: "Account",
    guestDescription: "All timers and core game features remain available while using PomoTM as a guest.",
    login: "Sign in / Create account",
    signedIn: "Signed in",
    logout: "Sign out",
    logoutError: "Could not sign out. Please try again.",
    processing: "Working…",
  },
} as const;

function getVerifiedDisplayUser(user: User | null): User | null {
  if (!user) return null;
  const usesPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password",
  );
  return usesPasswordProvider && !user.emailVerified ? null : user;
}

export function SettingsModal({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  soundEnabled,
  onSoundEnabledChange,
  isBreak,
  onOpenAuth,
}: SettingsModalProps) {
  const [user, setUser] = useState<User | null>(() => getVerifiedDisplayUser(auth?.currentUser ?? null));
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      return;
    }
    const firebaseAuth = auth;
    let disposed = false;
    let syncVersion = 0;

    const syncUser = async (nextUser: User | null) => {
      const version = ++syncVersion;
      if (nextUser) {
        const usesPasswordProvider = nextUser.providerData.some(
          (provider) => provider.providerId === "password",
        );
        if (usesPasswordProvider && !nextUser.emailVerified) {
          await reload(nextUser).catch(() => undefined);
        }
      }
      const currentUser = firebaseAuth.currentUser;
      const sameCurrentUser = currentUser?.uid === nextUser?.uid
        || (!currentUser && !nextUser);
      if (!disposed && version === syncVersion && sameCurrentUser) {
        setUser(getVerifiedDisplayUser(nextUser));
      }
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => void syncUser(nextUser));
    const syncCurrentUser = () => void syncUser(firebaseAuth.currentUser);
    const syncCurrentUserWhenVisible = () => {
      if (document.visibilityState === "visible") syncCurrentUser();
    };

    window.addEventListener("focus", syncCurrentUser);
    document.addEventListener("visibilitychange", syncCurrentUserWhenVisible);

    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("focus", syncCurrentUser);
      document.removeEventListener("visibilitychange", syncCurrentUserWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSignOutError(null);
      return;
    }
    setTermsOpen(false);
    setPrivacyOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const t = translations[language];
  const account = accountCopy[language];
  const closeButtonClass = isBreak
    ? "bg-white text-neutral-900 ring-neutral-300 hover:bg-neutral-100"
    : "bg-zinc-800 text-zinc-100 ring-zinc-700 hover:bg-zinc-700";

  return (
    <>
      <div
        className={`absolute inset-0 z-[70] grid place-items-center overflow-y-auto p-4 backdrop-blur-sm ${isBreak ? "bg-neutral-200/75" : "bg-neutral-950/75"}`}
        role="presentation"
        onMouseDown={onClose}
      >
        <section
          className={`my-auto w-full max-w-md rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`}
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

        <section className={`mt-6 border-t pt-5 ${isBreak ? "border-neutral-200" : "border-neutral-700"}`} aria-labelledby="sound-settings-title">
          <div className="flex items-center justify-between gap-4">
            <h3 id="sound-settings-title" className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em]">
              {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {t.settings.sound}
            </h3>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              aria-label={`${t.settings.sound} ${soundEnabled ? t.settings.soundOn : t.settings.soundOff}`}
              className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-black transition ${soundEnabled
                ? isBreak
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-red-400 bg-red-400/10 text-red-200"
                : isBreak
                  ? "border-neutral-300 bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  : "border-neutral-700 bg-neutral-950/70 text-neutral-400 hover:bg-neutral-800"}`}
              onClick={() => onSoundEnabledChange(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {soundEnabled ? t.settings.soundOn : t.settings.soundOff}
            </button>
          </div>
        </section>

        <section className={`mt-6 border-t pt-5 ${isBreak ? "border-neutral-200" : "border-neutral-700"}`} aria-labelledby="account-settings-title">
          <h3 id="account-settings-title" className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em]">
            <UserRound size={17} />
            {account.title}
          </h3>
          {user ? (
            <div className={`mt-3 rounded-2xl border p-4 ${isBreak ? "border-neutral-300 bg-neutral-100" : "border-neutral-700 bg-neutral-950/70"}`}>
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img
                    className="size-10 shrink-0 rounded-full object-cover ring-1 ring-black/10"
                    src={user.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={`grid size-10 shrink-0 place-items-center rounded-full ${isBreak ? "bg-emerald-100 text-emerald-700" : "bg-red-400/15 text-red-300"}`}>
                    <UserRound size={21} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-bold ${isBreak ? "text-neutral-500" : "text-neutral-400"}`}>{account.signedIn}</p>
                  {user.displayName && <p className="truncate text-sm font-black">{user.displayName}</p>}
                  <p className={`truncate text-sm ${isBreak ? "text-neutral-700" : "text-neutral-300"}`}>{user.email ?? ""}</p>
                </div>
              </div>
              <button
                type="button"
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${isBreak ? "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-200" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  setSignOutError(null);
                  try {
                    if (!auth) throw new Error("Firebase Authentication is not configured.");
                    await signOut(auth);
                  } catch {
                    setSignOutError(account.logoutError);
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                <LogOut size={17} />
                {signingOut ? account.processing : account.logout}
              </button>
              {signOutError && <p className="mt-2 text-sm text-red-500" role="alert">{signOutError}</p>}
            </div>
          ) : (
            <div className="mt-3">
              <p className={`text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>{account.guestDescription}</p>
              <button
                type="button"
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${isBreak ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-red-500 text-white hover:bg-red-400"}`}
                onClick={onOpenAuth}
              >
                <LogIn size={18} />
                {account.login}
              </button>
            </div>
          )}
        </section>

          <footer className={`mt-5 flex items-center justify-center gap-2 border-t pt-4 text-[11px] sm:text-xs ${isBreak ? "border-neutral-200 text-neutral-500" : "border-neutral-700 text-neutral-500"}`}>
            <button
              type="button"
              className="underline decoration-current/30 underline-offset-4 transition hover:text-current hover:decoration-current"
              onClick={() => setTermsOpen(true)}
            >
              {t.legal.termsLink}
            </button>
            <span aria-hidden="true">|</span>
            <button
              type="button"
              className="underline decoration-current/30 underline-offset-4 transition hover:text-current hover:decoration-current"
              onClick={() => setPrivacyOpen(true)}
            >
              {t.legal.privacyLink}
            </button>
          </footer>
        </section>
      </div>

      <TermsModal
        isOpen={termsOpen}
        onClose={() => setTermsOpen(false)}
        isBreak={isBreak}
        language={language}
      />
      <PrivacyModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        isBreak={isBreak}
        language={language}
      />
    </>
  );
}
