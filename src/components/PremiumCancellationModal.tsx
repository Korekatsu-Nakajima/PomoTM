"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { CalendarClock, Gem, X } from "lucide-react";
import {
  cancelPremiumSubscription,
  fetchPremiumStatus,
  PremiumApiError,
  type PremiumStatus,
} from "@/lib/premium";
import { translations, type Language } from "@/utils/translations";

type PremiumCancellationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isBreak: boolean;
  language: Language;
  user: User | null;
  premiumUntil: string | null;
  onCanceled: (status: PremiumStatus) => void;
};

type CancellationStep = "details" | "confirm" | "success";

function formatPremiumDate(value: string | null, language: Language): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "long",
  }).format(date);
}
export function PremiumCancellationModal({
  isOpen,
  onClose,
  isBreak,
  language,
  user,
  premiumUntil,
  onCanceled,
}: PremiumCancellationModalProps) {
  const t = translations[language];
  const [step, setStep] = useState<CancellationStep>("details");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedPremiumUntil, setConfirmedPremiumUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep("details");
    submittingRef.current = false;
    setSubmitting(false);
    setErrorMessage(null);
    setConfirmedPremiumUntil(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const activePremiumUntil = confirmedPremiumUntil ?? premiumUntil;
  const formattedPremiumUntil = formatPremiumDate(activePremiumUntil, language);
  const close = () => {
    if (!submitting) onClose();
  };
  const handleCancellation = async () => {
    if (!user) {
      setErrorMessage(t.settings.premiumCancelLoginRequired);
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const status = await cancelPremiumSubscription(user);
      setConfirmedPremiumUntil(status.premiumUntil);
      onCanceled(status);
      setStep("success");
      try {
        const refreshedStatus = await fetchPremiumStatus(user);
        setConfirmedPremiumUntil(refreshedStatus.premiumUntil);
        onCanceled(refreshedStatus);
      } catch {
        setErrorMessage(t.shop.premiumStatusFailed);
      }
    } catch (error) {
      if (error instanceof PremiumApiError
        && ["premium_subscription_not_found", "premium_not_active", "premium_subscription_invalid"].includes(error.code)) {
        setErrorMessage(t.settings.premiumCancelNotActive);
      } else if (error instanceof PremiumApiError
        && ["login_required", "verified_login_required", "invalid_auth_token"].includes(error.code)) {
        setErrorMessage(t.settings.premiumCancelLoginRequired);
      } else {
        setErrorMessage(t.settings.premiumCancelFailed);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`absolute inset-0 z-[100] grid place-items-center overflow-y-auto p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/90" : "bg-neutral-950/90"}`}
      role="presentation"
      onMouseDown={close}
    >
      <section
        className={`my-auto w-full max-w-md rounded-3xl border p-6 shadow-2xl ${isBreak ? "border-neutral-300 bg-white text-neutral-950" : "border-neutral-700 bg-neutral-900 text-white"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-cancellation-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full border ${isBreak ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"}`}>
              <Gem size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 id="premium-cancellation-title" className="text-lg font-black">
                {step === "confirm"
                  ? t.settings.premiumCancelConfirmTitle
                  : step === "success"
                    ? t.settings.premiumCancelSuccessTitle
                    : t.settings.premiumCancelTitle}
              </h2>
              {step === "details" && (
                <p className={`mt-1 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>
                  {t.settings.premiumCancelDescription}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-inset transition disabled:cursor-wait disabled:opacity-50 ${isBreak ? "bg-white text-neutral-700 ring-neutral-300 hover:bg-neutral-100" : "bg-neutral-800 text-neutral-200 ring-neutral-700 hover:bg-neutral-700"}`}
            disabled={submitting}
            aria-label={t.settings.premiumCancelClose}
            title={t.settings.premiumCancelClose}
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {step === "details" && (
          <>
            {formattedPremiumUntil && (
              <div className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${isBreak ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>
                <CalendarClock className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
                <p className="text-sm font-semibold leading-relaxed">
                  {t.settings.premiumCancelAvailableUntil.replace("{date}", formattedPremiumUntil)}
                </p>
              </div>
            )}
            <button
              type="button"
              className={`mt-5 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition ${isBreak ? "bg-neutral-800 text-white hover:bg-neutral-700" : "bg-neutral-100 text-neutral-950 hover:bg-white"}`}
              onClick={() => {
                setErrorMessage(null);
                setStep("confirm");
              }}
            >
              {t.settings.premiumCancelContinue}
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <p className={`mt-5 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-300"}`}>
              {t.settings.premiumCancelConfirmDescription}
            </p>
            {formattedPremiumUntil && (
              <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${isBreak ? "border-neutral-300 bg-neutral-100 text-neutral-700" : "border-neutral-700 bg-neutral-950/70 text-neutral-300"}`}>
                {t.settings.premiumCancelAvailableUntil.replace("{date}", formattedPremiumUntil)}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${isBreak ? "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
                disabled={submitting}
                onClick={() => {
                  setErrorMessage(null);
                  setStep("details");
                }}
              >
                {t.settings.premiumCancelBack}
              </button>
              <button
                type="button"
                className="rounded-2xl border border-rose-500/60 bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
                disabled={submitting}
                onClick={() => void handleCancellation()}
              >
                {submitting ? t.settings.premiumCancelProcessing : t.settings.premiumCancelConfirm}
              </button>
            </div>
          </>
        )}

        {step === "success" && (
          <>
            <div className={`mt-5 rounded-2xl border p-4 ${isBreak ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`} role="status">
              <p className="text-sm font-semibold leading-relaxed">
                {formattedPremiumUntil
                  ? t.settings.premiumCancelSuccessDescription.replace("{date}", formattedPremiumUntil)
                  : t.settings.premiumCancelDescription}
              </p>
            </div>
            <button
              type="button"
              className={`mt-5 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition ${isBreak ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"}`}
              onClick={onClose}
            >
              {t.settings.premiumCancelClose}
            </button>
          </>
        )}

        {errorMessage && (
          <p className="mt-4 text-sm font-semibold text-rose-500" role="alert">
            {errorMessage}
          </p>
        )}
      </section>
    </div>
  );
}
