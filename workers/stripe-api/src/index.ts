type DatabaseValue = string | number | null | ArrayBuffer;

interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: DatabaseValue[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface Env {
  DB?: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID_PREMIUM_MONTHLY?: string;
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_PROJECT_NUMBER?: string;
  FIREBASE_APP_ID?: string;
  APP_ORIGINS?: string;
  APP_URL?: string;
}

type FirebaseLookupUser = {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
};

type VerifiedUser = {
  uid: string;
  email: string;
  name: string | null;
};

type JsonWebKeyWithKid = JsonWebKey & { kid?: string; alg?: string; use?: string };
type AppCheckClaims = {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  iss?: string;
  sub?: string;
};

type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval?: string } | null;
};

type StripeCustomer = { id: string };
type StripeCustomerSearch = { data: StripeCustomer[] };
type StripeCheckoutSession = {
  id: string;
  url: string | null;
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
};

type StripeSubscriptionItem = {
  current_period_start?: number;
  current_period_end?: number;
  price?: { id?: string };
};

type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id?: string };
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: StripeSubscriptionItem[] };
};

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: unknown };
};

type SubscriptionRow = {
  status: string;
  current_period_end: string | null;
};

const APP_CHECK_JWKS_URL = "https://firebaseappcheck.googleapis.com/v1/jwks";
const STRIPE_API_BASE_URL = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;
const PREMIUM_STATUSES = new Set(["active", "trialing"]);
const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

let appCheckJwks: { keys: JsonWebKeyWithKid[]; expiresAt: number } | null = null;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireEnvValue(value: string | undefined, name: string): string {
  if (!value) throw new HttpError(503, "server_not_configured", `${name} is not configured.`);
  return value;
}

function requireDatabase(env: Env): D1Database {
  if (!env.DB) throw new HttpError(503, "server_not_configured", "D1 binding is not configured.");
  return env.DB;
}

function getAllowedOrigin(request: Request, env: Env): string {
  const origin = request.headers.get("Origin");
  const allowed = (env.APP_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) {
    throw new HttpError(403, "origin_not_allowed", "Request origin is not allowed.");
  }
  return origin;
}

function corsHeaders(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Firebase-AppCheck",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
}

function jsonResponse(payload: unknown, status: number, origin?: string): Response {
  const headers = origin
    ? corsHeaders(origin)
    : new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" });
  return new Response(JSON.stringify(payload), { status, headers });
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

async function getAppCheckKeys(): Promise<JsonWebKeyWithKid[]> {
  if (appCheckJwks && appCheckJwks.expiresAt > Date.now()) return appCheckJwks.keys;
  const response = await fetch(APP_CHECK_JWKS_URL);
  if (!response.ok) throw new HttpError(503, "app_check_unavailable", "App Check keys are unavailable.");
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.keys)) {
    throw new HttpError(503, "app_check_unavailable", "App Check keys are invalid.");
  }
  const keys = payload.keys.filter((key): key is JsonWebKeyWithKid => isRecord(key));
  appCheckJwks = { keys, expiresAt: Date.now() + 6 * 60 * 60 * 1_000 };
  return keys;
}

