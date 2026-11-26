import { MAX_HP, MAX_MP } from './constants';
import type { HunterDir } from './art';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  exp: number;
  gold: [number, number];
  minFloor: number;
  maxFloor: number;
  w: number;
  h: number;
  /** 見た目の高さ（ワールド単位。頭上の表示位置に使う） */
  height: number;
  flying?: boolean;
  ranged?: boolean;
  color: string;
  /** 見た目の大きさの倍率（昇格試験のボス） */
  scale?: number;
  /** 昇格試験のボス。倒すとランクが上がる */
  boss?: boolean;
}

export const ENEMIES: EnemyDef[] = [
  { id: 'slime', name: 'スライム', hp: 22, dmg: 8, speed: 55, exp: 5, gold: [2, 6], minFloor: 1, maxFloor: 6, w: 20, h: 14, height: 18, color: '#52b84a' },
  { id: 'bat', name: 'コウモリ', hp: 14, dmg: 6, speed: 100, exp: 6, gold: [1, 4], minFloor: 1, maxFloor: 7, w: 18, h: 12, height: 30, flying: true, color: '#7a5aa0' },
  { id: 'goblin', name: 'ゴブリン', hp: 38, dmg: 11, speed: 80, exp: 12, gold: [5, 12], minFloor: 2, maxFloor: 99, w: 18, h: 14, height: 32, color: '#6aa84f' },
  { id: 'skeleton', name: 'スケルトン', hp: 55, dmg: 14, speed: 70, exp: 18, gold: [6, 15], minFloor: 3, maxFloor: 99, w: 18, h: 14, height: 36, color: '#e8e4d0' },
  { id: 'ghost', name: 'ゴースト', hp: 40, dmg: 13, speed: 55, exp: 22, gold: [8, 18], minFloor: 4, maxFloor: 99, w: 18, h: 14, height: 36, flying: true, ranged: true, color: '#d8e0ff' },
  { id: 'golem', name: 'ゴーレム', hp: 160, dmg: 22, speed: 42, exp: 50, gold: [20, 40], minFloor: 6, maxFloor: 99, w: 34, h: 22, height: 62, color: '#8a8a94' },
];

export function enemyDef(id: string): EnemyDef {
  return ENEMIES.find((e) => e.id === id) ?? ENEMIES[0];
}

export class Player implements Box {
  x = 0;
  y = 0;
  w = 18;
  h = 14;
  facing: 1 | -1 = 1;
  /** 見た目の向き（横・下・上） */
  dir: HunterDir = 'side';
  aimX = 1;
  aimY = 0;
  moving = false;
  anim = 0;
  hp = MAX_HP;
  mp = MAX_MP;
  invuln = 0;
  attackCd = 0;
  attackAnim = 0;
  /** 攻撃動作の長さ（振りの進み具合の計算に使う） */
  attackDur = 1;
  speedBuff = 0;
  barrier = 0;
  kbx = 0;
  kby = 0;
}

export class Enemy implements Box {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  exp: number;
  facing: 1 | -1 = 1;
  /** 見た目の向き：横・下（正面）・上（背中） */
  dir: HunterDir = 'side';
  anim = Math.random();
  stun = 0;
  flash = 0;
  kbx = 0;
  kby = 0;
  wanderT = 0;
  wx = 0;
  wy = 0;
  shootCd = 1.5 + Math.random();
  aggro = false;
  alive = true;
  seed = Math.random() * 10;

  /** depth: その階の危険度 */
  constructor(public def: EnemyDef, x: number, y: number, depth: number) {
    this.x = x;
    this.y = y;
    this.w = def.w;
    this.h = def.h;
    const f = Math.max(0, depth - 1);
    this.maxHp = this.hp = Math.round(def.hp * (1 + 0.22 * f));
    this.dmg = Math.round(def.dmg * (1 + 0.1 * f));
    this.speed = def.speed;
    this.exp = Math.round(def.exp * (1 + 0.15 * f));
  }
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  maxLife: number;
  from: 'player' | 'enemy';
  /** arrow: 矢 / wave: 剣閃 / bomb: 爆裂矢 / orb: 杖の魔力弾 / fireball: 火の玉（敵も使う） */
  kind: 'arrow' | 'wave' | 'bomb' | 'orb' | 'fireball';
  /** 貫通する弾が当たった敵（同じ敵に二度当たらないように）。あれば貫通する */
  hits?: Enemy[];
  /** 矢の光の色 */
  tint?: string;
}

export type EffectType = 'slash' | 'ring' | 'particle' | 'bolt' | 'after' | 'icon' | 'smoke' | 'fall';

export interface Effect {
  type: EffectType;
  x: number;
  y: number;
  t: number;
  dur: number;
  ang?: number;
  r0?: number;
  r1?: number;
  color?: string;
  vx?: number;
  vy?: number;
  size?: number;
  pts?: { x: number; y: number }[];
  facing?: 1 | -1;
  dir?: HunterDir;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  dur: number;
}

export interface Pickup {
  x: number;
  y: number;
  kind: 'gold' | 'potion' | 'ether' | 'ore' | 'mat';
  /** kind が ore のときの鉱石 id */
  ore?: string;
  /** kind が mat のときの魔物の素材 id */
  mat?: string;
  amount: number;
  t: number;
}

export type ChestContent =
  | { kind: 'gold'; amount: number }
  | { kind: 'potion'; amount: number }
  | { kind: 'ether'; amount: number }
  | { kind: 'ore'; ore: string; amount: number }
  | { kind: 'book'; book: string }
  /** ダンジョンの最後の階にある踏破の宝箱 */
  | { kind: 'conquer'; gold: number; ore: string; ores: number }
  | { kind: 'treasure' };

export interface Chest {
  tx: number;
  ty: number;
  opened: boolean;
  locked: boolean;
  legendary: boolean;
  content: ChestContent;
}

/** ダンジョンの鉱脈。[E] で掘ると鉱石が手に入る */
export interface Vein {
  tx: number;
  ty: number;
  ore: string;
  /** あと何回たたくと崩れるか */
  hits: number;
  mined: boolean;
}
