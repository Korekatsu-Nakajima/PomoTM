export const LANGUAGE_STORAGE_KEY = "pomotm_lang";

export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

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
    close: string;
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
      close: "設定を閉じる",
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
      close: "Close Settings",
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