async function verifyAppCheckToken(token: string, env: Env): Promise<void> {
  const projectNumber = requireEnvValue(env.FIREBASE_PROJECT_NUMBER, "FIREBASE_PROJECT_NUMBER");
  const expectedAppId = requireEnvValue(env.FIREBASE_APP_ID, "FIREBASE_APP_ID");
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "invalid_app_check", "Invalid App Check token.");
  const header = decodeJwtPart<{ alg?: string; kid?: string; typ?: string }>(parts[0]);
  const claims = decodeJwtPart<AppCheckClaims>(parts[1]);
  if (header.alg !== "RS256" || header.typ !== "JWT" || !header.kid) {
    throw new HttpError(401, "invalid_app_check", "Invalid App Check token.");
  }
  const keys = await getAppCheckKeys();
  const jwk = keys.find((key) => key.kid === header.kid && (!key.alg || key.alg === "RS256"));
  if (!jwk) throw new HttpError(401, "invalid_app_check", "Invalid App Check token.");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    bytesToArrayBuffer(base64UrlToBytes(parts[2])),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  const now = Math.floor(Date.now() / 1_000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!verified
    || claims.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`
    || !audience.includes(`projects/${projectNumber}`)
    || claims.sub !== expectedAppId
    || typeof claims.exp !== "number"
    || claims.exp <= now
    || typeof claims.iat !== "number"
    || claims.iat > now) {
    throw new HttpError(401, "invalid_app_check", "Invalid App Check token.");
  }
}

async function verifyFirebaseUser(idToken: string, env: Env): Promise<VerifiedUser> {
  const apiKey = requireEnvValue(env.FIREBASE_WEB_API_KEY, "FIREBASE_WEB_API_KEY");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new HttpError(401, "invalid_auth_token", "Authentication token is invalid.");
  const payload: unknown = await response.json();
  const users = isRecord(payload) && Array.isArray(payload.users) ? payload.users : [];
  const firebaseUser = users.find((value): value is FirebaseLookupUser => isRecord(value));
  if (!firebaseUser?.localId || !firebaseUser.email || firebaseUser.emailVerified !== true) {
    throw new HttpError(401, "verified_login_required", "A verified Firebase account is required.");
  }
  return {
    uid: firebaseUser.localId,
    email: firebaseUser.email,
    name: typeof firebaseUser.displayName === "string" && firebaseUser.displayName.length > 0
      ? firebaseUser.displayName
      : null,
  };
}

async function authenticate(request: Request, env: Env): Promise<VerifiedUser> {
  const authorization = request.headers.get("Authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const appCheckToken = request.headers.get("X-Firebase-AppCheck") ?? "";
  if (!idToken || !appCheckToken) {
    throw new HttpError(401, "login_required", "Authentication and App Check tokens are required.");
  }
  const [user] = await Promise.all([
    verifyFirebaseUser(idToken, env),
    verifyAppCheckToken(appCheckToken, env),
  ]);
  return user;
}

async function stripeRequest<T>(env: Env, path: string, init?: RequestInit, idempotencyKey?: string): Promise<T> {
  const secretKey = requireEnvValue(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${secretKey}`);
  if (init?.body) headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(`${STRIPE_API_BASE_URL}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(502, "stripe_request_failed", "Stripe request failed.");
  return payload as T;
}

async function validatePremiumPrice(env: Env): Promise<string> {
  const priceId = requireEnvValue(env.STRIPE_PRICE_ID_PREMIUM_MONTHLY, "STRIPE_PRICE_ID_PREMIUM_MONTHLY");
  const price = await stripeRequest<StripePrice>(env, `/prices/${encodeURIComponent(priceId)}`);
  if (!price.active
    || price.currency !== "jpy"
    || price.unit_amount !== 240
    || price.recurring?.interval !== "month") {
    throw new HttpError(503, "invalid_premium_price", "Premium Price must be an active monthly JPY 240 Price.");
  }
  return priceId;
}

async function upsertUser(database: D1Database, user: VerifiedUser): Promise<void> {
  await database.prepare(`
    INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      email_verified = excluded.email_verified,
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.uid, user.name, user.email, new Date().toISOString()).run();
}

