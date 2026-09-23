# PomoTM セキュリティ運用方針

最終確認日: 2026-09-22

## 1. 現在の構成と通信境界

- 本番配備はNext.js static exportで生成した `out` をCloudflare Assetsから配信する。正規設定は `wrangler.json`、Worker名は `pomo-tm` である。
- `src/app` に独自 `/api/*` Route HandlerやServer Actionsを追加せず、static exportを維持する。Stripe処理だけを別Worker `pomo-tm-stripe-api`へ分離する。
- クライアント実行コードはD1 binding、`getCloudflareContext()`、D1クエリを使用しない。Stripe専用WorkerだけがCloudflare Dashboardで設定されたD1 binding `DB`へ接続する。
- 認証通信はFirebase Web SDKによるFirebase Authenticationへの直接通信である。Google popup、メール／パスワードログイン、登録、確認メール送信、ユーザー再読込を利用する。
- Premium購入・状態確認時だけ、静的クライアントは公開設定 `NEXT_PUBLIC_PREMIUM_API_BASE_URL` の `/checkout` / `/premium` を `fetch` する。Firebase ID tokenとApp Check tokenはAuthorization用に送るが、localStorageへ独自保存しない。
- 現在、Cloudflare DashboardのRate Limiting設定済みとは判定しない。UIのボタン無効化、確認メール再送の60秒cooldown、localStorage値はセキュリティ上のRate Limitとして扱わない。

## 2. Firebase App Check

### 2.1 コード側の実装

- `src/lib/firebase.ts` は既存Firebase Appを `getApps()[0]` で再利用し、新規Appを二重初期化しない。
- ブラウザかつFirebase必須設定が存在するときだけ、公開環境変数 `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` を使って `ReCaptchaEnterpriseProvider` を初期化する。
- App Checkは `getAuth()` より前に初期化し、token auto refreshを有効にする。
- static build、SSR相当のプリレンダー、設定未投入環境ではApp Checkを初期化しない。既存Firebase Authenticationのnull fallbackを維持する。
- reCAPTCHA Enterpriseのsite keyはWebクライアントへ配布される公開識別子でありsecretではない。実際の秘密鍵、サービスアカウント、Firebase Admin SDKはクライアントへ追加しない。
- Hot Reload時の二重初期化を避けるため、初期化済みApp Checkインスタンスをブラウザのruntime上で再利用する。

App Checkは正規Webアプリからの通信である可能性を高める追加層であり、認証、入力検証、Rate Limitingの代替ではない。正規ブラウザを操作する人間による悪用、attestation通過後の自動操作、DDoS、盗まれた有効セッション、将来APIへの過剰呼び出しを単独では防げない。

### 2.2 本番で必要なFirebase / Google Cloud Console設定

コードを配備しただけではenforcementは有効にならない。次の作業はConsole上で別途実施する。

1. Firebase AuthenticationをFirebase Authentication with Identity Platformへアップグレードする。Firebase公式仕様上、AuthenticationにApp Checkを適用するにはこのアップグレードが必要であり、料金体系と利用上限が変わるため事前確認する。
2. Google Cloud ConsoleでreCAPTCHA Enterprise APIを有効にし、checkboxではないWeb用score-based keyを作成する。
3. keyの許可ドメインを本番ホスト `pomotm.com` と `www.pomotm.com` に限定する。本番keyへ `localhost` を追加しない。
4. Firebase ConsoleのSecurity > App Checkで対象Web AppをreCAPTCHA Enterprise providerとして登録し、同じsite keyを設定する。
5. Cloudflareの本番build環境へ `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` を設定して再deployする。公開site key以外のsecretは設定しない。
6. まずenforcementを有効にせず、App CheckのAuthentication metricsでVerified / Unverified trafficを監視する。Google popup、メールログイン、登録、確認メール、再送、ログアウトを本番で確認する。
7. 正規トラフィックがVerifiedになったことを確認後、Firebase ConsoleのSecurity > App Check > APIsからAuthentication enforcementを有効化する。反映には時間差がある。
8. Firebase AuthenticationのAuthorized domainsを本番ドメインへ限定する。開発用Firebase projectを分離できる場合は、本番projectから `localhost` を外す。
9. Email enumeration protectionを有効化し、Identity Toolkit APIのsign-in / sign-up関連quotaを実トラフィックに合わせて厳しく設定する。既存フローへの影響を検証してから適用する。

