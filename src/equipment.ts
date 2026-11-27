/** 武器防具屋で買える装備。剣は攻撃力、杖は魔力、盾と防具は防御力を上げる */
import type { Stat } from './skills';

/** 武器の種類。剣・魔術・盾の技は、それぞれ剣・杖・盾を装備しているときだけ使える */
export type WeaponType = 'sword' | 'staff' | 'shield';
export const WEAPON_TYPE_NAME: Record<WeaponType, string> = { sword: '剣', staff: '杖', shield: '盾' };
export const WEAPON_TYPE_ICON: Record<WeaponType, string> = { sword: '⚔️', staff: '🪄', shield: '🛡️' };
/** 武器の種類ごとの主なパラメタ（鍛冶で伸びるのはこれ） */
export const WEAPON_MAIN: Record<WeaponType, Stat> = { sword: 'atk', staff: 'mag', shield: 'def' };

/** 作成した武器の追加効果 */
export type WeaponEffect =
  /** 敵に攻撃を当てるたびに体力が回復する */
  | 'drain'
  /** 敵を倒すとMPが回復する */
  | 'soul'
  /** 体当たりしてきた敵にダメージを返す */
  | 'thorns';

export const WEAPON_EFFECT_TEXT: Record<WeaponEffect, string> = {
  drain: '敵に攻撃を当てるたびに体力 +2',
  soul: '敵を倒すと MP +5',
  thorns: '体当たりしてきた敵に、防御力ぶんのダメージを返す',
};

/** 作成した防具の追加効果 */
export type ArmorEffect =
  /** 移動が速くなる */
  | 'swift'
  /** 敵を倒すと体力が回復する */
  | 'vigor'
  /** 敵の飛び道具のダメージが半分になる */
  | 'ward'
  /** 吹き飛ばされず、受けるダメージがさらに減る */
  | 'heavy';

export const ARMOR_EFFECT_TEXT: Record<ArmorEffect, string> = {
  swift: '移動速度 +15%',
  vigor: '敵を倒すと体力 +3',
  ward: '敵の飛び道具のダメージが半分',
  heavy: '攻撃を受けても吹き飛ばされず、受けるダメージ -10%',
};

/** 鍛冶場で武器・防具を作るのに要るもの */
export interface Recipe {
  gold: number;
  /** 鉱石の id → 個数 */
  ores: Record<string, number>;
  /** 魔物の素材の id → 個数 */
  mats: Record<string, number>;
}

export interface WeaponDef {
  id: string;
  name: string;
  type: WeaponType;
  /** 攻撃力の加算（通常攻撃と剣・盾の技の威力に効く） */
  atk: number;
  /** 魔力の加算（杖） */
  mag?: number;
  /** 防御力の加算（盾） */
  def?: number;
  /** 鍛冶で +1 するごとに主なパラメタ（WEAPON_MAIN）が増える量 */
  up: number;
  price: number;
  /** この危険度の階に到達すると入荷 */
  minFloor: number;
  icon: string;
  desc: string;
  /** 作成専用の武器：売り場では買えず、鍛冶場で素材から作る（price は鍛える代金・買い取り値の基準） */
  craft?: Recipe;
  effect?: WeaponEffect;
}

