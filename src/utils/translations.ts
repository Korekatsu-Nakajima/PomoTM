export const LANGUAGE_STORAGE_KEY = "pomotm_lang";

export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export type LegalDocument = {
  title: string;
  introduction: string;
  updatedAt: string;
  sections: LegalSection[];
};

export type TranslationDictionary = {
  timer: {
    focus: string;
    break: string;
  };
  header: {
    privacyPolicy: string;
    focus25Minutes: string;
    break5Minutes: string;
    start: string;
    pause: string;
    reset: string;
    autoSwitch: string;
    debug: string;
    shop: string;
    openShop: string;
    settings: string;
    openSettings: string;
    goldTomatoes: string;
    ufoDebugMode: string;
    catDebugMode: string;
    shortenToTenSeconds: string;
    setTenSeconds: string;
    on: string;
    off: string;
  };
  settings: {
    title: string;
    description: string;
    language: string;
    japanese: string;
    english: string;
    sound: string;
    soundOn: string;
    soundOff: string;
    close: string;
  };
  legal: {
    termsLink: string;
    privacyLink: string;
    close: string;
    updatedLabel: string;
    terms: LegalDocument;
    privacy: LegalDocument;
  };
  shop: {
    title: string;
    description: string;
    close: string;
    ufoUnlocked: string;
    unlockUfo: string;
    octopusUnlocked: string;
    unlockOctopus: string;
    doubleDrop: string;
    doubleDropDescription: string;
    balloonBoost: string;
    balloonBoostDescription: string;
    rocketBoost: string;
    rocketBoostDescription: string;
    goldBoost: string;
    goldBoostDescription: string;
    breakNote: string;
    activeRemaining: string;
    notOwned: string;
    use: string;
  };
};

