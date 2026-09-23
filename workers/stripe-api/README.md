# PomoTM Stripe API Worker

This Worker is deliberately separate from the `pomo-tm` static Assets Worker. It owns Stripe secret access, Firebase Authentication and App Check verification, D1 subscription state, and Stripe webhook verification.

## Required bindings and variables

Configure a D1 binding named `DB` in the Cloudflare Dashboard after selecting the reviewed production database. The repository does not guess or embed a database ID.

Set these secrets with `wrangler secret put --config workers/stripe-api/wrangler.jsonc <NAME>`:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Set these Worker variables in Cloudflare:

- `STRIPE_PRICE_ID_PREMIUM_MONTHLY`
- `FIREBASE_WEB_API_KEY`
- `FIREBASE_PROJECT_NUMBER`
- `FIREBASE_APP_ID`
- `APP_ORIGINS` (comma-separated exact origins)
- `APP_URL` (canonical PomoTM origin used for Checkout return URLs)

Set the static app build variable `NEXT_PUBLIC_PREMIUM_API_BASE_URL` to the deployed HTTPS origin of this Worker.

## Required migration review

`migrations/0001_stripe_webhook_events.sql` adds the Stripe event ordering column and the webhook idempotency table expected by this Worker. Before applying it, inspect the real production D1 schema and compare it with `schema.sql`. Do not apply the repository schema blindly.

## Stripe Dashboard

Create a recurring JPY monthly Price with an amount of 240. Put its real Price ID in `STRIPE_PRICE_ID_PREMIUM_MONTHLY`. The Worker validates the Price currency, amount, and monthly recurrence before creating Checkout.

Create a webhook endpoint at the deployed Worker `/webhook` URL and subscribe only to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

## Local and dry-run checks

Copy `.dev.vars.example` to `.dev.vars` only for local testing and never commit real values. Run:

```bash
npm run stripe-worker:dry-run
```

The dry run validates bundling. End-to-end Checkout and webhook tests require real Stripe test-mode values, a configured D1 binding, and Firebase/App Check tokens.

Implementation references:

- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase App Check custom backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend)
