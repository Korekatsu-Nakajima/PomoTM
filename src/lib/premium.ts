"use client";

import { getToken as getAppCheckToken } from "firebase/app-check";
import type { User } from "firebase/auth";
import { appCheck } from "@/lib/firebase";

export type PremiumStatus = {
  isPremium: boolean;
  premiumUntil: string | null;
};

type CheckoutResponse = {
  url: string;
};

type ApiErrorResponse = {
  error?: string;
  code?: string;
};

export class PremiumApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PremiumApiError";
    this.code = code;
  }
}

const premiumApiBaseUrl = process.env.NEXT_PUBLIC_PREMIUM_API_BASE_URL?.replace(/\/+$/, "") ?? "";

function assertPremiumApiConfigured() {
  if (!premiumApiBaseUrl) {
    throw new PremiumApiError("premium_not_configured", "Premium API is not configured.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function createAuthenticatedHeaders(user: User): Promise<Headers> {
  assertPremiumApiConfigured();
  const currentAppCheck = appCheck;
  if (!currentAppCheck) {
    throw new PremiumApiError("premium_not_configured", "Firebase App Check is not configured.");
  }
  const [idToken, appCheckResult] = await Promise.all([
    user.getIdToken(),
    getAppCheckToken(currentAppCheck, false),
  ]);
  return new Headers({
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
    "X-Firebase-AppCheck": appCheckResult.token,
  });
}

async function readApiError(response: Response): Promise<PremiumApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const code = isRecord(payload) && typeof payload.code === "string"
    ? payload.code
    : "premium_request_failed";
  const message = isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : "Premium request failed.";
  return new PremiumApiError(code, message);
}

export async function fetchPremiumStatus(user: User): Promise<PremiumStatus> {
  const headers = await createAuthenticatedHeaders(user);
  const response = await fetch(`${premiumApiBaseUrl}/premium`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw await readApiError(response);
  const payload: unknown = await response.json();
  if (!isRecord(payload)
    || typeof payload.isPremium !== "boolean"
    || !(typeof payload.premiumUntil === "string" || payload.premiumUntil === null)) {
    throw new PremiumApiError("invalid_premium_response", "Premium API returned an invalid response.");
  }
  return {
    isPremium: payload.isPremium,
    premiumUntil: payload.premiumUntil,
  };
}

export async function startPremiumCheckout(user: User): Promise<never> {
  const headers = await createAuthenticatedHeaders(user);
  const response = await fetch(`${premiumApiBaseUrl}/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (!response.ok) throw await readApiError(response);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.url !== "string") {
    throw new PremiumApiError("invalid_checkout_response", "Checkout API returned an invalid response.");
  }
  const checkout = new URL((payload as CheckoutResponse).url);
  if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
    throw new PremiumApiError("invalid_checkout_url", "Checkout API returned an invalid URL.");
  }
  window.location.assign(checkout.toString());
  return new Promise<never>(() => undefined);
}
