import { TILE } from './constants';
import { RNG } from './rng';
import { ENEMIES, enemyDef, type Chest, type ChestContent, type EnemyDef, type Vein } from './entities';
import { rollOre } from './equipment';

export const T = {
  FLOOR: 0,
  WALL: 1,
  STAIRS_DOWN: 2,
  STAIRS_UP: 3,
  GRASS: 4,
  PATH: 5,
  TREE: 6,
  WATER: 7,
  HOUSE: 8,
  SHOP_DOOR: 9,
  INN_DOOR: 10,
  ROCK: 11,
  ENTRANCE: 12,
  FLOWER: 13,
  HOME_DOOR: 14,
  /** 自宅の出口（歩いて乗れる） */
  HOME_EXIT: 15,
  SMITHY_DOOR: 16,
  TEMPLE_DOOR: 17,
  BANK_DOOR: 18,
} as const;

const SOLID = new Set<number>([T.WALL, T.TREE, T.WATER, T.HOUSE, T.SHOP_DOOR, T.INN_DOOR, T.ROCK, T.ENTRANCE, T.HOME_DOOR, T.SMITHY_DOOR, T.TEMPLE_DOOR, T.BANK_DOOR]);

export const FINAL_FLOOR = 10;

export class TileMap {
  tiles: Uint8Array;
  explored: Uint8Array;
  /** 未発動の罠 */
  traps = new Set<number>();
  /** 発動済みの罠 */
  sprung = new Set<number>();
  /** 宝箱などタイル以外の障害物 */
  blockers = new Set<number>();
  /** 探索済みの範囲が広がるたびに増える（描画用の形の作り直しに使う） */
  exploredVer = 0;

  constructor(public w: number, public h: number, fill: number) {
    this.tiles = new Uint8Array(w * h).fill(fill);
    this.explored = new Uint8Array(w * h);
  }

  /** 探索済みにする。新しく開けたら true */
  explore(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const k = y * this.w + x;
    if (this.explored[k]) return false;
    this.explored[k] = 1;
    this.exploredVer++;
    return true;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  key(x: number, y: number): number {
    return y * this.w + x;
  }

  get(x: number, y: number): number {
    return this.inBounds(x, y) ? this.tiles[y * this.w + x] : T.WALL;
  }

  set(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }

  isExplored(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.explored[y * this.w + x] === 1;
  }

  solidAt(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return SOLID.has(this.tiles[ty * this.w + tx]) || this.blockers.has(ty * this.w + tx);
  }

  /** 中心(x,y)・幅w・高さhの矩形が壁に重なるか */
  boxHits(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor((x - w / 2) / TILE);
    const x1 = Math.floor((x + w / 2) / TILE);
    const y0 = Math.floor((y - h / 2) / TILE);
    const y1 = Math.floor((y + h / 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.solidAt(tx, ty)) return true;
      }
    }
    return false;
  }

