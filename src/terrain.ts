/**
 * 地形の描画。タイルの格子が見えないよう、地面は継ぎ目のない模様で塗り、
 * 道や池はタイルをつないだ曲線の形で描く。木や建物は奥行きの順に並べて描けるよう objects() で返す。
 *
 * 座標はワールド単位（1タイル = 32）。
 */
import { TILE } from './constants';
import { RNG } from './rng';
import { T, type Building, type Furniture, type TileMap } from './map';
import { drawHomeGround, homeObjects } from './home';
import { ellipsePath, glow, groundShadow } from './art';

type C = CanvasRenderingContext2D;

export interface View {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Light {
  x: number;
  y: number;
  r: number;
  /** 灯りの色（加算で少しだけ色を乗せる） */
  tint?: string;
}

export interface Sortable {
  y: number;
  draw: (ctx: C) => void;
}

const TAU = Math.PI * 2;

// ================================================================ 模様（テクスチャ）

interface TexOpts {
  base: string;
  blots: string[];
  nBlots: number;
  blotR: [number, number];
  specks: [number, number, number][];
  nSpecks: number;
  cracks?: string;
  nCracks?: number;
  extra?: (g: C, r: RNG, S: number) => void;
}

const TEX = 512;
/** テクスチャ1ピクセルあたりのワールド単位（512px で 8タイル分） */
const TEX_SCALE = 0.5;

function makeTex(seed: number, o: TexOpts): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!;
  const r = new RNG(seed);
  g.fillStyle = o.base;
  g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < o.nBlots; i++) {
    const x = r.next() * TEX;
    const y = r.next() * TEX;
    const rr = o.blotR[0] + r.next() * (o.blotR[1] - o.blotR[0]);
    const col = r.pick(o.blots);
    for (const ox of [-TEX, 0, TEX]) {
      for (const oy of [-TEX, 0, TEX]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        gr.addColorStop(0, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
      }
    }
  }
  for (let i = 0; i < o.nSpecks; i++) {
    const [r0, g0, b0] = r.pick(o.specks);
    g.fillStyle = `rgba(${r0},${g0},${b0},${0.12 + r.next() * 0.3})`;
    const s = 1 + r.next() * 2.5;
    g.fillRect(r.next() * TEX, r.next() * TEX, s, s);
  }
  if (o.cracks) {
    g.strokeStyle = o.cracks;
    g.lineWidth = 1.2;
    for (let i = 0; i < (o.nCracks ?? 0); i++) {
      const pts: [number, number][] = [[r.next() * TEX, r.next() * TEX]];
      for (let k = 0; k < 6; k++) {
        const [px, py] = pts[pts.length - 1];
        pts.push([px + (r.next() - 0.5) * 40, py + (r.next() - 0.5) * 40]);
      }
      for (const ox of [-TEX, 0, TEX]) {
        for (const oy of [-TEX, 0, TEX]) {
          g.beginPath();
          pts.forEach(([px, py], k) => (k ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
          g.stroke();
        }
      }
    }
  }
  o.extra?.(g, r, TEX);
  return c;
}

interface Patterns {
  floor: CanvasPattern;
  wall: CanvasPattern;
  face: CanvasPattern;
  grass: CanvasPattern;
  dirt: CanvasPattern;
}

let PAT: Patterns | null = null;

function patterns(ctx: C): Patterns {
  if (PAT) return PAT;
  const pat = (c: HTMLCanvasElement) => {
    const p = ctx.createPattern(c, 'repeat')!;
    p.setTransform(new DOMMatrix().scale(TEX_SCALE));
    return p;
  };
  const floor = makeTex(11, {
    base: '#45404b',
    blots: ['rgba(20,18,26,0.28)', 'rgba(110,105,125,0.16)', 'rgba(70,60,50,0.18)'],
    nBlots: 70,
    blotR: [20, 70],
    specks: [[100, 96, 110], [40, 36, 46], [130, 128, 145]],
    nSpecks: 6000,
    cracks: 'rgba(18,14,22,0.4)',
    nCracks: 22,
  });
  const wall = makeTex(12, {
    base: '#141118',
    blots: ['rgba(0,0,0,0.45)', 'rgba(50,44,60,0.3)'],
    nBlots: 60,
    blotR: [16, 56],
    specks: [[45, 40, 54], [4, 3, 6], [64, 58, 74]],
    nSpecks: 4000,
    cracks: 'rgba(0,0,0,0.5)',
    nCracks: 18,
  });
  const face = makeTex(13, {
    base: '#4d4656',
    blots: ['rgba(0,0,0,0.25)', 'rgba(120,110,135,0.2)'],
    nBlots: 50,
    blotR: [14, 40],
    specks: [[110, 100, 120], [30, 26, 36]],
    nSpecks: 4000,
    extra: (g, r, S) => {
      // 岩肌の地層の筋
      for (let i = 0; i < 40; i++) {
        const y = r.next() * S;
        const x = r.next() * S;
        const w = 30 + r.next() * 90;
        g.strokeStyle = r.chance(0.5) ? 'rgba(20,16,26,0.45)' : 'rgba(140,130,155,0.25)';
        g.lineWidth = 1 + r.next() * 1.5;
        for (const ox of [-S, 0, S]) {
          g.beginPath();
          g.moveTo(x + ox, y);
          g.quadraticCurveTo(x + ox + w / 2, y + (r.next() - 0.5) * 6, x + ox + w, y + (r.next() - 0.5) * 4);
          g.stroke();
        }
      }
    },
  });
  const grass = makeTex(14, {
    base: '#4f8a3a',
    blots: ['rgba(30,70,20,0.3)', 'rgba(140,190,80,0.22)', 'rgba(110,120,40,0.18)'],
    nBlots: 90,
    blotR: [20, 80],
    specks: [[120, 170, 80], [40, 80, 30], [160, 190, 100]],
    nSpecks: 3000,
    extra: (g, r, S) => {
      const cols = ['#3d7a2c', '#5c9a42', '#6fae50', '#477f33', '#83bd5c'];
      g.lineCap = 'round';
      for (let i = 0; i < 7000; i++) {
        const x = r.next() * S;
        const y = r.next() * S;
        const h = 4 + r.next() * 7;
        const lean = (r.next() - 0.5) * 4;
        g.strokeStyle = r.pick(cols);
        g.lineWidth = 1.1 + r.next() * 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
        g.stroke();
      }
    },
  });
  const dirt = makeTex(15, {
    base: '#b38c58',
    blots: ['rgba(120,80,40,0.25)', 'rgba(220,190,140,0.25)'],
    nBlots: 60,
    blotR: [16, 60],
    specks: [[90, 60, 30], [230, 210, 170], [150, 120, 80]],
    nSpecks: 5000,
    extra: (g, r, S) => {
      for (let i = 0; i < 260; i++) {
        const x = r.next() * S;
        const y = r.next() * S;
        const s = 1.5 + r.next() * 3;
        g.fillStyle = 'rgba(60,40,20,0.35)';
        g.beginPath();
        g.ellipse(x + 0.6, y + 0.8, s, s * 0.7, 0, 0, TAU);
        g.fill();
        g.fillStyle = r.pick(['#c8b08a', '#a8906a', '#d8c4a0']);
        g.beginPath();
        g.ellipse(x, y, s, s * 0.7, 0, 0, TAU);
        g.fill();
      }
    },
  });
  PAT = { floor: pat(floor), wall: pat(wall), face: pat(face), grass: pat(grass), dirt: pat(dirt) };
  return PAT;
}

// 壁ぎわの影（グラデーションを一度だけ画像にしておく）
function shadowStrip(dir: 'down' | 'right' | 'left'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const vertical = dir === 'down';
  c.width = vertical ? 4 : 32;
  c.height = vertical ? 32 : 4;
  const g = c.getContext('2d')!;
  const gr = vertical ? g.createLinearGradient(0, 0, 0, 32) : dir === 'right' ? g.createLinearGradient(0, 0, 32, 0) : g.createLinearGradient(32, 0, 0, 0);
  gr.addColorStop(0, 'rgba(5,3,8,0.6)');
  gr.addColorStop(0.4, 'rgba(5,3,8,0.25)');
  gr.addColorStop(1, 'rgba(5,3,8,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
let SHADOWS: { down: HTMLCanvasElement; right: HTMLCanvasElement; left: HTMLCanvasElement } | null = null;

// ================================================================ 小物

type DecorKind = 'pebbles' | 'crack' | 'bones' | 'stain' | 'crystal' | 'rubble' | 'moss' | 'tuft' | 'flowers' | 'stone';

interface Decor {
  x: number;
  y: number;
  tx: number;
  ty: number;
  kind: DecorKind;
  seed: number;
}

function drawDecor(ctx: C, d: Decor, time: number) {
  const r = new RNG(d.seed);
  switch (d.kind) {
    case 'pebbles':
      for (let i = 0; i < 4; i++) {
        const x = d.x + (r.next() - 0.5) * 16;
        const y = d.y + (r.next() - 0.5) * 12;
        const s = 1.2 + r.next() * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ellipsePath(ctx, x + 0.6, y + 0.8, s, s * 0.7);
        ctx.fill();
        ctx.fillStyle = r.pick(['#6a6474', '#7a7484', '#5a5462']);
        ellipsePath(ctx, x, y, s, s * 0.7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ellipsePath(ctx, x - s * 0.3, y - s * 0.25, s * 0.4, s * 0.25);
        ctx.fill();
      }
      break;
    case 'crack': {
      ctx.strokeStyle = 'rgba(12,8,16,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = d.x - 10;
      let y = d.y + (r.next() - 0.5) * 8;
      ctx.moveTo(x, y);
      for (let i = 0; i < 5; i++) {
        x += 3 + r.next() * 3;
        y += (r.next() - 0.5) * 6;
        ctx.lineTo(x, y);
        if (r.chance(0.4)) {
          ctx.lineTo(x + (r.next() - 0.5) * 6, y + (r.next() - 0.5) * 6);
          ctx.moveTo(x, y);
        }
      }
      ctx.stroke();
      break;
    }
    case 'bones': {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(r.next() * TAU);
      ctx.strokeStyle = '#cfc8b2';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.fillStyle = '#ddd6c0';
      for (const ex of [-6, 6]) {
        ctx.beginPath();
        ctx.arc(ex, -0.8, 1.2, 0, TAU);
        ctx.arc(ex, 0.8, 1.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      if (r.chance(0.5)) {
        ctx.fillStyle = '#d8d0b8';
        ellipsePath(ctx, d.x + 6, d.y + 4, 3.5, 3);
        ctx.fill();
        ctx.fillStyle = '#2a2018';
        ellipsePath(ctx, d.x + 7, d.y + 3.6, 0.9, 1);
        ctx.fill();
      }
      break;
    }
    case 'stain': {
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 14);
      g.addColorStop(0, 'rgba(10,6,14,0.35)');
      g.addColorStop(1, 'rgba(10,6,14,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 14, d.y - 14, 28, 28);
      break;
    }
    case 'moss': {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(${70 + r.int(0, 30)},${110 + r.int(0, 40)},60,0.45)`;
        ellipsePath(ctx, d.x + (r.next() - 0.5) * 14, d.y + (r.next() - 0.5) * 10, 3 + r.next() * 4, 2 + r.next() * 2);
        ctx.fill();
      }
      break;
    }
    case 'rubble': {
      const s = 4 + r.next() * 3;
      groundShadow(ctx, d.x + 1, d.y + s * 0.5, s * 1.4, s * 0.55, 0.4);
      ctx.fillStyle = (() => {
        const g = ctx.createLinearGradient(d.x, d.y - s, d.x, d.y + s);
        g.addColorStop(0, '#8a8294');
        g.addColorStop(1, '#3e3846');
        return g;
      })();
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = s * (0.8 + r.next() * 0.35);
        const x = d.x + Math.cos(a) * rr * 1.2;
        const y = d.y + Math.sin(a) * rr * 0.75 - s * 0.3;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ellipsePath(ctx, d.x - s * 0.3, d.y - s * 0.8, s * 0.6, s * 0.3);
      ctx.fill();
      break;
    }
    case 'crystal': {
      const hue = r.chance(0.5) ? ['#7af0ff', '#2a9ac8'] : ['#d8a0ff', '#7a40c8'];
      const pulse = 0.7 + Math.sin(time * 2 + d.seed) * 0.2;
      glow(ctx, d.x, d.y - 6, 22, hue[0], 0.35 * pulse);
      groundShadow(ctx, d.x, d.y + 1, 9, 3, 0.4);
      for (let i = 0; i < 4; i++) {
        const ox = (i - 1.5) * 3.5 + (r.next() - 0.5) * 2;
        const h = 6 + r.next() * 9;
        const lean = (r.next() - 0.5) * 0.6;
        ctx.save();
        ctx.translate(d.x + ox, d.y);
        ctx.rotate(lean);
        const g = ctx.createLinearGradient(-2, 0, 2, 0);
        g.addColorStop(0, hue[1]);
        g.addColorStop(0.5, hue[0]);
        g.addColorStop(1, hue[1]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(-2, -h);
        ctx.lineTo(0, -h - 3);
        ctx.lineTo(2, -h);
        ctx.lineTo(2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-0.8, -h, 0.6, h * 0.8);
        ctx.restore();
      }
      break;
    }
    case 'tuft': {
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x = d.x + (r.next() - 0.5) * 8;
        const h = 4 + r.next() * 5;
        const lean = (r.next() - 0.5) * 5 + Math.sin(time * 1.5 + d.x * 0.05) * 0.8;
        ctx.strokeStyle = r.pick(['#3a7428', '#5c9a40', '#76b454']);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x, d.y);
        ctx.quadraticCurveTo(x + lean * 0.3, d.y - h * 0.6, x + lean, d.y - h);
        ctx.stroke();
      }
      break;
    }
    case 'flowers': {
      const col = r.pick(['#ffe060', '#ff8ab0', '#ffffff', '#b8a8ff', '#ff9a50']);
      for (let i = 0; i < 6; i++) {
        const x = d.x + (r.next() - 0.5) * 22;
        const y = d.y + (r.next() - 0.5) * 18;
        ctx.strokeStyle = '#3e7a2c';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = col;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU;
          ellipsePath(ctx, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 1.2, 1.2);
          ctx.fill();
        }
        ctx.fillStyle = '#e0a020';
        ellipsePath(ctx, x, y, 0.8, 0.8);
        ctx.fill();
      }
      break;
    }
    case 'stone': {
      const s = 1.5 + r.next() * 2;
      ctx.fillStyle = 'rgba(60,40,20,0.35)';
      ellipsePath(ctx, d.x + 0.6, d.y + 0.7, s, s * 0.65);
      ctx.fill();
      ctx.fillStyle = r.pick(['#a89a88', '#c4b8a4', '#8a7e70']);
      ellipsePath(ctx, d.x, d.y, s, s * 0.65);
      ctx.fill();
      break;
    }
  }
}

// ================================================================ 木

const TREE_PALS = [
  ['#1f4a24', '#3c7a3a', '#6aae52'],
  ['#234f26', '#467f36', '#7ab858'],
  ['#1d4430', '#33704a', '#5ea06a'],
];
const treeCache = new Map<number, HTMLCanvasElement>();
const TREE_RES = 4;

function treeImage(variant: number): HTMLCanvasElement {
  let c = treeCache.get(variant);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 64 * TREE_RES;
  c.height = 80 * TREE_RES;
  const g = c.getContext('2d')!;
  g.scale(TREE_RES, TREE_RES);
  g.translate(32, 72);
  const r = new RNG(variant * 97 + 3);
  const pal = TREE_PALS[variant % TREE_PALS.length];
  const s = 0.9 + (variant % 3) * 0.1;
  // 幹
  const tg = g.createLinearGradient(-4, 0, 4, 0);
  tg.addColorStop(0, '#4a2e18');
  tg.addColorStop(0.6, '#7a5230');
  tg.addColorStop(1, '#5a3a20');
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(-5.5, 0);
  g.quadraticCurveTo(-3, -2, -3, -8);
  g.lineTo(-2.5, -24 * s);
  g.lineTo(2.5, -24 * s);
  g.lineTo(3, -8);
  g.quadraticCurveTo(3, -2, 5.5, 0);
  g.closePath();
  g.fill();
  // 葉の塊
  const blobs: [number, number, number][] = [
    [-11, -26, 11],
    [11, -27, 11],
    [0, -24, 12],
    [-7, -38, 11],
    [8, -39, 11],
    [0, -47, 10],
  ];
  for (const [bx, by, br] of blobs) {
    const x = bx * s + (r.next() - 0.5) * 2;
    const y = by * s + (r.next() - 0.5) * 2;
    const rr = br * s;
    const gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
    gr.addColorStop(0, pal[2]);
    gr.addColorStop(0.55, pal[1]);
    gr.addColorStop(1, pal[0]);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rr, 0, TAU);
    g.fill();
  }
  // 葉のきらめき・陰
  for (let i = 0; i < 40; i++) {
    const a = r.next() * TAU;
    const d = r.next() * 20 * s;
    const x = Math.cos(a) * d;
    const y = -34 * s + Math.sin(a) * d * 0.9;
    g.fillStyle = r.chance(0.6) ? 'rgba(170,220,120,0.35)' : 'rgba(10,40,10,0.3)';
    g.beginPath();
    g.ellipse(x, y, 1.6 + r.next() * 1.6, 1.2 + r.next(), r.next() * 3, 0, TAU);
    g.fill();
  }
  treeCache.set(variant, c);
  return c;
}

function drawTree(ctx: C, x: number, baseY: number, variant: number) {
  const s = 1.45;
  groundShadow(ctx, x + 6, baseY, 30, 10, 0.35);
  ctx.drawImage(treeImage(variant), x - 32 * s, baseY - 72 * s, 64 * s, 80 * s);
}

// ================================================================ 建物

/** 建物の絵が収まる範囲（ワールド座標）。影・屋根・鐘楼・煙突・金床と親方まで含む */
function houseBox(b: Building): { x: number; y: number; w: number; h: number } {
  const x = b.x * TILE - 16;
  const y = b.y * TILE - 112;
  return { x, y, w: b.w * TILE + 48, h: b.h * TILE + 128 };
}

/**
 * 建物の動かない部分。町では一度だけ画像に描いて使い回す（Terrain.drawBuilding）。
 * 動く部分（鐘・煙・火の粉・親方など）は drawHouseAnim で毎フレーム重ねる
 */
function drawHouse(ctx: C, b: Building) {
  const x0 = b.x * TILE;
  const x1 = (b.x + b.w) * TILE;
  const top = b.y * TILE;
  const bottom = (b.y + b.h) * TILE;
  const w = x1 - x0;
  const wallTop = bottom - 54;
  const roofTop = top - 42;
  const eave = wallTop + 8;
  const home = b.kind === 'home';
  const smithy = b.kind === 'smithy';
  const temple = b.kind === 'temple';
  const bank = b.kind === 'bank';
  const guild = b.kind === 'guild';
  const warm = home || guild;
  const dx = (b.doorX + 0.5) * TILE;

  groundShadow(ctx, (x0 + x1) / 2 + 8, bottom - 2, w / 2 + 14, 12, 0.35);

  // 土台と壁
  ctx.fillStyle = '#8a8580';
  ctx.fillRect(x0 + 4, bottom - 7, w - 8, 7);
  ctx.strokeStyle = 'rgba(40,36,32,0.5)';
  ctx.lineWidth = 0.6;
  for (let x = x0 + 4; x < x1 - 4; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, bottom - 7);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  const wg = ctx.createLinearGradient(0, wallTop, 0, bottom);
  wg.addColorStop(0, smithy ? '#8a847c' : temple ? '#d4d2e2' : bank ? '#d6ccb4' : guild ? '#b8a284' : '#d8c6a0');
  wg.addColorStop(0.3, smithy ? '#b4aea4' : temple ? '#f8f6ff' : bank ? '#f6efdc' : guild ? '#dcc8a4' : '#f2e6cb');
  wg.addColorStop(1, smithy ? '#958f86' : temple ? '#c8c4da' : bank ? '#cfc4a8' : guild ? '#b09a7a' : '#ddcba6');
  ctx.fillStyle = wg;
  ctx.fillRect(x0 + 4, wallTop, w - 8, bottom - 7 - wallTop);
  if (smithy || bank) {
    // 石積みの壁（銀行は白っぽい切り石）
    ctx.strokeStyle = bank ? 'rgba(120,100,70,0.28)' : 'rgba(50,44,38,0.35)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let y = wallTop + 9, row = 0; y < bottom - 8; y += 8, row++) {
      ctx.moveTo(x0 + 4, y);
      ctx.lineTo(x1 - 4, y);
      for (let x = x0 + 4 + (row % 2) * 7; x < x1 - 4; x += 14) {
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  // 木の骨組み
  ctx.fillStyle = smithy ? '#3e342c' : temple ? '#b09a62' : bank ? '#a8925a' : guild ? '#3a2418' : '#6b4a2b';
  ctx.fillRect(x0 + 4, wallTop, w - 8, 4);
  ctx.fillRect(x0 + 4, bottom - 10, w - 8, 3);
  const posts = [x0 + 4, x0 + w * 0.34, x0 + w * 0.66, x1 - 8];
  for (const px of posts) {
    if (Math.abs(px - dx) <= 18) continue;
    if (temple || bank) {
      // 白い石の柱（溝つき）
      ctx.fillStyle = bank ? '#fbf6e8' : '#ece8f6';
      ctx.fillRect(px - 1, wallTop + 4, 6, bottom - 11 - wallTop);
      ctx.fillStyle = bank ? 'rgba(150,120,70,0.35)' : 'rgba(120,110,150,0.35)';
      ctx.fillRect(px + 0.8, wallTop + 6, 0.8, bottom - 15 - wallTop);
      ctx.fillRect(px + 2.8, wallTop + 6, 0.8, bottom - 15 - wallTop);
      ctx.fillStyle = bank ? '#c8a448' : '#b09a62';
      ctx.fillRect(px - 2, wallTop + 4, 8, 2);
      ctx.fillRect(px - 2, bottom - 12, 8, 2);
    } else ctx.fillRect(px, wallTop, 4, bottom - 7 - wallTop);
  }

  // 窓
  for (const wx of [x0 + w * 0.2, x0 + w * 0.82]) {
    if (Math.abs(wx - dx) < 26) continue;
    const wy = wallTop + 14;
    if (temple) {
      // アーチ形のステンドグラス
      const arch = (inset: number) => {
        ctx.beginPath();
        ctx.moveTo(wx - 9 + inset, wy + 20 - inset);
        ctx.lineTo(wx - 9 + inset, wy + 5);
        ctx.arc(wx, wy + 5, 9 - inset, Math.PI, 0);
        ctx.lineTo(wx + 9 - inset, wy + 20 - inset);
        ctx.closePath();
      };
      ctx.fillStyle = '#8a7a50';
      arch(-2);
      ctx.fill();
      ctx.save();
      arch(0);
      ctx.clip();
      const panes = ['#3a6ad8', '#d83a5a', '#e8c040', '#3ab08a', '#8a4ad8', '#3a6ad8'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = panes[(i + Math.floor(wx)) % panes.length];
        ctx.fillRect(wx - 9 + (i % 2) * 9, wy - 4 + Math.floor(i / 2) * 8, 9, 8);
      }
      ctx.restore();
      ctx.strokeStyle = '#3a3020';
      ctx.lineWidth = 1;
      arch(0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx, wy - 4);
      ctx.lineTo(wx, wy + 20);
      ctx.moveTo(wx - 9, wy + 7);
      ctx.lineTo(wx + 9, wy + 7);
      ctx.stroke();
      ctx.fillStyle = '#d8d4e4';
      ctx.fillRect(wx - 12, wy + 20, 24, 3);
      continue;
    }
    ctx.fillStyle = home ? '#3a5a8a' : smithy ? '#34343a' : bank ? '#24443a' : guild ? '#5a2034' : '#7a2a24';
    ctx.fillRect(wx - 16, wy - 1, 5, 18);
    ctx.fillRect(wx + 11, wy - 1, 5, 18);
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(wx - 11, wy - 2, 22, 20);
    const gg = ctx.createLinearGradient(0, wy, 0, wy + 16);
    if (smithy) {
      // 炉の火で赤く光る窓（ゆらめきは drawHouseAnim で重ねる）
      gg.addColorStop(0, 'rgba(255,220,140,0.85)');
      gg.addColorStop(1, '#e0501a');
    } else if (warm) {
      gg.addColorStop(0, '#fff0b8');
      gg.addColorStop(1, '#e8a848');
    } else {
      gg.addColorStop(0, '#d8f0ff');
      gg.addColorStop(1, '#6a9cc8');
    }
    ctx.fillStyle = gg;
    ctx.fillRect(wx - 9, wy, 18, 16);
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(wx - 0.8, wy, 1.6, 16);
    ctx.fillRect(wx - 9, wy + 7.2, 18, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(wx - 7, wy + 1.5, 4, 4);
    if (bank) {
      // 鉄格子
      ctx.fillStyle = '#2a2a30';
      for (const bx of [-5.5, -1, 3.5]) ctx.fillRect(wx + bx, wy - 1, 1.6, 18);
      ctx.fillRect(wx - 9, wy + 3, 18, 1.4);
      ctx.fillRect(wx - 9, wy + 12, 18, 1.4);
    }
    // 花台（武器防具屋と銀行は石の窓台）
    const stoneSill = smithy || bank;
    ctx.fillStyle = smithy ? '#6e6860' : bank ? '#bfb296' : '#6b4424';
    ctx.fillRect(wx - 12, wy + 18, 24, 4);
    for (let i = 0; i < 6 && !stoneSill; i++) {
      ctx.fillStyle = i % 2 ? '#ff6a6a' : '#fff0f0';
      ellipsePath(ctx, wx - 10 + i * 4, wy + 17, 1.8, 1.8);
      ctx.fill();
    }
  }

  // ひさしの影
  const sg = ctx.createLinearGradient(0, wallTop, 0, wallTop + 12);
  sg.addColorStop(0, 'rgba(30,20,10,0.45)');
  sg.addColorStop(1, 'rgba(30,20,10,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x0 + 4, wallTop, w - 8, 12);

  // 扉
  const dTop = bottom - 7 - 36;
  ctx.fillStyle = '#8a8478';
  ctx.beginPath();
  ctx.roundRect(dx - 14, dTop - 3, 28, 39, [13, 13, 0, 0]);
  ctx.fill();
  const dg = ctx.createLinearGradient(dx - 11, 0, dx + 11, 0);
  dg.addColorStop(0, smithy ? '#3a2a1e' : temple ? '#26346a' : bank ? '#1a3a2e' : guild ? '#4a1a2a' : '#6a3c1c');
  dg.addColorStop(0.5, smithy ? '#5e4630' : temple ? '#4a62a8' : bank ? '#2e6a50' : guild ? '#7a3048' : '#9a5e30');
  dg.addColorStop(1, smithy ? '#2e2018' : temple ? '#202c5a' : bank ? '#163024' : guild ? '#3a1420' : '#5e341a');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.roundRect(dx - 11, dTop, 22, 36, [11, 11, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.7;
  for (const lx of [-5.5, 0, 5.5]) {
    ctx.beginPath();
    ctx.moveTo(dx + lx, dTop + 2);
    ctx.lineTo(dx + lx, dTop + 36);
    ctx.stroke();
  }
  if (smithy || bank || guild) {
    // 鉄の帯（銀行は金の帯）
    ctx.fillStyle = bank ? '#c8a448' : '#2a2a30';
    for (const by of [dTop + 9, dTop + 26]) ctx.fillRect(dx - 11, by, 22, 2.4);
    ctx.fillStyle = bank ? '#fff0b0' : '#8a8a94';
    for (const by of [dTop + 10.2, dTop + 27.2]) {
      for (const bx of [-8, 8]) {
        ellipsePath(ctx, dx + bx, by, 0.9, 0.9);
        ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#e8c050';
  ellipsePath(ctx, dx + 7, dTop + 21, 1.5, 1.5);
  ctx.fill();
  ctx.fillStyle = '#9a948a';
  ctx.fillRect(dx - 15, bottom - 3, 30, 5);

  // 看板
  const sx = dx + 22;
  const sy = wallTop + 12;
  ctx.strokeStyle = '#2a1a0a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx - 4, sy - 3);
  ctx.lineTo(sx + 10, sy - 3);
  ctx.moveTo(sx, sy - 3);
  ctx.lineTo(sx, sy);
  ctx.moveTo(sx + 8, sy - 3);
  ctx.lineTo(sx + 8, sy);
  ctx.stroke();
  ctx.fillStyle = '#8a5a2c';
  ctx.beginPath();
  ctx.roundRect(sx - 4, sy, 16, 12, 2);
  ctx.fill();
  if (home) {
    // 本の看板
    ctx.fillStyle = '#3f6aa8';
    ctx.fillRect(sx - 0.5, sy + 3, 4.2, 6.5);
    ctx.fillStyle = '#c8402e';
    ctx.fillRect(sx + 4.3, sy + 3, 4.2, 6.5);
    ctx.fillStyle = '#f2e8d0';
    ctx.fillRect(sx + 3.6, sy + 3, 0.8, 6.5);
  } else if (smithy) {
    // 交差した剣
    ctx.strokeStyle = '#e8eef4';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(sx - 1, sy + 10);
    ctx.lineTo(sx + 9, sy + 2);
    ctx.moveTo(sx + 9, sy + 10);
    ctx.lineTo(sx - 1, sy + 2);
    ctx.stroke();
    ctx.strokeStyle = '#e8c050';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(sx - 0.5, sy + 7.5);
    ctx.lineTo(sx + 2.5, sy + 10.5);
    ctx.moveTo(sx + 8.5, sy + 7.5);
    ctx.lineTo(sx + 5.5, sy + 10.5);
    ctx.stroke();
  } else if (guild) {
    // 盾と交差した剣の看板
    ctx.strokeStyle = '#e8eef4';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(sx - 1, sy + 10.5);
    ctx.lineTo(sx + 9, sy + 1.5);
    ctx.moveTo(sx + 9, sy + 10.5);
    ctx.lineTo(sx - 1, sy + 1.5);
    ctx.stroke();
    guildShield(ctx, sx + 4, sy + 6, 0.55);
  } else if (bank) {
    // 金貨の看板
    ctx.fillStyle = '#a07c20';
    ellipsePath(ctx, sx + 4, sy + 6, 4.4, 4.4);
    ctx.fill();
    ctx.fillStyle = '#f0c848';
    ellipsePath(ctx, sx + 4, sy + 6, 3.6, 3.6);
    ctx.fill();
    ctx.strokeStyle = '#a07c20';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(sx + 4, sy + 6, 1.9, -0.4, Math.PI * 1.6);
    ctx.lineTo(sx + 4.2, sy + 6);
    ctx.stroke();
  } else if (temple) {
    // 金色の太陽の紋章
    ctx.strokeStyle = '#ffe080';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.moveTo(sx + 4 + Math.cos(a) * 2.6, sy + 6 + Math.sin(a) * 2.6);
      ctx.lineTo(sx + 4 + Math.cos(a) * 4.6, sy + 6 + Math.sin(a) * 4.6);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffe080';
    ellipsePath(ctx, sx + 4, sy + 6, 2.2, 2.2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#d84a4a';
    ellipsePath(ctx, sx + 4, sy + 7.5, 3.2, 3.2);
    ctx.fill();
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(sx + 3, sy + 2, 2, 3);
  }

  // 店の日よけ
  if (b.kind === 'shop') {
    const ax0 = dx - 20;
    const ay = dTop - 8;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#f4ece0' : '#c83a32';
      ctx.beginPath();
      ctx.moveTo(ax0 + i * 8 + 2, ay);
      ctx.lineTo(ax0 + i * 8 + 10, ay);
      ctx.lineTo(ax0 + i * 8 + 10, ay + 7);
      ctx.quadraticCurveTo(ax0 + i * 8 + 6, ay + 10, ax0 + i * 8 + 2, ay + 7);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 屋根
  const roofPath = new Path2D();
  roofPath.moveTo(x0 - 8, eave);
  roofPath.lineTo(x1 + 8, eave);
  roofPath.lineTo(x1 - 16, roofTop);
  roofPath.lineTo(x0 + 16, roofTop);
  roofPath.closePath();
  const rc = temple ? ['#6a8ad0', '#34529a', '#22366a'] : guild ? ['#a8485e', '#6e2438', '#461424'] : bank ? ['#5a9a78', '#2e6a4e', '#1c4634'] : smithy ? ['#7a828c', '#4a5059', '#2e333a'] : home ? ['#d0944a', '#8f5a26', '#5e3818'] : ['#d0584a', '#9a3a30', '#6e2620'];
  const rg = ctx.createLinearGradient(0, roofTop, 0, eave);
  rg.addColorStop(0, rc[0]);
  rg.addColorStop(0.6, rc[1]);
  rg.addColorStop(1, rc[2]);
  ctx.fillStyle = rg;
  ctx.fill(roofPath);
  ctx.save();
  ctx.clip(roofPath);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 0.9;
  for (let y = roofTop + 6, row = 0; y < eave; y += 7, row++) {
    ctx.beginPath();
    for (let x = x0 - 8 + (row % 2) * 5; x < x1 + 8; x += 10) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 5, y + 4, x + 10, y);
    }
    ctx.stroke();
  }
  const hl = ctx.createLinearGradient(x0, 0, x1, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0.12)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = hl;
  ctx.fill(roofPath);
  ctx.restore();
  ctx.fillStyle = rc[2];
  ctx.beginPath();
  ctx.roundRect(x0 + 13, roofTop - 3, w - 26, 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x0 + 16, roofTop - 2, w - 32, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0 - 8, eave - 2, w + 16, 2.5);

  // 神殿：金の縁どりと、屋根の上の鐘楼
  if (temple) {
    ctx.fillStyle = '#d8b850';
    ctx.fillRect(x0 - 8, eave - 3, w + 16, 1.6);
    const bx = x1 - 52;
    const by = roofTop + 6;
    // 塔
    const tg = ctx.createLinearGradient(bx - 11, 0, bx + 11, 0);
    tg.addColorStop(0, '#cfcbe0');
    tg.addColorStop(0.5, '#f8f6ff');
    tg.addColorStop(1, '#bdb8d2');
    ctx.fillStyle = tg;
    ctx.fillRect(bx - 11, by - 30, 22, 34);
    // 鐘の窓と、揺れる金の鐘
    ctx.fillStyle = '#2a2440';
    ctx.beginPath();
    ctx.moveTo(bx - 6, by - 8);
    ctx.lineTo(bx - 6, by - 20);
    ctx.arc(bx, by - 20, 6, Math.PI, 0);
    ctx.lineTo(bx + 6, by - 8);
    ctx.closePath();
    ctx.fill();
    // とんがり屋根と、光る金の宝珠
    ctx.fillStyle = '#34529a';
    ctx.beginPath();
    ctx.moveTo(bx - 14, by - 29);
    ctx.lineTo(bx + 14, by - 29);
    ctx.lineTo(bx, by - 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(bx - 14, by - 29);
    ctx.lineTo(bx - 2, by - 29);
    ctx.lineTo(bx, by - 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8b850';
    ctx.fillRect(bx - 14, by - 31, 28, 2.5);
  }

  // 銀行：金の縁どりと、屋根の正面の破風に大きな金貨の紋章
  if (bank) {
    ctx.fillStyle = '#d8b850';
    ctx.fillRect(x0 - 8, eave - 3, w + 16, 1.6);
    const { x: cx, y: cy } = bankCoin(b);
    ctx.fillStyle = '#f2ead4';
    ctx.beginPath();
    ctx.moveTo(cx - 30, eave - 4);
    ctx.lineTo(cx + 30, eave - 4);
    ctx.lineTo(cx, roofTop - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c8a448';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#7a5a18';
    ellipsePath(ctx, cx, cy, 10.5, 10.5);
    ctx.fill();
    const cg = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 10);
    cg.addColorStop(0, '#fff2a8');
    cg.addColorStop(0.6, '#f0c040');
    cg.addColorStop(1, '#b88a20');
    ctx.fillStyle = cg;
    ellipsePath(ctx, cx, cy, 9, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(122,90,24,0.8)';
    ctx.lineWidth = 0.8;
    ellipsePath(ctx, cx, cy, 6.8, 6.8);
    ctx.stroke();
    // 「G」の刻印
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, -0.5, Math.PI * 1.65);
    ctx.moveTo(cx + 4, cy + 1.2);
    ctx.lineTo(cx + 0.6, cy + 1.2);
    ctx.stroke();
  }

  // ハンターギルド：金の縁どり、破風の盾の紋章、旗竿、壁の垂れ幕、店先の掲示板
  if (guild) {
    ctx.fillStyle = '#d8b850';
    ctx.fillRect(x0 - 8, eave - 3, w + 16, 1.6);
    const cx = (x0 + x1) / 2;
    const cy = (roofTop + eave) / 2 + 2;
    ctx.fillStyle = '#3a1420';
    ctx.beginPath();
    ctx.moveTo(cx - 26, eave - 4);
    ctx.lineTo(cx + 26, eave - 4);
    ctx.lineTo(cx, roofTop - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c8a448';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    guildShield(ctx, cx, cy + 3, 1.25);
    // 旗竿（旗は drawHouseAnim でなびかせる）
    const { x: fx, y: fy } = guildFlag(b);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(fx - 1, fy, 2.2, roofTop + 14 - fy);
    ctx.fillStyle = '#e8c050';
    ellipsePath(ctx, fx + 0.1, fy - 1, 2, 2);
    ctx.fill();
    // 壁の垂れ幕
    for (const bx of [x0 + 7, x1 - 19]) {
      ctx.fillStyle = '#c8a448';
      ctx.fillRect(bx - 1, wallTop + 3, 14, 2);
      ctx.fillStyle = '#7a2438';
      ctx.beginPath();
      ctx.moveTo(bx, wallTop + 5);
      ctx.lineTo(bx + 12, wallTop + 5);
      ctx.lineTo(bx + 12, wallTop + 34);
      ctx.lineTo(bx + 6, wallTop + 29);
      ctx.lineTo(bx, wallTop + 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, wallTop + 5, 3, 27);
      guildShield(ctx, bx + 6, wallTop + 15, 0.45);
    }
    // 掲示板（依頼の貼り紙）
    const ax = x1 - 26;
    const ay = bottom + 3;
    groundShadow(ctx, ax, ay, 15, 3.5, 0.4);
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(ax - 12, ay - 22, 2.5, 22);
    ctx.fillRect(ax + 9.5, ay - 22, 2.5, 22);
    ctx.fillStyle = '#8a5a2c';
    ctx.fillRect(ax - 14, ay - 24, 28, 15);
    ctx.fillStyle = '#5e3a1c';
    ctx.fillRect(ax - 15, ay - 26, 30, 3);
    const papers: [number, number, number][] = [
      [-11, -21, -0.1],
      [-3, -22, 0.08],
      [5, -21, -0.05],
      [-7, -15.5, 0.06],
      [2, -15, -0.1],
    ];
    for (const [px, py, rot] of papers) {
      ctx.save();
      ctx.translate(ax + px, ay + py);
      ctx.rotate(rot);
      ctx.fillStyle = '#f2e8cc';
      ctx.fillRect(0, 0, 6, 5.5);
      ctx.fillStyle = 'rgba(80,60,40,0.55)';
      ctx.fillRect(1, 1.5, 4, 0.6);
      ctx.fillRect(1, 3, 3, 0.6);
      ctx.fillStyle = '#c83a2a';
      ctx.fillRect(2.5, -0.4, 1, 1);
      ctx.restore();
    }
  }

  // 武器防具屋：石の煙突から黒い煙と火の粉
  if (smithy) {
    const cx = x0 + 40;
    ctx.fillStyle = '#6e6860';
    ctx.fillRect(cx, roofTop - 20, 16, 30);
    ctx.strokeStyle = 'rgba(40,36,32,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let y = roofTop - 14; y < roofTop + 10; y += 6) {
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + 16, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#4e4842';
    ctx.fillRect(cx - 2, roofTop - 23, 20, 5);
  }

  // 店先の金床
  if (smithy) {
    const ax = x1 - 34;
    const ay = bottom + 2;
    groundShadow(ctx, ax + 2, ay, 14, 3.5, 0.4);
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(ax - 6, ay - 9, 12, 9);
    ctx.fillStyle = '#3a2c1e';
    ctx.fillRect(ax - 6, ay - 9, 12, 1.5);
    const ag = ctx.createLinearGradient(0, ay - 17, 0, ay - 9);
    ag.addColorStop(0, '#9aa0aa');
    ag.addColorStop(1, '#3e424a');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.moveTo(ax - 9, ay - 17);
    ctx.lineTo(ax + 7, ay - 17);
    ctx.quadraticCurveTo(ax + 13, ay - 16.5, ax + 14, ay - 14.5);
    ctx.lineTo(ax + 7, ay - 13.5);
    ctx.lineTo(ax + 4, ay - 9);
    ctx.lineTo(ax - 5, ay - 9);
    ctx.lineTo(ax - 7, ay - 13.5);
    ctx.lineTo(ax - 9, ay - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(ax - 8, ay - 17, 15, 1);
    // 立てかけた金づち
    ctx.strokeStyle = '#6a4424';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax - 13, ay);
    ctx.lineTo(ax - 9, ay - 13);
    ctx.stroke();
    ctx.fillStyle = '#5a5e66';
    ctx.save();
    ctx.translate(ax - 9, ay - 13);
    ctx.rotate(0.3);
    ctx.fillRect(-3.5, -2, 7, 3.2);
    ctx.restore();
  }

  // 煙突と煙（わが家・ギルド）
  if (warm) {
    const cx = x1 - 52;
    ctx.fillStyle = '#7a4a3a';
    ctx.fillRect(cx, roofTop - 12, 11, 22);
    ctx.fillStyle = '#5a3428';
    ctx.fillRect(cx - 1.5, roofTop - 14, 14, 4);
  }
}

/** ハンターギルドの紋章：赤い盾に金の縁と剣 */
function guildShield(ctx: C, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(7, -8);
    ctx.lineTo(7, 0);
    ctx.quadraticCurveTo(6, 6, 0, 9);
    ctx.quadraticCurveTo(-6, 6, -7, 0);
    ctx.closePath();
  };
  ctx.fillStyle = '#c8a448';
  ctx.save();
  ctx.scale(1.18, 1.14);
  shield();
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(-7, -8, 7, 9);
  g.addColorStop(0, '#d84a4a');
  g.addColorStop(1, '#8a1e28');
  ctx.fillStyle = g;
  shield();
  ctx.fill();
  // 剣
  ctx.fillStyle = '#f2f4f8';
  ctx.fillRect(-0.9, -6.5, 1.8, 10);
  ctx.fillStyle = '#e8c050';
  ctx.fillRect(-3.5, 2.5, 7, 1.6);
  ctx.fillRect(-0.9, 4, 1.8, 3);
  ctx.restore();
}

/** ハンターギルドの旗竿の先 */
function guildFlag(b: Building): { x: number; y: number } {
  return { x: b.x * TILE + 34, y: b.y * TILE - 42 - 30 };
}

/** 銀行の屋根の金貨の紋章の中心 */
function bankCoin(b: Building): { x: number; y: number } {
  const bottom = (b.y + b.h) * TILE;
  const roofTop = b.y * TILE - 42;
  const eave = bottom - 54 + 8;
  return { x: (b.x + b.w / 2) * TILE, y: (roofTop + eave) / 2 + 4 };
}

/** 建物の動く部分：ステンドグラスのきらめき・鐘・宝珠・光の粒・炉の火・煙・火の粉・鍛冶屋の親方 */
function drawHouseAnim(ctx: C, b: Building, time: number) {
  const x0 = b.x * TILE;
  const x1 = (b.x + b.w) * TILE;
  const top = b.y * TILE;
  const bottom = (b.y + b.h) * TILE;
  const w = x1 - x0;
  const wallTop = bottom - 54;
  const roofTop = top - 42;
  const dx = (b.doorX + 0.5) * TILE;
  if (b.kind === 'temple') {
    for (const wx of [x0 + w * 0.2, x0 + w * 0.82]) {
      if (Math.abs(wx - dx) < 26) continue;
      const wy = wallTop + 14;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(wx - 9, wy + 20);
      ctx.lineTo(wx - 9, wy + 5);
      ctx.arc(wx, wy + 5, 9, Math.PI, 0);
      ctx.lineTo(wx + 9, wy + 20);
      ctx.closePath();
      ctx.clip();
        const sh = 0.25 + Math.sin(time * 1.5 + wx * 0.1) * 0.12;
        ctx.fillStyle = `rgba(255,255,255,${sh})`;
        ctx.fillRect(wx - 9, wy - 4, 18, 26);
      ctx.restore();
    }
    const bx = x1 - 52;
    const by = roofTop + 6;
    ctx.save();
    ctx.translate(bx, by - 24);
    ctx.rotate(Math.sin(time * 2.2) * 0.25);
    ctx.fillStyle = '#e8c048';
    ctx.beginPath();
    ctx.moveTo(-1.5, 0);
    ctx.quadraticCurveTo(-4.5, 4, -5, 10);
    ctx.lineTo(5, 10);
    ctx.quadraticCurveTo(4.5, 4, 1.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a07c20';
    ctx.fillRect(-5, 9, 10, 1.5);
    ctx.restore();
    glow(ctx, bx, by - 56, 12, '#fff0a0', 0.4 + Math.sin(time * 2) * 0.12);
    ctx.fillStyle = '#ffe070';
    ellipsePath(ctx, bx, by - 56, 3.4, 3.4);
    ctx.fill();
    ctx.fillStyle = '#fff8d0';
    ellipsePath(ctx, bx - 1, by - 57, 1.2, 1.2);
    ctx.fill();
    // 舞う光の粒
    for (let i = 0; i < 5; i++) {
      const k = ((time * 0.25 + i * 0.21) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(255,244,180,${0.8 * Math.sin(k * Math.PI)})`;
      ctx.fillRect(dx + Math.sin(i * 5.1 + k * 3) * 22, bottom - 6 - k * 60, 1.5, 1.5);
    }
  }
  if (b.kind === 'smithy') {
    // 炉の火で窓がゆらめく
    for (const wx of [x0 + w * 0.2, x0 + w * 0.82]) {
      if (Math.abs(wx - dx) < 26) continue;
      const fl = Math.sin(time * 7 + wx) * 0.08 + Math.sin(time * 13) * 0.05;
      ctx.fillStyle = fl > 0 ? `rgba(255,230,160,${fl})` : `rgba(120,30,10,${-fl})`;
      ctx.fillRect(wx - 9, wallTop + 14, 18, 16);
    }
    const cx = x0 + 40;
    glow(ctx, cx + 8, roofTop - 22, 10, '#ff8a30', 0.35 + Math.sin(time * 9) * 0.1);
    for (let i = 0; i < 4; i++) {
      const k = ((time * 0.3 + i / 4) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(70,66,70,${0.5 * (1 - k)})`;
      ellipsePath(ctx, cx + 8 + Math.sin(k * 5 + i) * 4 + k * 12, roofTop - 26 - k * 36, 4 + k * 7, 3 + k * 6);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      const k = ((time * 0.8 + i * 0.37) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(255,${180 - k * 100},60,${1 - k})`;
      ctx.fillRect(cx + 8 + Math.sin(i * 7.3 + k * 4) * 8 * k, roofTop - 24 - k * 26, 1.4, 1.4);
    }
    const ax = x1 - 34;
    const ay = bottom + 2;
    // 金床の上の焼けた鉄と、それを叩く鍛冶屋の親方
    glow(ctx, ax + 2, ay - 18, 7, '#ff7a20', 0.55);
    ctx.fillStyle = '#ffb040';
    ctx.fillRect(ax - 2, ay - 18.6, 8, 1.6);
    drawSmith(ctx, ax + 22, ay, time, ax + 2, ay - 18);
  }
  if (b.kind === 'bank') {
    // 屋根の金貨を光がさっと横切り、ときどききらめく
    const { x: cx, y: cy } = bankCoin(b);
    const k = (time % 4) / 4;
    if (k < 0.3) {
      const sx = cx - 12 + (k / 0.3) * 24;
      ctx.save();
      ellipsePath(ctx, cx, cy, 9, 9);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,240,0.65)';
      ctx.beginPath();
      ctx.moveTo(sx - 2, cy - 10);
      ctx.lineTo(sx + 2, cy - 10);
      ctx.lineTo(sx - 2, cy + 10);
      ctx.lineTo(sx - 6, cy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const tw = Math.max(0, Math.sin(time * 2.3)) ** 6;
    if (tw > 0.05) {
      const px = cx + 6;
      const py = cy - 6;
      ctx.strokeStyle = `rgba(255,255,220,${tw})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - 4 * tw, py);
      ctx.lineTo(px + 4 * tw, py);
      ctx.moveTo(px, py - 4 * tw);
      ctx.lineTo(px, py + 4 * tw);
      ctx.stroke();
    }
    glow(ctx, cx, cy, 16, '#ffd860', 0.18 + Math.sin(time * 2) * 0.06);
  }
  if (b.kind === 'guild') {
    // 旗竿の先でなびく旗
    const { x: fx, y: fy } = guildFlag(b);
    const wave = (k: number) => Math.sin(time * 5 - k * 4) * 2.2 * k;
    ctx.fillStyle = '#a02a3a';
    ctx.beginPath();
    ctx.moveTo(fx + 1, fy + 1);
    const n = 6;
    for (let i = 0; i <= n; i++) ctx.lineTo(fx + 1 + (i / n) * 22, fy + 1 + wave(i / n));
    for (let i = n; i >= 0; i--) ctx.lineTo(fx + 1 + (i / n) * 22, fy + 13 - (i / n) * 2 + wave(i / n));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8c050';
    ctx.fillRect(fx + 1, fy + 6, 6, 1.4);
  }
  if (b.kind === 'home') {
    const cx = x1 - 52;
    for (let i = 0; i < 4; i++) {
      const k = ((time * 0.35 + i / 4) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(230,230,235,${0.45 * (1 - k)})`;
      ellipsePath(ctx, cx + 5.5 + Math.sin(k * 5 + i) * 4 + k * 10, roofTop - 16 - k * 34, 3 + k * 6, 2.5 + k * 5);
      ctx.fill();
    }
  }
}

/**
 * 鍛冶屋の親方。金床に向かって（左向き）金づちを振り下ろし、打つたびに火花が散る。
 * (x, y) は足元、(hx, hy) は金づちが当たる場所。
 */
function drawSmith(ctx: C, x: number, y: number, time: number, hx: number, hy: number) {
  const P = 1.3;
  const ph = (time % P) / P;
  // 腕の振り上げ量：ゆっくり上げて、一気に振り下ろす
  let raise: number;
  if (ph < 0.55) raise = (ph / 0.55) * 2.1;
  else if (ph < 0.64) raise = 2.1 * (1 - (ph - 0.55) / 0.09);
  else raise = 0;
  const since = (ph - 0.64) * P; // 打ってからの秒数
  const bob = since >= 0 && since < 0.12 ? 0.8 : 0;
  const skin = '#d89a72';
  const skinD = '#b87a54';

  groundShadow(ctx, x, y, 12, 3.5, 0.35);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1); // +x を金床（画面の左）へ向ける

  // 脚とブーツ
  ctx.fillStyle = '#3a3040';
  ctx.beginPath();
  ctx.roundRect(-5.5, -15, 5, 13, 1.5);
  ctx.roundRect(1, -15, 5, 13, 1.5);
  ctx.fill();
  ctx.fillStyle = '#2a1c12';
  ctx.beginPath();
  ctx.roundRect(-6, -3.2, 6, 3.4, [1.5, 1.5, 0.8, 0.8]);
  ctx.roundRect(1, -3.2, 7.5, 3.4, [1.5, 2.5, 0.8, 0.8]);
  ctx.fill();

  // 奥の腕（腰に当てている）
  ctx.strokeStyle = skinD;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -28 + bob);
  ctx.lineTo(-7, -21 + bob);
  ctx.lineTo(-4, -16 + bob);
  ctx.stroke();

  // 胴（たくましい上半身と革の前掛け）
  ctx.fillStyle = '#7a3a2a';
  ctx.beginPath();
  ctx.roundRect(-8, -32 + bob, 16, 19, [7, 7, 3, 3]);
  ctx.fill();
  const ag = ctx.createLinearGradient(-1, 0, 9, 0);
  ag.addColorStop(0, '#4e3018');
  ag.addColorStop(1, '#7a5030');
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.roundRect(-0.5, -29 + bob, 9.5, 25, [2, 3, 3, 2]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -29 + bob);
  ctx.lineTo(-6, -31 + bob);
  ctx.stroke();
  ctx.fillStyle = '#2e2018';
  ctx.fillRect(-8, -16.5 + bob, 16, 2.2);

  // 頭（はちまき・眉・ひげ）
  const hY = -37 + bob;
  ctx.fillStyle = skinD;
  ctx.fillRect(-1, -33 + bob, 4, 3);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1.5, hY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ellipsePath(ctx, 0, hY - 3.5, 3, 1.4);
  ctx.fill();
  ctx.fillStyle = '#c03a2a';
  ctx.fillRect(-4.3, hY - 3, 11.6, 2);
  ctx.fillStyle = '#c03a2a';
  ctx.beginPath();
  ctx.moveTo(-4, hY - 2.6);
  ctx.lineTo(-8, hY - 1 + Math.sin(time * 5) * 0.8);
  ctx.lineTo(-7.5, hY + 0.6 + Math.sin(time * 5) * 0.8);
  ctx.lineTo(-4, hY - 1);
  ctx.fill();
  ctx.fillStyle = skinD;
  ellipsePath(ctx, 7.3, hY + 0.5, 1.6, 1.3);
  ctx.fill();
  ctx.fillStyle = '#5a3418';
  ctx.beginPath();
  ctx.moveTo(-1, hY + 1);
  ctx.quadraticCurveTo(4, hY + 10, 7.6, hY + 2);
  ctx.quadraticCurveTo(4, hY + 4.5, -1, hY + 1);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ellipsePath(ctx, 4.6, hY - 0.4, 0.8, 1.1);
  ctx.fill();
  ctx.strokeStyle = '#4a2a14';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(3, hY - 2);
  ctx.lineTo(6.4, hY - 1.4);
  ctx.stroke();

  // 金づちを持つ腕
  const th = 0.38 - raise; // 腕の向き（+x から下向きが正）
  const sx = 2;
  const sy = -28 + bob;
  const ex = sx + Math.cos(th) * 9.5;
  const ey = sy + Math.sin(th) * 9.5;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(th);
  ctx.fillStyle = '#6a4424';
  ctx.fillRect(-1, -0.8, 11, 1.6);
  const hg = ctx.createLinearGradient(0, -3.5, 0, 3.5);
  hg.addColorStop(0, '#b0b6c0');
  hg.addColorStop(1, '#4a4e58');
  ctx.fillStyle = hg;
  ctx.fillRect(9, -3.4, 4.6, 6.8);
  ctx.restore();
  ctx.strokeStyle = skin;
  ctx.lineWidth = 4.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 打った瞬間の光と火花
  if (since >= 0 && since < 0.2) glow(ctx, hx, hy, 12, '#ffc060', 0.9 * (1 - since / 0.2));
  if (since >= 0 && since < 0.45) {
    const k = since / 0.45;
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + (i - 3.5) * 0.42;
      const sp = 45 + (i % 3) * 18;
      const px = hx + Math.cos(ang) * sp * since;
      const py = hy + Math.sin(ang) * sp * since + 140 * since * since;
      ctx.fillStyle = `rgba(255,${210 - k * 120},80,${1 - k})`;
      ctx.fillRect(px - 0.7, py - 0.7, 1.5, 1.5);
    }
  }
}

/** 遺跡の入口（岩山と石の門） */
function drawRuin(ctx: C, b: Building, time: number, rocks: [number, number][]) {
  const x0 = b.x * TILE;
  const x1 = (b.x + b.w) * TILE;
  const bottom = (b.y + b.h) * TILE;
  const dx = (b.doorX + 0.5) * TILE;
  groundShadow(ctx, (x0 + x1) / 2 + 8, bottom - 4, (x1 - x0) / 2 + 14, 14, 0.4);

  // 岩山
  const rg = ctx.createLinearGradient(0, bottom - 110, 0, bottom);
  rg.addColorStop(0, '#a89c8c');
  rg.addColorStop(0.5, '#7e7266');
  rg.addColorStop(1, '#4e463e');
  ctx.fillStyle = rg;
  ctx.beginPath();
  rocks.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  // 岩の面の明暗
  ctx.save();
  ctx.clip();
  for (let i = 1; i < rocks.length - 1; i += 2) {
    const [px, py] = rocks[i];
    ctx.fillStyle = i % 4 === 1 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 18, bottom);
    ctx.lineTo(px - 10, bottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(90,140,60,0.55)';
  for (const [mx, my] of [
    [x0 + 30, bottom - 70],
    [x1 - 40, bottom - 62],
    [dx + 40, bottom - 92],
  ]) {
    ellipsePath(ctx, mx, my, 12, 4);
    ctx.fill();
  }
  ctx.restore();

  // 石の門
  const pillar = (px: number) => {
    const pg = ctx.createLinearGradient(px - 6, 0, px + 6, 0);
    pg.addColorStop(0, '#8a8070');
    pg.addColorStop(0.5, '#cfc4ae');
    pg.addColorStop(1, '#7a7062');
    ctx.fillStyle = pg;
    ctx.fillRect(px - 6, bottom - 62, 12, 62);
    ctx.strokeStyle = 'rgba(40,34,28,0.5)';
    ctx.lineWidth = 0.7;
    for (let y = bottom - 50; y < bottom; y += 12) {
      ctx.beginPath();
      ctx.moveTo(px - 6, y);
      ctx.lineTo(px + 6, y);
      ctx.stroke();
    }
  };
  // 入口の闇
  const cg = ctx.createRadialGradient(dx, bottom - 14, 2, dx, bottom - 20, 30);
  cg.addColorStop(0, '#000000');
  cg.addColorStop(0.7, '#120c08');
  cg.addColorStop(1, '#3a2c20');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.roundRect(dx - 17, bottom - 52, 34, 52, [17, 17, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,140,110,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(dx - 12 + i * 1.5, bottom - 3 - i * 5);
    ctx.lineTo(dx + 12 - i * 1.5, bottom - 3 - i * 5);
    ctx.stroke();
  }
  pillar(dx - 23);
  pillar(dx + 23);
  const lg = ctx.createLinearGradient(0, bottom - 72, 0, bottom - 60);
  lg.addColorStop(0, '#d8ccb4');
  lg.addColorStop(1, '#8a7e6c');
  ctx.fillStyle = lg;
  ctx.fillRect(dx - 34, bottom - 72, 68, 11);
  const rune = 0.5 + Math.sin(time * 2) * 0.25;
  glow(ctx, dx, bottom - 66.5, 14, '#60e0ff', rune * 0.5);
  ctx.strokeStyle = `rgba(120,230,255,${rune})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dx - 8, bottom - 66.5);
  ctx.lineTo(dx - 3, bottom - 69.5);
  ctx.lineTo(dx + 3, bottom - 63.5);
  ctx.lineTo(dx + 8, bottom - 66.5);
  ctx.stroke();

  // 松明
  for (const tx of [dx - 34, dx + 34]) torch(ctx, tx, bottom - 44, time);
}

function torch(ctx: C, x: number, y: number, time: number) {
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 1.2, y, 2.4, 10);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(x - 2.6, y - 1, 5.2, 2.4);
  const f = Math.sin(time * 13 + x) * 0.5 + Math.sin(time * 21 + x * 2) * 0.3;
  glow(ctx, x, y - 5, 20, '#ff9a30', 0.55 + f * 0.08);
  ctx.fillStyle = '#ff8a20';
  ctx.beginPath();
  ctx.moveTo(x - 3.2, y - 1);
  ctx.quadraticCurveTo(x - 3.5 + f, y - 8, x + f * 1.5, y - 12 - f);
  ctx.quadraticCurveTo(x + 3.5 + f, y - 7, x + 3.2, y - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y - 1.5);
  ctx.quadraticCurveTo(x - 1.2 + f * 0.5, y - 6, x + f, y - 8);
  ctx.quadraticCurveTo(x + 1.6, y - 5, x + 1.5, y - 1.5);
  ctx.closePath();
  ctx.fill();
}

// ================================================================ 夜の町

/** 建物の窓（ガラスの上端の中心）。drawHouse と同じ並び */
function windowSpots(b: Building): { x: number; y: number }[] {
  if (b.kind === 'ruin') return [];
  const x0 = b.x * TILE;
  const w = b.w * TILE;
  const wy = (b.y + b.h) * TILE - 54 + 14;
  const dx = (b.doorX + 0.5) * TILE;
  return [x0 + w * 0.2, x0 + w * 0.82].filter((wx) => Math.abs(wx - dx) >= 26).map((wx) => ({ x: wx, y: wy }));
}

/** 夜、窓に灯りがともっている時間（時）。[夜に消える時刻, 朝につく時刻]。[24, 0] なら一晩じゅう */
const WINDOW_HOURS: Record<Building['kind'], [number, number]> = {
  shop: [23, 5],
  bank: [21, 24],
  home: [23, 24],
  temple: [24, 0],
  smithy: [24, 0],
  guild: [24, 0],
  ruin: [0, 24],
};

function windowLit(b: Building, clock: number): boolean {
  const h = clock / 60;
  const [off, on] = WINDOW_HOURS[b.kind];
  return h >= 12 ? h < off : h >= on;
}

/** 夜の窓の灯り */
function drawWindowGlow(ctx: C, b: Building, n: number, time: number) {
  for (const { x: wx, y: wy } of windowSpots(b)) {
    ctx.save();
    ctx.globalAlpha = n;
    if (b.kind === 'temple') {
      // ろうそくの灯りに透けるステンドグラス
      ctx.beginPath();
      ctx.moveTo(wx - 9, wy + 20);
      ctx.lineTo(wx - 9, wy + 5);
      ctx.arc(wx, wy + 5, 9, Math.PI, 0);
      ctx.lineTo(wx + 9, wy + 20);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      const panes = ['#6a9aff', '#ff6a8a', '#ffe070', '#6ae0b8', '#b87aff', '#6a9aff'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = panes[(i + Math.floor(wx)) % panes.length];
        ctx.fillRect(wx - 9 + (i % 2) * 9, wy - 4 + Math.floor(i / 2) * 8, 9, 8);
      }
      ctx.fillStyle = `rgba(255,240,200,${0.25 + Math.sin(time * 3 + wx) * 0.08})`;
      ctx.fillRect(wx - 9, wy - 4, 18, 24);
      ctx.restore();
      ctx.strokeStyle = '#3a3020';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx, wy - 4);
      ctx.lineTo(wx, wy + 20);
      ctx.moveTo(wx - 9, wy + 7);
      ctx.lineTo(wx + 9, wy + 7);
      ctx.stroke();
      ctx.restore();
      glow(ctx, wx, wy + 8, 20, '#c8b0ff', 0.3 * n);
      continue;
    }
    const smithy = b.kind === 'smithy';
    const fl = Math.sin(time * (smithy ? 7 : 2.3) + wx) * (smithy ? 0.12 : 0.04);
    const gg = ctx.createLinearGradient(0, wy, 0, wy + 16);
    gg.addColorStop(0, smithy ? '#ffd890' : '#fff2c0');
    gg.addColorStop(1, smithy ? '#f05a1a' : '#f0a848');
    ctx.fillStyle = gg;
    ctx.globalAlpha = n * Math.min(1, 0.92 + fl);
    ctx.fillRect(wx - 9, wy, 18, 16);
    ctx.globalAlpha = n;
    ctx.fillStyle = '#4a2e16';
    ctx.fillRect(wx - 0.8, wy, 1.6, 16);
    ctx.fillRect(wx - 9, wy + 7.2, 18, 1.6);
    if (b.kind === 'bank') {
      ctx.fillStyle = '#2a2a30';
      for (const bx of [-5.5, -1, 3.5]) ctx.fillRect(wx + bx, wy - 1, 1.6, 18);
      ctx.fillRect(wx - 9, wy + 3, 18, 1.4);
      ctx.fillRect(wx - 9, wy + 12, 18, 1.4);
    }
    ctx.restore();
    glow(ctx, wx, wy + 8, 22, smithy ? '#ff7a30' : '#ffc060', (0.3 + fl) * n);
  }
}

/** 街灯の柱（昼も夜も描く。夜の火は drawLampFlame で重ねる）。(x, y) は足元 */
function drawLampPost(ctx: C, x: number, y: number) {
  groundShadow(ctx, x + 2, y, 7, 2.6, 0.35);
  ctx.fillStyle = '#2c2a30';
  ctx.fillRect(x - 3.5, y - 4, 7, 4);
  ctx.fillRect(x - 1.3, y - 34, 2.6, 30);
  ctx.fillStyle = '#4a4650';
  ctx.fillRect(x - 0.4, y - 33, 0.8, 28);
  // 灯籠（ガラスの箱と屋根）
  ctx.fillStyle = '#2c2a30';
  ctx.fillRect(x - 4.5, y - 36, 9, 2);
  ctx.fillStyle = '#b8c8cc';
  ctx.fillRect(x - 3.5, y - 44, 7, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x - 2.6, y - 43, 1.4, 5);
  ctx.strokeStyle = '#2c2a30';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, y - 44, 7, 8);
  ctx.fillStyle = '#2c2a30';
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 44);
  ctx.lineTo(x, y - 49);
  ctx.lineTo(x + 6, y - 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 0.8, y - 51, 1.6, 2.5);
}

/** 街灯の火（暗さを重ねたあとに描く） */
function drawLampFlame(ctx: C, x: number, y: number, n: number, time: number) {
  const f = Math.sin(time * 9 + x) * 0.5 + Math.sin(time * 15 + x * 2) * 0.3;
  glow(ctx, x, y - 40, 26, '#ffb050', (0.45 + f * 0.05) * n);
  ctx.save();
  ctx.globalAlpha = n;
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(x - 3.5, y - 44, 7, 8);
  ctx.fillStyle = '#ff9a30';
  ctx.beginPath();
  ctx.moveTo(x - 1.8, y - 37);
  ctx.quadraticCurveTo(x - 2 + f * 0.4, y - 41, x + f * 0.6, y - 43.5);
  ctx.quadraticCurveTo(x + 2 + f * 0.4, y - 41, x + 1.8, y - 37);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2c2a30';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3.5, y - 44, 7, 8);
  ctx.restore();
}

// ================================================================ 本体

const isWall = (t: number) => t === T.WALL;

export class Terrain {
  private decor: Decor[] = [];
  private decorGrid = new Map<number, Decor[]>();
  private torches: { x: number; y: number; tx: number; ty: number }[] = [];
  private trees: { x: number; y: number; v: number }[] = [];
  private ruinRocks: [number, number][] = [];
  // ダンジョン：探索済みの床と壁の形
  private floorPath = new Path2D();
  private wallPath = new Path2D();
  private builtVer = -1;
  // 町：道と池の形
  private pathEdge = new Path2D();
  private pathFill = new Path2D();
  private shore = new Path2D();
  private waterWet = new Path2D();
  private water = new Path2D();
  private waterBox = { x0: 0, y0: 0, x1: 0, y1: 0 };

  /** わが家：本棚に並べる本の色（ゲーム側が毎フレーム入れる） */
  shelfColors: string[] = [];
  /** わが家：秘宝をテーブルに飾るか */
  cleared = false;
  /** ダンジョン：地面と壁にかける色（乗算）。ダンジョンごとの雰囲気 */
  tint = '';
  /** 町：街灯の位置（足元） */
  lamps: { x: number; y: number }[] = [];
  /** 町：灯りのつき具合（0 = 昼 … 1 = 夜。ゲーム側が毎フレーム入れる） */
  night = 0;
  /** 町：時刻（0:00 からの分。窓の灯りが消える時刻に使う） */
  clock = 0;

  constructor(
    private map: TileMap,
    private scene: 'town' | 'dungeon' | 'home',
    private buildings: Building[],
    private furniture: Furniture[] = [],
  ) {
    if (!SHADOWS) SHADOWS = { down: shadowStrip('down'), right: shadowStrip('right'), left: shadowStrip('left') };
    if (scene === 'dungeon') this.initDungeon();
    else if (scene === 'town') this.initTown();
  }

  private addDecor(d: Decor) {
    this.decor.push(d);
    const k = this.map.key(d.tx, d.ty);
    const list = this.decorGrid.get(k);
    if (list) list.push(d);
    else this.decorGrid.set(k, [d]);
  }

  private initDungeon() {
    const m = this.map;
    const r = new RNG(m.hash(m.w, m.h) ^ (Date.now() & 0xffff));
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        const t = m.get(tx, ty);
        if (t === T.FLOOR && !m.blockers.has(m.key(tx, ty))) {
          const roll = r.next();
          const kind: DecorKind | null =
            roll < 0.1 ? 'pebbles' : roll < 0.16 ? 'crack' : roll < 0.19 ? 'stain' : roll < 0.215 ? 'bones' : roll < 0.25 ? 'rubble' : roll < 0.28 ? 'moss' : roll < 0.292 ? 'crystal' : null;
          if (kind) {
            this.addDecor({ x: (tx + 0.2 + r.next() * 0.6) * TILE, y: (ty + 0.25 + r.next() * 0.6) * TILE, tx, ty, kind, seed: r.int(0, 1e9) });
          }
        }
        if (isWall(t) && !isWall(m.get(tx, ty + 1)) && m.get(tx, ty + 1) !== T.WALL && r.chance(0.07)) {
          if (!this.torches.some((o) => Math.abs(o.tx - tx) < 4 && o.ty === ty)) {
            this.torches.push({ x: (tx + 0.5) * TILE, y: ty * TILE + 18, tx, ty });
          }
        }
      }
    }
  }

  private initTown() {
    const m = this.map;
    const r = new RNG(7777);
    const pathCells: [number, number][] = [];
    const waterCells: [number, number][] = [];
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        const t = m.get(tx, ty);
        const cx = (tx + 0.5) * TILE;
        const cy = (ty + 0.5) * TILE;
        if (t === T.PATH) {
          pathCells.push([tx, ty]);
          if (r.chance(0.6)) this.addDecor({ x: cx + (r.next() - 0.5) * 22, y: cy + (r.next() - 0.5) * 22, tx, ty, kind: 'stone', seed: r.int(0, 1e9) });
        } else if (t === T.WATER) {
          waterCells.push([tx, ty]);
        } else if (t === T.TREE) {
          this.trees.push({ x: cx + (r.next() - 0.5) * 6, y: (ty + 0.85) * TILE, v: r.int(0, 8) });
        } else if (t === T.FLOWER) {
          this.addDecor({ x: cx, y: cy, tx, ty, kind: 'flowers', seed: r.int(0, 1e9) });
        } else if (t === T.GRASS && r.chance(0.45)) {
          this.addDecor({ x: cx + (r.next() - 0.5) * 24, y: cy + (r.next() - 0.5) * 24, tx, ty, kind: 'tuft', seed: r.int(0, 1e9) });
        }
      }
    }
    const blob = (cells: [number, number][], rad: number, set: Set<number>) => {
      const p = new Path2D();
      for (const [tx, ty] of cells) {
        const cx = (tx + 0.5) * TILE;
        const cy = (ty + 0.5) * TILE;
        p.moveTo(cx + rad, cy);
        p.arc(cx, cy, rad, 0, TAU);
        if (set.has(m.key(tx + 1, ty))) p.rect(cx, cy - rad, TILE, rad * 2);
        if (set.has(m.key(tx, ty + 1))) p.rect(cx - rad, cy, rad * 2, TILE);
        if (set.has(m.key(tx + 1, ty)) && set.has(m.key(tx, ty + 1)) && set.has(m.key(tx + 1, ty + 1))) p.rect(cx, cy, TILE, TILE);
      }
      return p;
    };
    const pathSet = new Set(pathCells.map(([x, y]) => m.key(x, y)));
    this.pathEdge = blob(pathCells, 21, pathSet);
    this.pathFill = blob(pathCells, 18, pathSet);
    // 池は水のタイルを囲む、ゆらぎのある楕円として描く
    if (waterCells.length) {
      const xs = waterCells.map((c) => c[0]);
      const ys = waterCells.map((c) => c[1]);
      const box = { x0: Math.min(...xs) * TILE, y0: Math.min(...ys) * TILE, x1: (Math.max(...xs) + 1) * TILE, y1: (Math.max(...ys) + 1) * TILE };
      this.waterBox = box;
      const cx = (box.x0 + box.x1) / 2;
      const cy = (box.y0 + box.y1) / 2;
      const rx = (box.x1 - box.x0) / 2;
      const ry = (box.y1 - box.y0) / 2;
      const oval = (k: number) => {
        const p = new Path2D();
        const n = 64;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const wob = 1 + 0.045 * Math.sin(a * 3 + 1) + 0.03 * Math.sin(a * 5 + 2);
          const x = cx + Math.cos(a) * rx * wob * k;
          const y = cy + Math.sin(a) * ry * wob * k;
          if (i) p.lineTo(x, y);
          else p.moveTo(x, y);
        }
        p.closePath();
        return p;
      };
      this.shore = oval(1.1);
      this.waterWet = oval(1.03);
      this.water = oval(0.99);
    }
    // 遺跡の岩山の輪郭
    const ruin = this.buildings.find((b) => b.kind === 'ruin');
    if (ruin) {
      const x0 = ruin.x * TILE;
      const x1 = (ruin.x + ruin.w) * TILE;
      const bottom = (ruin.y + ruin.h) * TILE;
      const rr = new RNG(4242);
      const pts: [number, number][] = [[x0 + 6, bottom]];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const hump = Math.sin(k * Math.PI);
        pts.push([x0 + k * (x1 - x0) + (rr.next() - 0.5) * 8, bottom - 26 - hump * 74 - rr.next() * 14]);
      }
      pts.push([x1 - 6, bottom]);
      this.ruinRocks = pts;
    }
  }

  private rebuildDungeonPaths() {
    const m = this.map;
    this.builtVer = m.exploredVer;
    this.floorPath = new Path2D();
    this.wallPath = new Path2D();
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        if (!m.explored[m.key(tx, ty)]) continue;
        // 継ぎ目が出ないよう少しだけ重ねる
        (isWall(m.get(tx, ty)) ? this.wallPath : this.floorPath).rect(tx * TILE - 0.3, ty * TILE - 0.3, TILE + 0.6, TILE + 0.6);
      }
    }
  }

  /** 地面の層を描く */
  drawGround(ctx: C, v: View, time: number) {
    const P = patterns(ctx);
    if (this.scene === 'dungeon') this.drawDungeon(ctx, P, v, time);
    else if (this.scene === 'home') drawHomeGround(ctx, this.map, time);
    else this.drawTown(ctx, P, v, time);
  }

  private tileRange(v: View, pad = 1) {
    return {
      tx0: Math.max(0, Math.floor(v.x0 / TILE) - pad),
      ty0: Math.max(0, Math.floor(v.y0 / TILE) - pad),
      tx1: Math.min(this.map.w - 1, Math.floor(v.x1 / TILE) + pad),
      ty1: Math.min(this.map.h - 1, Math.floor(v.y1 / TILE) + pad),
    };
  }

  private drawDecorIn(ctx: C, v: View, time: number, needExplored: boolean) {
    const { tx0, ty0, tx1, ty1 } = this.tileRange(v);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (needExplored && !this.map.isExplored(tx, ty)) continue;
        const list = this.decorGrid.get(this.map.key(tx, ty));
        if (list) for (const d of list) drawDecor(ctx, d, time);
      }
    }
  }

  private drawDungeon(ctx: C, P: Patterns, v: View, time: number) {
    const m = this.map;
    if (this.builtVer !== m.exploredVer) this.rebuildDungeonPaths();
    ctx.fillStyle = P.floor;
    ctx.fill(this.floorPath);
    this.drawDecorIn(ctx, v, time, true);

    const { tx0, ty0, tx1, ty1 } = this.tileRange(v);
    const S = SHADOWS!;
    // 階段
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!m.isExplored(tx, ty)) continue;
        const t = m.get(tx, ty);
        if (t === T.STAIRS_DOWN) drawStairsDown(ctx, tx * TILE, ty * TILE);
        else if (t === T.STAIRS_UP) drawStairsUp(ctx, tx * TILE, ty * TILE, time);
      }
    }
    // 壁ぎわの影（床側）
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isWall(m.get(tx, ty)) || !m.isExplored(tx, ty)) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (isWall(m.get(tx, ty - 1))) ctx.drawImage(S.down, x, y, TILE, 16);
        if (isWall(m.get(tx - 1, ty))) ctx.drawImage(S.right, x, y, 9, TILE);
        if (isWall(m.get(tx + 1, ty))) ctx.drawImage(S.left, x + TILE - 9, y, 9, TILE);
      }
    }
    // 壁の上面
    ctx.fillStyle = P.wall;
    ctx.fill(this.wallPath);
    // 壁の正面（下が床の壁）と縁の明かり
    const jag = (gx: number, ty: number) => ((m.hash(gx, ty + 7919) % 7) - 3) * 0.8;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isWall(m.get(tx, ty)) || !m.isExplored(tx, ty)) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        // 横と上に床がある辺はうっすら明るく縁取る
        ctx.strokeStyle = 'rgba(140,128,160,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (!isWall(m.get(tx - 1, ty))) {
          ctx.moveTo(x + 0.5, y);
          ctx.lineTo(x + 0.5, y + TILE);
        }
        if (!isWall(m.get(tx + 1, ty))) {
          ctx.moveTo(x + TILE - 0.5, y);
          ctx.lineTo(x + TILE - 0.5, y + TILE);
        }
        if (!isWall(m.get(tx, ty - 1))) {
          ctx.moveTo(x, y + 0.5);
          ctx.lineTo(x + TILE, y + 0.5);
        }
        ctx.stroke();
        if (isWall(m.get(tx, ty + 1))) continue;
        const faceTop = y + 10;
        ctx.beginPath();
        ctx.moveTo(x - 0.3, y + TILE + 0.3);
        for (let i = 0; i <= 4; i++) ctx.lineTo(x + i * 8, faceTop + jag(tx * 4 + i, ty));
        ctx.lineTo(x + TILE + 0.3, y + TILE + 0.3);
        ctx.closePath();
        ctx.fillStyle = P.face;
        ctx.fill();
        const fg = ctx.createLinearGradient(0, faceTop - 3, 0, y + TILE);
        fg.addColorStop(0, 'rgba(255,245,255,0.14)');
        fg.addColorStop(0.35, 'rgba(0,0,0,0)');
        fg.addColorStop(1, 'rgba(5,3,8,0.55)');
        ctx.fillStyle = fg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(170,160,190,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
          const px = x + i * 8;
          const py = faceTop + jag(tx * 4 + i, ty);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
    if (this.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = this.tint;
      ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
      ctx.restore();
    }
    for (const t of this.torches) {
      if (m.isExplored(t.tx, t.ty) && t.x > v.x0 - 40 && t.x < v.x1 + 40 && t.y > v.y0 - 40 && t.y < v.y1 + 40) torch(ctx, t.x, t.y, time);
    }
  }

  private drawTown(ctx: C, P: Patterns, v: View, time: number) {
    const m = this.map;
    ctx.fillStyle = P.grass;
    ctx.fillRect(0, 0, m.w * TILE, m.h * TILE);
    // 池
    ctx.fillStyle = '#c8ad78';
    ctx.fill(this.shore);
    ctx.fillStyle = '#7a6a48';
    ctx.fill(this.waterWet);
    const b = this.waterBox;
    const wg = ctx.createLinearGradient(0, b.y0, 0, b.y1);
    wg.addColorStop(0, '#4a9ae0');
    wg.addColorStop(1, '#2a5aa0');
    ctx.fillStyle = wg;
    ctx.fill(this.water);
    ctx.save();
    ctx.clip(this.water);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = b.y0 + 8 + i * 13;
      const off = (time * 12 + i * 37) % 60;
      ctx.beginPath();
      for (let x = b.x0 - 60 + off; x < b.x1; x += 30) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 6, y - 2.5, x + 12, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const k = (time * 0.5 + i * 0.37) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.sin(k * Math.PI)})`;
      ellipsePath(ctx, b.x0 + 20 + ((i * 53) % (b.x1 - b.x0 - 30)), b.y0 + 14 + ((i * 29) % (b.y1 - b.y0 - 20)), 3, 0.8);
      ctx.fill();
    }
    ctx.restore();
    // 道
    ctx.fillStyle = 'rgba(70,50,24,0.35)';
    ctx.fill(this.pathEdge);
    ctx.fillStyle = P.dirt;
    ctx.fill(this.pathFill);
    this.drawDecorIn(ctx, v, time, false);
  }

  /** 奥行き順に並べて描くもの（木・建物） */
  objects(v: View, time: number): Sortable[] {
    if (this.scene === 'home') return homeObjects(this.furniture, this.shelfColors, time, this.cleared);
    const out: Sortable[] = [];
    for (const t of this.trees) {
      if (t.x < v.x0 - 60 || t.x > v.x1 + 60 || t.y < v.y0 - 10 || t.y > v.y1 + 120) continue;
      out.push({ y: t.y, draw: (ctx) => drawTree(ctx, t.x, t.y, t.v) });
    }
    for (const l of this.lamps) {
      if (l.x < v.x0 - 20 || l.x > v.x1 + 20 || l.y < v.y0 - 10 || l.y > v.y1 + 60) continue;
      out.push({ y: l.y, draw: (ctx) => drawLampPost(ctx, l.x, l.y) });
    }
    for (const b of this.buildings) {
      const bottom = (b.y + b.h) * TILE;
      if (b.kind === 'ruin') {
        out.push({ y: bottom, draw: (ctx) => drawRuin(ctx, b, time, this.ruinRocks) });
        continue;
      }
      // 画面の外の建物は描かない
      const box = houseBox(b);
      if (box.x > v.x1 || box.x + box.w < v.x0 || box.y > v.y1 || box.y + box.h < v.y0) continue;
      out.push({ y: bottom, draw: (ctx) => this.drawBuilding(ctx, b, time) });
    }
    return out;
  }

  /** 建物の動かない部分を描いた画像（拡大率ごとに作り直す） */
  private houseCache = new Map<Building, { c: HTMLCanvasElement; k: number }>();

  /** 建物を描く。動かない部分は画像を使い回し、動く部分だけ毎フレーム描く */
  private drawBuilding(ctx: C, b: Building, time: number) {
    const m = ctx.getTransform();
    const k = Math.min(6, Math.hypot(m.a, m.b));
    const box = houseBox(b);
    let e = this.houseCache.get(b);
    if (!e || Math.abs(e.k - k) > 0.001) {
      const c = e?.c ?? document.createElement('canvas');
      c.width = Math.ceil(box.w * k);
      c.height = Math.ceil(box.h * k);
      const g = c.getContext('2d')!;
      g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
      drawHouse(g, b);
      e = { c, k };
      this.houseCache.set(b, e);
    }
    ctx.drawImage(e.c, box.x, box.y, box.w, box.h);
    drawHouseAnim(ctx, b, time);
  }

  /**
   * 夜の町で光るもの（窓・街灯の火・ホタル・水面の星）。暗さを重ねたあとに描くので、暗がりの中で明るく見える
   */
  drawNightGlow(ctx: C, v: View, time: number) {
    const n = this.night;
    if (this.scene !== 'town' || n <= 0) return;
    for (const b of this.buildings) {
      if (b.kind === 'ruin' || !windowLit(b, this.clock)) continue;
      const box = houseBox(b);
      if (box.x > v.x1 || box.x + box.w < v.x0 || box.y > v.y1 || box.y + box.h < v.y0) continue;
      drawWindowGlow(ctx, b, n, time);
    }
    for (const l of this.lamps) {
      if (l.x < v.x0 - 40 || l.x > v.x1 + 40 || l.y < v.y0 - 10 || l.y > v.y1 + 80) continue;
      drawLampFlame(ctx, l.x, l.y, n, time);
    }
    // 池のほとりのホタルと、水面にうつる星
    const b = this.waterBox;
    if (b.x1 > v.x0 - 60 && b.x0 < v.x1 + 60 && b.y1 > v.y0 - 60 && b.y0 < v.y1 + 60) {
      ctx.save();
      ctx.clip(this.water);
      for (let i = 0; i < 9; i++) {
        const tw = Math.max(0, Math.sin(time * (1.3 + (i % 3) * 0.4) + i * 2.1));
        ctx.fillStyle = `rgba(230,240,255,${0.7 * n * tw})`;
        const sx = b.x0 + 14 + ((i * 47) % (b.x1 - b.x0 - 28));
        const sy = b.y0 + 10 + ((i * 31) % (b.y1 - b.y0 - 20));
        ctx.fillRect(sx - 0.6 + Math.sin(time + i) * 0.8, sy - 0.6, 1.2, 1.2);
      }
      ctx.restore();
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const rx = (b.x1 - b.x0) / 2 + 24;
      const ry = (b.y1 - b.y0) / 2 + 18;
      for (let i = 0; i < 12; i++) {
        const a = i * 0.53 + time * (0.06 + (i % 4) * 0.015) * (i % 2 ? 1 : -1);
        const x = cx + Math.cos(a) * rx * (0.9 + 0.15 * Math.sin(time * 0.7 + i)) + Math.sin(time * 1.7 + i * 3) * 6;
        const y = cy + Math.sin(a) * ry * (0.9 + 0.15 * Math.cos(time * 0.5 + i)) + Math.cos(time * 1.3 + i * 5) * 5 - 6;
        const blink = Math.max(0, Math.sin(time * 2.2 + i * 1.9)) ** 2;
        if (blink < 0.05) continue;
        glow(ctx, x, y, 7, '#d8ff70', 0.5 * n * blink);
        ctx.fillStyle = `rgba(240,255,170,${n * blink})`;
        ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
      }
    }
  }

  /** 暗闇を照らす灯り */
  lights(v: View): Light[] {
    const out: Light[] = [];
    const near = (x: number, y: number, r: number) => x > v.x0 - r && x < v.x1 + r && y > v.y0 - r && y < v.y1 + r;
    for (const t of this.torches) {
      if (this.map.isExplored(t.tx, t.ty) && near(t.x, t.y, 130)) out.push({ x: t.x, y: t.y + 6, r: 130, tint: 'rgba(255,150,60,0.16)' });
    }
    for (const d of this.decor) {
      if (d.kind === 'crystal' && this.map.isExplored(d.tx, d.ty) && near(d.x, d.y, 80)) out.push({ x: d.x, y: d.y - 4, r: 80, tint: 'rgba(120,200,255,0.12)' });
    }
    if (this.scene === 'town' && this.night > 0) {
      const n = this.night;
      for (const l of this.lamps) if (near(l.x, l.y - 30, 100)) out.push({ x: l.x, y: l.y - 22, r: 100 * (0.5 + 0.5 * n), tint: `rgba(255,190,100,${0.2 * n})` });
      for (const b of this.buildings) {
        if (!windowLit(b, this.clock)) continue;
        const tint = b.kind === 'smithy' ? `rgba(255,120,50,${0.22 * n})` : b.kind === 'temple' ? `rgba(200,170,255,${0.16 * n})` : `rgba(255,200,120,${0.16 * n})`;
        for (const w of windowSpots(b)) if (near(w.x, w.y, 70)) out.push({ x: w.x, y: w.y + 14, r: 64 * (0.5 + 0.5 * n), tint });
      }
    }
    const m = this.map;
    const { tx0, ty0, tx1, ty1 } = this.tileRange(v, 4);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (m.get(tx, ty) === T.STAIRS_UP && m.isExplored(tx, ty)) out.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, r: 110, tint: 'rgba(255,240,200,0.12)' });
      }
    }
    return out;
  }
}

function drawStairsDown(ctx: C, x: number, y: number) {
  const g = ctx.createRadialGradient(x + 16, y + 20, 2, x + 16, y + 16, 22);
  g.addColorStop(0, '#000');
  g.addColorStop(1, '#1a1520');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, 28, 28, 5);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const inset = 3 + i * 2.5;
    ctx.fillStyle = `rgba(150,140,165,${0.55 - i * 0.12})`;
    ctx.fillRect(x + inset, y + 4 + i * 6, TILE - inset * 2, 2.5);
  }
  ctx.strokeStyle = 'rgba(120,200,255,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, 28, 28, 5);
  ctx.stroke();
}

function drawStairsUp(ctx: C, x: number, y: number, time: number) {
  for (let i = 0; i < 5; i++) {
    const c = 200 - i * 22;
    ctx.fillStyle = `rgb(${c},${c - 10},${c - 30})`;
    ctx.fillRect(x + 3, y + 3 + i * 5.5, 26, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 3, y + 7 + i * 5.5, 26, 1);
  }
  glow(ctx, x + 16, y + 6, 26, '#fff0c0', 0.35 + Math.sin(time * 2) * 0.08);
}