export interface ArmorDef {
  id: string;
  name: string;
  /** 防御力の加算 */
  def: number;
  /** 鍛冶で +1 するごとに増える防御力 */
  up: number;
  price: number;
  minFloor: number;
  icon: string;
  desc: string;
  /** 作成専用の防具：売り場では買えず、鍛冶場で素材から作る（price は鍛える代金・買い取り値の基準） */
  craft?: Recipe;
  effect?: ArmorEffect;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'dagger', name: '旅の短剣', type: 'sword', atk: 0, up: 1, price: 0, minFloor: 0, icon: '🗡️', desc: '旅立ちのときから使っている短剣。' },
  { id: 'steel', name: '鋼の剣', type: 'sword', atk: 4, up: 1, price: 180, minFloor: 0, icon: '⚔️', desc: '町の鍛冶屋が鍛えた、よく切れる剣。' },
  { id: 'mithril', name: 'ミスリルの剣', type: 'sword', atk: 9, up: 2, price: 550, minFloor: 3, icon: '✨', desc: '青白く光る軽い魔法銀の剣。' },
  { id: 'dragon', name: '竜牙の剣', type: 'sword', atk: 15, up: 3, price: 1400, minFloor: 6, icon: '🐉', desc: '竜の牙を削り出した、燃えるような刃。' },
  { id: 'oakstaff', name: '樫の杖', type: 'staff', atk: 0, mag: 4, up: 1, price: 150, minFloor: 0, icon: '🪄', desc: '魔法学院の見習いが使う、緑の石をはめた杖。' },
  { id: 'magestaff', name: '魔導士の杖', type: 'staff', atk: 0, mag: 10, up: 2, price: 520, minFloor: 3, icon: '🔷', desc: '青い魔石が魔力を増幅する、熟練の魔導士の杖。' },
  { id: 'sagestaff', name: '賢者の杖', type: 'staff', atk: 0, mag: 17, up: 3, price: 1350, minFloor: 6, icon: '🔮', desc: '大賢者が遺した、紫の宝珠が輝く杖。' },
  { id: 'woodshield', name: '木の盾', type: 'shield', atk: 2, def: 4, up: 1, price: 140, minFloor: 0, icon: '🪵', desc: '鉄の縁で補強した丸い木の盾。殴ってもそこそこ痛い。' },
  { id: 'steelshield', name: '鋼の大盾', type: 'shield', atk: 5, def: 10, up: 2, price: 500, minFloor: 3, icon: '🛡️', desc: '分厚い鋼を打ち出した大きな盾。' },
  { id: 'dragonshield', name: '竜鱗の盾', type: 'shield', atk: 9, def: 18, up: 3, price: 1300, minFloor: 6, icon: '🐲', desc: '竜の鱗を張り合わせた、炎をも弾く盾。' },
  // ---- 作成専用（鍛冶場で鉱石と魔物の素材から作る。minFloor はレシピを教えてもらえる危険度）
  { id: 'vampblade', name: '吸血の剣', type: 'sword', atk: 11, up: 2, price: 900, minFloor: 3, icon: '🩸', desc: 'コウモリの翼を鍔に巻いた紅い剣。斬るたびに命を吸う。', effect: 'drain', craft: { gold: 300, ores: { iron: 4 }, mats: { wing: 6, bone: 3 } } },
  { id: 'soulstaff', name: '霊魂の杖', type: 'staff', atk: 0, mag: 14, up: 2, price: 950, minFloor: 4, icon: '👻', desc: '霊気の結晶を閉じこめた杖。倒した敵の魂を魔力に変える。', effect: 'soul', craft: { gold: 350, ores: { silver: 2 }, mats: { ecto: 5, jelly: 6 } } },
  { id: 'golemshield', name: '巨像の盾', type: 'shield', atk: 8, def: 16, up: 3, price: 1200, minFloor: 6, icon: '🗿', desc: 'ゴーレムの核を埋めこんだ石の大盾。表面の牙が、ぶつかってきた敵を傷つける。', effect: 'thorns', craft: { gold: 500, ores: { silver: 3 }, mats: { core: 3, fang: 5 } } },
];

