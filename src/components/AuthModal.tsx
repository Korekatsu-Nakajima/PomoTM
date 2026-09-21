"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { Eye, EyeOff, LockKeyhole, Mail, UserPlus, UserRound, X } from "lucide-react";
import { auth, googleProvider } from "@/lib/firebase";
import type { Language } from "@/utils/translations";

export type EmailAuthMode = "signIn" | "signUp";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isBreak: boolean;
  language: Language;
};

const SIGN_UP_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,30}$/;

const copy = {
  ja: {
    title: "アカウント",
    description: "ログインすると、将来の端末間同期やプレミアム機能を利用できます。ゲストのままでも全機能を利用できます。",
    google: "Googleでログイン",
    divider: "または",
    name: "表示名",
    email: "メールアドレス",
    password: "パスワード",
    signIn: "ログイン",
    signUp: "アカウント作成",
    close: "後で / 閉じる",
    closeLabel: "認証画面を閉じる",
    passwordHint: "8文字以上で入力してください。",
    passwordRequirements: "8〜30文字で、英大文字・英小文字・数字をそれぞれ1文字以上含めてください。",
    showPassword: "パスワードを表示",
    hidePassword: "パスワードを隠す",
    required: "メールアドレスと8文字以上のパスワードを入力してください。",
    nameRequired: "表示名を1〜80文字で入力してください。",
    invalidCredentials: "メールアドレスまたはパスワードが正しくありません。",
    emailExists: "このメールアドレスはすでに登録されています。",
    verificationSent: "確認メールを送信しました。メール内のリンクをクリックして認証を完了させてください。",
    emailNotVerified: "メールアドレスの確認が完了していません。受信トレイのリンクをご確認ください。",
    resendVerification: "確認メールを再送する",
    resendRequiresPassword: "確認メールを再送するには、パスワードを入力してください。",
    resendAvailableIn: (seconds: number) => `再送まで ${seconds}秒`,
    popupClosed: "Googleログインがキャンセルされました。",
    popupBlocked: "ログイン画面を開けませんでした。ポップアップを許可してもう一度お試しください。",
    tooManyRequests: "試行回数が多すぎます。時間をおいてもう一度お試しください。",
    networkError: "ネットワークに接続できません。通信状態を確認してください。",
    genericError: "認証に失敗しました。時間をおいてもう一度お試しください。",
    processing: "処理中…",
  },
  en: {
    title: "Account",
    description: "Sign in for future cross-device sync and premium features. Every timer and core feature remains available to guests.",
    google: "Continue with Google",
    divider: "or",
    name: "Display name",
    email: "Email address",
    password: "Password",
    signIn: "Sign in",
    signUp: "Create account",
    close: "Not now / Close",
    closeLabel: "Close authentication",
    passwordHint: "Use at least 8 characters.",
    passwordRequirements: "Use 8–30 characters with at least one uppercase letter, one lowercase letter, and one number.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    required: "Enter a valid email address and a password of at least 8 characters.",
    nameRequired: "Enter a display name between 1 and 80 characters.",
    invalidCredentials: "The email address or password is incorrect.",
    emailExists: "An account with this email address already exists.",
    verificationSent: "We sent a verification email. Open the link in the message to verify your email address.",
    emailNotVerified: "Your email address has not been verified. Check your inbox for the verification link.",
    resendVerification: "Resend verification email",
    resendRequiresPassword: "Enter your password to resend the verification email.",
    resendAvailableIn: (seconds: number) => `Resend in ${seconds}s`,
    popupClosed: "Google sign-in was canceled.",
    popupBlocked: "The sign-in window was blocked. Allow pop-ups and try again.",
    tooManyRequests: "Too many attempts. Please wait and try again.",
    networkError: "Could not connect. Check your network and try again.",
    genericError: "Authentication failed. Please try again later.",
    processing: "Working…",
  },
} as const;

