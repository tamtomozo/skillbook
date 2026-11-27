/**
 * 町の1日（時刻・明るさ）と、日替わりの割引セール。
 *
 * 時刻はセーブの `minutes`（冒険を始めてからのゲーム内の通算の分）で持つ。
 * 1日は夜明け（DAWN = 5:00）に切り替わり、その日のセールも夜明けに入れ替わる。
 */

/** 現実の1秒で進むゲーム内の分数（1日 = 現実の12分） */
export const GAME_MIN_PER_SEC = 2;
export const DAY_MIN = 24 * 60;
/** 日付が変わる時刻（夜明け） */
export const DAWN = 5 * 60;
/** ゲームを始めたときの時刻（1日目の朝 7:00） */
export const START_MINUTES = 7 * 60;
/** ベッドで寝ると目が覚める時刻 */
export const WAKE = 6 * 60;

/** 0:00 からの分（0〜1439） */
export const clockOf = (minutes: number) => ((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN;
/** 何日目か（1日目から。夜明けで変わる） */
export const dayOf = (minutes: number) => Math.floor((minutes - DAWN) / DAY_MIN) + 1;

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
export const PHASE_NAME: Record<Phase, string> = { dawn: '朝', day: '昼', dusk: '夕方', night: '夜' };
export const PHASE_ICON: Record<Phase, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };

export function phaseOf(minutes: number): Phase {
  const h = clockOf(minutes) / 60;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 19.5) return 'dusk';
  return 'night';
}

/** 寝てから起きるまで：夕方6時〜朝6時なら次の朝まで、それ以外はひと休み（1時間） */
export function sleepUntil(minutes: number): number {
  const c = clockOf(minutes);
  if (c >= 18 * 60) return minutes - c + DAY_MIN + WAKE;
  if (c < WAKE) return minutes - c + WAKE;
  return minutes + 60;
}

/** 時刻の表示を切り替える間隔（分）。表示は 7:00 → 7:15 → 7:30 のように進む */
export const CLOCK_STEP = 15;

export const clockText = (minutes: number) => {
  const c = Math.floor(clockOf(minutes) / CLOCK_STEP) * CLOCK_STEP;
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- 明るさ

/** 町の空気の色。dark: 夜の暗さ（0〜1）、tint: 景色に掛ける色（乗算）、lamp: 灯りのつき具合（0〜1） */
export interface Sky {
  dark: number;
  tint: [number, number, number];
  /** tint の強さ（0〜1） */
  tintA: number;
  lamp: number;
}

/** 時刻（時）ごとの空気。あいだは補間する */
const SKY_KEYS: { h: number; dark: number; tint: [number, number, number]; tintA: number }[] = [
  { h: 0, dark: 0.74, tint: [80, 100, 190], tintA: 0.4 },
  { h: 4.5, dark: 0.74, tint: [80, 100, 190], tintA: 0.4 },
  { h: 5.5, dark: 0.38, tint: [200, 120, 190], tintA: 0.42 },
  { h: 6.5, dark: 0.06, tint: [255, 165, 130], tintA: 0.38 },
  { h: 8, dark: 0, tint: [255, 235, 210], tintA: 0.06 },
  { h: 15.5, dark: 0, tint: [255, 240, 220], tintA: 0.04 },
  { h: 17, dark: 0, tint: [255, 180, 100], tintA: 0.38 },
  { h: 18.3, dark: 0.14, tint: [255, 120, 70], tintA: 0.55 },
  { h: 19.5, dark: 0.5, tint: [150, 90, 170], tintA: 0.48 },
  { h: 20.5, dark: 0.74, tint: [80, 100, 190], tintA: 0.4 },
  { h: 24, dark: 0.74, tint: [80, 100, 190], tintA: 0.4 },
];

export function skyOf(minutes: number): Sky {
  const h = clockOf(minutes) / 60;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const k = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));
  const mix = (x: number, y: number) => x + (y - x) * k;
  // 灯りは日が傾くころにつき、明るくなると消える
  const lamp = h >= 18 ? Math.min(1, (h - 18) / 1) : h < 6.5 ? Math.min(1, (6.5 - h) / 1) : 0;
  return {
    dark: mix(a.dark, b.dark),
    tint: [mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2])],
    tintA: mix(a.tintA, b.tintA),
    lamp,
  };
}

// ---------------------------------------------------------------- セール

export type SaleTarget = 'item' | 'book' | 'weapon' | 'armor' | 'forge' | 'craft';

export interface SaleDef {
  target: SaleTarget;
  /** セールをする店 */
  shop: 'shop' | 'smithy';
  /** 割引の名前（〇〇が△割引き） */
  name: string;
  /** 割引率 */
  off: number;
}

export const SALES: SaleDef[] = [
  { target: 'item', shop: 'shop', name: '回復薬とエーテル', off: 0.3 },
  { target: 'book', shop: 'shop', name: 'スキルブック', off: 0.2 },
  { target: 'weapon', shop: 'smithy', name: '武器', off: 0.2 },
  { target: 'armor', shop: 'smithy', name: '防具', off: 0.2 },
  { target: 'forge', shop: 'smithy', name: '鍛冶の代金', off: 0.3 },
  { target: 'craft', shop: 'smithy', name: '装備作成の代金', off: 0.3 },
];

/** セールのある日の割合 */
export const SALE_CHANCE = 0.35;

function hashDay(day: number, salt: number): number {
  let h = Math.imul(day ^ 0x5bd1e995, 0x27d4eb2d) + salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** その日のセール（ない日は null）。日付から決まるので、読み込み直しても変わらない */
export function saleOfDay(day: number): SaleDef | null {
  // 1日目はセールなし。2日目は必ずセール（仕組みを知ってもらう）
  if (day <= 1) return null;
  if (day !== 2 && hashDay(day, 17) >= SALE_CHANCE) return null;
  return SALES[Math.floor(hashDay(day, 91) * SALES.length)];
}

export const offText = (off: number) => `${Math.round(off * 10)}割引き`;

/** 割り引いた値段（5 G 単位に丸める。最低 1 G） */
export function discount(price: number, off: number): number {
  if (off <= 0 || price <= 0) return price;
  return Math.max(1, Math.round((price * (1 - off)) / 5) * 5);
}
