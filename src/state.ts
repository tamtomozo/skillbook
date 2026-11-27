import { BOOKS, SKILLS, START_BOOK, isBook, lvUpCost, spSpent } from './skills';
import { eqSellPrice } from './equipment';
import { DUNGEONS, FIELD_DUNGEONS, RANK_B, RANK_S, RUINS, rankDef } from './dungeons';
import { START_MINUTES } from './daytime';

export const HOTBAR_SIZE = 5;
/** 持ち歩けるスキルブックの数 */
export const MAX_CARRY = 3;

/** セーブデータの版。2 = スキルブックの系統（パラメタ・技）ができた版 */
export const SAVE_VER = 2;

/** 未鑑定の本。no は拾った順の通し番号（鑑定するまで変わらない） */
export interface UnidentifiedBook {
  no: number;
  book: string;
}

export interface SaveData {
  ver: number;
  gold: number;
  /** 銀行に預けているゴールド。倒れても減らない */
  bank: number;
  /** 未使用の経験値 (SPに変換できる) */
  exp: number;
  sp: number;
  /** これまでにEXPから変換したSPの数 (変換コストが上がる) */
  spBought: number;
  /** 持っているすべての本 */
  books: string[];
  /** かばんに入れて持ち歩いている本（最大 MAX_CARRY 冊）。残りは家の本棚にある */
  carried: string[];
  /** 本ごとのレベル。本はレベル0（効果なし）から始まる */
  bookLv: Record<string, number>;
  /**
   * ダンジョンで拾ったまま、まだ鑑定していない本。正体が分からず使えない。
   * 持っている本と同じ本のこともある。かばんの枠は使わない。
   * （以前は「呪われた本」と呼んでいたので、セーブの項目名は cursed のまま）
   */
  cursed: UnidentifiedBook[];
  /** これまでに拾った未鑑定の本の数（通し番号に使う） */
  curseSeq: number;
  /** 同じ本の予備（本の id → 冊数）。道具屋で売れる */
  spares: Record<string, number>;
  /** 覚えたスキル（本のレベルから決まる） */
  learned: string[];
  hotbar: (string | null)[];
  /** 装備中の武器・防具と、持っている武器・防具 */
  weapon: string;
  armor: string;
  weapons: string[];
  armors: string[];
  /** 鍛冶で鍛えた段階（装備の id → +n） */
  plus: Record<string, number>;
  /** 持っている鉱石（鉱石の id → 個数） */
  ores: Record<string, number>;
  /** 持っている魔物の素材（素材の id → 個数）。武器作成に使う */
  mats: Record<string, number>;
  potions: number;
  ethers: number;
  /** これまでに到達した最も高い危険度（店の入荷などが決まる） */
  maxFloor: number;
  /** 古代遺跡の秘宝を手に入れた */
  cleared: boolean;
  /** ハンターギルドのランク（0 = E … 3 = B, 4 = S） */
  rank: number;
  /** 最後の階まで踏破したダンジョン */
  conquered: string[];
  /** ダンジョンごとに到達した最も深い階 */
  reached: Record<string, number>;
  /** ゲーム内の時刻（冒険を始めてからの通算の分。何日目かと時刻はここから決まる） */
  minutes: number;
  /** 古いセーブから移行したときの知らせ（一度表示したら消す） */
  notice?: string;
}

export function newSave(): SaveData {
  return {
    ver: SAVE_VER,
    gold: 100,
    bank: 0,
    exp: 0,
    sp: 3,
    spBought: 0,
    books: [START_BOOK],
    carried: [START_BOOK],
    bookLv: { [START_BOOK]: 0 },
    cursed: [],
    curseSeq: 0,
    spares: {},
    learned: [],
    hotbar: Array(HOTBAR_SIZE).fill(null),
    weapon: 'dagger',
    armor: 'cloth',
    weapons: ['dagger'],
    armors: ['cloth'],
    plus: {},
    ores: {},
    mats: {},
    potions: 2,
    ethers: 1,
    maxFloor: 0,
    cleared: false,
    rank: 0,
    conquered: [],
    reached: {},
    minutes: START_MINUTES,
  };
}

/** 銀行の利息：階段を1つ降りるたびに預金の BANK_RATE（1回あたり BANK_INTEREST_CAP G まで） */
export const BANK_RATE = 0.02;
export const BANK_INTEREST_CAP = 200;

export function bankInterest(bank: number): number {
  return Math.min(BANK_INTEREST_CAP, Math.floor(bank * BANK_RATE));
}

/** n個目のSPを得るのに必要なEXP */
export function spCost(n: number): number {
  return 25 + 12 * n;
}

const KEY = 'skillbook-hunter-save-v1';

export function saveGame(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ストレージが使えない環境では保存しない */
  }
}