export function AuthModal({ isOpen, onClose, isBreak, language }: AuthModalProps) {
  const [mode, setMode] = useState<EmailAuthMode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [showVerificationResend, setShowVerificationResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [awaitingVerificationInSession, setAwaitingVerificationInSession] = useState(false);
  const onCloseRef = useRef(onClose);
  const t = copy[language];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setPending(false);
    setError(null);
    setVerificationMessage(null);
    setShowVerificationResend(false);
    setResendCooldown(0);
    setAwaitingVerificationInSession(false);
    setName("");
    setPassword("");
    setShowPassword(false);
  }, [isOpen]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeoutId = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [resendCooldown]);

  useEffect(() => {
    if (!isOpen || !awaitingVerificationInSession || !auth) return;
    const firebaseAuth = auth;

    let disposed = false;
    let refreshInProgress = false;

    const refreshVerificationState = async () => {
      if (refreshInProgress) return;
      const currentUser = firebaseAuth.currentUser;
      const usesPasswordProvider = currentUser?.providerData.some(
        (provider) => provider.providerId === "password",
      );
      if (!currentUser || !usesPasswordProvider) return;

      refreshInProgress = true;
      try {
        await reload(currentUser);
        if (!disposed && currentUser.emailVerified) {
          setAwaitingVerificationInSession(false);
          setShowVerificationResend(false);
          onCloseRef.current();
        }
      } catch {
        // A transient refresh failure must not replace the existing auth UI state.
      } finally {
        refreshInProgress = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshVerificationState();
    };

    const intervalId = window.setInterval(() => void refreshVerificationState(), 5000);
    window.addEventListener("focus", refreshVerificationState);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    void refreshVerificationState();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVerificationState);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [awaitingVerificationInSession, isOpen]);

  if (!isOpen) return null;

  const getAuthenticationError = (reason: unknown) => {
    if (!(reason instanceof FirebaseError)) return t.genericError;
    switch (reason.code) {
      case "auth/email-already-in-use":
        return t.emailExists;
      case "auth/invalid-credential":
      case "auth/invalid-email":
      case "auth/user-disabled":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return t.invalidCredentials;
      case "auth/popup-closed-by-user":
        return t.popupClosed;
      case "auth/popup-blocked":
      case "auth/cancelled-popup-request":
        return t.popupBlocked;
      case "auth/too-many-requests":
        return t.tooManyRequests;
      case "auth/network-request-failed":
        return t.networkError;
      default:
        return t.genericError;
    }
  };

  const runGoogleSignIn = async () => {
    if (pending) return;
    if (!auth || !googleProvider) {
      setError(t.genericError);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (reason) {
      setError(getAuthenticationError(reason));
    } finally {
      setPending(false);
    }
  };

  const submitEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (!auth) {
      setError(t.genericError);
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@") || password.length === 0) {
      setError(t.required);
      return;
    }
    if (mode === "signUp" && !SIGN_UP_PASSWORD_PATTERN.test(password)) {
      setError(t.passwordRequirements);
      return;
    }
    if (mode === "signIn" && password.length < 8) {
      setError(t.required);
      return;
    }
    const normalizedName = name.trim();
    if (mode === "signUp" && (normalizedName.length === 0 || normalizedName.length > 80)) {
      setError(t.nameRequired);
      return;
    }
    setPending(true);
    setError(null);
    setVerificationMessage(null);
    try {
      if (mode === "signUp") {
        let createdUserId: string | null = null;
        try {
          const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
          createdUserId = credential.user.uid;
          setShowVerificationResend(true);
          setVerificationMessage(t.emailNotVerified);
          await updateProfile(credential.user, { displayName: normalizedName });
          await sendEmailVerification(credential.user, {
            url: window.location.origin,
            handleCodeInApp: false,
          });
          setMode("signIn");
          setResendCooldown(60);
          setAwaitingVerificationInSession(true);
          setVerificationMessage(t.verificationSent);
        } catch (reason) {
          if (createdUserId && auth.currentUser?.uid === createdUserId) {
            await signOut(auth).catch(() => undefined);
          }
          throw reason;
        }
      } else {
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        if (!credential.user.emailVerified) {
          setAwaitingVerificationInSession(false);
          setShowVerificationResend(true);
          setVerificationMessage(t.emailNotVerified);
          await signOut(auth);
          return;
        }
        onClose();
      }
    } catch (reason) {
      setError(getAuthenticationError(reason));
    } finally {
      setPending(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (pending || resendCooldown > 0) return;
    if (!auth) {
      setError(t.genericError);
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@") || password.length < 8) {
      setError(t.resendRequiresPassword);
      return;
    }
    setPending(true);
    setError(null);
    try {
      let verificationUser = auth.currentUser;
      let shouldSignOutAfterResend = false;
      if (verificationUser?.email?.toLowerCase() !== normalizedEmail) {
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        verificationUser = credential.user;
        shouldSignOutAfterResend = true;
      }
      if (!verificationUser) {
        setError(t.genericError);
        return;
      }
      await reload(verificationUser);
      if (verificationUser.emailVerified) {
        onClose();
        return;
      }
      try {
        await sendEmailVerification(verificationUser, {
          url: window.location.origin,
          handleCodeInApp: false,
        });
        setVerificationMessage(t.verificationSent);
        setResendCooldown(60);
        setAwaitingVerificationInSession(!shouldSignOutAfterResend);
      } finally {
        if (shouldSignOutAfterResend) await signOut(auth).catch(() => undefined);
      }
    } catch (reason) {
      setError(getAuthenticationError(reason));
    } finally {
      setPending(false);
    }
  };

  const cardClass = isBreak
    ? "border-neutral-300 bg-white text-neutral-950"
    : "border-neutral-700 bg-neutral-900 text-white";
  const inputClass = isBreak
    ? "border-neutral-300 bg-neutral-50 text-neutral-950 placeholder:text-neutral-400 focus:border-emerald-500"
    : "border-neutral-700 bg-neutral-950 text-white placeholder:text-neutral-500 focus:border-red-400";
  const secondaryButtonClass = isBreak
    ? "border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
    : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700";

  return (
    <div
      className={`absolute inset-0 z-[80] grid place-items-center overflow-y-auto p-4 backdrop-blur-md ${isBreak ? "bg-neutral-200/85" : "bg-neutral-950/85"}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`my-auto w-full max-w-md rounded-3xl border p-6 shadow-2xl ${cardClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-title" className="flex items-center gap-2 text-xl font-black">
              <UserPlus className={isBreak ? "text-emerald-500" : "text-red-400"} size={22} />
              {t.title}
            </h2>
            <p className={`mt-2 text-sm leading-relaxed ${isBreak ? "text-neutral-600" : "text-neutral-400"}`}>{t.description}</p>
          </div>
          <button
            type="button"
            className={`inline-flex shrink-0 items-center justify-center rounded-full border p-2 transition ${secondaryButtonClass}`}
            aria-label={t.closeLabel}
            title={t.closeLabel}
            disabled={pending}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <button
          type="button"
          className={`mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${secondaryButtonClass}`}
          disabled={pending}
          onClick={runGoogleSignIn}
        >
          <span className="grid size-6 place-items-center rounded-full bg-white font-black text-blue-600 shadow-sm" aria-hidden="true">G</span>
          {pending ? t.processing : t.google}
        </button>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className={`h-px flex-1 ${isBreak ? "bg-neutral-200" : "bg-neutral-700"}`} />
          <span className="text-xs font-bold text-neutral-500">{t.divider}</span>
          <span className={`h-px flex-1 ${isBreak ? "bg-neutral-200" : "bg-neutral-700"}`} />
        </div>

        <form className="grid gap-4" onSubmit={submitEmailAuth}>
          <div
            className={`grid grid-cols-2 rounded-2xl border p-1 ${isBreak ? "border-neutral-300 bg-neutral-100" : "border-neutral-700 bg-neutral-950/70"}`}
            role="tablist"
            aria-label={t.title}
          >
            {(["signIn", "signUp"] as const).map((option) => {
              const selected = mode === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`rounded-xl px-3 py-2 text-sm font-black transition ${selected
                    ? isBreak
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "bg-neutral-800 text-red-200 shadow-sm"
                    : isBreak
                      ? "text-neutral-500 hover:text-neutral-800"
                      : "text-neutral-500 hover:text-neutral-200"}`}
                  disabled={pending}
                  onClick={() => {
                    setMode(option);
                    setError(null);
                    setVerificationMessage(null);
                    setShowVerificationResend(false);
                    setResendCooldown(0);
                    setAwaitingVerificationInSession(false);
                    setPassword("");
                    setShowPassword(false);
                  }}
                >
                  {option === "signIn" ? t.signIn : t.signUp}
                </button>
              );
            })}
          </div>

          {mode === "signUp" && (
            <label className="grid gap-1.5 text-sm font-bold">
              <span className="flex items-center gap-2"><UserRound size={16} />{t.name}</span>
              <input
                className={`rounded-2xl border px-4 py-3 text-base outline-none transition ${inputClass}`}
                type="text"
                autoComplete="name"
                maxLength={80}
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}

          <label className="grid gap-1.5 text-sm font-bold">
            <span className="flex items-center gap-2"><Mail size={16} />{t.email}</span>
            <input
              className={`rounded-2xl border px-4 py-3 text-base outline-none transition ${inputClass}`}
              type="email"
              autoComplete="email"
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-bold">
            <span className="flex items-center gap-2"><LockKeyhole size={16} />{t.password}</span>
            <div className="relative">
              <input
                className={`w-full rounded-2xl border py-3 pl-4 pr-12 text-base outline-none transition ${inputClass}`}
                type={showPassword ? "text" : "password"}
                minLength={8}
                maxLength={mode === "signUp" ? 30 : undefined}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={`absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full p-1.5 transition disabled:cursor-not-allowed disabled:opacity-50 ${isBreak ? "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                title={showPassword ? t.hidePassword : t.showPassword}
                aria-pressed={showPassword}
                disabled={pending}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            <span className="text-xs font-normal text-neutral-500">
              {mode === "signUp" ? t.passwordRequirements : t.passwordHint}
            </span>
          </label>

          {error && (
            <p className={`rounded-2xl border px-4 py-3 text-sm ${isBreak ? "border-red-200 bg-red-50 text-red-700" : "border-red-500/40 bg-red-500/10 text-red-200"}`} role="alert">
              {error}
            </p>
          )}

          {verificationMessage && (
            <p className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${isBreak ? "border-sky-200 bg-sky-50 text-sky-800" : "border-sky-400/40 bg-sky-400/10 text-sky-100"}`} role="status">
              {verificationMessage}
            </p>
          )}

          {showVerificationResend && (
            <button
              type="button"
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${secondaryButtonClass}`}
              disabled={pending || resendCooldown > 0}
              onClick={resendVerificationEmail}
            >
              {resendCooldown > 0 ? t.resendAvailableIn(resendCooldown) : t.resendVerification}
            </button>
          )}

          <button
            type="submit"
            className={`rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-wait disabled:opacity-60 ${isBreak ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-red-500 text-white hover:bg-red-400"}`}
            disabled={pending}
          >
            {pending ? t.processing : mode === "signIn" ? t.signIn : t.signUp}
          </button>
        </form>

        <button
          type="button"
          className={`mt-5 w-full rounded-2xl border px-4 py-3 text-sm font-bold transition ${secondaryButtonClass}`}
          disabled={pending}
          onClick={onClose}
        >
          {t.close}
        </button>
      </section>
    </div>
  );
}
