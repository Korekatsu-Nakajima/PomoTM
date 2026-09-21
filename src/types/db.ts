export type DatabaseBoolean = 0 | 1;
export type DatabaseDateTime = string;

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  password_hash: string | null;
  email_verified: DatabaseDateTime | null;
  image: string | null;
  is_premium: DatabaseBoolean;
  premium_until: DatabaseDateTime | null;
  guest_id: string | null;
  created_at: DatabaseDateTime;
  updated_at: DatabaseDateTime;
}

export interface Account {
  id: string;
  user_id: string;
  provider_type: string;
  provider_id: string;
  provider_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  created_at: DatabaseDateTime;
  updated_at: DatabaseDateTime;
}

export interface Session {
  id: string;
  user_id: string;
  session_token: string;
  expires: DatabaseDateTime;
  created_at: DatabaseDateTime;
  updated_at: DatabaseDateTime;
}

export interface Ranking {
  id: number;
  user_id: string | null;
  user_name: string;
  score: number;
  created_at: DatabaseDateTime;
}

export interface UserItem {
  id: number;
  user_id: string;
  item_id: string;
  quantity: number;
  is_unlocked: DatabaseBoolean;
  active_until: DatabaseDateTime | null;
  unlocked_at: DatabaseDateTime | null;
  created_at: DatabaseDateTime;
  updated_at: DatabaseDateTime;
}

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export interface Subscription {
  id: string;
  user_id: string;
  provider: string;
  status: SubscriptionStatus;
  stripe_customer_id: string | null;
  price_id: string | null;
  cancel_at_period_end: DatabaseBoolean;
  current_period_start: DatabaseDateTime | null;
  current_period_end: DatabaseDateTime | null;
  canceled_at: DatabaseDateTime | null;
  created_at: DatabaseDateTime;
  updated_at: DatabaseDateTime;
}

export type UserInsert = Pick<User, "id"> & Partial<Omit<User, "id">>;
export type UserUpdate = Partial<Omit<User, "id" | "created_at">>;

export type AccountInsert = Pick<
  Account,
  "id" | "user_id" | "provider_type" | "provider_id" | "provider_account_id"
> & Partial<Omit<Account, "id" | "user_id" | "provider_type" | "provider_id" | "provider_account_id">>;

export type SessionInsert = Pick<Session, "id" | "user_id" | "session_token" | "expires">
  & Partial<Pick<Session, "created_at" | "updated_at">>;

export type RankingInsert = Pick<Ranking, "user_name" | "score">
  & Partial<Pick<Ranking, "user_id" | "created_at">>;

export type UserItemInsert = Pick<UserItem, "user_id" | "item_id">
  & Partial<Pick<UserItem, "quantity" | "is_unlocked" | "active_until" | "unlocked_at" | "created_at" | "updated_at">>;

export type SubscriptionInsert = Pick<Subscription, "id" | "user_id" | "status">
  & Partial<Omit<Subscription, "id" | "user_id" | "status">>;

export type PremiumUser = Pick<User, "is_premium" | "premium_until"> | {
  isPremium: boolean;
  premiumUntil?: DatabaseDateTime | null;
};

export function isUserPremium(user: PremiumUser, at: Date = new Date()): boolean {
  const premiumEnabled = "isPremium" in user ? user.isPremium : user.is_premium === 1;
  if (!premiumEnabled) return false;
  const premiumUntil = "isPremium" in user ? user.premiumUntil : user.premium_until;
  if (!premiumUntil) return true;
  const expirationTime = Date.parse(premiumUntil);
  return Number.isFinite(expirationTime) && expirationTime > at.getTime();
}