export const ARMORS: ArmorDef[] = [
  { id: 'cloth', name: '旅人の服', def: 0, up: 1, price: 0, minFloor: 0, icon: '👕', desc: '動きやすいが、身を守る力はない。' },
  { id: 'leather', name: '革の鎧', def: 6, up: 1, price: 150, minFloor: 0, icon: '🦺', desc: 'なめし革を重ねた軽い鎧。' },
  { id: 'chain', name: '鎖かたびら', def: 12, up: 2, price: 480, minFloor: 3, icon: '⛓️', desc: '細い鉄の輪を編んだ鎧。斬撃に強い。' },
  { id: 'mithrilmail', name: 'ミスリルの鎧', def: 20, up: 3, price: 1300, minFloor: 6, icon: '🛡️', desc: '魔法銀で編まれた、羽のように軽い鎧。' },
  // ---- 作成専用（鍛冶場で鉱石と魔物の素材から作る。minFloor は作り方を教えてもらえる危険度）
  { id: 'wingcloak', name: '夜翼の外套', def: 8, up: 1, price: 600, minFloor: 2, icon: '🦇', desc: 'コウモリの翼を縫い合わせた黒い外套。風のように身が軽くなる。', effect: 'swift', craft: { gold: 250, ores: { iron: 3 }, mats: { wing: 5, jelly: 4 } } },
  { id: 'bonemail', name: '骸骨の鎧', def: 14, up: 2, price: 850, minFloor: 3, icon: '💀', desc: '古い骨を鉄の鋲で留めた鎧。倒した敵の生気を吸いとる。', effect: 'vigor', craft: { gold: 350, ores: { iron: 4 }, mats: { bone: 6, fang: 3 } } },
  { id: 'spiritrobe', name: '霊布の衣', def: 12, up: 2, price: 900, minFloor: 4, icon: '🫧', desc: '霊気の結晶を織りこんだ淡く光る衣。飛んでくる魔弾をやわらげる。', effect: 'ward', craft: { gold: 400, ores: { silver: 2 }, mats: { ecto: 6, jelly: 5 } } },
  { id: 'golemmail', name: '巨像の鎧', def: 24, up: 3, price: 1400, minFloor: 6, icon: '🗿', desc: 'ゴーレムの核で動く石の鎧。どんな一撃にも揺るがない。', effect: 'heavy', craft: { gold: 600, ores: { silver: 3 }, mats: { core: 4, fang: 4 } } },
];

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}

export function armorById(id: string): ArmorDef {
  return ARMORS.find((a) => a.id === id) ?? ARMORS[0];
}

/** 鍛冶で鍛えられる上限 */
export const MAX_PLUS = 5;

/** +n の武器がパラメタ s に足す値。鍛えた分は主なパラメタにだけ乗る */
export function weaponStat(w: WeaponDef, s: Stat, plus: number): number {
  const base = s === 'atk' ? w.atk : s === 'mag' ? (w.mag ?? 0) : s === 'def' ? (w.def ?? 0) : 0;
  return base + (WEAPON_MAIN[w.type] === s ? w.up * plus : 0);
}

const STAT_LABEL: Record<Stat, string> = { atk: '攻撃力', mag: '魔力', def: '防御力', luck: '運' };

/** 「盾・防御力 +10・攻撃力 +5」のような説明 */
export function weaponStatText(w: WeaponDef, plus: number): string {
  const main = WEAPON_MAIN[w.type];
  const parts = [main, ...(['atk', 'mag', 'def'] as const).filter((k) => k !== main)]
    .map((k) => ({ k, v: weaponStat(w, k, plus) }))
    .filter((x) => x.k === main || x.v > 0)
    .map((x) => `${STAT_LABEL[x.k]} +${x.v}`);
  return `${WEAPON_TYPE_NAME[w.type]}・${parts.join('・')}`;
}

/** +n の防具の防御力 */
export function armorDef(a: ArmorDef, plus: number): number {
  return a.def + a.up * plus;
}

/** 防御力から受けるダメージの倍率を出す（防御力50で半分） */
export function damageRate(def: number): number {
  return 50 / (50 + Math.max(0, def));
}

/** +n から +(n+1) へ鍛える代金（鉱石とは別）。元の値段が高い品ほど高くつく */
export function forgeCost(price: number, plus: number): number {
  return Math.round(((20 + price * 0.15) * (plus + 1)) / 5) * 5;
}

/** 武器防具屋の買い取り値：元の値段と、鍛えるのに払った代金の合計の半額（鉱石は戻らない）。最初の装備は売れない（0） */
export function eqSellPrice(price: number, plus: number): number {
  if (price <= 0) return 0;
  let forged = 0;
  for (let p = 0; p < plus; p++) forged += forgeCost(price, p);
  return Math.floor((price + forged) / 2);
}