  hash(x: number, y: number): number {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
}

export interface Label {
  x: number;
  y: number;
  text: string;
}

/** 町の建物（タイル単位）。見た目は1つの絵としてまとめて描く */
export interface Building {
  kind: 'shop' | 'inn' | 'ruin' | 'home' | 'smithy' | 'temple' | 'bank';
  x: number;
  y: number;
  w: number;
  h: number;
  doorX: number;
}

const center = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

// ---------------------------------------------------------------- 町

export function buildTown() {
  const W = 36;
  const H = 24;
  const m = new TileMap(W, H, T.GRASS);
  m.explored.fill(1);
  const rect = (x: number, y: number, w: number, h: number, t: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m.set(i, j, t);
  };

  // 森の外周
  rect(0, 0, W, 1, T.TREE);
  rect(0, H - 1, W, 1, T.TREE);
  rect(0, 0, 1, H, T.TREE);
  rect(W - 1, 0, 1, H, T.TREE);

  // 道
  rect(11, 5, 1, 4, T.PATH);
  rect(22, 5, 1, 4, T.PATH);
  rect(11, 8, 12, 1, T.PATH);
  rect(13, 8, 1, 11, T.PATH);
  rect(5, 14, 8, 1, T.PATH);
  rect(13, 18, 6, 1, T.PATH);
  rect(18, 17, 1, 2, T.PATH);
  rect(19, 18, 9, 1, T.PATH);
  rect(4, 5, 1, 3, T.PATH);
  rect(4, 8, 7, 1, T.PATH);
  // 銀行への道（わが家の前の道から南へ下り、銀行の正面へ回りこむ）
  rect(10, 15, 1, 5, T.PATH);
  rect(5, 20, 6, 1, T.PATH);

  // わが家
  rect(3, 11, 6, 3, T.HOUSE);
  m.set(5, 13, T.HOME_DOOR);
  // 道具屋
  rect(9, 2, 6, 3, T.HOUSE);
  m.set(11, 4, T.SHOP_DOOR);
  // 武器防具屋
  rect(25, 15, 6, 3, T.HOUSE);
  m.set(27, 17, T.SMITHY_DOOR);
  // 神殿（呪われた本を浄化する）
  rect(2, 2, 6, 3, T.HOUSE);
  m.set(4, 4, T.TEMPLE_DOOR);
  // 銀行（お金を預ける）
  rect(3, 17, 6, 3, T.HOUSE);
  m.set(5, 19, T.BANK_DOOR);
  // 宿屋
  rect(20, 2, 6, 3, T.HOUSE);
  m.set(22, 4, T.INN_DOOR);
  // ダンジョン入口 (岩山)
  rect(15, 14, 7, 3, T.ROCK);
  m.set(15, 14, T.GRASS);
  m.set(21, 14, T.GRASS);
  m.set(18, 16, T.ENTRANCE);
  // 池
  // 楕円の中に中心が入るタイルを水にする（見た目は terrain.ts で楕円として描く）
  for (let y = 4; y <= 11; y++) {
    for (let x = 25; x <= 34; x++) {
      if (((x + 0.5 - 29.5) / 3.4) ** 2 + ((y + 0.5 - 8) / 2.5) ** 2 <= 1) m.set(x, y, T.WATER);
    }
  }

  // 木と花を散らす
  const r = new RNG(20261124);
  const open = (x: number, y: number) => {
    const t = m.get(x, y);
    return t === T.GRASS || t === T.TREE || t === T.FLOWER;
  };
  for (let i = 0; i < 70; i++) {
    const x = r.int(2, W - 3);
    const y = r.int(2, H - 3);
    if (m.get(x, y) !== T.GRASS) continue;
    if (Math.abs(x - 13) < 3 && Math.abs(y - 10) < 3) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!open(x + dx, y + dy)) ok = false;
    if (!ok) continue;
    m.set(x, y, r.chance(0.4) ? T.TREE : T.FLOWER);
  }

  // 看板の位置は建物の絵（屋根が上へはみ出す）に合わせている
  const labels: Label[] = [
    { x: 12 * TILE, y: 2 * TILE - 52, text: '道具屋' },
    { x: 23 * TILE, y: 2 * TILE - 52, text: '宿屋' },
    { x: 18.5 * TILE, y: 14 * TILE - 46, text: '古代遺跡' },
    { x: 6 * TILE, y: 11 * TILE - 52, text: 'わが家' },
    { x: 28 * TILE, y: 15 * TILE - 52, text: '武器防具屋' },
    { x: 5 * TILE, y: 2 * TILE - 52, text: '神殿' },
    { x: 6 * TILE, y: 17 * TILE - 52, text: '銀行' },
  ];
  const buildings: Building[] = [
    { kind: 'shop', x: 9, y: 2, w: 6, h: 3, doorX: 11 },
    { kind: 'inn', x: 20, y: 2, w: 6, h: 3, doorX: 22 },
    { kind: 'ruin', x: 15, y: 14, w: 7, h: 3, doorX: 18 },
    { kind: 'home', x: 3, y: 11, w: 6, h: 3, doorX: 5 },
    { kind: 'smithy', x: 25, y: 15, w: 6, h: 3, doorX: 27 },
    { kind: 'temple', x: 2, y: 2, w: 6, h: 3, doorX: 4 },
    { kind: 'bank', x: 3, y: 17, w: 6, h: 3, doorX: 5 },
  ];

  return { map: m, start: center(13, 10), dungeonFront: center(18, 17), homeFront: center(5, 14), labels, buildings };
}

// ---------------------------------------------------------------- ダンジョン

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface Spawn {
  x: number;
  y: number;
  def: EnemyDef;
}