Identity PlatformのApp Check連携は公式資料上Pre-GA条件が示される場合がある。Firebase / Google Cloud Consoleに表示される最新の提供条件、地域、料金、quotaを本番有効化直前に確認する。

公式資料:

- <https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider>
- <https://firebase.google.com/docs/app-check/enable-enforcement>
- <https://firebase.google.com/docs/auth/faq-and-troubleshooting>
- <https://cloud.google.com/identity-platform/docs/admin/app-check-integration>
- <https://firebase.google.com/support/guides/security-checklist>

### 2.3 ローカル開発

- 本番とは別のFirebase projectとreCAPTCHA keyを推奨する。
- ローカルでenforced serviceを検証するときだけ `.env.local` の `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG=true` を使用する。コードはproduction buildでこのフラグを無視する。
- ブラウザconsoleに一度だけ表示される生成済みdebug tokenをFirebase ConsoleのManage debug tokensへ登録する。debug token自体を `.env*`、ソース、Cloudflare変数、ログ、ドキュメントへ保存しない。
- App Check debug tokenと `src/hooks/useDebugMode.ts` のゲーム用debug modeは完全に別物である。
- 本番keyの許可ドメインへ `localhost` を追加しない。漏えいしたdebug tokenはFirebase Consoleから直ちに削除する。

## 3. Cloudflare側の防御

静的Assets Worker `pomo-tm` は従来どおり `./out` だけを配信する。Stripe専用Worker `pomo-tm-stripe-api` は `/checkout`、`/premium`、`/webhook`だけを公開し、静的配信のroute・custom domain・D1非接続状態を変更しない。

- `/checkout` と `/premium` は完全一致CORS origin、Firebase Authentication、Firebase App Checkをすべて検証する。
- `/checkout` はクライアントから金額・Price ID・UIDを受け取らず、Worker環境のPriceをStripe APIでJPY 240円・月額として再検証する。
- `/webhook` はraw body、`Stripe-Signature`、Worker secretを使うHMAC SHA-256検証に成功したeventだけを処理する。
- D1の `stripe_webhook_events` でevent IDを冪等化し、`stripe_event_created` で古いeventによる状態の先祖返りを防止する。
- Premiumは `active` / `trialing` かつ有効期限内だけtrueとし、success URL、React State、localStorageだけでは付与しない。

Cloudflare Dashboard上のWAF、Bot、Rate Limiting設定はこのリポジトリから設定済みとは判定しない。利用可能な機能と料金は契約planおよび最新Consoleで確認する。

Stripe APIを公開する前、および将来APIを追加する場合は次を必須とする。

1. `/api/*` をCloudflare Workerまたは別の認証済みbackendとして明示的に設計し、static exportとの配備境界を再評価する。
2. Cloudflare Rate Limiting ruleを `/api/*` のmethodとendpoint単位で設定する。閾値を推測で固定せず、正常トラフィックを計測して設定する。
3. WAF managed rules、必要に応じたBot対策、DDoS protectionの適用範囲を確認する。
4. Firebase ID tokenをサーバー側で検証し、認証済みユーザーと権限を確認する。クライアントから渡されたuser IDを信用しない。
5. `X-Firebase-AppCheck` tokenをサーバー側で検証する。Authentication tokenとApp Check tokenの片方だけで許可しない。
6. schema validation、文字数・数値範囲・許可値、payload size、Content-Type、methodをサーバー側で検証する。
7. endpoint別・user別・IP等の多層quotaを設け、高コスト処理へ追加上限を設ける。
8. secretやtoken本文を記録せず、request ID、拒否理由、quota到達、課金指標を監視・警告できるログを用意する。
9. D1はWorker側bindingからのみ利用し、ブラウザへbindingや管理資格情報を露出しない。