/** 「鋼の剣 +2」のような名前 */
export function eqName(name: string, plus: number): string {
  return plus > 0 ? `${name} +${plus}` : name;
}

// ---------------------------------------------------------------- 鉱石（鍛冶の素材）

export interface OreDef {
  id: string;
  name: string;
  icon: string;
  /** 結晶の色（明・暗） */
  color: [string, string];
  /** この危険度の階から掘れる */
  minFloor: number;
}

export const ORES: OreDef[] = [
  { id: 'iron', name: '鉄鉱石', icon: '🪨', color: ['#d8dce8', '#6a7084'], minFloor: 1 },
  { id: 'silver', name: '魔法銀鉱', icon: '💎', color: ['#c8f4ff', '#3a90d0'], minFloor: 3 },
  { id: 'flame', name: '竜炎石', icon: '🔥', color: ['#ffd080', '#d03a20'], minFloor: 6 },
];

export function oreById(id: string): OreDef {
  return ORES.find((o) => o.id === id) ?? ORES[0];
}

/** +n から +(n+1) へ鍛えるのに要る鉱石。段階が上がるほど深い階の鉱石が要る */
export function forgeOre(plus: number): { ore: OreDef; n: number } {
  if (plus < 2) return { ore: ORES[0], n: plus + 2 }; // +1: 鉄×2, +2: 鉄×3
  if (plus < 4) return { ore: ORES[1], n: plus }; // +3: 魔法銀×2, +4: 魔法銀×3
  return { ore: ORES[2], n: 2 }; // +5: 竜炎石×2
}

// ---------------------------------------------------------------- 魔物の素材（武器作成に使う）

export interface MatDef {
  id: string;
  name: string;
  icon: string;
  /** 落とす魔物（entities.ts の EnemyDef.id） */
  enemy: string;
  /** 見た目の色（明・暗） */
  color: [string, string];
}

export const MATS: MatDef[] = [
  { id: 'jelly', name: 'スライムゼリー', icon: '🟢', enemy: 'slime', color: ['#b8f0a0', '#3a9a3a'] },
  { id: 'wing', name: 'コウモリの翼', icon: '🦇', enemy: 'bat', color: ['#c8a8e8', '#5a3a80'] },
  { id: 'fang', name: 'ゴブリンの牙', icon: '🦷', enemy: 'goblin', color: ['#fff8e0', '#b0a070'] },
  { id: 'bone', name: '古びた骨', icon: '🦴', enemy: 'skeleton', color: ['#f4f0e0', '#a09880'] },
  { id: 'ecto', name: '霊気の結晶', icon: '🫧', enemy: 'ghost', color: ['#e0f8ff', '#70b0e0'] },
  { id: 'core', name: 'ゴーレムの核', icon: '🔷', enemy: 'golem', color: ['#a0f0ff', '#2a80b0'] },
];

export function matById(id: string): MatDef {
  return MATS.find((m) => m.id === id) ?? MATS[0];
}

/** 魔物が落とす素材（なければ undefined） */
export function matOfEnemy(enemyId: string): MatDef | undefined {
  return MATS.find((m) => m.enemy === enemyId);
}

/** 魔物が素材を落とす確率（運で上がる前の値）。ゴーレムは落としやすい */
export function matDropRate(enemyId: string): number {
  return enemyId === 'golem' ? 0.5 : 0.22;
}

/** その危険度の階で見つかる鉱石をランダムに選ぶ（危険度が高いほど上位の鉱石が出やすい） */
export function rollOre(floor: number, r: number): OreDef {
  const pool = ORES.filter((o) => o.minFloor <= floor);
  if (pool.length === 0) return ORES[0];
  const weights = pool.map((o, i) => 1 + i * 0.4 + (floor - o.minFloor) * 0.15);
  let x = r * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