export interface DungeonResult {
  map: TileMap;
  start: { x: number; y: number };
  chests: Chest[];
  veins: Vein[];
  spawns: Spawn[];
}

export function generateDungeon(floor: number, eligibleBooks: string[]): DungeonResult {
  const rng = new RNG((Date.now() ^ Math.imul(floor, 7919)) >>> 0);
  const W = 56;
  const H = 42;
  const m = new TileMap(W, H, T.WALL);

  // 部屋を配置
  const rooms: Room[] = [];
  for (let tries = 0; tries < 400 && rooms.length < 11; tries++) {
    const w = rng.int(6, 12);
    const h = rng.int(5, 9);
    const x = rng.int(2, W - w - 3);
    const y = rng.int(2, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  for (const r of rooms) {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) m.set(i, j, T.FLOOR);
  }

  // 通路 (幅2)
  const carveH = (x1: number, x2: number, y: number) => {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2) + 1; x++) {
      m.set(x, y, T.FLOOR);
      m.set(x, y + 1, T.FLOOR);
    }
  };
  const carveV = (y1: number, y2: number, x: number) => {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2) + 1; y++) {
      m.set(x, y, T.FLOOR);
      m.set(x + 1, y, T.FLOOR);
    }
  };
  const connect = (a: Room, b: Room) => {
    if (rng.chance(0.5)) {
      carveH(a.cx, b.cx, a.cy);
      carveV(a.cy, b.cy, b.cx);
    } else {
      carveV(a.cy, b.cy, a.cx);
      carveH(a.cx, b.cx, b.cy);
    }
  };
  for (let i = 1; i < rooms.length; i++) {
    let best = rooms[0];
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.abs(rooms[j].cx - rooms[i].cx) + Math.abs(rooms[j].cy - rooms[i].cy);
      if (d < bestD) {
        bestD = d;
        best = rooms[j];
      }
    }
    connect(rooms[i], best);
  }
  for (let k = 0; k < 2; k++) connect(rng.pick(rooms), rng.pick(rooms));

  // 開始地点
  const startRoom = rooms[0];
  m.set(startRoom.cx, startRoom.cy, T.STAIRS_UP);
  const used = new Set<number>([m.key(startRoom.cx, startRoom.cy), m.key(startRoom.cx, startRoom.cy + 1)]);

  // 開始地点からの距離 (BFS) で一番遠い部屋をゴールにする
  const dist = new Int32Array(W * H).fill(-1);
  const queue = [m.key(startRoom.cx, startRoom.cy)];
  dist[queue[0]] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const x = k % W;
    const y = Math.floor(k / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (m.solidAt(nx, ny)) continue;
      const nk = m.key(nx, ny);
      if (dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      queue.push(nk);
    }
  }
  const others = rooms.slice(1);
  const goalRoom = others.reduce((a, b) => (dist[m.key(b.cx, b.cy)] > dist[m.key(a.cx, a.cy)] ? b : a), others[0] ?? startRoom);

  const chests: Chest[] = [];
  const addChest = (tx: number, ty: number, locked: boolean, content: ChestContent, legendary = false) => {
    chests.push({ tx, ty, opened: false, locked, legendary, content });
    m.blockers.add(m.key(tx, ty));
    used.add(m.key(tx, ty));
  };

  const isFinal = floor >= FINAL_FLOOR;
  if (isFinal) {
    addChest(goalRoom.cx, goalRoom.cy, false, { kind: 'treasure' }, true);
  } else {
    m.set(goalRoom.cx, goalRoom.cy, T.STAIRS_DOWN);
    used.add(m.key(goalRoom.cx, goalRoom.cy));
  }

  const randomSpot = (room: Room): [number, number] | null => {
    for (let i = 0; i < 20; i++) {
      const x = rng.int(room.x + 1, room.x + room.w - 2);
      const y = rng.int(room.y + 1, room.y + room.h - 2);
      if (!used.has(m.key(x, y)) && m.get(x, y) === T.FLOOR) return [x, y];
    }
    return null;
  };

  // 宝箱
  const chestCount = 2 + Math.floor(floor / 3);
  const book = eligibleBooks.length > 0 && rng.chance(0.7) ? rng.pick(eligibleBooks) : null;
  const bookIndex = rng.int(0, chestCount - 1);
  for (let i = 0; i < chestCount && others.length > 0; i++) {
    const spot = randomSpot(rng.pick(others));
    if (!spot) continue;
    const locked = rng.chance(0.3);
    const mult = locked ? 2 : 1;
    let content: ChestContent;
    if (book && i === bookIndex) {
      content = { kind: 'book', book };
    } else {
      const roll = rng.next();
      if (roll < 0.42) content = { kind: 'gold', amount: Math.round(rng.int(20, 45) * (1 + floor * 0.3) * mult) };
      else if (roll < 0.62) content = { kind: 'ore', ore: rollOre(floor, rng.next()).id, amount: rng.int(1, 2) * mult };
      else if (roll < 0.82) content = { kind: 'potion', amount: mult };
      else content = { kind: 'ether', amount: mult };
    }
    addChest(spot[0], spot[1], locked, content);
  }

  // 鉱脈：部屋の奥の壁ぎわ（上が壁の床）に埋まっている
  const veins: Vein[] = [];
  const veinCount = 2 + Math.floor(floor / 3);
  for (let i = 0, tries = 0; i < veinCount && tries < 200 && others.length > 0; tries++) {
    const room = rng.pick(others);
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = room.y;
    const k = m.key(x, y);
    if (m.get(x, y) !== T.FLOOR || m.get(x, y - 1) !== T.WALL || used.has(k)) continue;
    if (used.has(m.key(x - 1, y)) || used.has(m.key(x + 1, y))) continue;
    veins.push({ tx: x, ty: y, ore: rollOre(floor, rng.next()).id, hits: 3, mined: false });
    m.blockers.add(k);
    used.add(k);
    i++;
  }

  // 罠
  const trapCount = 3 + floor;
  for (let i = 0, tries = 0; i < trapCount && tries < 300; tries++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(1, H - 2);
    if (m.get(x, y) !== T.FLOOR || used.has(m.key(x, y))) continue;
    if (Math.abs(x - startRoom.cx) < 5 && Math.abs(y - startRoom.cy) < 5) continue;
    m.traps.add(m.key(x, y));
    i++;
  }

  // 敵
  const spawns: Spawn[] = [];
  const pool = ENEMIES.filter((e) => e.minFloor <= floor && e.maxFloor >= floor);
  for (const room of others) {
    const n = rng.int(1, Math.min(5, 2 + Math.floor(floor / 2)));
    for (let i = 0; i < n; i++) {
      const spot = randomSpot(room);
      if (!spot) continue;
      spawns.push({ ...center(spot[0], spot[1]), def: rng.pick(pool) });
    }
  }
  if (isFinal) {
    for (const [dx, dy] of [[-2, 0], [2, 0]]) {
      spawns.push({ ...center(goalRoom.cx + dx, goalRoom.cy + dy), def: enemyDef('golem') });
    }
  }

  return { map: m, start: center(startRoom.cx, startRoom.cy + 1), chests, veins, spawns };
}