export function loadGame(): SaveData | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const raw = JSON.parse(s) as Partial<SaveData>;
    const d = { ...newSave(), ...raw };
    d.bank = Math.max(0, Math.floor(Number(d.bank) || 0));
    d.minutes = Math.max(0, Number(d.minutes) || START_MINUTES);
    if ((raw.ver ?? 1) < SAVE_VER) migrateV1(d, raw);
    migrateCut(d);
    migrateCursed(d, raw);
    if (raw.rank === undefined) migrateGuild(d);
    d.rank = Math.max(0, Math.min(RANK_S, Math.floor(Number(d.rank) || 0)));
    d.conquered = (d.conquered ?? []).filter((id) => DUNGEONS.some((x) => x.id === id));
    d.reached = { ...(d.reached ?? {}) };
    d.books = d.books.filter(isBook);
    d.carried = d.carried.filter((b) => d.books.includes(b)).slice(0, MAX_CARRY);
    if (d.books.length === 0) {
      d.books = [START_BOOK];
      d.carried = [START_BOOK];
    }
    d.spares = Object.fromEntries(Object.entries(d.spares ?? {}).filter(([id, n]) => d.books.includes(id) && n > 0));
    // 本のレベルで覚えるスキルをそろえる
    for (const id of d.books) {
      const b = BOOKS.find((x) => x.id === id);
      if (!b) continue;
      d.bookLv[id] = Math.min(b.maxLv, d.bookLv[id] ?? 0);
      for (const s of b.skills) if (SKILLS[s].lv <= d.bookLv[id] && !d.learned.includes(s)) d.learned.push(s);
    }
    d.learned = d.learned.filter((s) => SKILLS[s]);
    d.hotbar = Array.from({ length: HOTBAR_SIZE }, (_, i) => {
      const id = d.hotbar[i] ?? null;
      return id && d.learned.includes(id) && SKILLS[id].kind === 'active' ? id : null;
    });
    return d;
  } catch {
    return null;
  }
}

/**
 * 呪われた本をそろえる。呪われた本を「持っている本」として扱っていた版のセーブは、
 * 本の一覧から外して呪われた本の山へ移す。
 */
function migrateCursed(d: SaveData, raw: Partial<SaveData>) {
  const old = raw as { cursed?: unknown[]; cursedNo?: Record<string, number> };
  const list: UnidentifiedBook[] = [];
  (old.cursed ?? []).forEach((c, i) => {
    if (typeof c === 'string') {
      if (!isBook(c)) return;
      d.books = d.books.filter((b) => b !== c);
      d.carried = d.carried.filter((b) => b !== c);
      delete d.bookLv[c];
      list.push({ no: old.cursedNo?.[c] ?? i + 1, book: c });
    } else if (c && typeof c === 'object' && isBook((c as UnidentifiedBook).book)) {
      list.push({ no: Number((c as UnidentifiedBook).no) || i + 1, book: (c as UnidentifiedBook).book });
    }
  });
  d.cursed = list;
  d.curseSeq = Math.max(d.curseSeq || 0, Object.keys(old.cursedNo ?? {}).length, ...list.map((c) => c.no));
  delete (d as { cursedNo?: unknown }).cursedNo;
}

/**
 * ハンターギルドができる前のセーブ。古代遺跡でたどり着いた階（= 危険度）から、ランクを認定する。
 * 秘宝を手に入れていれば S、遺跡の地下7階まで行っていれば遺跡に入れる B。
 */
function migrateGuild(d: SaveData) {
  const m = d.maxFloor;
  d.rank = d.cleared ? RANK_S : m >= 7 ? RANK_B : m >= 5 ? 2 : m >= 3 ? 1 : 0;
  // 認定したランクより下のダンジョンは踏破したことにする
  d.conquered = FIELD_DUNGEONS.filter((x) => x.rank < d.rank).map((x) => x.id);
  d.reached = {};
  // 遺跡の途中の階から挑めるのは、遺跡に入れるランクのときだけ（旧版の階をそのまま引き継ぐ）
  if (d.rank >= RANK_B) d.reached[RUINS.id] = Math.min(RUINS.depths.length, m);
  if (m > 0) {
    const r = rankDef(d.rank);
    d.notice = (d.notice ? d.notice + ' ' : '') + `町にハンターギルドができた！ これまでの冒険が認められ、ランク ${r.name}（${r.title}）に認定された。ギルドでは各地のダンジョンへ出発したり、昇格試験を受けたりできる。`;
  }
}

/**
 * 弓と窮地の書がなくなる前のセーブ。なくなった本と装備は、道具屋・武器防具屋の買い取り値ぶんのゴールドに替え、
 * 本のレベル上げに使った SP を返す。未鑑定のままの本は消える。
 */
