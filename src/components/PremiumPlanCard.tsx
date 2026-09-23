"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Check, Gem, LockKeyhole } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { auth } from "@/lib/firebase";
import { fetchPremiumStatus, PremiumApiError, startPremiumCheckout } from "@/lib/premium";
import { translations, type Language } from "@/utils/translations";

type PremiumPlanCardProps = {
  isBreak: boolean;
  language: Language;
};

function isVerifiedUser(user: User | null): user is User {
  if (!user) return false;
  const usesPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password",
  );
  return !usesPasswordProvider || user.emailVerified;
}

export function PremiumPlanCard({ isBreak, language }: PremiumPlanCardProps) {
  const t = translations[language];
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [authOpen, setAuthOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPremiumStatus = useCallback(async (currentUser: User) => {
    setChecking(true);
    try {
      const status = await fetchPremiumStatus(currentUser);
      setIsPremium(status.isPremium);
      setPremiumUntil(status.premiumUntil);
      if (status.isPremium) setNotice(null);
      return status.isPremium;
    } catch (error) {
      setNotice(error instanceof PremiumApiError && error.code === "premium_not_configured"
        ? t.shop.premiumConfigurationMissing
        : t.shop.premiumStatusFailed);
      return false;
    } finally {
      setChecking(false);
    }
  }, [t.shop.premiumConfigurationMissing, t.shop.premiumStatusFailed]);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!isVerifiedUser(nextUser)) {
        setIsPremium(false);
        setPremiumUntil(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!isVerifiedUser(user)) return;
    let disposed = false;
    const checkoutResult = new URLSearchParams(window.location.search).get("checkout");
    if (checkoutResult === "cancel") setNotice(t.shop.premiumCheckoutCanceled);

    const refresh = async () => {
      const attempts = checkoutResult === "success" ? 5 : 1;
      if (checkoutResult === "success") setNotice(t.shop.premiumChecking);
      for (let attempt = 0; attempt < attempts && !disposed; attempt += 1) {
        const active = await loadPremiumStatus(user);
        if (active || attempt === attempts - 1 || disposed) break;
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      if (!disposed && (checkoutResult === "success" || checkoutResult === "cancel")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };
    void refresh();
    return () => { disposed = true; };
  }, [loadPremiumStatus, t.shop.premiumCheckoutCanceled, t.shop.premiumChecking, user]);

  const handleUpgrade = async () => {
    if (!isVerifiedUser(user)) {
      setNotice(t.shop.premiumLoginRequired);
      setAuthOpen(true);
      return;
    }
    setStartingCheckout(true);
    setNotice(null);
    try {
      await startPremiumCheckout(user);
    } catch (error) {
      setNotice(error instanceof PremiumApiError && error.code === "premium_not_configured"
        ? t.shop.premiumConfigurationMissing
        : t.shop.premiumCheckoutFailed);
      setStartingCheckout(false);
    }
  };

  const formattedPremiumUntil = premiumUntil
    ? new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", { dateStyle: "medium" }).format(new Date(premiumUntil))
    : null;

  return (
    <>
      <section
        className={`relative mt-5 overflow-hidden rounded-2xl border p-4 ${isBreak
          ? "border-emerald-200 bg-gradient-to-br from-white via-emerald-50/60 to-neutral-50 text-neutral-900 shadow-[0_10px_30px_rgba(16,185,129,0.08)]"
          : "border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/90 to-white text-zinc-900 shadow-[0_12px_35px_rgba(16,185,129,0.10)]"
        }`}
        aria-labelledby="premium-plan-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <Gem size={17} aria-hidden="true" />
            </span>
            <h3 id="premium-plan-title" className="text-lg font-black tracking-tight">{t.shop.premium}</h3>
          </div>
          <span className="rounded-full border border-emerald-200 bg-white/90 px-3 py-1.5 text-sm font-black text-emerald-800 shadow-sm">
            {t.shop.premiumPrice}
          </span>
        </div>
        <ul className="mt-4 grid gap-2.5 text-sm font-semibold text-neutral-700">
          <li className="flex items-center gap-2.5">
            <Check className="shrink-0 text-emerald-600" size={16} aria-hidden="true" />
            <span>{t.shop.premiumContinuousPlayback}</span>
            {!isPremium && (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">
                <LockKeyhole size={11} aria-hidden="true" />
                {t.shop.premiumExclusive}
              </span>
            )}
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="shrink-0 text-emerald-600" size={16} aria-hidden="true" />
            <span>{t.shop.premiumAdFree}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Check className="shrink-0 text-emerald-600" size={16} aria-hidden="true" />
            <span>{t.shop.premiumBreakMode}</span>
          </li>
        </ul>
        <button
          type="button"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-default disabled:opacity-70"
          disabled={checking || startingCheckout || isPremium}
          onClick={() => void handleUpgrade()}
        >
          {isPremium
            ? t.shop.premiumActive
            : checking || startingCheckout
              ? t.shop.premiumChecking
              : t.shop.premiumUpgrade}
        </button>
        {isPremium && formattedPremiumUntil && (
          <p className="mt-2 text-center text-[11px] font-semibold text-emerald-800">
            {t.shop.premiumActiveUntil.replace("{date}", formattedPremiumUntil)}
          </p>
        )}
        {!isPremium && notice && (
          <p className="mt-2 text-center text-[11px] font-medium text-neutral-600" role="status">{notice}</p>
        )}
      </section>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        isBreak={isBreak}
        language={language}
      />
    </>
  );
}