// ---------------------------------------------------------------- わが家（室内）

/** 室内の家具（タイル単位）。shelf と bed は調べられる */
export interface Furniture {
  kind: 'shelf' | 'bed' | 'table' | 'plant';
  x: number;
  y: number;
  w: number;
  h: number;
}

export function buildHome() {
  const W = 14;
  const H = 10;
  const m = new TileMap(W, H, T.FLOOR);
  m.explored.fill(1);
  for (let x = 0; x < W; x++) {
    m.set(x, 0, T.WALL);
    m.set(x, 1, T.WALL);
    m.set(x, H - 1, T.WALL);
  }
  for (let y = 0; y < H; y++) {
    m.set(0, y, T.WALL);
    m.set(W - 1, y, T.WALL);
  }
  m.set(7, H - 1, T.HOME_EXIT);
  const furniture: Furniture[] = [
    { kind: 'shelf', x: 2, y: 2, w: 4, h: 1 },
    { kind: 'bed', x: 10, y: 2, w: 2, h: 2 },
    { kind: 'table', x: 6, y: 5, w: 2, h: 1 },
    { kind: 'plant', x: 12, y: 2, w: 1, h: 1 },
  ];
  for (const f of furniture) {
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) m.blockers.add(m.key(x, y));
  }
  return { map: m, start: center(8, 7), door: center(7, H - 2), furniture };
}