const CUT_BOOKS: Record<string, { name: string; gold: number }> = {
  bow1: { name: '弓術の書・初級', gold: 150 },
  bow2: { name: '弓術の書・中級', gold: 325 },
  bow3: { name: '弓術の書・上級', gold: 500 },
  bow4: { name: '弓術の書・二段', gold: 500 },
  rage: { name: '背水の書', gold: 400 },
  endure: { name: '不屈の書', gold: 400 },
  awaken: { name: '覚醒の書', gold: 400 },
  reckless: { name: '捨て身の書', gold: 400 },
  aegis: { name: '魔盾の書', gold: 400 },
  fortune: { name: '起死回生の書', gold: 400 },
};
const CUT_WEAPONS: Record<string, { name: string; price: number }> = {
  shortbow: { name: '狩人の弓', price: 160 },
  longbow: { name: 'イチイの長弓', price: 520 },
  spiritbow: { name: '精霊樹の弓', price: 1350 },
  bonebow: { name: '白骨の弓', price: 880 },
};

function migrateCut(d: SaveData) {
  let gold = 0;
  let sp = 0;
  const names: string[] = [];
  for (const [id, cut] of Object.entries(CUT_BOOKS)) {
    const n = (d.books.includes(id) ? 1 : 0) + (d.spares?.[id] ?? 0);
    if (n > 0) {
      gold += cut.gold * n;
      sp += spSpent(d.bookLv?.[id] ?? 0);
      names.push(n > 1 ? `${cut.name}×${n}` : cut.name);
    }
    d.books = d.books.filter((b) => b !== id);
    d.carried = d.carried.filter((b) => b !== id);
    delete d.bookLv?.[id];
    delete d.spares?.[id];
  }
  for (const [id, cut] of Object.entries(CUT_WEAPONS)) {
    if (d.weapons.includes(id)) {
      gold += eqSellPrice(cut.price, d.plus?.[id] ?? 0);
      names.push(cut.name);
    }
    d.weapons = d.weapons.filter((w) => w !== id);
    delete d.plus?.[id];
    if (d.weapon === id) d.weapon = 'dagger';
  }
  if (!d.weapons.includes('dagger')) d.weapons.unshift('dagger');
  // 未鑑定の本（古い版では本の id の文字列のこともある）。この後 migrateCursed で形をそろえる
  const cursedBook = (c: unknown) => (typeof c === 'string' ? c : (c as UnidentifiedBook | null)?.book ?? '');
  const cursed = (d.cursed ?? []) as unknown[];
  const lostCursed = cursed.filter((c) => CUT_BOOKS[cursedBook(c)]).length;
  d.cursed = cursed.filter((c) => !CUT_BOOKS[cursedBook(c)]) as UnidentifiedBook[];
  if (names.length === 0 && lostCursed === 0) return;
  d.gold += gold;
  d.sp += sp;
  let msg = '弓と窮地の書は、この世界から姿を消した。';
  if (names.length) msg += `${names.join('・')}は引き取られ、${gold} G${sp > 0 ? ` と SP ${sp}` : ''} が戻ってきた。`;
  if (lostCursed) msg += `未鑑定の本のうち ${lostCursed} 冊は、霧のように消えてしまった。`;
  d.notice = (d.notice ? d.notice + ' ' : '') + msg;
}

/** 旧版（ver 1）の本の値段。道具屋で買った本は代金を返す */
const V1_SHOP_PRICE: Record<string, number> = { healer: 250, sword: 350, guard: 600 };

/**
 * 旧版のセーブを新しいスキルブックの仕組みへ移す。
 * 本はすべて新しい仕組みのものに入れ替わるので、本のレベル上げに使ったSPと、道具屋で本を買った代金を返す。
 */
function migrateV1(d: SaveData, raw: Partial<SaveData>) {
  const oldBooks = raw.books ?? [];
  const oldLv = raw.bookLv ?? {};
  let sp = 0;
  let gold = 0;
  for (const id of oldBooks) {
    for (let lv = 1; lv < (oldLv[id] ?? 1); lv++) sp += lvUpCost(lv);
    gold += V1_SHOP_PRICE[id] ?? 0;
  }
  // 装備と鍛えた段階はそのまま引き継ぐ（鎧は新しい「防御力」で計算される）
  d.ver = SAVE_VER;
  d.books = [START_BOOK];
  d.carried = [START_BOOK];
  d.bookLv = { [START_BOOK]: 1 };
  d.learned = ['smash'];
  d.hotbar = ['smash', ...Array(HOTBAR_SIZE - 1).fill(null)];
  d.sp += sp;
  d.gold += gold;
  d.notice = `スキルブックが「パラメタ・技・窮地」の3系統に生まれ変わった！ 古い本の代わりに『剣技の書・初級』を受け取り、本のレベル上げに使った SP ${sp} と、本の代金 ${gold} G が戻ってきた。`;
}

export function hasSave(): boolean {
  return loadGame() !== null;
}