推奨ルールの概念例は「`/api/*` を対象に、短時間burstと長時間sustained rateの両方を制限し、超過時は429またはchallenge」とする。具体的閾値やCloudflare機能名は契約planと実測値を確認して決める。

## 4. コスト・quotaリスク

金額や無料枠は変更されるため、以下はすべて本番有効化時に公式Consoleで要確認とする。

| 対象 | 現在の利用 | 主なリスク | コードで軽減できる範囲 | Console / 契約で必要な確認 |
| --- | --- | --- | --- | --- |
| Firebase Authentication | Google、メール／パスワード、確認メール | account creation、sign-in、verification emailの大量実行、Identity PlatformのDAU/MAU、quota枯渇 | App Check token付与、既存入力検証と60秒UI cooldown | Identity Platform料金、Identity Toolkit quota、メール送信quota、budget alert、email enumeration protection |
| Firebase App Check | reCAPTCHA Enterprise provider | token refresh頻度、誤判定、未登録App遮断 | token auto refresh、browser-only初期化、既定TTLを不用意に短縮しない | metrics、risk threshold、TTL、Authentication enforcement |
| reCAPTCHA Enterprise | App Check attestation | assessment増加によるquota消費・従量課金 | 不要な再初期化を避ける | Google Cloud Billing、assessment quota、budget alert、許可ドメイン |
| Cloudflare Assets / Workers | `out` の静的配信、Stripe専用API | 静的トラフィック、API request、Stripe/Firebase外部照会 | API責務分離、認証・App Check・入力検証 | plan limits、WAF / Bot / Rate Limiting、Worker observability、通知設定 |
| Google AdSense | 外部広告script | 広告配信側のポリシー・通信 | アプリ固有API費用の防御対象外 | AdSense Consoleとポリシー |
| D1 | Stripe専用WorkerだけがSubscription状態を同期 | Webhook再送や状態照会によるread/write増加 | 署名検証、event ID冪等化、必要最小限のquery | 本番schema差分、read/write/storage quota、backup・budget運用 |
| Stripe | 月額Premium Checkout / Subscription | 不正Checkout、Webhook偽装、重複event、決済状態の不整合 | サーバー固定Price、署名検証、D1冪等化、正規状態の限定 | Product/Price、Webhook endpoint、test/live secret分離、税・返金・顧客対応 |

Firebase Authentication、App Check、reCAPTCHA Enterprise、Cloudflareの最新料金・無料枠・quotaは「要Console確認」であり、この文書の数値を課金判断に使用しない。

## 5. リリース時チェックリスト

- `NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY` はFirebase Consoleへ登録した本番用公開site keyと一致している。
- production buildでは `NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG` が未設定または `false` であり、debug tokenがbundle、環境変数、ログに存在しない。
- App Check metricsで正規のGoogle／メール認証リクエストがVerifiedになっている。
- enforcement前後でGoogle login、メールlogin、登録、確認メール、60秒再送cooldown、logoutを実機確認している。
- Authorized domains、email enumeration protection、Identity Toolkit quota、billing budget alertをConsoleで確認している。
- 静的配備は `wrangler.json` のAssets構成を維持し、Stripe専用WorkerへだけD1 bindingとsecretを設定している。
- 本番D1 schemaを取得し、`migrations/0001_stripe_webhook_events.sql`との差分をレビューしてから適用している。
- Stripe test modeでCheckout、cancel、署名検証、event再送、active、past_due、canceled、期限切れを確認している。
- `/checkout` と `/premium` へCloudflare Rate Limiting、WAF、監視、request/error alertを設定している。
- `STRIPE_SECRET_KEY`と`STRIPE_WEBHOOK_SECRET`はStripe専用Worker secret storeだけにあり、静的build環境とclient bundleには存在しない。
