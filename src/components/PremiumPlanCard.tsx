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
  onPremiumStatusChange: (isPremium: boolean) => void;
};

type PremiumViewState = "idle" | "checking" | "standard" | "premium" | "error";

function isVerifiedUser(user: User | null): user is User {
  if (!user) return false;
  const usesPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password",
  );
  return !usesPasswordProvider || user.emailVerified;
}

export function PremiumPlanCard({ isBreak, language, onPremiumStatusChange }: PremiumPlanCardProps) {
  const t = translations[language];
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);
  const [authOpen, setAuthOpen] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [premiumState, setPremiumState] = useState<PremiumViewState>("idle");
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPremiumStatus = useCallback(async (currentUser: User) => {
    setPremiumState("checking");
    try {
      const status = await fetchPremiumStatus(currentUser);
      setPremiumState(status.isPremium ? "premium" : "standard");
      setPremiumUntil(status.premiumUntil);
      setCancelAtPeriodEnd(status.cancelAtPeriodEnd);
      setNotice(null);
      onPremiumStatusChange(status.isPremium);
      return status.isPremium;
    } catch (error) {
      setPremiumState("error");
      setPremiumUntil(null);
      setCancelAtPeriodEnd(false);
      setNotice(error instanceof PremiumApiError && error.code === "premium_not_configured"
        ? t.shop.premiumConfigurationMissing
        : t.shop.premiumStatusFailed);
      return false;
    }
  }, [onPremiumStatusChange, t.shop.premiumConfigurationMissing, t.shop.premiumStatusFailed]);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      onPremiumStatusChange(false);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (!isVerifiedUser(nextUser)) {
        onPremiumStatusChange(false);
        setPremiumState("idle");
        setPremiumUntil(null);
        setCancelAtPeriodEnd(false);
        setNotice(null);
      } else {
        setPremiumState("checking");
        setPremiumUntil(null);
        setCancelAtPeriodEnd(false);
        setNotice(null);
      }
    });
  }, [onPremiumStatusChange]);

  useEffect(() => {
    if (!isVerifiedUser(user)) return;
    let disposed = false;
    const checkoutResult = new URLSearchParams(window.location.search).get("checkout");

    const refresh = async () => {
      await loadPremiumStatus(user);
      if (!disposed && checkoutResult === "cancel") {
        setNotice(t.shop.premiumCheckoutCanceled);
      }
      if (!disposed && checkoutResult === "cancel") {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };
    void refresh();
    return () => { disposed = true; };
  }, [loadPremiumStatus, t.shop.premiumCheckoutCanceled, user]);

  const handleUpgrade = async () => {
    if (!isVerifiedUser(user)) {
      setNotice(t.shop.premiumLoginRequired);
      setAuthOpen(true);
      return;
    }
    if (premiumState !== "standard") return;
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
  const isPremium = premiumState === "premium";
  const isChecking = premiumState === "checking"
    || (isVerifiedUser(user) && premiumState === "idle");
  const hasStatusError = premiumState === "error";

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
          disabled={isChecking || startingCheckout || isPremium || hasStatusError}
          onClick={() => void handleUpgrade()}
        >
          {isPremium
            ? cancelAtPeriodEnd
              ? t.settings.premiumCancelScheduled
              : t.shop.premiumActive
            : isChecking || startingCheckout
              ? t.shop.premiumChecking
              : hasStatusError
                ? t.shop.premiumStatusFailed
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