export const translations: Record<Language, TranslationDictionary> = {
  ja: {
    timer: {
      focus: "集中",
      break: "休憩",
    },
    header: {
      privacyPolicy: "プライバシーポリシー",
      focus25Minutes: "集中 25分",
      break5Minutes: "休憩 5分",
      start: "開始",
      pause: "一時停止",
      reset: "リセット",
      autoSwitch: "自動切り替え",
      debug: "デバッグ",
      shop: "アイテム管理",
      openShop: "アイテム管理を開く",
      settings: "設定",
      openSettings: "設定を開く",
      goldTomatoes: "所持している金のトマト",
      ufoDebugMode: "UFOデバッグモード",
      catDebugMode: "猫デバッグモード",
      shortenToTenSeconds: "残り時間を10秒に短縮",
      setTenSeconds: "残り10秒にする",
      on: "ON",
      off: "OFF",
    },
    settings: {
      title: "設定",
      description: "表示言語はすぐに切り替わります。",
      language: "言語",
      japanese: "日本語",
      english: "English",
      sound: "音量",
      soundOn: "ON",
      soundOff: "OFF",
      close: "設定を閉じる",
    },
    legal: {
      termsLink: "利用規約",
      privacyLink: "プライバシーポリシー",
      close: "閉じる",
      updatedLabel: "最終更新",
      terms: {
        title: "利用規約",
        introduction: "本利用規約は、PomoTM（以下「本サービス」）の利用条件を定めるものです。本サービスを利用することで、本規約に同意したものとみなされます。",
        updatedAt: "2026年9月21日",
        sections: [
          {
            title: "1. サービスの目的",
            paragraphs: [
              "本サービスは、ポモドーロタイマー、物理演算を用いた視覚演出、アイテム等を通じて、勉強や作業の集中を補助する個人開発のWebアプリです。特定の成果、学習効果、生産性または継続的な提供を保証するものではありません。",
              "本サービスはゲストとして利用できます。アカウント機能は、本人確認、将来の端末間同期、プレミアム状態または購入情報の管理等のために提供されます。",
            ],
          },
          {
            title: "2. アカウントの管理",
            paragraphs: [
              "利用者は、登録情報を正確に保ち、パスワード、Googleアカウントおよび認証端末を自己の責任で管理するものとします。第三者による不正利用が疑われる場合は、速やかに認証情報を変更してください。",
              "メールアドレス登録では、確認メールによる所有確認が完了するまでログイン機能を利用できません。虚偽の情報、他人の情報または権限のないアカウントを使用してはなりません。",
            ],
          },
          {
            title: "3. 禁止事項",
            paragraphs: [
              "法令または公序良俗に反する行為、不正アクセス、認証・課金処理の回避、他の利用者または第三者へのなりすまし、サービスの運営を妨害する過度な負荷、脆弱性の悪用、データの改ざん、マルウェアの送信を禁止します。",
              "本サービス、Google、Firebase、Cloudflareその他の第三者サービスの権利を侵害する行為、または各サービスの規約に違反する行為を禁止します。",
            ],
          },
          {
            title: "4. 知的財産権",
            paragraphs: [
              "本サービスに含まれるプログラム、デザイン、文章、画像、音声その他のコンテンツに関する権利は、運営者または正当な権利者に帰属します。法令で認められる範囲を超えた複製、再配布または商用利用はできません。",
            ],
          },
          {
            title: "5. サービスの変更・停止",
            paragraphs: [
              "保守、障害、セキュリティ対応、外部サービスの仕様変更その他の事情により、事前の通知なく本サービスの全部または一部を変更、中断または終了することがあります。",
            ],
          },
          {
            title: "6. 免責および責任の制限",
            paragraphs: [
              "本サービスは現状有姿で提供されます。利用可能性、正確性、完全性、特定目的への適合性、データの永続性について、法令上認められる範囲で保証しません。重要なデータは利用者自身で管理してください。",
              "本サービスの利用または利用不能、外部サービス、通信障害、データ消失等から生じた損害について、運営者は故意または重過失がある場合を除き、法令上認められる範囲で責任を負いません。消費者保護法令により制限できない権利は影響を受けません。",
            ],
          },
          {
            title: "7. 規約の変更",
            paragraphs: [
              "法令、機能または運用の変更に応じて本規約を改定することがあります。重要な変更は、本サービス内または公開ページ上で合理的な方法により案内します。改定後も利用を継続した場合、改定内容に同意したものとみなされます。",
            ],
          },
        ],
      },
      privacy: {
        title: "プライバシーポリシー",
        introduction: "本ポリシーは、PomoTMにおける利用者情報の取得、利用、保存および保護について説明するものです。",
        updatedAt: "2026年9月21日",
        sections: [
          {
            title: "1. 取得する情報",
            paragraphs: [
              "Firebase Authenticationを通じて、FirebaseのユーザーID、メールアドレス、メール確認状態、表示名、プロフィール画像、利用した認証方式等を取得します。Googleログインを選択した場合は、利用者がGoogleの同意画面で許可した基本プロフィール情報を取得します。Googleのパスワードを本サービスが取得することはありません。",
              "機能の提供に応じて、タイマーやゲームの設定、獲得アイテム、プレミアム状態、購入・サブスクリプション状態、ゲストデータ移行用ID等を端末のlocalStorageまたはCloudflare D1等のデータベースへ保存することがあります。決済カード番号等は、将来導入する決済事業者が直接処理し、本サービスでは保持しません。",
              "安全性、障害解析および性能改善のため、IPアドレス、ブラウザ・端末情報、アクセス日時、操作・エラー情報等の技術情報がホスティング、認証、解析または広告サービスにより取得されることがあります。",
            ],
          },
          {
            title: "2. 利用目的",
            paragraphs: [
              "取得した情報は、本人確認、ログイン状態の維持、不正利用防止、メール確認、端末間同期、ゲームデータの保存、プレミアム・課金状態の管理、問い合わせ対応、品質・安全性の改善、法令上必要な対応のために利用します。",
              "目的を変更する場合は、変更後の目的が合理的に関連する範囲で行い、必要に応じて本サービス内で案内または同意を取得します。",
            ],
          },
          {
            title: "3. 外部サービスと委託先",
            paragraphs: [
              "本サービスは、認証にGoogle Firebase Authentication、ホスティングやデータ保存にCloudflareおよびCloudflare D1を利用します。また、広告、アクセス解析、決済等を導入する場合は、その提供事業者へ必要最小限の情報が送信されることがあります。",
              "これらの事業者は、それぞれのプライバシーポリシーおよび契約条件に基づいて情報を処理します。利用者はGoogleアカウントの設定から、本サービスに付与したアクセス権を確認または取り消すことができます。",
            ],
          },
          {
            title: "4. 第三者提供",
            paragraphs: [
              "利用者情報を販売しません。利用者の同意がある場合、サービス提供に必要な委託先へ提供する場合、事業承継に伴う場合、または法令・裁判所・行政機関の適法な要請に対応する場合を除き、個人情報を第三者へ提供しません。",
            ],
          },
          {
            title: "5. データの管理と保存期間",
            paragraphs: [
              "合理的な技術的・組織的安全管理措置を講じますが、インターネット上の送信または保存の完全な安全性を保証するものではありません。認証情報はFirebase SDKにより管理し、本サービス独自のlocalStorageへパスワードやID tokenを保存しません。",
              "情報は、サービス提供、契約・課金管理、セキュリティ、法令遵守に必要な期間保持し、その後削除または匿名化します。端末内データはブラウザのサイトデータ削除により消去できます。",
            ],
          },
          {
            title: "6. 利用者の選択と削除",
            paragraphs: [
              "利用者はGoogleアカウント側で連携解除を行えます。アカウント情報の確認、訂正、削除その他の請求については、本サービスまたは配布ページに掲示する問い合わせ窓口から申請できます。法令または不正防止上必要な情報は、一定期間保持する場合があります。",
            ],
          },
          {
            title: "7. 未成年者",
            paragraphs: [
              "居住地域の法令上、個人情報の提供に保護者の同意が必要な年齢の利用者は、保護者の同意を得た上で本サービスを利用してください。",
            ],
          },
          {
            title: "8. ポリシーの変更",
            paragraphs: [
              "機能、外部サービスまたは法令の変更に応じて本ポリシーを改定することがあります。重要な変更は、本サービス内または公開ページ上で案内します。",
            ],
          },
        ],
      },
    },
    shop: {
      title: "アイテム管理",
      description: "獲得したアイテムの確認と使用ができます",
      close: "アイテム管理を閉じる",
      ufoUnlocked: "UFO解除済み",
      unlockUfo: "UFO解除",
      octopusUnlocked: "宇宙タコ解除済み",
      unlockOctopus: "宇宙タコ解除",
      doubleDrop: "ダブルドロップ",
      doubleDropDescription: "1回の供給量を増やすためのアイテムです。（有効時間: 30分）",
      balloonBoost: "気球ブースト",
      balloonBoostDescription: "気球イベントを強化するためのアイテムです。（有効時間: 30分）",
      rocketBoost: "ロケットブースト",
      rocketBoostDescription: "ロケットイベントを強化するためのアイテムです。（有効時間: 30分）",
      goldBoost: "ゴールドブースト",
      goldBoostDescription: "金トマトの出現確率をアップさせるアイテムです。（有効時間: 30分）",
      breakNote: "※休憩中はアイテムの減算は行われません。",
      activeRemaining: "使用中 残り{time}",
      notOwned: "未所持",
      use: "使用",
    },
  },
  en: {
    timer: {
      focus: "Focus",
      break: "Break",
    },
    header: {
      privacyPolicy: "Privacy Policy",
      focus25Minutes: "Focus for 25 minutes",
      break5Minutes: "Break for 5 minutes",
      start: "Start",
      pause: "Pause",
      reset: "Reset",
      autoSwitch: "Auto Switch",
      debug: "Debug",
      shop: "Item Shop",
      openShop: "Open Item Shop",
      settings: "Settings",
      openSettings: "Open Settings",
      goldTomatoes: "Gold Tomatoes owned",
      ufoDebugMode: "UFO Debug Mode",
      catDebugMode: "Cat Debug Mode",
      shortenToTenSeconds: "Set the remaining time to 10 seconds",
      setTenSeconds: "Set to 10 seconds",
      on: "ON",
      off: "OFF",
    },
    settings: {
      title: "Settings",
      description: "Display language changes immediately.",
      language: "Language",
      japanese: "日本語",
      english: "English",
      sound: "Sound",
      soundOn: "ON",
      soundOff: "OFF",
      close: "Close Settings",
    },
    legal: {
      termsLink: "Terms of Service",
      privacyLink: "Privacy Policy",
      close: "Close",
      updatedLabel: "Last updated",
      terms: {
        title: "Terms of Service",
        introduction: "These Terms of Service govern your use of PomoTM (the “Service”). By using the Service, you agree to these Terms.",
        updatedAt: "September 21, 2026",
        sections: [
          {
            title: "1. Purpose of the Service",
            paragraphs: [
              "The Service is an independently developed web application intended to support study and work sessions through a Pomodoro timer, physics-based visuals, and optional game items. It does not guarantee any particular result, learning outcome, productivity gain, or uninterrupted availability.",
              "The Service can be used as a guest. Account features may be provided for identity verification, future cross-device synchronization, and management of premium or purchase status.",
            ],
          },
          {
            title: "2. Account Management",
            paragraphs: [
              "You are responsible for keeping your registration information accurate and for securing your password, Google account, and authenticated devices. If you suspect unauthorized use, promptly update the relevant credentials.",
              "Email accounts cannot use signed-in features until ownership is confirmed through the verification message. You must not use false information, another person’s information, or an account you are not authorized to use.",
            ],
          },
          {
            title: "3. Prohibited Conduct",
            paragraphs: [
              "You may not violate applicable law, gain unauthorized access, bypass authentication or payment controls, impersonate another person, place an unreasonable load on the Service, exploit vulnerabilities, alter data without authorization, transmit malware, or otherwise interfere with operation of the Service.",
              "You may not infringe the rights of the Service, Google, Firebase, Cloudflare, or any other third party, or use their services in violation of their applicable terms.",
            ],
          },
          {
            title: "4. Intellectual Property",
            paragraphs: [
              "Rights in the software, design, text, images, audio, and other content included in the Service belong to the operator or their respective lawful owners. You may not reproduce, redistribute, or commercially exploit that content beyond what applicable law permits.",
            ],
          },
          {
            title: "5. Changes and Suspension",
            paragraphs: [
              "The Service may be changed, suspended, or discontinued, in whole or in part and without prior notice, for maintenance, outages, security concerns, third-party service changes, or other operational reasons.",
            ],
          },
          {
            title: "6. Disclaimers and Limitation of Liability",
            paragraphs: [
              "The Service is provided “as is.” To the extent permitted by law, no warranty is made regarding availability, accuracy, completeness, fitness for a particular purpose, or permanent retention of data. You should maintain your own copy of important information.",
              "To the extent permitted by law, the operator is not liable for losses arising from use or inability to use the Service, third-party services, network failure, or loss of data, except where caused by willful misconduct or gross negligence. Rights that cannot be limited under applicable consumer law remain unaffected.",
            ],
          },
          {
            title: "7. Changes to These Terms",
            paragraphs: [
              "These Terms may be revised to reflect changes in law, features, or operation. Material changes will be communicated through the Service or a public page by reasonable means. Continued use after a revision constitutes acceptance of the updated Terms.",
            ],
          },
        ],
      },
      privacy: {
        title: "Privacy Policy",
        introduction: "This Policy explains how PomoTM collects, uses, stores, and protects information about its users.",
        updatedAt: "September 21, 2026",
        sections: [
          {
            title: "1. Information We Collect",
            paragraphs: [
              "Through Firebase Authentication, we collect a Firebase user ID, email address, email-verification status, display name, profile image, and authentication provider. If you choose Google sign-in, we receive the basic profile information you approve on Google’s consent screen. The Service never receives your Google password.",
              "Depending on the features you use, timer and game settings, collected items, premium status, purchase or subscription status, and a guest-migration identifier may be stored in browser localStorage or a database such as Cloudflare D1. If payment processing is introduced, payment-card details will be handled directly by the payment provider and will not be stored by the Service.",
              "Hosting, authentication, analytics, advertising, or security providers may collect technical information such as IP address, browser and device information, access time, interactions, and error data for security, diagnostics, and performance improvement.",
            ],
          },
          {
            title: "2. How We Use Information",
            paragraphs: [
              "Information is used to authenticate users, maintain signed-in sessions, prevent abuse, verify email ownership, synchronize devices, save game data, manage premium and billing status, respond to inquiries, improve quality and security, and satisfy legal obligations.",
              "If a purpose changes, the new purpose will remain reasonably related to the original purpose, and notice or consent will be provided when required.",
            ],
          },
          {
            title: "3. Service Providers",
            paragraphs: [
              "The Service uses Google Firebase Authentication for identity services and Cloudflare, including Cloudflare D1, for hosting or data storage. If advertising, analytics, or payment features are enabled, the relevant provider may receive the minimum information needed to provide that feature.",
              "Each provider processes information under its own privacy policy and contractual terms. You can review or revoke access granted to the Service through your Google Account settings.",
            ],
          },
          {
            title: "4. Disclosure to Third Parties",
            paragraphs: [
              "We do not sell personal information. Information is disclosed only with your consent, to service providers necessary to operate the Service, in connection with a business transfer, or when required by applicable law or a lawful request from a court or public authority.",
            ],
          },
          {
            title: "5. Security and Retention",
            paragraphs: [
              "Reasonable technical and organizational safeguards are used, but no internet transmission or storage system can be guaranteed completely secure. Authentication is managed through the Firebase SDK, and the Service does not store passwords or ID tokens in its own localStorage.",
              "Information is retained only as long as reasonably needed to provide the Service, administer subscriptions or transactions, maintain security, and comply with law, after which it is deleted or anonymized. Local device data can be removed by clearing the site’s browser data.",
            ],
          },
          {
            title: "6. Your Choices and Deletion",
            paragraphs: [
              "You can revoke Google access from your Google Account. Requests to access, correct, or delete account information may be submitted through the contact method published in the Service or on its distribution page. Some information may be retained where required by law or reasonably necessary to prevent abuse.",
            ],
          },
          {
            title: "7. Children",
            paragraphs: [
              "If the law where you live requires parental consent before providing personal information, you must obtain that consent before using the Service.",
            ],
          },
          {
            title: "8. Changes to This Policy",
            paragraphs: [
              "This Policy may be updated to reflect changes to features, service providers, or law. Material changes will be communicated through the Service or a public page.",
            ],
          },
        ],
      },
    },
    shop: {
      title: "Item Shop",
      description: "Manage and use your collected power-ups.",
      close: "Close Item Shop",
      ufoUnlocked: "UFO Unlocked",
      unlockUfo: "Unlock UFO",
      octopusUnlocked: "Space Octopus Unlocked",
      unlockOctopus: "Unlock Space Octopus",
      doubleDrop: "Double Drop",
      doubleDropDescription: "Increases each tomato delivery. (Duration: 30 min)",
      balloonBoost: "Balloon Boost",
      balloonBoostDescription: "Boosts balloon event odds. (Duration: 30 min)",
      rocketBoost: "Rocket Boost",
      rocketBoostDescription: "Boosts rocket event odds. (Duration: 30 min)",
      goldBoost: "Gold Boost",
      goldBoostDescription: "Increases the chance of Gold Tomatoes. (Duration: 30 min)",
      breakNote: "Items are not consumed during breaks.",
      activeRemaining: "Active, {time} remaining",
      notOwned: "Not owned",
      use: "Use",
    },
  },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string"
    && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
