/**
 * ハンターギルドのランクと、挑めるダンジョンの定義（バランス調整はここ）。
 *
 * ダンジョンの各階には「危険度」がある。敵の強さ・出てくる敵・宝箱の中身・鉱石、
 * 店の入荷（SaveData.maxFloor = これまでに到達した最も高い危険度）はすべて危険度で決まる。
 */
import { enemyDef, type EnemyDef } from './entities';

export interface RankDef {
  /** E / D / C / B / S */
  name: string;
  title: string;
  color: string;
}

export const RANKS: RankDef[] = [
  { name: 'E', title: '見習いハンター', color: '#b8b0a0' },
  { name: 'D', title: '駆け出しハンター', color: '#7ad07a' },
  { name: 'C', title: '一人前のハンター', color: '#6ab4f0' },
  { name: 'B', title: '熟練のハンター', color: '#c890ff' },
  { name: 'S', title: '伝説のハンター', color: '#ffd84a' },
];

/** 古代遺跡に入れるランク */
export const RANK_B = 3;
/** 秘宝を手に入れると S ランク */
export const RANK_S = 4;

export function rankDef(rank: number): RankDef {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, rank))];
}

/** 昇格試験の最後の階にいるボス */
export interface BossDef {
  /** 見た目と動きの元になる魔物 */
  base: string;
  name: string;
  /** 体力・攻撃力の倍率（危険度による強化に上乗せ） */
  hp: number;
  dmg: number;
  /** 見た目と当たり判定の大きさの倍率 */
  scale: number;
  /** 一緒に出てくる手下 */
  minions: string[];
}

export interface DungeonDef {
  id: string;
  name: string;
  icon: string;
  /** 挑むのに要るランク */
  rank: number;
  /** 階ごとの危険度（[0] が地下1階） */
  depths: number[];
  desc: string;
  /** 地面と壁にかける色（乗算）。なければ元の色 */
  tint?: string;
  /** どこから入るか。guild: ギルドから出発 / ruin: 町の遺跡の入口から */
  from: 'guild' | 'ruin';
  /** 最後の階に秘宝がある（古代遺跡） */
  final?: boolean;
  /** 途中の階から挑める階（そこに到達していれば） */
  checkpoints?: number[];
  /** 昇格試験：最後の階がボスの間。ボスを倒すと rank + 1 に上がる */
  trial?: BossDef;
  /** 昇格試験を受けるのに踏破しておくダンジョン */
  requires?: string;
  /** 踏破の宝箱のゴールド（2回目からは半分） */
  reward?: number;
}

export const DUNGEONS: DungeonDef[] = [
  {
    id: 'forest',
    name: '森の洞窟',
    icon: '🌲',
    rank: 0,
    depths: [1, 2, 3],
    desc: '町はずれの森にぽっかり開いた洞窟。見習いハンターの腕試しの場。',
    tint: '#b8dca4',
    from: 'guild',
    reward: 200,
  },
  {
    id: 'sewer',
    name: '地下水路',
    icon: '💧',
    rank: 1,
    depths: [3, 4, 5],
    desc: '古い都の下を走る石造りの水路。迷いこんだ骸骨がうろついている。',
    tint: '#a4c4e0',
    from: 'guild',
    reward: 400,
  },
  {
    id: 'mine',
    name: '灼熱の坑道',
    icon: '🌋',
    rank: 2,
    depths: [5, 6, 7, 8],
    desc: '火山のふもとの廃坑。奥ではゴーレムが鉱石を守っている。',
    tint: '#f2b890',
    from: 'guild',
    reward: 700,
  },
  {
    id: 'ruins',
    name: '古代遺跡',
    icon: '🏛️',
    rank: RANK_B,
    depths: [7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
    desc: '伝説の秘宝が眠る遺跡。ギルドはランクB以上のハンターにしか立ち入りを許していない。',
    from: 'ruin',
    final: true,
    checkpoints: [4, 7],
  },
  // ---- 昇格試験
  {
    id: 'trial1',
    name: '昇格試験・試練の岩屋',
    icon: '📜',
    rank: 0,
    depths: [3, 4],
    desc: 'Dランクへの昇格試験。奥で待つゴブリンの親分を倒せ。',
    tint: '#d8c4ec',
    from: 'guild',
    requires: 'forest',
    trial: { base: 'goblin', name: 'ゴブリンの親分', hp: 7, dmg: 1.3, scale: 1.6, minions: ['goblin', 'goblin'] },
  },
  {
    id: 'trial2',
    name: '昇格試験・骸骨の聖堂',
    icon: '📜',
    rank: 1,
    depths: [5, 6],
    desc: 'Cランクへの昇格試験。聖堂を守る骸骨の騎士を倒せ。',
    tint: '#d8c4ec',
    from: 'guild',
    requires: 'sewer',
    trial: { base: 'skeleton', name: '骸骨の騎士', hp: 7, dmg: 1.3, scale: 1.6, minions: ['skeleton', 'ghost'] },
  },
  {
    id: 'trial3',
    name: '昇格試験・巨像の間',
    icon: '📜',
    rank: 2,
    depths: [8, 9],
    desc: 'Bランクへの昇格試験。古代の巨像を打ち砕け。合格すれば古代遺跡に入れる。',
    tint: '#d8c4ec',
    from: 'guild',
    requires: 'mine',
    trial: { base: 'golem', name: '古代の巨像', hp: 4, dmg: 1.25, scale: 1.35, minions: ['ghost', 'skeleton', 'ghost'] },
  },
];

export const RUINS = DUNGEONS.find((d) => d.id === 'ruins')!;

export function dungeonById(id: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.id === id);
}

/** 通常のダンジョン（昇格試験を除く） */
export const FIELD_DUNGEONS = DUNGEONS.filter((d) => !d.trial);

/** いまのランクで受けられる昇格試験（B 以上なら無し） */
export function trialFor(rank: number): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.trial && d.rank === rank);
}

/** ボスの魔物の定義（危険度による強化は Enemy 側でかかる） */
export function bossEnemyDef(b: BossDef): EnemyDef {
  const base = enemyDef(b.base);
  return {
    ...base,
    name: b.name,
    hp: Math.round(base.hp * b.hp),
    dmg: Math.round(base.dmg * b.dmg),
    exp: base.exp * 8,
    gold: [base.gold[0] * 8, base.gold[1] * 8],
    w: Math.round(base.w * b.scale),
    h: Math.round(base.h * b.scale),
    height: Math.round(base.height * b.scale),
    scale: b.scale,
    boss: true,
  };
}