async function findStripeCustomerId(database: D1Database, env: Env, user: VerifiedUser): Promise<string> {
  const stored = await database.prepare(`
    SELECT stripe_customer_id
    FROM subscriptions
    WHERE user_id = ? AND stripe_customer_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(user.uid).first<{ stripe_customer_id: string | null }>();
  if (stored?.stripe_customer_id) return stored.stripe_customer_id;

  const escapedUid = user.uid.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const query = encodeURIComponent(`metadata['firebase_uid']:'${escapedUid}'`);
  const search = await stripeRequest<StripeCustomerSearch>(env, `/customers/search?query=${query}&limit=1`);
  if (search.data[0]?.id) return search.data[0].id;

  const params = new URLSearchParams({
    email: user.email,
    "metadata[firebase_uid]": user.uid,
  });
  if (user.name) params.set("name", user.name);
  const customer = await stripeRequest<StripeCustomer>(
    env,
    "/customers",
    { method: "POST", body: params },
    `pomotm-customer-v1:${user.uid}`,
  );
  if (!customer.id) throw new HttpError(502, "invalid_stripe_customer", "Stripe returned an invalid Customer.");
  return customer.id;
}

function parseAppUrl(env: Env): URL {
  const appUrl = new URL(requireEnvValue(env.APP_URL, "APP_URL"));
  if (appUrl.protocol !== "https:" && !(appUrl.protocol === "http:" && appUrl.hostname === "localhost")) {
    throw new HttpError(503, "server_not_configured", "APP_URL must use HTTPS outside localhost.");
  }
  return appUrl;
}

function hasActivePremium(row: SubscriptionRow | null): boolean {
  if (!row || !PREMIUM_STATUSES.has(row.status) || !row.current_period_end) return false;
  const periodEnd = Date.parse(row.current_period_end);
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

async function getPremiumStatus(database: D1Database, userId: string): Promise<{ isPremium: boolean; premiumUntil: string | null }> {
  const row = await database.prepare(`
    SELECT status, current_period_end
    FROM subscriptions
    WHERE user_id = ?
    ORDER BY current_period_end DESC, updated_at DESC
    LIMIT 1
  `).bind(userId).first<SubscriptionRow>();
  const isPremium = hasActivePremium(row);
  const premiumUntil = isPremium ? row?.current_period_end ?? null : null;
  if (!isPremium) {
    await database.prepare(`
      UPDATE users
      SET is_premium = 0, premium_until = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_premium <> 0
    `).bind(userId).run();
  }
  return { isPremium, premiumUntil };
}

async function handleCheckout(request: Request, env: Env, origin: string): Promise<Response> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0] !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const bodyText = await request.text();
  if (bodyText.length > 32) throw new HttpError(413, "request_too_large", "Request body is too large.");
  const user = await authenticate(request, env);
  const database = requireDatabase(env);
  await upsertUser(database, user);
  const status = await getPremiumStatus(database, user.uid);
  if (status.isPremium) throw new HttpError(409, "premium_already_active", "Premium is already active.");

  const priceId = await validatePremiumPrice(env);
  const customerId = await findStripeCustomerId(database, env, user);
  const appUrl = parseAppUrl(env);
  const successUrl = new URL(appUrl);
  successUrl.searchParams.set("checkout", "success");
  const cancelUrl = new URL(appUrl);
  cancelUrl.searchParams.set("checkout", "cancel");
  const params = new URLSearchParams({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.uid,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[firebase_uid]": user.uid,
    "subscription_data[metadata][firebase_uid]": user.uid,
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    locale: "auto",
  });
  const session = await stripeRequest<StripeCheckoutSession>(
    env,
    "/checkout/sessions",
    { method: "POST", body: params },
    `pomotm-checkout-v1:${user.uid}:${Math.floor(Date.now() / 60_000)}`,
  );
  if (!session.url) throw new HttpError(502, "invalid_checkout_session", "Stripe returned an invalid Checkout Session.");
  return jsonResponse({ url: session.url }, 200, origin);
}

async function handlePremiumStatus(request: Request, env: Env, origin: string): Promise<Response> {
  const user = await authenticate(request, env);
  const database = requireDatabase(env);
  await upsertUser(database, user);
  const status = await getPremiumStatus(database, user.uid);
  return jsonResponse(status, 200, origin);
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function verifyStripeSignature(payload: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestampValue = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp)
    || Math.abs(Math.floor(Date.now() / 1_000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS
    || signatures.length === 0) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedPayload = new TextEncoder().encode(`${timestamp}.${payload}`);
  for (const signature of signatures) {
    const bytes = hexToBytes(signature);
    if (bytes && await crypto.subtle.verify("HMAC", key, bytesToArrayBuffer(bytes), signedPayload)) return true;
  }
  return false;
}

function stripeObjectId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function getSubscriptionPeriod(subscription: StripeSubscription): { start: string | null; end: string | null } {
  const items = subscription.items?.data ?? [];
  const startSeconds = subscription.current_period_start
    ?? items.map((item) => item.current_period_start ?? 0).filter((value) => value > 0).sort((a, b) => a - b)[0];
  const endSeconds = subscription.current_period_end
    ?? items.map((item) => item.current_period_end ?? 0).filter((value) => value > 0).sort((a, b) => b - a)[0];
  return {
    start: startSeconds ? new Date(startSeconds * 1_000).toISOString() : null,
    end: endSeconds ? new Date(endSeconds * 1_000).toISOString() : null,
  };
}

function getSubscriptionPriceId(subscription: StripeSubscription): string | null {
  return subscription.items?.data?.map((item) => item.price?.id).find((id): id is string => Boolean(id)) ?? null;
}

async function resolveSubscriptionUserId(database: D1Database, subscription: StripeSubscription): Promise<string | null> {
  const metadataUid = subscription.metadata?.firebase_uid;
  if (metadataUid) return metadataUid;
  const customerId = stripeObjectId(subscription.customer);
  const row = await database.prepare(`
    SELECT user_id
    FROM subscriptions
    WHERE id = ? OR stripe_customer_id = ?
    LIMIT 1
  `).bind(subscription.id, customerId).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

async function syncSubscription(
  database: D1Database,
  env: Env,
  subscription: StripeSubscription,
  eventCreated: number,
): Promise<void> {
  const configuredPriceId = requireEnvValue(env.STRIPE_PRICE_ID_PREMIUM_MONTHLY, "STRIPE_PRICE_ID_PREMIUM_MONTHLY");
  const priceId = getSubscriptionPriceId(subscription);
  if (priceId !== configuredPriceId) return;
  const userId = await resolveSubscriptionUserId(database, subscription);
  if (!userId) throw new HttpError(422, "subscription_user_missing", "Subscription has no Firebase UID mapping.");
  const customerId = stripeObjectId(subscription.customer);
  if (!customerId) throw new HttpError(422, "subscription_customer_missing", "Subscription has no Customer.");
  const existing = await database.prepare(`
    SELECT stripe_event_created
    FROM subscriptions
    WHERE stripe_customer_id = ?
    ORDER BY stripe_event_created DESC
    LIMIT 1
  `).bind(customerId).first<{ stripe_event_created: number }>();
  if ((existing?.stripe_event_created ?? 0) > eventCreated) return;
  const period = getSubscriptionPeriod(subscription);
  const premium = PREMIUM_STATUSES.has(subscription.status)
    && Boolean(period.end)
    && Date.parse(period.end ?? "") > Date.now();
  const canceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1_000).toISOString()
    : null;
  await database.batch([
    database.prepare(`
      DELETE FROM subscriptions
      WHERE stripe_customer_id = ? AND id <> ?
    `).bind(customerId, subscription.id),
    database.prepare(`
      INSERT INTO subscriptions (
        id, user_id, provider, status, stripe_customer_id, price_id,
        cancel_at_period_end, current_period_start, current_period_end,
        canceled_at, stripe_event_created, created_at, updated_at
      ) VALUES (?, ?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        status = excluded.status,
        stripe_customer_id = excluded.stripe_customer_id,
        price_id = excluded.price_id,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        canceled_at = excluded.canceled_at,
        stripe_event_created = excluded.stripe_event_created,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      subscription.id,
      userId,
      subscription.status,
      customerId,
      priceId,
      subscription.cancel_at_period_end ? 1 : 0,
      period.start,
      period.end,
      canceledAt,
      eventCreated,
    ),
    database.prepare(`
      UPDATE users
      SET is_premium = ?, premium_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(premium ? 1 : 0, premium ? period.end : null, userId),
  ]);
}

async function processWebhookEvent(event: StripeEvent, database: D1Database, env: Env): Promise<void> {
  if (!SUPPORTED_WEBHOOK_EVENTS.has(event.type)) return;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as StripeCheckoutSession;
    if (session.mode !== "subscription") return;
    const subscriptionId = stripeObjectId(session.subscription);
    if (!subscriptionId) throw new HttpError(422, "subscription_missing", "Checkout Session has no Subscription.");
    const subscription = await stripeRequest<StripeSubscription>(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    if (!subscription.metadata?.firebase_uid && session.client_reference_id) {
      subscription.metadata = { ...(subscription.metadata ?? {}), firebase_uid: session.client_reference_id };
    }
    await syncSubscription(database, env, subscription, event.created);
    return;
  }
  await syncSubscription(database, env, event.data.object as StripeSubscription, event.created);
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const secret = requireEnvValue(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
  const signature = request.headers.get("Stripe-Signature");
  if (!signature) throw new HttpError(400, "stripe_signature_missing", "Stripe signature is missing.");
  const payload = await request.text();
  if (!await verifyStripeSignature(payload, signature, secret)) {
    throw new HttpError(400, "stripe_signature_invalid", "Stripe signature is invalid.");
  }
  const parsed: unknown = JSON.parse(payload);
  if (!isRecord(parsed)
    || typeof parsed.id !== "string"
    || typeof parsed.type !== "string"
    || typeof parsed.created !== "number"
    || !isRecord(parsed.data)
    || !("object" in parsed.data)) {
    throw new HttpError(400, "invalid_stripe_event", "Stripe event is invalid.");
  }
  const event = parsed as StripeEvent;
  const database = requireDatabase(env);
  const inserted = await database.prepare(`
    INSERT OR IGNORE INTO stripe_webhook_events (id, event_type, processed_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `).bind(event.id, event.type).run();
  if ((inserted.meta?.changes ?? 0) === 0) return jsonResponse({ received: true, duplicate: true }, 200);
  try {
    await processWebhookEvent(event, database, env);
  } catch (error) {
    await database.prepare("DELETE FROM stripe_webhook_events WHERE id = ?").bind(event.id).run();
    throw error;
  }
  return jsonResponse({ received: true }, 200);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/webhook") {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Method not allowed.");
    return handleWebhook(request, env);
  }
  const origin = getAllowedOrigin(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (url.pathname === "/checkout" && request.method === "POST") return handleCheckout(request, env, origin);
  if (url.pathname === "/premium" && request.method === "GET") return handlePremiumStatus(request, env, origin);
  throw new HttpError(404, "not_found", "Not found.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let origin: string | undefined;
    try {
      if (new URL(request.url).pathname !== "/webhook") origin = getAllowedOrigin(request, env);
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.message, code: error.code }, error.status, origin);
      }
      return jsonResponse({ error: "Internal server error.", code: "internal_error" }, 500, origin);
    }
  },
};
