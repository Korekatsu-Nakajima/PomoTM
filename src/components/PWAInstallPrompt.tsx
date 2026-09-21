"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const DISMISS_UNTIL_KEY = "pomotm:pwa-install-dismissed-until";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const isStandaloneMode = () => {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone;
  return window.matchMedia("(display-mode: standalone)").matches
    || navigatorWithStandalone.standalone === true
    || document.referrer.startsWith("android-app://");
};

const isDismissed = () => {
  try {
    const dismissedUntil = Number(window.localStorage.getItem(DISMISS_UNTIL_KEY));
    return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now();
  } catch {
    return false;
  }
};

const rememberDismissal = () => {
  try {
    window.localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS));
  } catch {
    return;
  }
};

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [prompting, setPrompting] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isDismissed()) return;
      const installEvent = event as BeforeInstallPromptEvent;
      setDeferredPrompt(installEvent);
      setVisible(true);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setVisible(false);
      setPrompting(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const closePrompt = useCallback(() => {
    rememberDismissal();
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  const installApp = useCallback(async () => {
    if (!deferredPrompt || prompting) return;
    setPrompting(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") rememberDismissal();
    } finally {
      setDeferredPrompt(null);
      setVisible(false);
      setPrompting(false);
    }
  }, [deferredPrompt, prompting]);

  if (!visible || !deferredPrompt) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-install-title"
      className="fixed inset-x-3 bottom-16 z-[80] mx-auto w-[min(28rem,calc(100vw-1.5rem))] rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-white shadow-2xl shadow-black/50 backdrop-blur-md sm:bottom-6"
    >
      <button
        type="button"
        aria-label="インストール案内を閉じる"
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
        onClick={closePrompt}
      >
        <X size={17} aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-lg shadow-red-950/30">
          <Download size={22} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="pwa-install-title" className="text-sm font-black sm:text-base">
            アプリ化（ホーム画面に追加）しますか？
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-sm">
            PomoTMをホーム画面からすぐに開けるようになります。
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-full px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white sm:text-sm"
          onClick={closePrompt}
        >
          後で
        </button>
        <button
          type="button"
          disabled={prompting}
          className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-black text-white transition hover:bg-red-400 disabled:cursor-default disabled:opacity-60 sm:text-sm"
          onClick={installApp}
        >
          <Download size={16} aria-hidden="true" />
          {prompting ? "確認中…" : "アプリをインストールする"}
        </button>
      </div>
    </aside>
  );
}
