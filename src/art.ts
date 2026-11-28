/**
 * キャラクター・敵・宝箱・アイテムの絵。すべてキャンバスのパスとグラデーションで描く。
 *
 * 座標系：単位はワールド単位（1タイル = 32）。原点は足元の中央（地面）で、上が -y。
 * キャラは横向きで描き、+x が向いている方向。左向きは描くときに左右反転する。
 */
import type { Enemy } from './entities';

type C = CanvasRenderingContext2D;

const TAU = Math.PI * 2;


// ================================================================ 共通の部品

export function ellipsePath(ctx: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function circlePath(ctx: C, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function lin(ctx: C, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function rad(ctx: C, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** 接地影（地面に落ちる柔らかい影） */
export function groundShadow(ctx: C, x: number, y: number, rx: number, ry: number, alpha = 0.32) {
  if (noShadow) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, rx, [
    [0, `rgba(10,6,4,${alpha})`],
    [0.6, `rgba(10,6,4,${alpha * 0.75})`],
    [1, 'rgba(10,6,4,0)'],
  ]);
  circlePath(ctx, 0, 0, rx);
  ctx.fill();
  ctx.restore();
}

/** 発光のにじみ（加算合成で半透明の円を重ねる） */
export function glow(ctx: C, x: number, y: number, r: number, color: string, alpha = 0.4) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [
    [0, color],
    [1, 'rgba(0,0,0,0)'],
  ]);
  ctx.globalAlpha *= alpha;
  circlePath(ctx, x, y, r);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- 白く光る姿（被弾・残像）

/** true のあいだは接地影を描かない（白く光る姿を作るときに使う） */
let noShadow = false;
const whiteCv = document.createElement('canvas');
const whiteCtx = whiteCv.getContext('2d')!;

/**
 * 白く光る姿を重ねる。ワールド座標の範囲 (x0, y0, w, h) に draw で描いたものを、影なしで小さな作業用キャンバスに描き、
 * 白く塗りつぶして1枚の画像として重ねる。
 * （ctx.filter を使うと図形を1つ描くたびにフィルター処理が走り、戦闘中にとても重くなるため）
 */
export function drawWhite(ctx: C, x0: number, y0: number, w: number, h: number, alpha: number, draw: (c: C) => void, color = '#ffffff') {
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b);
  const sw = Math.ceil(w * k);
  const sh = Math.ceil(h * k);
  if (sw <= 0 || sh <= 0 || alpha <= 0) return;
  if (whiteCv.width < sw) whiteCv.width = sw;
  if (whiteCv.height < sh) whiteCv.height = sh;
  const g = whiteCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, sw, sh);
  g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  noShadow = true;
  try {
    draw(g);
  } finally {
    noShadow = false;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, sw, sh);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(whiteCv, 0, 0, sw, sh, x0, y0, w, h);
  ctx.restore();
}

/** 2本の骨で膝を前に曲げる脚（腰 → 足先） */
function limb(ctx: C, hx: number, hy: number, fx: number, fy: number, len: number, width: number, color: string) {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = len * 2 - 0.1;
  if (d > max) {
    fx = hx + (dx / d) * max;
    fy = hy + (dy / d) * max;
    dx = fx - hx;
    dy = fy - hy;
    d = max;
  }
  const h = Math.sqrt(Math.max(0, len * len - (d / 2) ** 2));
  let px = -dy / d;
  let py = dx / d;
  if (px < 0) {
    px = -px;
    py = -py;
  }
  const kx = (hx + fx) / 2 + px * h;
  const ky = (hy + fy) / 2 + py * h;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(kx, ky);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  return { kx, ky, fx, fy };
}

/** 肩から伸びる腕。a = 0 で真下、正の値で前へ振る。手の位置を返す */
function arm(ctx: C, sx: number, sy: number, a: number, len: number, width: number, sleeve: string, skin: string) {
  const ex = sx + Math.sin(a) * len * 0.5;
  const ey = sy + Math.cos(a) * len * 0.5;
  const hx = sx + Math.sin(a + 0.25) * len;
  const hy = sy + Math.cos(a + 0.25) * len;
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = skin;
  circlePath(ctx, hx, hy, width * 0.5);
  ctx.fill();
  return { hx, hy };
}

function boot(ctx: C, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - 2.8, y - 4.2, 7, 4.4, [2.4, 2.8, 1, 1]);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x - 2.8, y - 0.9, 7, 1.1);
}

// ================================================================ トレジャーハンター

/** 見た目の向き：横・下（正面）・上（背中） */
export type HunterDir = 'side' | 'down' | 'up';

export interface HunterPose {
  /** 横向きのときの左右 */
  facing: 1 | -1;
  dir?: HunterDir;
  /** 歩行の位相（ラジアン） */
  walk: number;
  moving: boolean;
  /** 攻撃の進み具合 0〜1。攻撃していなければ -1 */
  attack: number;
  time: number;
  /** 装備中の武器・防具の id（見た目が変わる） */
  weapon?: string;
  /** 鍛冶で鍛えた段階（刃のつやと光が増す） */
  weaponPlus?: number;
  armor?: string;
  /** 装備している武器の種類（剣・杖・盾で持ち方が変わる） */
  wtype?: 'sword' | 'staff' | 'shield';
}

/** 防具ごとのベストの色：暗い・明るい・中間 */
const VESTS: Record<string, [string, string, string]> = {
  cloth: ['#55391f', '#7a5532', '#6b4a2b'],
  leather: ['#3a2414', '#7a4c26', '#5e3a1c'],
  chain: ['#4e545c', '#b0b8c2', '#7c848e'],
  mithrilmail: ['#4a6a94', '#d0e8ff', '#88b0dc'],
  wingcloak: ['#241a34', '#5a4480', '#3a2c56'],
  bonemail: ['#6a6450', '#f0ead4', '#b8b098'],
  spiritrobe: ['#5a7aa0', '#e8faff', '#a8d4f0'],
  golemmail: ['#3e3a34', '#a8a090', '#6e685c'],
};

/** 防具の質感（革の縫い目・鎖の輪・ミスリルのつや） */
function armorTexture(ctx: C, armor: string, x: number, y: number, w: number, h: number) {
  if (armor === 'leather') {
    ctx.strokeStyle = 'rgba(230,190,130,0.55)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1.2, 1]);
    ctx.beginPath();
    ctx.moveTo(x + 1.2, y + 2);
    ctx.lineTo(x + 1.2, y + h - 1.5);
    ctx.moveTo(x + w - 1.2, y + 2);
    ctx.lineTo(x + w - 1.2, y + h - 1.5);
    ctx.moveTo(x + 1.2, y + h * 0.5);
    ctx.lineTo(x + w - 1.2, y + h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (armor === 'chain') {
    ctx.strokeStyle = 'rgba(30,34,40,0.55)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let yy = y + 1.6, r = 0; yy < y + h - 0.5; yy += 1.6, r++) {
      for (let xx = x + 1 + (r % 2) * 0.9; xx < x + w - 0.6; xx += 1.8) {
        ctx.moveTo(xx + 0.6, yy);
        ctx.arc(xx, yy, 0.6, 0, TAU);
      }
    }
    ctx.stroke();
  } else if (armor === 'mithrilmail') {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(x + w * 0.3, y + 1.5, 0.9, h - 3);
    ctx.fillStyle = 'rgba(160,220,255,0.35)';
    ctx.fillRect(x + 0.8, y + h * 0.45, w - 1.6, 1);
  } else if (armor === 'wingcloak') {
    // 翼の骨組みのような斜めの筋
    ctx.strokeStyle = 'rgba(170,140,220,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(x + w * 0.5, y + 1.5);
      ctx.lineTo(x + 0.8 + i * (w - 1.6) * 0.5, y + h - 1);
    }
    ctx.stroke();
  } else if (armor === 'bonemail') {
    // あばら骨のような横の骨
    ctx.fillStyle = 'rgba(250,246,230,0.85)';
    for (let yy = y + 2; yy < y + h - 1; yy += 2.2) ctx.fillRect(x + 1, yy, w - 2, 0.8);
    ctx.fillStyle = 'rgba(90,80,60,0.6)';
    ctx.fillRect(x + w / 2 - 0.4, y + 1.5, 0.8, h - 2.5);
  } else if (armor === 'spiritrobe') {
    // 霊気の光の粒
    ctx.fillStyle = 'rgba(200,250,255,0.85)';
    for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.5], [0.4, 0.75], [0.65, 0.2]]) ctx.fillRect(x + w * fx, y + h * fy, 0.8, 0.8);
  } else if (armor === 'golemmail') {
    // 石板のつなぎ目と、胸の核
    ctx.strokeStyle = 'rgba(20,18,14,0.6)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h * 0.55);
    ctx.lineTo(x + w - 0.5, y + h * 0.55);
    ctx.moveTo(x + w * 0.5, y + h * 0.55);
    ctx.lineTo(x + w * 0.5, y + h - 0.5);
    ctx.stroke();
    ctx.fillStyle = '#70e8ff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.32, 1.1, 0, TAU);
    ctx.fill();
  }
}

export function drawHunter(ctx: C, x: number, y: number, p: HunterPose) {
  if (p.dir === 'down' || p.dir === 'up') {
    drawHunterFrontBack(ctx, x, y, p, p.dir === 'up');
    return;
  }
  const mv = p.moving ? 1 : 0;
  const w = p.walk;
  const u = mv ? Math.abs(Math.cos(w)) * -1.2 : Math.sin(p.time * 2.2) * 0.35; // 上半身の上下動
  const skin = '#f0c29a';
  const skinD = '#d9a47c';
  const shirt = '#dcc189';
  const shirtD = '#a98e5a';
  const pants = '#44507a';
  const pantsD = '#323b5c';
  const bootC = '#3b2416';

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(p.facing, 1);

  const hipY = -13 + u;
  const legPos = (ph: number) => ({ fx: Math.sin(ph) * 6.5 * mv, fy: -Math.max(0, Math.cos(ph)) * 3 * mv });

  // 奥の腕
  const backA = mv ? Math.sin(w) * 0.6 : 0.1;
  arm(ctx, -1, -25 + u, backA, 10, 3.4, shirtD, skinD);

  // 奥の脚
  const lb = legPos(w + Math.PI);
  limb(ctx, -1, hipY, lb.fx - 1, lb.fy - 1.2, 7, 4.2, pantsD);
  boot(ctx, lb.fx - 1, lb.fy, '#2a190f');

  // 胴体
  ctx.fillStyle = lin(ctx, -6, 0, 6, 0, [
    [0, '#b39459'],
    [0.55, shirt],
    [1, '#ecd7a6'],
  ]);
  ctx.beginPath();
  ctx.roundRect(-6, -28 + u, 12, 15, [4, 4, 2.5, 2.5]);
  ctx.fill();
  // ベスト（防具で色が変わる）
  const vest = VESTS[p.armor ?? 'cloth'] ?? VESTS.cloth;
  ctx.fillStyle = lin(ctx, -6, 0, 1, 0, [
    [0, vest[0]],
    [1, vest[1]],
  ]);
  ctx.beginPath();
  ctx.roundRect(-6, -28 + u, 7, 14, [4, 1, 1, 2.5]);
  ctx.fill();
  armorTexture(ctx, p.armor ?? 'cloth', -6, -28 + u, 7, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-1, -27 + u, 0.8, 12);

  // 背負い袋と寝袋
  ctx.fillStyle = lin(ctx, -13, 0, -5, 0, [
    [0, '#5e3b1d'],
    [1, '#9a6534'],
  ]);
  ctx.beginPath();
  ctx.roundRect(-13, -29 + u, 8.5, 15, 3);
  ctx.fill();
  ctx.fillStyle = '#6e4521';
  ctx.beginPath();
  ctx.roundRect(-13.4, -29.5 + u, 9.2, 5, [3, 3, 1.5, 1.5]);
  ctx.fill();
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(-9.5, -25.4 + u, 1.6, 1.8);
  ctx.fillStyle = lin(ctx, 0, -35 + u, 0, -30 + u, [
    [0, '#7f9a6a'],
    [1, '#4e6a42'],
  ]);
  ctx.beginPath();
  ctx.roundRect(-14.5, -34.5 + u, 11, 5, 2.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,25,10,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-11.5, -34.5 + u);
  ctx.lineTo(-11.5, -29.5 + u);
  ctx.moveTo(-6.5, -34.5 + u);
  ctx.lineTo(-6.5, -29.5 + u);
  ctx.stroke();

  // 手前の脚
  const lf = legPos(w);
  limb(ctx, 1, hipY, lf.fx + 1, lf.fy - 1.2, 7, 4.4, pants);
  boot(ctx, lf.fx + 1, lf.fy, bootC);

  // ベルトとポーチ
  ctx.fillStyle = '#3b2614';
  ctx.fillRect(-6, -15.5 + u, 12, 2.6);
  ctx.fillStyle = '#e0b24a';
  ctx.fillRect(2.6, -16 + u, 2.6, 3.4);
  ctx.fillStyle = '#6b4424';
  ctx.beginPath();
  ctx.roundRect(-7.5, -15 + u, 4.5, 5, 1.5);
  ctx.fill();

  // スカーフ（後ろへなびく）
  const flap = Math.sin(p.time * 9) * (0.8 + mv * 1.2);
  const tail = 9 + mv * 5;
  ctx.fillStyle = '#c8322c';
  ctx.beginPath();
  ctx.moveTo(-3, -28.5 + u);
  ctx.quadraticCurveTo(-tail * 0.5, -29 + u + flap, -tail, -26.5 + u + flap * 1.6);
  ctx.lineTo(-tail + 1.5, -24.5 + u + flap * 1.4);
  ctx.quadraticCurveTo(-tail * 0.45, -26 + u + flap * 0.6, -2.5, -25.5 + u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, -29 + u, 0, -25 + u, [
    [0, '#e04a3e'],
    [1, '#a8261f'],
  ]);
  ellipsePath(ctx, 0.5, -27.2 + u, 6, 2.4);
  ctx.fill();

  // 首と頭
  ctx.fillStyle = skinD;
  ctx.fillRect(-0.5, -30.5 + u, 3.4, 3.5);
  const hx = 1.6;
  const hy = -34.5 + u;
  ctx.fillStyle = rad(ctx, hx + 2.5, hy - 2.5, 0.5, hx, hy, 7.2, [
    [0, '#fbdcbc'],
    [0.7, skin],
    [1, skinD],
  ]);
  circlePath(ctx, hx, hy, 6.8);
  ctx.fill();
  // 鼻
  ctx.fillStyle = skin;
  ellipsePath(ctx, hx + 6.6, hy + 0.9, 1.5, 1.3);
  ctx.fill();
  // 後ろ髪と耳
  ctx.fillStyle = '#4a2a12';
  ctx.beginPath();
  ctx.arc(hx, hy, 6.9, Math.PI * 0.55, Math.PI * 1.25);
  ctx.lineTo(hx - 1, hy - 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = skinD;
  ellipsePath(ctx, hx - 1.2, hy + 0.6, 1.5, 2.1);
  ctx.fill();
  // 目・眉・口
  const blink = (p.time % 3.7) < 0.12;
  if (blink) {
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx + 3.2, hy - 0.4);
    ctx.lineTo(hx + 5.2, hy - 0.4);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#2a1a10';
    ellipsePath(ctx, hx + 4.3, hy - 0.5, 1, 1.4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circlePath(ctx, hx + 4.6, hy - 1, 0.35);
    ctx.fill();
  }
  ctx.strokeStyle = '#4a2a12';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(hx + 2.8, hy - 2.6);
  ctx.lineTo(hx + 5.4, hy - 2.2);
  ctx.stroke();
  ctx.strokeStyle = '#a0604a';
  ctx.beginPath();
  ctx.moveTo(hx + 4.2, hy + 3.4);
  ctx.quadraticCurveTo(hx + 5.2, hy + 4, hx + 6.1, hy + 3.3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,110,90,0.3)';
  circlePath(ctx, hx + 3, hy + 2, 1.5);
  ctx.fill();

  // 帽子（中折れ帽）
  ctx.fillStyle = lin(ctx, 0, hy - 6, 0, hy - 2, [
    [0, '#8a5529'],
    [1, '#5e3818'],
  ]);
  ellipsePath(ctx, hx + 0.8, hy - 4.2, 11.2, 2.6, -0.04);
  ctx.fill();
  ctx.fillStyle = lin(ctx, hx - 5, 0, hx + 7, 0, [
    [0, '#6b3f1c'],
    [0.5, '#9a6232'],
    [1, '#7a4822'],
  ]);
  ctx.beginPath();
  ctx.moveTo(hx - 5.2, hy - 4.6);
  ctx.lineTo(hx - 4.4, hy - 10);
  ctx.quadraticCurveTo(hx + 0.6, hy - 12.8, hx + 5.8, hy - 10.4);
  ctx.lineTo(hx + 6.6, hy - 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,8,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx - 1.5, hy - 11.6);
  ctx.quadraticCurveTo(hx + 0.6, hy - 10, hx + 3, hy - 11.4);
  ctx.stroke();
  ctx.fillStyle = '#2b180b';
  ctx.beginPath();
  ctx.moveTo(hx - 5.1, hy - 5.2);
  ctx.lineTo(hx - 4.8, hy - 7.3);
  ctx.lineTo(hx + 6.2, hy - 7.3);
  ctx.lineTo(hx + 6.5, hy - 5.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,190,0.18)';
  ellipsePath(ctx, hx + 2.5, hy - 4.9, 7, 0.8);
  ctx.fill();

  // 手前の腕と武器
  if (p.wtype === 'staff' || p.wtype === 'shield') {
    const k = p.attack >= 0 ? 1 - (1 - p.attack) ** 2 : 0;
    if (p.wtype === 'staff') {
      // 杖：ふだんは立てて持ち、攻撃では先を前へ突き出す
      const a = p.attack >= 0 ? 0.3 + Math.sin(k * Math.PI) * 0.9 + k * 0.2 : mv ? 0.25 - Math.sin(w) * 0.25 : 0.25;
      const hand = arm(ctx, 1.5, -25 + u, a, 10.5, 3.7, shirt, skin);
      const tilt = p.attack >= 0 ? 0.12 + Math.sin(k * Math.PI) * 1.1 : 0.12;
      drawStaff(ctx, hand.hx, hand.hy, tilt, p.weapon, p.weaponPlus, p.attack >= 0 ? 1 - p.attack : 0, p.time);
    } else {
      // 盾：腕を前に出して構え、攻撃では前へ突き出す
      const a = 0.7 + (p.attack >= 0 ? Math.sin(k * Math.PI) * 0.8 : mv ? -Math.sin(w) * 0.15 : 0);
      const hand = arm(ctx, 1.5, -25 + u, a, 10.5, 3.7, shirt, skin);
      drawShield(ctx, hand.hx + 1.5, hand.hy - 1, 'side', p.weapon, p.weaponPlus);
    }
    ctx.restore();
    return;
  }
  let a: number;
  if (p.attack >= 0) {
    const k = 1 - (1 - p.attack) ** 2;
    a = -2.3 + k * 3.4;
  } else {
    a = mv ? -Math.sin(w) * 0.6 : 0.18;
  }
  const hand = arm(ctx, 1.5, -25 + u, a, 10.5, 3.7, shirt, skin);
  drawShortSword(ctx, hand.hx, hand.hy, a + 1.35, p.weapon, p.weaponPlus);
  if (p.attack >= 0 && p.attack < 0.7) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - p.attack)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(1.5, -25 + u, 22, -Math.PI / 2 - 0.9, -Math.PI / 2 + (-2.3 + (1 - (1 - p.attack) ** 2) * 3.4) * 0.9 + 1.2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 正面（下向き）と背中（上向き）のトレジャーハンター。
 * 見下ろし視点なので、帽子はつばの楕円の上に山（クラウン）が乗って見える。
 */
function drawHunterFrontBack(ctx: C, x: number, y: number, p: HunterPose, back: boolean) {
  const mv = p.moving ? 1 : 0;
  const w = p.walk;
  const u = mv ? -Math.abs(Math.cos(w)) * 1.2 : Math.sin(p.time * 2.2) * 0.35;
  const sway = mv ? Math.sin(w) * 0.5 : 0;
  const skin = '#f0c29a';
  const skinD = '#d9a47c';
  const shirt = '#dcc189';
  const shirtD = '#b39459';
  const pants = '#44507a';
  const bootC = '#3b2416';
  const flap = Math.sin(p.time * 9) * (0.6 + mv * 0.8);

  ctx.save();
  ctx.translate(x + sway, y);

  // 剣を持つ手：正面なら画面の左、背中なら画面の右（キャラの右手）
  const sd = back ? 1 : -1;
  const shoulderX = sd * 7.2;
  const shoulderY = -26.5 + u;
  let hand: { x: number; y: number };
  let bladeA: number;
  const kk = p.attack >= 0 ? Math.sin((1 - (1 - p.attack) ** 2) * Math.PI) : 0;
  if (p.wtype === 'staff') {
    // 杖：体の横に立てて持ち、攻撃では掲げる
    hand = { x: sd * (8.4 - kk * 1.5), y: -15.5 + u - kk * 8 + (mv && p.attack < 0 ? Math.sin(w) * 1.5 : 0) };
    bladeA = 0;
  } else if (p.wtype === 'shield') {
    // 盾：体の横に構え、攻撃では体の前（背中向きなら奥）へ突き出す
    hand = { x: sd * (7.5 - kk * 6), y: -18 + u - (back ? kk * 8 : -kk * 2) + (mv && p.attack < 0 ? Math.sin(w) * 1 : 0) };
    bladeA = 0;
  } else if (p.attack >= 0) {
    const k = 1 - (1 - p.attack) ** 2;
    if (back) {
      // 奥（画面の上）へ振り上げる
      hand = { x: sd * (8.5 - k * 4), y: -15 + u - k * 26 };
      bladeA = k * Math.PI * 0.95;
    } else {
      // 手前（画面の下）へ振り下ろす
      hand = { x: sd * (9.5 - k * 6.5), y: -39 + u + k * 27 };
      bladeA = Math.PI * 0.9 * (1 - k) - 0.1 * k;
    }
  } else {
    hand = { x: sd * 8.4, y: -15.5 + u + (mv ? Math.sin(w) * 1.5 : 0) };
    bladeA = sd * 0.4;
  }
  const swordArm = () => {
    if (p.wtype === 'staff') {
      drawStaff(ctx, hand.x, hand.y, sd * 0.08, p.weapon, p.weaponPlus, p.attack >= 0 ? 1 - p.attack : 0, p.time);
    } else if (p.wtype !== 'shield') drawShortSword(ctx, hand.x, hand.y, bladeA, p.weapon, p.weaponPlus);
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.fillStyle = skin;
    circlePath(ctx, hand.x, hand.y, 1.9);
    ctx.fill();
    // 盾は手と腕を覆う
    if (p.wtype === 'shield') drawShield(ctx, hand.x, hand.y + 1, back ? 'back' : 'front', p.weapon, p.weaponPlus, 1 + kk * 0.12);
  };
  // 背中向きで振り上げた剣は体の奥にある
  if (back && p.attack >= 0) swordArm();

  // 正面：背負い袋と寝袋が体の後ろからのぞく
  if (!back) {
    ctx.fillStyle = '#5e3b1d';
    ctx.beginPath();
    ctx.roundRect(-9.5, -29 + u, 19, 14, 3);
    ctx.fill();
    ctx.fillStyle = lin(ctx, 0, -35 + u, 0, -30 + u, [
      [0, '#7f9a6a'],
      [1, '#4e6a42'],
    ]);
    ctx.beginPath();
    ctx.roundRect(-11.5, -35.5 + u, 23, 5.5, 2.7);
    ctx.fill();
  }

  // 脚（左右交互に足を上げる）
  for (const [side, ph] of [
    [-1, w],
    [1, w + Math.PI],
  ] as const) {
    const lift = Math.max(0, Math.sin(ph)) * 2.6 * mv;
    const fx = side * 3.4;
    ctx.strokeStyle = side === sd ? pants : '#3c4770';
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * 3.1, -13 + u);
    ctx.lineTo(fx, -3 - lift);
    ctx.stroke();
    ctx.fillStyle = bootC;
    ctx.beginPath();
    ctx.roundRect(fx - 3, -4.6 - lift, 6, 4.8, back ? [1.5, 1.5, 2, 2] : [2.6, 2.6, 1.2, 1.2]);
    ctx.fill();
    ctx.fillStyle = back ? 'rgba(0,0,0,0.35)' : 'rgba(255,220,180,0.15)';
    ctx.fillRect(fx - 2.2, back ? -1.4 - lift : -4 - lift, 4.4, 1);
  }

  // 剣を持たない方の腕
  const freeHandY = -15.5 + u - (mv ? Math.sin(w) * 1.5 : 0);
  ctx.strokeStyle = shirtD;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-shoulderX, shoulderY);
  ctx.lineTo(-sd * 8.4, freeHandY);
  ctx.stroke();
  ctx.fillStyle = skinD;
  circlePath(ctx, -sd * 8.4, freeHandY, 1.9);
  ctx.fill();
  if (back && p.attack < 0) swordArm();

  // 胴体
  ctx.fillStyle = lin(ctx, -7, 0, 7, 0, [
    [0, shirtD],
    [0.5, back ? '#cdb27a' : '#ecd7a6'],
    [1, shirtD],
  ]);
  ctx.beginPath();
  ctx.roundRect(-7, -28 + u, 14, 15, [4, 4, 2.5, 2.5]);
  ctx.fill();
  const vest = VESTS[p.armor ?? 'cloth'] ?? VESTS.cloth;
  if (back) {
    ctx.fillStyle = lin(ctx, -7, 0, 7, 0, [
      [0, vest[0]],
      [0.5, vest[1]],
      [1, vest[0]],
    ]);
    ctx.beginPath();
    ctx.roundRect(-7, -28 + u, 14, 13.5, [4, 4, 2, 2]);
    ctx.fill();
    armorTexture(ctx, p.armor ?? 'cloth', -7, -28 + u, 14, 13.5);
  } else {
    // 前の開いたベストとボタン
    ctx.fillStyle = vest[2];
    ctx.beginPath();
    ctx.roundRect(-7, -28 + u, 4.6, 14, [4, 1, 1, 2.5]);
    ctx.roundRect(2.4, -28 + u, 4.6, 14, [1, 4, 2.5, 1]);
    ctx.fill();
    armorTexture(ctx, p.armor ?? 'cloth', -7, -28 + u, 4.6, 14);
    armorTexture(ctx, p.armor ?? 'cloth', 2.4, -28 + u, 4.6, 14);
    ctx.fillStyle = '#8a6a40';
    for (const by of [-24, -21, -18]) {
      circlePath(ctx, 0, by + u, 0.55);
      ctx.fill();
    }
    // 背負い袋の肩ひも
    ctx.strokeStyle = '#4a2e16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4.6, -28 + u);
    ctx.lineTo(-4.2, -19 + u);
    ctx.moveTo(4.6, -28 + u);
    ctx.lineTo(4.2, -19 + u);
    ctx.stroke();
  }
  // ベルト
  ctx.fillStyle = '#3b2614';
  ctx.fillRect(-7, -15.5 + u, 14, 2.6);
  if (!back) {
    ctx.fillStyle = '#e0b24a';
    ctx.fillRect(-1.4, -16 + u, 2.8, 3.4);
  }
  ctx.fillStyle = '#6b4424';
  ctx.beginPath();
  ctx.roundRect(sd < 0 ? 4 : -8, -15 + u, 4, 5, 1.5); // 剣と反対側の腰のポーチ
  ctx.fill();

  // 背中：背負い袋と寝袋
  if (back) {
    ctx.fillStyle = lin(ctx, -8, 0, 8, 0, [
      [0, '#5e3b1d'],
      [0.5, '#9a6534'],
      [1, '#5e3b1d'],
    ]);
    ctx.beginPath();
    ctx.roundRect(-8, -30 + u, 16, 15.5, 3.5);
    ctx.fill();
    ctx.fillStyle = '#6e4521';
    ctx.beginPath();
    ctx.roundRect(-8.4, -30.5 + u, 16.8, 6.5, [3.5, 3.5, 2.5, 2.5]);
    ctx.fill();
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-1.2, -25.2 + u, 2.4, 2.2);
    ctx.fillStyle = '#7a4e26';
    ctx.beginPath();
    ctx.roundRect(-6.5, -21.5 + u, 5, 5, 1.2);
    ctx.roundRect(1.5, -21.5 + u, 5, 5, 1.2);
    ctx.fill();
    ctx.fillStyle = lin(ctx, 0, -36 + u, 0, -30 + u, [
      [0, '#8aa874'],
      [1, '#4e6a42'],
    ]);
    ctx.beginPath();
    ctx.roundRect(-11, -35.5 + u, 22, 6, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,25,10,0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-5, -35.5 + u);
    ctx.lineTo(-5, -29.5 + u);
    ctx.moveTo(5, -35.5 + u);
    ctx.lineTo(5, -29.5 + u);
    ctx.stroke();
  }

  // スカーフ
  ctx.fillStyle = lin(ctx, 0, -29.5 + u, 0, -25.5 + u, [
    [0, '#e04a3e'],
    [1, '#a8261f'],
  ]);
  ellipsePath(ctx, 0, -27.6 + u, 6.6, 2.4);
  ctx.fill();
  ctx.fillStyle = '#c8322c';
  ctx.beginPath();
  if (back) {
    // 結び目から背中側へなびく
    ctx.moveTo(-1, -28 + u);
    ctx.quadraticCurveTo(-6, -31 + u + flap, -10 - mv * 2, -30 + u + flap * 1.6);
    ctx.lineTo(-9.5 - mv * 2, -28 + u + flap * 1.4);
    ctx.quadraticCurveTo(-5, -28.5 + u, -1, -26.5 + u);
  } else {
    ctx.moveTo(1.5, -27 + u);
    ctx.quadraticCurveTo(3.8 + flap * 0.4, -24 + u, 3 + flap * 0.8, -20.5 + u);
    ctx.lineTo(1.2 + flap * 0.6, -21 + u);
    ctx.quadraticCurveTo(2, -24 + u, 0, -27 + u);
  }
  ctx.closePath();
  ctx.fill();
  if (!back) {
    ctx.fillStyle = '#e04a3e';
    circlePath(ctx, 1.4, -26.8 + u, 1.5);
    ctx.fill();
  }

  // 首・耳・頭
  const hy = -34.5 + u;
  ctx.fillStyle = skinD;
  ctx.fillRect(-1.6, -30.5 + u, 3.2, 3);
  ellipsePath(ctx, -6.7, hy + 0.5, 1.5, 2.1);
  ctx.fill();
  ellipsePath(ctx, 6.7, hy + 0.5, 1.5, 2.1);
  ctx.fill();
  if (back) {
    ctx.fillStyle = rad(ctx, 0, hy - 3, 0.5, 0, hy, 7.2, [
      [0, '#6a4020'],
      [1, '#3a200c'],
    ]);
    circlePath(ctx, 0, hy, 6.9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,4,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const hx of [-3.5, -1, 1.5, 4]) {
      ctx.moveTo(hx, hy - 3);
      ctx.quadraticCurveTo(hx + 0.6, hy + 2, hx - 0.3, hy + 5.6);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = rad(ctx, 0, hy - 2, 0.5, 0, hy, 7.2, [
      [0, '#fbdcbc'],
      [0.7, skin],
      [1, skinD],
    ]);
    circlePath(ctx, 0, hy, 6.9);
    ctx.fill();
    // 前髪
    ctx.save();
    circlePath(ctx, 0, hy, 6.9);
    ctx.clip();
    ctx.fillStyle = '#4a2a12';
    ctx.fillRect(-8, hy - 8, 16, 5.3);
    ctx.beginPath();
    ctx.moveTo(-7, hy - 3);
    ctx.lineTo(-5.5, hy - 0.5);
    ctx.lineTo(-4, hy - 3);
    ctx.moveTo(4, hy - 3);
    ctx.lineTo(5.5, hy - 0.5);
    ctx.lineTo(7, hy - 3);
    ctx.fill();
    ctx.restore();
    // 目・眉・鼻・口
    const blink = (p.time % 3.7) < 0.12;
    for (const ex of [-2.6, 2.6]) {
      if (blink) {
        ctx.strokeStyle = '#2a1a10';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(ex - 1, hy + 0.2);
        ctx.lineTo(ex + 1, hy + 0.2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#2a1a10';
        ellipsePath(ctx, ex, hy + 0.2, 1, 1.4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        circlePath(ctx, ex + 0.3, hy - 0.3, 0.35);
        ctx.fill();
      }
      ctx.strokeStyle = '#4a2a12';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(ex - 1.3, hy - 2);
      ctx.lineTo(ex + 1.3, hy - 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,110,90,0.3)';
      circlePath(ctx, ex * 1.45, hy + 2.3, 1.3);
      ctx.fill();
    }
    ctx.fillStyle = skinD;
    ellipsePath(ctx, 0, hy + 2, 0.8, 0.6);
    ctx.fill();
    ctx.strokeStyle = '#a0604a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-1.2, hy + 3.6);
    ctx.quadraticCurveTo(0, hy + 4.4, 1.2, hy + 3.6);
    ctx.stroke();
    // つばの影
    ctx.fillStyle = 'rgba(60,30,10,0.25)';
    ellipsePath(ctx, 0, hy - 2.8, 6, 1.2);
    ctx.fill();
  }

  // 帽子：つば → 山
  ctx.fillStyle = lin(ctx, 0, hy - 8, 0, hy - 2, [
    [0, '#9a6232'],
    [1, '#5e3818'],
  ]);
  ellipsePath(ctx, 0, hy - 5, 11.8, 3.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,190,0.15)';
  ellipsePath(ctx, 0, hy - 5.8, 10, 2);
  ctx.fill();
  ctx.fillStyle = lin(ctx, -5.6, 0, 5.6, 0, [
    [0, '#6b3f1c'],
    [0.5, '#9a6232'],
    [1, '#6b3f1c'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-5.6, hy - 5.2);
  ctx.lineTo(-5, hy - 11);
  ctx.quadraticCurveTo(0, hy - 13.6, 5, hy - 11);
  ctx.lineTo(5.6, hy - 5.2);
  ctx.quadraticCurveTo(0, hy - 4.2, -5.6, hy - 5.2);
  ctx.fill();
  ctx.fillStyle = '#2b180b';
  ctx.beginPath();
  ctx.moveTo(-5.6, hy - 5.2);
  ctx.lineTo(-5.4, hy - 7.4);
  ctx.quadraticCurveTo(0, hy - 6.6, 5.4, hy - 7.4);
  ctx.lineTo(5.6, hy - 5.2);
  ctx.quadraticCurveTo(0, hy - 4.2, -5.6, hy - 5.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,8,0.5)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, hy - 12.6);
  ctx.lineTo(0, hy - 9.5);
  ctx.stroke();

  // 正面向きの剣は体の手前
  if (!back) swordArm();

  ctx.restore();
}

/** 杖ごとの柄と宝石の色 */
const STAFFS: Record<string, { shaft: [string, string]; gem: string; prong: string; glow?: string }> = {
  oakstaff: { shaft: ['#a8743a', '#5e3a1a'], gem: '#70e080', prong: '#7a4e26' },
  magestaff: { shaft: ['#5a4a6a', '#2a1e36'], gem: '#5ab0ff', prong: '#c8ccd8' },
  sagestaff: { shaft: ['#f4ecd4', '#a89870'], gem: '#c878ff', prong: '#e8c050', glow: '#d8a0ff' },
  soulstaff: { shaft: ['#5a5a7a', '#1e1e34'], gem: '#a8f4ff', prong: '#d8e8ff', glow: '#80e0ff' },
};

/**
 * 杖。(x, y) が握り。tilt は傾き（0 で真上、正で前へ倒れる）。charge は先端の光の強さ 0〜1
 */
function drawStaff(ctx: C, x: number, y: number, tilt: number, weapon = 'oakstaff', plus = 0, charge = 0, time = 0) {
  const st = STAFFS[weapon] ?? STAFFS.oakstaff;
  const dx = Math.sin(tilt);
  const dy = -Math.cos(tilt);
  const bx = x - dx * 9;
  const by = y - dy * 9;
  const tx = x + dx * 17;
  const ty = y + dy * 17;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = lin(ctx, bx - dy * 1, by + dx * 1, bx + dy * 1, by - dx * 1, [
    [0, st.shaft[0]],
    [1, st.shaft[1]],
  ]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  // 宝石を抱える爪
  ctx.strokeStyle = st.prong;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx - dy * side * 3.4 + dx * 1.5, ty + dx * side * 3.4 + dy * 1.5, tx + dx * 4.5 - dy * side * 1, ty + dy * 4.5 + dx * side * 1);
  }
  ctx.stroke();
  // 宝石（鍛えた杖と攻撃中は光る）
  const gx = tx + dx * 3;
  const gy = ty + dy * 3;
  const shine = Math.min(1, charge + (st.glow ? 0.35 : 0) + Math.max(0, plus - 2) * 0.12);
  if (shine > 0) glow(ctx, gx, gy, 7 + shine * 7 + Math.sin(time * 6) * 0.8, st.glow ?? st.gem, 0.35 + shine * 0.5);
  ctx.fillStyle = rad(ctx, gx - 0.8, gy - 0.8, 0.2, gx, gy, 2.6, [
    [0, '#ffffff'],
    [0.4, st.gem],
    [1, 'rgba(0,0,0,0.5)'],
  ]);
  circlePath(ctx, gx, gy, 2.4);
  ctx.fill();
  ctx.restore();
}

/** 盾ごとの色：表面（明・暗）・縁・中央の飾り */
const SHIELDS: Record<string, { face: [string, string]; rim: string; boss: string; glow?: string }> = {
  woodshield: { face: ['#c08a4a', '#6a4220'], rim: '#9aa0aa', boss: '#d0d4dc' },
  steelshield: { face: ['#e8eef6', '#68727e'], rim: '#3e4652', boss: '#ffd860' },
  dragonshield: { face: ['#f07050', '#7a1a10'], rim: '#e0a840', boss: '#ffe090', glow: '#ff7a3a' },
  golemshield: { face: ['#c0b8a8', '#5a5448'], rim: '#3e3830', boss: '#60e0ff', glow: '#60d0ff' },
};

/**
 * 盾。(x, y) が中心。side は横から見た細い姿、front は表、back は裏（持ち手側）
 */
function drawShield(ctx: C, x: number, y: number, view: 'side' | 'front' | 'back', weapon = 'woodshield', plus = 0, scale = 1) {
  const sh = SHIELDS[weapon] ?? SHIELDS.woodshield;
  const rx = (view === 'side' ? 3 : 6.6) * scale;
  const ry = 8.2 * scale;
  ctx.save();
  if (view !== 'back' && (sh.glow || plus >= 3)) {
    ctx.shadowColor = sh.glow ?? '#fff0b0';
    ctx.shadowBlur = 5 + Math.max(0, plus - 2) * 2;
  }
  if (view === 'back') {
    // 裏側：木の板と持ち手のベルト
    ctx.fillStyle = lin(ctx, x - rx, 0, x + rx, 0, [
      [0, '#4a2e16'],
      [0.5, '#7a4e26'],
      [1, '#4a2e16'],
    ]);
    ellipsePath(ctx, x, y, rx, ry);
    ctx.fill();
    ctx.strokeStyle = sh.rim;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = '#2e1c0e';
    ctx.fillRect(x - rx * 0.7, y - 2.6, rx * 1.4, 1.4);
    ctx.fillRect(x - rx * 0.7, y + 1.4, rx * 1.4, 1.4);
    ctx.restore();
    return;
  }
  ctx.fillStyle = view === 'side'
    ? lin(ctx, x - rx, 0, x + rx, 0, [
        [0, sh.face[1]],
        [1, sh.face[0]],
      ])
    : rad(ctx, x - rx * 0.35, y - ry * 0.35, 0.5, x, y, ry * 1.1, [
        [0, sh.face[0]],
        [1, sh.face[1]],
      ]);
  ellipsePath(ctx, x, y, rx, ry);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 模様：木の盾は板目、竜鱗の盾は鱗
  ctx.save();
  ellipsePath(ctx, x, y, rx, ry);
  ctx.clip();
  if (weapon === 'woodshield') {
    ctx.strokeStyle = 'rgba(60,30,10,0.45)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(x + i * rx * 0.38, y - ry);
      ctx.lineTo(x + i * rx * 0.38, y + ry);
    }
    ctx.stroke();
  } else if (weapon === 'dragonshield') {
    ctx.strokeStyle = 'rgba(255,200,140,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let yy = -ry; yy < ry; yy += 2.6) {
      for (let xx = -rx; xx < rx; xx += 2.6) {
        const ox = x + xx + ((Math.round(yy / 2.6) & 1) ? 1.3 : 0);
        ctx.moveTo(ox + 1.3, y + yy);
        ctx.arc(ox, y + yy, 1.3, 0, Math.PI);
      }
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - rx * 0.5, y - ry, rx * 0.25, ry * 2);
  }
  ctx.restore();
  // 縁と中央の飾り
  ctx.strokeStyle = sh.rim;
  ctx.lineWidth = 1.2;
  ellipsePath(ctx, x, y, rx, ry);
  ctx.stroke();
  ctx.fillStyle = sh.boss;
  if (view === 'side') {
    ellipsePath(ctx, x + rx * 0.7, y, 1.3, 2);
  } else {
    circlePath(ctx, x, y, 1.9 * scale);
  }
  ctx.fill();
  if (plus >= 1) {
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + plus * 0.1})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.8, ry * 0.85, 0, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** 武器ごとの刃の長さ・太さ・色 */
const BLADES: Record<string, { len: number; w: number; c: [string, string, string]; guard: string; grip: string; glow?: string }> = {
  dagger: { len: 14, w: 1.3, c: ['#f4f7fb', '#c4ccd6', '#7d8794'], guard: '#d7b24c', grip: '#4a2c14' },
  steel: { len: 16, w: 1.5, c: ['#ffffff', '#d4dce6', '#66707c'], guard: '#a4aebb', grip: '#3a2a20' },
  mithril: { len: 17, w: 1.6, c: ['#f4fdff', '#a8dcf8', '#4a80b0'], guard: '#eef2fa', grip: '#2a3a5a', glow: '#8ad0ff' },
  dragon: { len: 19, w: 2, c: ['#fff4d8', '#f0a050', '#8a2a18'], guard: '#b02a2a', grip: '#2a1a10', glow: '#ff7a3a' },
  vampblade: { len: 17, w: 1.6, c: ['#ffe4e8', '#d03048', '#4a0a18'], guard: '#3a2a3a', grip: '#4a0a14', glow: '#ff3050' },
};

function drawShortSword(ctx: C, x: number, y: number, a: number, weapon = 'dagger', plus = 0) {
  const bl = BLADES[weapon] ?? BLADES.dagger;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = bl.grip;
  ctx.fillRect(-3.5, -0.9, 4, 1.8);
  ctx.fillStyle = bl.guard;
  ctx.fillRect(0.2, -2.6 - (bl.w - 1.3), 1.3, 5.2 + (bl.w - 1.3) * 2);
  // 鍛えた刃は +3 から光をまとう
  if (bl.glow || plus >= 3) {
    ctx.shadowColor = bl.glow ?? '#fff0b0';
    ctx.shadowBlur = 6 + Math.max(0, plus - 2) * 2;
  }
  ctx.fillStyle = lin(ctx, 0, -bl.w, 0, bl.w, [
    [0, bl.c[0]],
    [0.5, bl.c[1]],
    [1, bl.c[2]],
  ]);
  ctx.beginPath();
  ctx.moveTo(1.5, -bl.w);
  ctx.lineTo(bl.len - 2, -bl.w * 0.7);
  ctx.lineTo(bl.len, 0);
  ctx.lineTo(bl.len - 2, bl.w * 0.7);
  ctx.lineTo(1.5, bl.w);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  if (plus >= 1) {
    // 研ぎ澄まされた刃先のつや
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + plus * 0.1})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(2.5, -bl.w * 0.55);
    ctx.lineTo(bl.len - 2.5, -bl.w * 0.35);
    ctx.stroke();
  }
  if (plus >= 5) {
    // 最大まで鍛えた刃のきらめき
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bl.len - 4, -2.2);
    ctx.lineTo(bl.len - 3.5, -0.5);
    ctx.lineTo(bl.len - 2, 0);
    ctx.lineTo(bl.len - 3.5, 0.5);
    ctx.lineTo(bl.len - 4, 2.2);
    ctx.lineTo(bl.len - 4.5, 0.5);
    ctx.lineTo(bl.len - 6, 0);
    ctx.lineTo(bl.len - 4.5, -0.5);
    ctx.fill();
  }
  if (weapon === 'dragon') {
    // 牙のギザギザ
    ctx.fillStyle = '#fff0d0';
    ctx.beginPath();
    for (const tx of [5, 9, 13]) {
      ctx.moveTo(tx, -bl.w * 0.9);
      ctx.lineTo(tx + 1, -bl.w * 1.6);
      ctx.lineTo(tx + 2, -bl.w * 0.85);
    }
    ctx.fill();
  }
  ctx.restore();
}

// ================================================================ 敵

export function drawEnemy(ctx: C, e: Enemy, time: number) {
  const moving = e.stun <= 0 && (e.aggro || e.wx !== 0 || e.wy !== 0);
  ctx.save();
  ctx.translate(e.x, e.y + e.h / 2);
  if (e.def.scale) ctx.scale(e.def.scale, e.def.scale);
  if (e.dir !== 'side') {
    drawEnemyFrontBack(ctx, e, time, moving, e.dir === 'up');
    ctx.restore();
    return;
  }
  switch (e.def.id) {
    case 'slime':
      drawSlime(ctx, e, time);
      break;
    case 'bat':
      drawBat(ctx, e, time);
      break;
    case 'goblin':
      drawGoblin(ctx, e, time, moving);
      break;
    case 'skeleton':
      drawSkeleton(ctx, e, time, moving);
      break;
    case 'ghost':
      drawGhost(ctx, e, time);
      break;
    case 'golem':
      drawGolem(ctx, e, time, moving);
      break;
  }
  ctx.restore();
}

/** 飛ぶ敵の高さ（影と本体の距離） */
export function hoverOf(e: Enemy, time: number): number {
  if (e.def.id === 'bat') return 14 + Math.sin(time * 4 + e.seed) * 3;
  if (e.def.id === 'ghost') return 8 + Math.sin(time * 2.5 + e.seed) * 2.5;
  return 0;
}

function drawSlime(ctx: C, e: Enemy, t: number) {
  const sq = Math.sin(e.anim * 7) * 0.13;
  const w = 13 * (1 + sq);
  const h = 15 * (1 - sq);
  groundShadow(ctx, 0, 0, 14, 4.5);
  ctx.scale(e.facing, 1);
  ctx.fillStyle = rad(ctx, -w * 0.3, -h * 0.75, 1, 0, -h * 0.4, w * 1.35, [
    [0, '#c8f7b0'],
    [0.35, '#64c858'],
    [0.85, '#2f8a33'],
    [1, '#1f5e24'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-w, -0.5);
  ctx.bezierCurveTo(-w * 1.05, -h * 1.25, w * 1.05, -h * 1.25, w, -0.5);
  ctx.quadraticCurveTo(0, 1.8, -w, -0.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(16,60,20,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 中の泡
  ctx.fillStyle = 'rgba(220,255,210,0.28)';
  circlePath(ctx, -w * 0.25, -h * 0.35, 1.6);
  ctx.fill();
  circlePath(ctx, w * 0.05, -h * 0.2 + Math.sin(t * 2 + e.seed) * 0.8, 1);
  ctx.fill();
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ellipsePath(ctx, -w * 0.38, -h * 0.72, 3.2, 1.7, -0.6);
  ctx.fill();
  // 目
  for (const ex of [w * 0.28, w * 0.66]) {
    ctx.fillStyle = '#fff';
    ellipsePath(ctx, ex, -h * 0.55, 2, 2.6);
    ctx.fill();
    ctx.fillStyle = '#132';
    ellipsePath(ctx, ex + 0.7, -h * 0.5, 1.1, 1.6);
    ctx.fill();
  }
  ctx.strokeStyle = '#1d4a1f';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(w * 0.5, -h * 0.3, 1.6, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function batWing(ctx: C, tipY: number, color: string, dx: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(1 + dx, -1);
  ctx.quadraticCurveTo(-6 + dx, tipY - 3, -16 + dx, tipY);
  ctx.quadraticCurveTo(-13 + dx, tipY * 0.35 + 1, -10 + dx, 2);
  ctx.quadraticCurveTo(-8 + dx, 0, -6 + dx, 3);
  ctx.quadraticCurveTo(-3 + dx, 1, -1 + dx, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,8,30,0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(1 + dx, -1);
  ctx.lineTo(-10 + dx, 2);
  ctx.moveTo(1 + dx, -1);
  ctx.lineTo(-6 + dx, 3);
  ctx.stroke();
}

function drawBat(ctx: C, e: Enemy, t: number) {
  const hv = hoverOf(e, t);
  groundShadow(ctx, 0, 0, 10, 3.2, 0.25);
  ctx.translate(0, -hv - 6);
  ctx.scale(e.facing, 1);
  const flap = Math.sin(e.anim * 16);
  batWing(ctx, -2 - flap * 11, '#3c2856', 3);
  // 体
  ctx.fillStyle = rad(ctx, 1, -2, 0.5, 0, 0, 6, [
    [0, '#8a6ab0'],
    [1, '#3e2a5a'],
  ]);
  ellipsePath(ctx, 0, 0, 5.5, 4.6);
  ctx.fill();
  ctx.fillStyle = '#4a3268';
  ctx.beginPath();
  ctx.moveTo(1, -3.5);
  ctx.lineTo(2, -8.5);
  ctx.lineTo(3.6, -3);
  ctx.moveTo(-1.5, -3.6);
  ctx.lineTo(-1.6, -8);
  ctx.lineTo(0.6, -3.6);
  ctx.fill();
  glow(ctx, 3.6, -1, 3, '#ff3030', 0.7);
  ctx.fillStyle = '#ff4a4a';
  circlePath(ctx, 3.6, -1, 0.9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(3.4, 2);
  ctx.lineTo(3.9, 3.6);
  ctx.lineTo(4.4, 2);
  ctx.fill();
  batWing(ctx, -2 - Math.sin(e.anim * 16 + 0.4) * 12, '#6a4c94', 0);
}

function drawGoblin(ctx: C, e: Enemy, t: number, moving: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 11;
  const u = mv ? -Math.abs(Math.cos(w)) * 1 : 0;
  const skin = '#71ad55';
  const skinD = '#4d8038';
  groundShadow(ctx, 0, 0, 11, 4);
  ctx.scale(e.facing, 1);
  const lp = (ph: number) => ({ fx: Math.sin(ph) * 5.5 * mv, fy: -Math.max(0, Math.cos(ph)) * 2.5 * mv });
  // 奥の腕・脚
  arm(ctx, -1, -20 + u, mv ? Math.sin(w) * 0.6 : 0.2, 8, 3, skinD, skinD);
  const b = lp(w + Math.PI);
  limb(ctx, -1, -10 + u, b.fx - 1, b.fy - 0.8, 5.5, 3.6, skinD);
  ctx.fillStyle = '#3a2a18';
  ellipsePath(ctx, b.fx, b.fy - 0.8, 3, 1.4);
  ctx.fill();
  // 胴体（腰布）
  ctx.fillStyle = lin(ctx, -6, 0, 6, 0, [
    [0, skinD],
    [1, '#86c266'],
  ]);
  ellipsePath(ctx, 0, -16 + u, 6.5, 7.5);
  ctx.fill();
  ctx.fillStyle = '#7a5232';
  ctx.beginPath();
  ctx.moveTo(-6.5, -13 + u);
  ctx.lineTo(6.5, -13 + u);
  ctx.lineTo(6, -8 + u);
  ctx.lineTo(3.5, -9.5 + u);
  ctx.lineTo(1.5, -7.5 + u);
  ctx.lineTo(-1.5, -9.5 + u);
  ctx.lineTo(-4, -7.5 + u);
  ctx.lineTo(-6, -9 + u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(-6.5, -14 + u, 13, 1.8);
  // 手前の脚
  const f = lp(w);
  limb(ctx, 1, -10 + u, f.fx + 1, f.fy - 0.8, 5.5, 3.8, skin);
  ctx.fillStyle = '#4a3420';
  ellipsePath(ctx, f.fx + 1.8, f.fy - 0.8, 3.2, 1.5);
  ctx.fill();
  // 頭
  const hy = -27 + u;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-3, hy - 1);
  ctx.lineTo(-13, hy - 6);
  ctx.lineTo(-3, hy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rad(ctx, 3, hy - 3, 0.5, 1.5, hy, 8, [
    [0, '#9ad67a'],
    [1, skinD],
  ]);
  circlePath(ctx, 1.5, hy, 7);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(6.5, hy - 1.5);
  ctx.quadraticCurveTo(12, hy + 1, 7.5, hy + 2.5);
  ctx.fill();
  glow(ctx, 4.8, hy - 1.8, 2.6, '#ffe040', 0.5);
  ctx.fillStyle = '#ffe24a';
  ellipsePath(ctx, 4.8, hy - 1.8, 1.6, 1.2);
  ctx.fill();
  ctx.fillStyle = '#201000';
  ctx.fillRect(4.9, hy - 2.8, 0.7, 2);
  ctx.strokeStyle = '#2a4a1a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(2.5, hy - 3.8);
  ctx.lineTo(6.4, hy - 3);
  ctx.stroke();
  ctx.fillStyle = '#2e1a10';
  ctx.beginPath();
  ctx.moveTo(3, hy + 3.6);
  ctx.lineTo(7.4, hy + 3.4);
  ctx.lineTo(6.6, hy + 5);
  ctx.lineTo(3.6, hy + 4.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4ecd0';
  ctx.fillRect(4, hy + 3.6, 0.9, 1.1);
  ctx.fillRect(6, hy + 3.5, 0.9, 1.1);
  // こん棒
  const swing = e.aggro ? Math.sin(t * 9 + e.seed) * 0.5 : 0;
  const hand = arm(ctx, 1.5, -20 + u, 0.9 + swing, 8, 3.2, skin, skin);
  drawClub(ctx, hand.hx, hand.hy, -1.1 + swing);
}

/** ゴブリンのトゲこん棒。rot の方向（+x）へ伸びる */
function drawClub(ctx: C, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = lin(ctx, 0, -2, 0, 2, [
    [0, '#9a6a3c'],
    [1, '#5a3a1c'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-1, -1.2);
  ctx.lineTo(13, -3.2);
  ctx.quadraticCurveTo(16, 0, 13, 3.2);
  ctx.lineTo(-1, 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d8d0c0';
  for (const sx of [7, 10, 13]) {
    ctx.beginPath();
    ctx.moveTo(sx, -2.6);
    ctx.lineTo(sx + 0.8, -4.6);
    ctx.lineTo(sx + 1.6, -2.8);
    ctx.fill();
  }
  ctx.restore();
}

function bone(ctx: C, x0: number, y0: number, x1: number, y1: number, w: number) {
  ctx.strokeStyle = '#e8e2cc';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.fillStyle = '#f2eedc';
  circlePath(ctx, x1, y1, w * 0.7);
  ctx.fill();
}

function drawSkeleton(ctx: C, e: Enemy, t: number, moving: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 9;
  const u = mv ? -Math.abs(Math.cos(w)) * 1 : 0;
  groundShadow(ctx, 0, 0, 10, 3.6);
  ctx.scale(e.facing, 1);
  const lp = (ph: number) => ({ fx: Math.sin(ph) * 6 * mv, fy: -Math.max(0, Math.cos(ph)) * 2.5 * mv });
  // 奥の脚
  const b = lp(w + Math.PI);
  ctx.globalAlpha = 0.85;
  limb(ctx, -1, -13 + u, b.fx - 1, b.fy - 1, 6.6, 2, '#c8c2ac');
  ctx.globalAlpha = 1;
  // 骨盤・背骨・肋骨
  ctx.fillStyle = '#ddd6be';
  ctx.beginPath();
  ctx.ellipse(0, -13.5 + u, 4.5, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ddd6be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-0.5, -14 + u);
  ctx.quadraticCurveTo(-2, -20 + u, 0, -26 + u);
  ctx.stroke();
  ctx.strokeStyle = '#e8e2cc';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const ry = -24.5 + i * 2.4 + u;
    const rw = 5.6 - i * 0.6;
    ctx.beginPath();
    ctx.moveTo(-1.5, ry);
    ctx.quadraticCurveTo(rw + 1, ry - 1.5, rw - 0.5, ry + 1.6);
    ctx.stroke();
  }
  // 手前の脚
  const f = lp(w);
  limb(ctx, 1, -13 + u, f.fx + 1, f.fy - 1, 6.6, 2.2, '#e8e2cc');
  ctx.fillStyle = '#e8e2cc';
  ellipsePath(ctx, f.fx + 2, f.fy - 0.8, 2.8, 1.2);
  ctx.fill();
  // 頭蓋骨
  const hy = -31 + u;
  ctx.fillStyle = rad(ctx, 2, hy - 3, 0.5, 1, hy, 7, [
    [0, '#fbf8ea'],
    [1, '#c4bca0'],
  ]);
  ctx.beginPath();
  ctx.arc(1, hy, 6, Math.PI * 0.85, Math.PI * 2.25);
  ctx.lineTo(6, hy + 5);
  ctx.lineTo(1, hy + 5.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c1410';
  ellipsePath(ctx, 3.8, hy - 0.4, 1.8, 2.1);
  ctx.fill();
  glow(ctx, 4, hy - 0.3, 3, '#ff4030', 0.55);
  ctx.fillStyle = '#ff6040';
  circlePath(ctx, 4, hy - 0.3, 0.6);
  ctx.fill();
  ctx.fillStyle = '#1c1410';
  ctx.beginPath();
  ctx.moveTo(6.4, hy + 1.4);
  ctx.lineTo(5.6, hy + 3);
  ctx.lineTo(7, hy + 3);
  ctx.fill();
  ctx.strokeStyle = '#6a6250';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(2.4 + i * 1.2, hy + 4.2);
    ctx.lineTo(2.4 + i * 1.2, hy + 5.6);
  }
  ctx.stroke();
  // 錆びた剣を持つ腕
  const swing = e.aggro ? Math.sin(t * 7 + e.seed) * 0.4 : 0;
  bone(ctx, 1, -24 + u, 4, -18 + u, 1.8);
  bone(ctx, 4, -18 + u, 8, -16 + u + swing * 3, 1.6);
  drawRustySword(ctx, 8, -16 + u + swing * 3, -1.3 + swing);
}

/** 骸骨の錆びた剣。rot の方向（+x）へ伸びる */
function drawRustySword(ctx: C, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#5a3a1c';
  ctx.fillRect(-3, -0.8, 3.5, 1.6);
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(0.4, -2.4, 1.2, 4.8);
  ctx.fillStyle = lin(ctx, 0, -1.4, 0, 1.4, [
    [0, '#b8b0a0'],
    [1, '#6a5a48'],
  ]);
  ctx.beginPath();
  ctx.moveTo(1.6, -1.3);
  ctx.lineTo(15, -1.1);
  ctx.lineTo(17, 0);
  ctx.lineTo(13, 1.3);
  ctx.lineTo(11, 0.6);
  ctx.lineTo(8, 1.3);
  ctx.lineTo(1.6, 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(140,70,30,0.45)';
  circlePath(ctx, 7, 0, 1.2);
  ctx.fill();
  ctx.restore();
}

function drawGhost(ctx: C, e: Enemy, t: number) {
  const hv = hoverOf(e, t);
  groundShadow(ctx, 0, 0, 10, 3.2, 0.18);
  ctx.translate(0, -hv);
  ctx.scale(e.facing, 1);
  glow(ctx, 0, -16, 22, '#8aa0ff', 0.35);
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = rad(ctx, 2, -22, 1, 0, -16, 18, [
    [0, 'rgba(250,252,255,0.98)'],
    [0.6, 'rgba(205,215,255,0.85)'],
    [1, 'rgba(130,150,240,0.25)'],
  ]);
  ctx.beginPath();
  ctx.moveTo(8.5, -16);
  ctx.bezierCurveTo(9, -30, -8, -31, -8, -17);
  // しっぽ（後ろへたなびく波）
  const wv = (k: number) => Math.sin(t * 6 + k + e.seed) * 2;
  ctx.bezierCurveTo(-8, -10, -10, -6 + wv(0), -16, -4 + wv(1));
  ctx.quadraticCurveTo(-10, -4 + wv(2), -7, -2 + wv(2));
  ctx.quadraticCurveTo(-4, -5 + wv(3), -1, -1 + wv(3));
  ctx.quadraticCurveTo(3, -5 + wv(4), 5.5, -2 + wv(4));
  ctx.quadraticCurveTo(8, -6, 8.5, -16);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a2a50';
  ellipsePath(ctx, 2.5, -20, 1.5, 2.4);
  ctx.fill();
  ellipsePath(ctx, 6.2, -20, 1.3, 2.2);
  ctx.fill();
  ellipsePath(ctx, 4.8, -14.5, 1.4, 1.9);
  ctx.fill();
  // 腕
  ctx.strokeStyle = 'rgba(220,228,255,0.8)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(6, -13);
  ctx.quadraticCurveTo(10, -11 + Math.sin(t * 4) * 1.5, 13, -14 + Math.sin(t * 4) * 2);
  ctx.stroke();
}

function drawGolem(ctx: C, e: Enemy, t: number, moving: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 5;
  const u = mv ? -Math.abs(Math.cos(w)) * 1.6 : 0;
  const stone = (x0: number, y0: number, x1: number, y1: number) =>
    lin(ctx, x0, y0, x1, y1, [
      [0, '#b4b2b8'],
      [0.5, '#8a8890'],
      [1, '#55535c'],
    ]);
  groundShadow(ctx, 0, 0, 24, 7, 0.38);
  ctx.scale(e.facing, 1);
  // 奥の腕
  const backSwing = mv ? Math.sin(w) * 0.35 : 0;
  ctx.save();
  ctx.translate(-6, -42 + u);
  ctx.rotate(backSwing);
  ctx.fillStyle = '#5a5862';
  ctx.beginPath();
  ctx.roundRect(-5, 0, 10, 26, 4);
  ctx.fill();
  ctx.restore();
  // 脚
  for (const [lx, ph, col] of [
    [-6, w + Math.PI, '#605e68'],
    [6, w, '#77757e'],
  ] as const) {
    const lift = Math.max(0, Math.cos(ph)) * 3 * mv;
    const off = Math.sin(ph) * 5 * mv;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(lx - 5.5 + off, -20 + u - lift, 11, 20 - u, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(lx - 5.5 + off, -3 - lift, 11, 3);
  }
  // 胴体
  ctx.fillStyle = stone(-18, -52, 18, -14);
  ctx.beginPath();
  ctx.moveTo(-17, -20 + u);
  ctx.lineTo(-19, -40 + u);
  ctx.lineTo(-12, -51 + u);
  ctx.lineTo(10, -52 + u);
  ctx.lineTo(18, -42 + u);
  ctx.lineTo(16, -20 + u);
  ctx.quadraticCurveTo(0, -15 + u, -17, -20 + u);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,28,36,0.6)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-10, -48 + u);
  ctx.lineTo(-6, -40 + u);
  ctx.lineTo(-9, -32 + u);
  ctx.moveTo(8, -46 + u);
  ctx.lineTo(4, -38 + u);
  ctx.moveTo(-14, -26 + u);
  ctx.lineTo(-5, -24 + u);
  ctx.stroke();
  // 苔
  ctx.fillStyle = 'rgba(90,140,60,0.75)';
  ellipsePath(ctx, -10, -50 + u, 6, 2.2, 0.1);
  ctx.fill();
  ellipsePath(ctx, 12, -22 + u, 3.5, 1.6);
  ctx.fill();
  // 胸の紋様
  const pulse = 0.55 + Math.sin(t * 3 + e.seed) * 0.25;
  glow(ctx, 2, -34 + u, 12, '#ff8a30', pulse * 0.6);
  ctx.strokeStyle = `rgba(255,160,60,${pulse})`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3, -40 + u);
  ctx.lineTo(2, -34 + u);
  ctx.lineTo(-2, -28 + u);
  ctx.moveTo(2, -34 + u);
  ctx.lineTo(8, -35 + u);
  ctx.stroke();
  // 頭
  ctx.fillStyle = stone(4, -62, 18, -50);
  ctx.beginPath();
  ctx.roundRect(2, -61 + u, 15, 12, [4, 5, 2, 2]);
  ctx.fill();
  glow(ctx, 13, -55.5 + u, 6, '#ffa030', 0.8);
  ctx.fillStyle = '#ffd070';
  ctx.fillRect(10.5, -56.5 + u, 5, 1.8);
  // 手前の腕
  const swing = mv ? -Math.sin(w) * 0.35 : 0.1;
  ctx.save();
  ctx.translate(8, -44 + u);
  ctx.rotate(swing - 0.15);
  ctx.fillStyle = stone(-6, 0, 6, 30);
  ctx.beginPath();
  ctx.roundRect(-5.5, 0, 11, 22, 4);
  ctx.fill();
  ctx.fillStyle = stone(-8, 20, 8, 34);
  ctx.beginPath();
  ctx.roundRect(-7.5, 19, 15, 13, 5);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- 敵の正面・背中

/**
 * 正面（下向き）と背中（上向き）の敵。左右対称に描き、背中では顔を描かない。
 * 武器を持つ手は、正面なら画面の左、背中なら画面の右（その敵の右手）。
 */
function drawEnemyFrontBack(ctx: C, e: Enemy, t: number, moving: boolean, back: boolean) {
  switch (e.def.id) {
    case 'slime':
      return slimeFB(ctx, e, t, back);
    case 'bat':
      return batFB(ctx, e, t, back);
    case 'goblin':
      return goblinFB(ctx, e, t, moving, back);
    case 'skeleton':
      return skeletonFB(ctx, e, t, moving, back);
    case 'ghost':
      return ghostFB(ctx, e, t, back);
    case 'golem':
      return golemFB(ctx, e, t, moving, back);
  }
}

function slimeFB(ctx: C, e: Enemy, t: number, back: boolean) {
  const sq = Math.sin(e.anim * 7) * 0.13;
  const w = 13 * (1 + sq);
  const h = 15 * (1 - sq);
  groundShadow(ctx, 0, 0, 14, 4.5);
  ctx.fillStyle = rad(
    ctx,
    back ? w * 0.25 : -w * 0.25,
    -h * 0.8,
    1,
    0,
    -h * 0.4,
    w * 1.35,
    back
      ? [
          [0, '#a8e894'],
          [0.35, '#52b048'],
          [0.85, '#277a2b'],
          [1, '#1a521f'],
        ]
      : [
          [0, '#c8f7b0'],
          [0.35, '#64c858'],
          [0.85, '#2f8a33'],
          [1, '#1f5e24'],
        ],
  );
  ctx.beginPath();
  ctx.moveTo(-w, -0.5);
  ctx.bezierCurveTo(-w * 1.05, -h * 1.25, w * 1.05, -h * 1.25, w, -0.5);
  ctx.quadraticCurveTo(0, 1.8, -w, -0.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(16,60,20,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 中の泡
  ctx.fillStyle = 'rgba(220,255,210,0.28)';
  circlePath(ctx, w * 0.3, -h * 0.3, 1.5);
  ctx.fill();
  circlePath(ctx, -w * 0.2, -h * 0.22 + Math.sin(t * 2 + e.seed) * 0.8, 1);
  ctx.fill();
  if (back) {
    // 透けて見える核と、てっぺんのつや
    ctx.fillStyle = 'rgba(15,70,20,0.3)';
    ellipsePath(ctx, 0, -h * 0.45, w * 0.35, h * 0.25);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ellipsePath(ctx, w * 0.1, -h * 0.82, 4.2, 1.5);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ellipsePath(ctx, -w * 0.5, -h * 0.68, 3, 1.6, -0.7);
    ctx.fill();
    for (const ex of [-w * 0.3, w * 0.3]) {
      ctx.fillStyle = '#fff';
      ellipsePath(ctx, ex, -h * 0.5, 2.2, 2.8);
      ctx.fill();
      ctx.fillStyle = '#132';
      ellipsePath(ctx, ex, -h * 0.45, 1.2, 1.7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      circlePath(ctx, ex + 0.4, -h * 0.5, 0.45);
      ctx.fill();
    }
    ctx.strokeStyle = '#1d4a1f';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -h * 0.26, 1.8, 0.25, Math.PI - 0.25);
    ctx.stroke();
  }
}

function batFB(ctx: C, e: Enemy, t: number, back: boolean) {
  const hv = hoverOf(e, t);
  groundShadow(ctx, 0, 0, 12, 3.2, 0.25);
  ctx.translate(0, -hv - 6);
  // 翼（左右そろって羽ばたく）
  const flap = Math.sin(e.anim * 16);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.scale(s, 1);
    batWing(ctx, -2 - flap * 11, back ? '#5a4282' : '#4a3268', -2.5);
    ctx.restore();
  }
  // 体
  ctx.fillStyle = rad(
    ctx,
    0,
    -2,
    0.5,
    0,
    0,
    6.5,
    back
      ? [
          [0, '#6a5090'],
          [1, '#33224a'],
        ]
      : [
          [0, '#8a6ab0'],
          [1, '#3e2a5a'],
        ],
  );
  ellipsePath(ctx, 0, 0, 5.2, 5);
  ctx.fill();
  // 耳
  ctx.fillStyle = '#4a3268';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 1, -3.8);
    ctx.lineTo(s * 3.6, -9.5);
    ctx.lineTo(s * 4.4, -2.8);
  }
  ctx.fill();
  if (back) {
    // 背中の毛並み
    ctx.strokeStyle = 'rgba(20,10,30,0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const fx of [-2, 0, 2]) {
      ctx.moveTo(fx, -3);
      ctx.quadraticCurveTo(fx + 0.6, 0, fx, 3);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#c07a9a';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 2.2, -4);
      ctx.lineTo(s * 3.5, -7.8);
      ctx.lineTo(s * 3.8, -3.6);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(200,170,230,0.35)';
    ellipsePath(ctx, 0, 1.8, 3, 2.6);
    ctx.fill();
    for (const s of [-1, 1]) {
      glow(ctx, s * 2, -1, 3, '#ff3030', 0.6);
      ctx.fillStyle = '#ff4a4a';
      circlePath(ctx, s * 2, -1, 0.95);
      ctx.fill();
    }
    ctx.fillStyle = '#2a1838';
    ellipsePath(ctx, 0, 0.8, 0.9, 0.6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 0.4, 2);
      ctx.lineTo(s * 1, 3.7);
      ctx.lineTo(s * 1.6, 2);
    }
    ctx.fill();
  }
  // 足
  ctx.strokeStyle = '#2a1838';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 1.2, 4.6);
    ctx.lineTo(s * 1.6, 6.4);
  }
  ctx.stroke();
}

function goblinFB(ctx: C, e: Enemy, t: number, moving: boolean, back: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 11;
  const u = mv ? -Math.abs(Math.cos(w)) : 0;
  const skin = '#71ad55';
  const skinD = '#4d8038';
  const sd = back ? 1 : -1;
  groundShadow(ctx, 0, 0, 11, 4);
  ctx.translate(mv ? Math.sin(w) * 0.5 : 0, 0);
  // 脚
  for (const [side, ph] of [
    [-1, w],
    [1, w + Math.PI],
  ] as const) {
    const lift = Math.max(0, Math.sin(ph)) * 2.2 * mv;
    ctx.strokeStyle = side === sd ? skin : skinD;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * 2.6, -10 + u);
    ctx.lineTo(side * 3.2, -2.2 - lift);
    ctx.stroke();
    ctx.fillStyle = '#3a2a18';
    ellipsePath(ctx, side * 3.4, -1.2 - lift, 2.8, 1.5);
    ctx.fill();
  }
  // こん棒を持たない腕
  const freeY = -11.5 + u - (mv ? Math.sin(w) * 1.2 : 0);
  ctx.strokeStyle = skinD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-sd * 5.5, -19 + u);
  ctx.lineTo(-sd * 8.2, freeY);
  ctx.stroke();
  ctx.fillStyle = skinD;
  circlePath(ctx, -sd * 8.2, freeY, 1.7);
  ctx.fill();
  // 胴体
  ctx.fillStyle = lin(ctx, -7, 0, 7, 0, [
    [0, skinD],
    [0.5, back ? '#79b45c' : '#8ac86a'],
    [1, skinD],
  ]);
  ellipsePath(ctx, 0, -16 + u, 6.8, 7.5);
  ctx.fill();
  if (back) {
    // 背骨のでこぼこ
    ctx.fillStyle = 'rgba(40,80,30,0.45)';
    for (const by of [-21, -18.5, -16]) {
      circlePath(ctx, 0, by + u, 0.8);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(190,235,150,0.3)';
    ellipsePath(ctx, 0, -17.5 + u, 3.6, 4);
    ctx.fill();
  }
  // 腰布とベルト
  ctx.fillStyle = '#7a5232';
  ctx.beginPath();
  ctx.moveTo(-6.6, -13 + u);
  ctx.lineTo(6.6, -13 + u);
  ctx.lineTo(5.8, -8.5 + u);
  ctx.lineTo(3.2, -7 + u);
  ctx.lineTo(1, -9 + u);
  ctx.lineTo(-1.4, -7 + u);
  ctx.lineTo(-3.6, -9 + u);
  ctx.lineTo(-5.8, -7.6 + u);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(-6.8, -14 + u, 13.6, 1.8);
  if (!back) {
    ctx.fillStyle = '#a08040';
    ctx.fillRect(-1, -14.2 + u, 2, 2.2);
  }
  // 頭と耳
  const hy = -27 + u;
  ctx.fillStyle = skin;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(s * 4, hy - 2);
    ctx.lineTo(s * 13.5, hy - 6);
    ctx.lineTo(s * 4.8, hy + 2.5);
  }
  ctx.fill();
  if (!back) {
    ctx.fillStyle = 'rgba(184,106,90,0.7)';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 5.5, hy - 1.2);
      ctx.lineTo(s * 11.5, hy - 5);
      ctx.lineTo(s * 5.8, hy + 1);
    }
    ctx.fill();
  }
  ctx.fillStyle = rad(
    ctx,
    0,
    hy - 3,
    0.5,
    0,
    hy,
    8,
    back
      ? [
          [0, '#80bd62'],
          [1, '#3f6e2e'],
        ]
      : [
          [0, '#9ad67a'],
          [1, skinD],
        ],
  );
  circlePath(ctx, 0, hy, 7);
  ctx.fill();
  if (back) {
    // 後頭部の毛と首のしわ
    ctx.strokeStyle = '#2a2014';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const hx of [-1.5, 0, 1.5]) {
      ctx.moveTo(hx, hy - 6.5);
      ctx.quadraticCurveTo(hx + 0.8, hy - 9, hx + 1.8, hy - 9.6);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,60,20,0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-3, hy + 4.5);
    ctx.quadraticCurveTo(0, hy + 5.5, 3, hy + 4.5);
    ctx.stroke();
  } else {
    // 目・怒り眉・鼻・牙
    for (const s of [-1, 1]) {
      glow(ctx, s * 2.8, hy - 1.2, 2.6, '#ffe040', 0.5);
      ctx.fillStyle = '#ffe24a';
      ellipsePath(ctx, s * 2.8, hy - 1.2, 1.6, 1.2);
      ctx.fill();
      ctx.fillStyle = '#201000';
      ctx.fillRect(s * 2.8 - 0.35, hy - 2.2, 0.7, 2);
    }
    ctx.strokeStyle = '#2a4a1a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 1, hy - 2.8);
      ctx.lineTo(s * 4.6, hy - 4);
    }
    ctx.stroke();
    ctx.fillStyle = '#8ac86a';
    ellipsePath(ctx, 0, hy + 1.2, 1.7, 1.4);
    ctx.fill();
    ctx.fillStyle = '#2a4a1a';
    for (const s of [-1, 1]) {
      circlePath(ctx, s * 0.6, hy + 1.8, 0.35);
      ctx.fill();
    }
    ctx.fillStyle = '#2e1a10';
    ctx.beginPath();
    ctx.moveTo(-3, hy + 3.4);
    ctx.lineTo(3, hy + 3.4);
    ctx.lineTo(2.2, hy + 5);
    ctx.lineTo(-2.2, hy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4ecd0';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 1.3, hy + 5);
      ctx.lineTo(s * 1.9, hy + 2.8);
      ctx.lineTo(s * 2.5, hy + 5);
    }
    ctx.fill();
  }
  // こん棒を持つ腕（追いかけてくるときは振り上げる）
  const swing = e.aggro ? Math.sin(t * 9 + e.seed) : 0;
  const hx = sd * 8.6;
  const hyH = -12.5 + u - Math.max(0, swing) * 8;
  ctx.strokeStyle = skin;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(sd * 5.5, -19 + u);
  ctx.lineTo(hx, hyH);
  ctx.stroke();
  drawClub(ctx, hx, hyH, -Math.PI / 2 + sd * (0.55 - swing * 0.35));
  ctx.fillStyle = skin;
  circlePath(ctx, hx, hyH, 1.8);
  ctx.fill();
}

function skeletonFB(ctx: C, e: Enemy, t: number, moving: boolean, back: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 9;
  const u = mv ? -Math.abs(Math.cos(w)) : 0;
  const sd = back ? 1 : -1;
  groundShadow(ctx, 0, 0, 10, 3.6);
  ctx.translate(mv ? Math.sin(w) * 0.5 : 0, 0);
  // 脚
  for (const [side, ph] of [
    [-1, w],
    [1, w + Math.PI],
  ] as const) {
    const lift = Math.max(0, Math.sin(ph)) * 2.4 * mv;
    bone(ctx, side * 2.4, -13 + u, side * 2.8, -7 - lift * 0.5, 2);
    bone(ctx, side * 2.8, -7 - lift * 0.5, side * 3, -1.6 - lift, 1.9);
    ctx.fillStyle = '#e8e2cc';
    ellipsePath(ctx, side * 3.2, -1 - lift, 2.4, 1.2);
    ctx.fill();
  }
  // 骨盤
  ctx.fillStyle = '#ddd6be';
  ellipsePath(ctx, 0, -13.5 + u, 5, 2.5);
  ctx.fill();
  if (!back) {
    ctx.fillStyle = 'rgba(40,30,20,0.55)';
    for (const s of [-1, 1]) {
      ellipsePath(ctx, s * 2.1, -13.3 + u, 1.2, 1);
      ctx.fill();
    }
  }
  // 背骨と肋骨
  ctx.strokeStyle = '#ddd6be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -14 + u);
  ctx.lineTo(0, -27 + u);
  ctx.stroke();
  ctx.strokeStyle = '#e8e2cc';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ry = -25 + i * 2.4 + u;
    const rw = 6 - i * 0.6;
    for (const s of [-1, 1]) {
      ctx.moveTo(0, ry);
      ctx.quadraticCurveTo(s * (rw + 1), ry - 1.4, s * (rw - 0.4), ry + (back ? 1.2 : 1.8));
    }
  }
  ctx.stroke();
  if (back) {
    // 背骨の節と肩甲骨
    ctx.fillStyle = '#f2eedc';
    for (let i = 0; i < 6; i++) {
      circlePath(ctx, 0, -15.5 - i * 2.1 + u, 1.1);
      ctx.fill();
    }
    ctx.fillStyle = '#d8d0b6';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 1.8, -26 + u);
      ctx.lineTo(s * 5.6, -25.5 + u);
      ctx.lineTo(s * 3, -20.5 + u);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // 胸骨
    ctx.fillStyle = '#f2eedc';
    ctx.beginPath();
    ctx.roundRect(-0.9, -26 + u, 1.8, 7, 0.9);
    ctx.fill();
  }
  // 鎖骨
  ctx.strokeStyle = '#e8e2cc';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, -26.8 + u);
  ctx.quadraticCurveTo(0, -25.5 + u, 6, -26.8 + u);
  ctx.stroke();
  // 剣を持たない腕
  const sw = mv ? Math.sin(w) * 1.2 : 0;
  bone(ctx, -sd * 6, -26.5 + u, -sd * 7.6, -20.5 + u, 1.8);
  bone(ctx, -sd * 7.6, -20.5 + u, -sd * 7.8, -14.5 + u - sw, 1.6);
  // 頭蓋骨
  const hy = -32.5 + u;
  ctx.fillStyle = rad(
    ctx,
    0,
    hy - 3,
    0.5,
    0,
    hy,
    7,
    back
      ? [
          [0, '#ece6d2'],
          [1, '#aaa286'],
        ]
      : [
          [0, '#fbf8ea'],
          [1, '#c4bca0'],
        ],
  );
  circlePath(ctx, 0, hy, 6);
  ctx.fill();
  if (back) {
    // 後頭部のひび
    ctx.strokeStyle = 'rgba(90,80,60,0.7)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(1, hy - 5.5);
    ctx.lineTo(2, hy - 3);
    ctx.lineTo(0.8, hy - 1.2);
    ctx.lineTo(2.2, hy + 1);
    ctx.stroke();
  } else {
    // あご・目・鼻・歯
    ctx.beginPath();
    ctx.roundRect(-3.6, hy + 2.6, 7.2, 3.4, [1, 1, 2, 2]);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#1c1410';
      ellipsePath(ctx, s * 2.4, hy - 0.2, 1.8, 2.1);
      ctx.fill();
      glow(ctx, s * 2.4, hy - 0.1, 3, '#ff4030', 0.55);
      ctx.fillStyle = '#ff6040';
      circlePath(ctx, s * 2.4, hy - 0.1, 0.6);
      ctx.fill();
    }
    ctx.fillStyle = '#1c1410';
    ctx.beginPath();
    ctx.moveTo(0, hy + 1.6);
    ctx.lineTo(-0.9, hy + 3.2);
    ctx.lineTo(0.9, hy + 3.2);
    ctx.fill();
    ctx.strokeStyle = '#6a6250';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, hy + 4.3);
    ctx.lineTo(3, hy + 4.3);
    for (let i = 0; i < 5; i++) {
      ctx.moveTo(-2.4 + i * 1.2, hy + 3.6);
      ctx.lineTo(-2.4 + i * 1.2, hy + 5.4);
    }
    ctx.stroke();
  }
  // 錆びた剣を持つ腕
  const swing = e.aggro ? Math.sin(t * 7 + e.seed) : 0;
  const hx = sd * 8.4;
  const hyH = -15 + u - Math.max(0, swing) * 7;
  bone(ctx, sd * 6, -26.5 + u, sd * 7.8, -20.5 + u, 1.8);
  bone(ctx, sd * 7.8, -20.5 + u, hx, hyH, 1.6);
  drawRustySword(ctx, hx, hyH, -Math.PI / 2 + sd * (0.5 - swing * 0.4));
}

function ghostFB(ctx: C, e: Enemy, t: number, back: boolean) {
  const hv = hoverOf(e, t);
  groundShadow(ctx, 0, 0, 10, 3.2, 0.18);
  ctx.translate(0, -hv);
  glow(ctx, 0, -16, 22, '#8aa0ff', 0.35);
  // 体の両わきから伸びる腕
  ctx.strokeStyle = 'rgba(220,228,255,0.8)';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    const a = Math.sin(t * 4 + s) * 1.5;
    ctx.moveTo(s * 7.5, -15);
    ctx.quadraticCurveTo(s * 11, -12 + a, s * 12.5, -16 + a);
  }
  ctx.stroke();
  // 体（すそは波打つ）
  const wv = (k: number) => Math.sin(t * 6 + k + e.seed) * 1.6;
  ctx.globalAlpha = back ? 0.8 : 0.88;
  ctx.fillStyle = rad(ctx, 0, -22, 1, 0, -16, 18, [
    [0, 'rgba(250,252,255,0.98)'],
    [0.6, 'rgba(205,215,255,0.85)'],
    [1, 'rgba(130,150,240,0.25)'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-8.5, -16);
  ctx.bezierCurveTo(-8.5, -31, 8.5, -31, 8.5, -16);
  ctx.bezierCurveTo(8.5, -9, 9.5, -5, 9.5, -2 + wv(0));
  ctx.quadraticCurveTo(7.5, -5 + wv(1), 4.8, -1 + wv(1));
  ctx.quadraticCurveTo(2.4, -4.5 + wv(2), 0, -0.5 + wv(2));
  ctx.quadraticCurveTo(-2.4, -4.5 + wv(3), -4.8, -1 + wv(3));
  ctx.quadraticCurveTo(-7.5, -5 + wv(4), -9.5, -2 + wv(4));
  ctx.bezierCurveTo(-9.5, -5, -8.5, -9, -8.5, -16);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  if (back) {
    // 背中にぼんやり浮かぶ渦
    ctx.strokeStyle = 'rgba(150,165,240,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -19, 3.5, 0.5, 4.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#2a2a50';
    for (const s of [-1, 1]) {
      ellipsePath(ctx, s * 3, -20, 1.5, 2.4);
      ctx.fill();
    }
    ellipsePath(ctx, 0, -14.2, 1.5, 2);
    ctx.fill();
  }
}

function golemFB(ctx: C, e: Enemy, t: number, moving: boolean, back: boolean) {
  const mv = moving ? 1 : 0;
  const w = e.anim * 5;
  const u = mv ? -Math.abs(Math.cos(w)) * 1.6 : 0;
  const stone = (x0: number, y0: number, x1: number, y1: number) =>
    lin(ctx, x0, y0, x1, y1, [
      [0, '#b4b2b8'],
      [0.5, '#8a8890'],
      [1, '#55535c'],
    ]);
  groundShadow(ctx, 0, 0, 24, 7, 0.38);
  ctx.translate(mv ? Math.sin(w) : 0, 0);
  // 脚
  for (const [side, ph] of [
    [-1, w],
    [1, w + Math.PI],
  ] as const) {
    const lift = Math.max(0, Math.sin(ph)) * 3 * mv;
    ctx.fillStyle = back ? '#68666f' : '#77757e';
    ctx.beginPath();
    ctx.roundRect(side * 7 - 5.5, -20 + u - lift, 11, 20 - u, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(side * 7 - 5.5, -3 - lift, 11, 3);
  }
  // 胴体
  ctx.fillStyle = stone(-18, -52, 18, -14);
  ctx.beginPath();
  ctx.moveTo(-16, -20 + u);
  ctx.lineTo(-19, -40 + u);
  ctx.lineTo(-13, -51 + u);
  ctx.lineTo(13, -51 + u);
  ctx.lineTo(19, -40 + u);
  ctx.lineTo(16, -20 + u);
  ctx.quadraticCurveTo(0, -15 + u, -16, -20 + u);
  ctx.fill();
  // ひび
  ctx.strokeStyle = 'rgba(30,28,36,0.6)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  if (back) {
    ctx.moveTo(0, -50 + u);
    ctx.lineTo(-3, -42 + u);
    ctx.lineTo(2, -34 + u);
    ctx.lineTo(-1, -24 + u);
    ctx.moveTo(10, -46 + u);
    ctx.lineTo(14, -36 + u);
  } else {
    ctx.moveTo(-11, -47 + u);
    ctx.lineTo(-7, -41 + u);
    ctx.lineTo(-10, -34 + u);
    ctx.moveTo(9, -45 + u);
    ctx.lineTo(12, -38 + u);
    ctx.moveTo(-13, -25 + u);
    ctx.lineTo(-5, -23.5 + u);
  }
  ctx.stroke();
  // 苔（背中に多い）
  ctx.fillStyle = 'rgba(90,140,60,0.75)';
  const moss: [number, number, number, number][] = back
    ? [
        [4, -49, 9, 3],
        [-9, -30, 4, 2],
        [10, -38, 3, 1.6],
      ]
    : [
        [-11, -50, 5.5, 2],
        [13, -23, 3, 1.4],
      ];
  for (const [mx, my, rx, ry] of moss) {
    ellipsePath(ctx, mx, my + u, rx, ry);
    ctx.fill();
  }
  // 胸の紋様（正面だけ）
  if (!back) {
    const pulse = 0.55 + Math.sin(t * 3 + e.seed) * 0.25;
    glow(ctx, 0, -35 + u, 12, '#ff8a30', pulse * 0.6);
    ctx.strokeStyle = `rgba(255,160,60,${pulse})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -42 + u);
    ctx.lineTo(5, -35 + u);
    ctx.lineTo(0, -28 + u);
    ctx.lineTo(-5, -35 + u);
    ctx.closePath();
    ctx.moveTo(0, -38 + u);
    ctx.lineTo(0, -32 + u);
    ctx.stroke();
  }
  // 頭
  ctx.fillStyle = stone(-8, -62, 8, -50);
  ctx.beginPath();
  ctx.roundRect(-7.5, -61 + u, 15, 12, [5, 5, 2, 2]);
  ctx.fill();
  if (back) {
    ctx.fillStyle = 'rgba(90,140,60,0.75)';
    ellipsePath(ctx, -1, -60.5 + u, 5, 1.6);
    ctx.fill();
  } else {
    glow(ctx, 0, -55.5 + u, 7, '#ffa030', 0.8);
    ctx.fillStyle = '#ffd070';
    ctx.fillRect(-5, -56.4 + u, 10, 1.8);
  }
  // 腕（前後に振ると、上下に揺れて見える）
  for (const s of [-1, 1]) {
    const sw = mv ? Math.sin(w + (s > 0 ? Math.PI : 0)) * 2.5 : 0;
    ctx.save();
    ctx.translate(s * 19, -45 + u);
    ctx.rotate(-s * 0.08);
    ctx.fillStyle = stone(-6, 0, 6, 30);
    ctx.beginPath();
    ctx.roundRect(-5.5, 0, 11, 21 + sw * 0.4, 4);
    ctx.fill();
    ctx.fillStyle = stone(-8, 20, 8, 34);
    ctx.beginPath();
    ctx.roundRect(-7.5, 18 + sw, 15, 13, 5);
    ctx.fill();
    ctx.restore();
  }
}

// ================================================================ 宝箱

export type ChestKind = 'normal' | 'locked' | 'legend';

export function drawChest(ctx: C, x: number, y: number, kind: ChestKind, open: boolean, time: number) {
  const pal =
    kind === 'legend'
      ? { body: ['#7a3ab0', '#4a1a70'], lid: ['#9a52d0', '#5e2690'], band: '#e8c050', bandD: '#a07820' }
      : kind === 'locked'
        ? { body: ['#7a7a90', '#4a4a5c'], lid: ['#9090a8', '#5a5a70'], band: '#c8ccd8', bandD: '#7a7e8c' }
        : { body: ['#9a6334', '#5e3a1a'], lid: ['#b67a40', '#7a4c22'], band: '#5a3a1a', bandD: '#3a2410' };
  ctx.save();
  ctx.translate(x, y);
  groundShadow(ctx, 0, 0, 17, 5, 0.35);
  if (kind === 'legend' && !open) glow(ctx, 0, -12, 30, '#c080ff', 0.35 + Math.sin(time * 3) * 0.12);

  if (open) {
    // 開いたふた（奥側）
    ctx.fillStyle = lin(ctx, 0, -32, 0, -22, [
      [0, pal.lid[1]],
      [1, '#2a1608'],
    ]);
    ctx.beginPath();
    ctx.roundRect(-13.5, -31, 27, 10, [6, 6, 1, 1]);
    ctx.fill();
  }
  // 本体
  ctx.fillStyle = lin(ctx, 0, -16, 0, 0, [
    [0, pal.body[0]],
    [1, pal.body[1]],
  ]);
  ctx.beginPath();
  ctx.roundRect(-13, -16, 26, 16, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-13, -8.5);
  ctx.lineTo(13, -8.5);
  ctx.stroke();
  if (open) {
    ctx.fillStyle = '#1a0e06';
    ellipsePath(ctx, 0, -16, 12, 3);
    ctx.fill();
    glow(ctx, 0, -17, 14, '#ffd860', 0.35);
  } else {
    // ふた
    ctx.fillStyle = lin(ctx, 0, -25, 0, -15, [
      [0, pal.lid[0]],
      [1, pal.lid[1]],
    ]);
    ctx.beginPath();
    ctx.roundRect(-13.6, -24.5, 27.2, 9.5, [7, 7, 1, 1]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.roundRect(-11, -23.6, 22, 2, 1);
    ctx.fill();
  }
  // 金具の帯
  ctx.fillStyle = pal.band;
  for (const bx of [-10, 7]) {
    ctx.fillRect(bx, open ? -16 : -24.2, 3, open ? 16 : 24.2);
    ctx.fillStyle = pal.bandD;
    ctx.fillRect(bx + 2.2, open ? -16 : -24.2, 0.8, open ? 16 : 24.2);
    ctx.fillStyle = pal.band;
  }
  // 錠前
  if (!open) {
    ctx.fillStyle = kind === 'locked' ? '#d8b048' : '#e8c060';
    ctx.beginPath();
    ctx.roundRect(-2.6, -18, 5.2, 6, 1);
    ctx.fill();
    ctx.fillStyle = '#2a1a08';
    circlePath(ctx, 0, -16, 0.9);
    ctx.fill();
    ctx.fillRect(-0.4, -16, 0.8, 2);
    if (kind === 'locked') {
      ctx.strokeStyle = '#c8ccd8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -18.5, 2.4, Math.PI, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ================================================================ 拾うもの・本

export function drawPickup(ctx: C, kind: 'gold' | 'potion' | 'ether' | 'ore' | 'mat', x: number, y: number, time: number, oreCol: [string, string] = ['#d8dce8', '#6a7084']) {
  const bob = Math.sin(time * 5 + x * 0.1) * 1.5;
  groundShadow(ctx, x, y + 3, 5, 1.8, 0.3);
  ctx.save();
  ctx.translate(x, y - 3 + bob);
  if (kind === 'gold') {
    const s = Math.cos(time * 5 + x);
    glow(ctx, 0, 0, 9, '#ffd040', 0.35);
    ctx.scale(Math.max(0.15, Math.abs(s)), 1);
    ctx.fillStyle = rad(ctx, -1.5, -1.5, 0.3, 0, 0, 5, [
      [0, '#fff4b0'],
      [0.5, '#f2c43a'],
      [1, '#b08218'],
    ]);
    circlePath(ctx, 0, 0, 4.6);
    ctx.fill();
    ctx.strokeStyle = '#8a6010';
    ctx.lineWidth = 0.7;
    circlePath(ctx, 0, 0, 3.2);
    ctx.stroke();
  } else if (kind === 'ore') {
    // 鉱石のかたまり
    glow(ctx, 0, -2, 10, oreCol[1], 0.4);
    ctx.fillStyle = lin(ctx, 0, -7, 0, 2, [
      [0, '#7c7490'],
      [1, '#3c3648'],
    ]);
    ctx.beginPath();
    ctx.moveTo(-6, 1.5);
    ctx.lineTo(-5.5, -3);
    ctx.lineTo(-2, -6);
    ctx.lineTo(3, -5.5);
    ctx.lineTo(6, -1.5);
    ctx.lineTo(5, 1.5);
    ctx.closePath();
    ctx.fill();
    crystal(ctx, -1.5, -2.5, -0.35, 8, 2.2, oreCol);
    crystal(ctx, 2.5, -1.5, 0.5, 6, 1.8, oreCol);
  } else if (kind === 'mat') {
    // 魔物の素材：口をひもでしばった小袋。中身の色がにじむ
    glow(ctx, 0, -3, 10, oreCol[1], 0.45);
    ctx.fillStyle = lin(ctx, 0, -8, 0, 2, [
      [0, '#d8b888'],
      [1, '#8a6438'],
    ]);
    ctx.beginPath();
    ctx.moveTo(-2.2, -7);
    ctx.quadraticCurveTo(-6.5, -4, -5.5, 0.5);
    ctx.quadraticCurveTo(0, 3, 5.5, 0.5);
    ctx.quadraticCurveTo(6.5, -4, 2.2, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a3e20';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    // 袋の口と、のぞく中身
    ctx.fillStyle = rad(ctx, -0.5, -8.5, 0.3, 0, -8, 3, [
      [0, oreCol[0]],
      [1, oreCol[1]],
    ]);
    ellipsePath(ctx, 0, -8, 2.8, 1.6, 0);
    ctx.fill();
    ctx.strokeStyle = '#c84a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2.4, -6.6);
    ctx.lineTo(2.4, -6.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ellipsePath(ctx, -2.5, -3, 1, 2, 0.3);
    ctx.fill();
  } else {
    const col = kind === 'potion' ? ['#ff8a80', '#d02a2a'] : ['#8ac8ff', '#2a5ad0'];
    glow(ctx, 0, -3, 10, kind === 'potion' ? '#ff5050' : '#5090ff', 0.4);
    ctx.fillStyle = 'rgba(220,235,255,0.55)';
    ctx.fillRect(-1.5, -10, 3, 4);
    ctx.fillStyle = '#a07040';
    ctx.fillRect(-1.8, -11.5, 3.6, 2);
    ctx.fillStyle = rad(ctx, -1.5, -4, 0.5, 0, -2, 6, [
      [0, col[0]],
      [1, col[1]],
    ]);
    circlePath(ctx, 0, -2.5, 4.8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ellipsePath(ctx, -1.8, -4, 1, 1.6, 0.5);
    ctx.fill();
  }
  ctx.restore();
}

/** 結晶のかけら（根元 x,y から角度 a へ伸びる） */
function crystal(ctx: C, x: number, y: number, a: number, len: number, w: number, col: [string, string]) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = lin(ctx, -w, 0, w, 0, [
    [0, col[0]],
    [0.55, col[1]],
    [1, col[1]],
  ]);
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 0.8, -len * 0.75);
  ctx.lineTo(0, -len);
  ctx.lineTo(w * 0.8, -len * 0.75);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, -1);
  ctx.lineTo(-w * 0.3, -len * 0.72);
  ctx.stroke();
  ctx.restore();
}

/** ダンジョンの鉱脈。hits は残りの耐久（0 なら掘りつくした跡） */
export function drawOreVein(ctx: C, x: number, y: number, col: [string, string], hits: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  if (hits <= 0) {
    // 掘りつくした跡：がれき
    groundShadow(ctx, 0, 0, 14, 3.5, 0.25);
    const rocks: [number, number, number][] = [
      [-8, -2, 4.5],
      [3, -1.5, 5],
      [10, -1, 3.2],
      [-2, -5, 3.6],
      [6, -5.5, 2.6],
    ];
    for (const [rx, ry, r] of rocks) {
      ctx.fillStyle = rad(ctx, rx - r * 0.4, ry - r * 0.5, 0.5, rx, ry, r * 1.2, [
        [0, '#8a8296'],
        [1, '#4a4456'],
      ]);
      ellipsePath(ctx, rx, ry, r, r * 0.7);
      ctx.fill();
    }
    ctx.fillStyle = col[0];
    ctx.globalAlpha = 0.7;
    ctx.fillRect(-1, -4, 1.5, 1.5);
    ctx.fillRect(8, -2.5, 1.2, 1.2);
    ctx.restore();
    return;
  }

  glow(ctx, 0, -14, 26, col[1], 0.22 + Math.sin(time * 2.4 + x) * 0.06);
  groundShadow(ctx, 0, 0, 17, 4.5, 0.35);
  // 岩
  ctx.fillStyle = lin(ctx, 0, -30, 0, 0, [
    [0, '#7c7490'],
    [0.6, '#5a5268'],
    [1, '#3c3648'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-17, 0);
  ctx.lineTo(-16, -9);
  ctx.lineTo(-11, -19);
  ctx.lineTo(-4, -26);
  ctx.lineTo(5, -28);
  ctx.lineTo(12, -21);
  ctx.lineTo(16, -11);
  ctx.lineTo(17, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a2434';
  ctx.lineWidth = 1;
  ctx.stroke();
  // 面のかげ
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(-11, -19);
  ctx.lineTo(-4, -26);
  ctx.lineTo(5, -28);
  ctx.lineTo(-2, -17);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.moveTo(12, -21);
  ctx.lineTo(16, -11);
  ctx.lineTo(17, 0);
  ctx.lineTo(8, 0);
  ctx.lineTo(9, -14);
  ctx.closePath();
  ctx.fill();

  // 結晶
  crystal(ctx, -7, -11, -0.45, 13, 3.2, col);
  crystal(ctx, 2, -16, 0.1, 15, 3.6, col);
  crystal(ctx, 9, -8, 0.6, 10, 2.8, col);
  crystal(ctx, -12, -3, -0.9, 7, 2.2, col);

  // たたくたびに入るひび
  ctx.strokeStyle = '#1e1a28';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  if (hits <= 2) {
    ctx.beginPath();
    ctx.moveTo(-3, -27);
    ctx.lineTo(-5, -20);
    ctx.lineTo(-2, -15);
    ctx.lineTo(-4, -8);
    ctx.stroke();
  }
  if (hits <= 1) {
    ctx.beginPath();
    ctx.moveTo(14, -16);
    ctx.lineTo(9, -12);
    ctx.lineTo(10, -5);
    ctx.moveTo(-15, -8);
    ctx.lineTo(-10, -6);
    ctx.lineTo(-11, -1);
    ctx.stroke();
  }

  // きらめき
  const tw = (time * 1.3 + x * 0.013) % 2.2;
  if (tw < 0.5) {
    const k = Math.sin((tw / 0.5) * Math.PI);
    const sx = [2, -8, 9][Math.floor(x / 32) % 3] ?? 2;
    const sy = [-29, -22, -15][Math.floor(x / 32) % 3] ?? -29;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4 * k);
    ctx.lineTo(sx + 1, sy - 1);
    ctx.lineTo(sx + 4 * k, sy);
    ctx.lineTo(sx + 1, sy + 1);
    ctx.lineTo(sx, sy + 4 * k);
    ctx.lineTo(sx - 1, sy + 1);
    ctx.lineTo(sx - 4 * k, sy);
    ctx.lineTo(sx - 1, sy - 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawBook(ctx: C, x: number, y: number, color: string, size: number) {
  const s = size / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  glow(ctx, 0, 0, 20, '#ffe080', 0.5);
  ctx.fillStyle = '#f2e8d0';
  ctx.beginPath();
  ctx.roundRect(-8, -9, 17, 19, 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-9, -10, 17, 19, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-9, -10, 3, 19);
  ctx.fillStyle = '#f0d060';
  ctx.beginPath();
  ctx.moveTo(0.5, -5);
  ctx.lineTo(4, -0.5);
  ctx.lineTo(0.5, 4);
  ctx.lineTo(-3, -0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ================================================================ 飛び道具

export function drawKnife(ctx: C, x: number, y: number, ang: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-14, -0.6, 10, 1.2);
  ctx.fillStyle = '#4a2c14';
  ctx.fillRect(-6, -1, 4, 2);
  ctx.fillStyle = '#d7b24c';
  ctx.fillRect(-2.2, -2.2, 1.2, 4.4);
  ctx.fillStyle = lin(ctx, 0, -1.2, 0, 1.2, [
    [0, '#ffffff'],
    [1, '#8a94a0'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-1, -1.2);
  ctx.lineTo(7, -0.6);
  ctx.lineTo(9, 0);
  ctx.lineTo(7, 0.6);
  ctx.lineTo(-1, 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 飛んでいる矢。tint があれば矢じりが光る。explosive なら火薬袋つきの爆裂矢 */
export function drawArrow(ctx: C, x: number, y: number, ang: number, tint?: string, explosive = false, time = 0) {
  if (tint) glow(ctx, x + Math.cos(ang) * 7, y + Math.sin(ang) * 7, explosive ? 10 + Math.sin(time * 40) * 2 : 9, tint, 0.7);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-20, -0.5, 10, 1);
  ctx.fillStyle = '#c8a070';
  ctx.fillRect(-10, -0.55, 16, 1.1);
  ctx.fillStyle = '#e04a3e';
  ctx.beginPath();
  ctx.moveTo(-10, -0.5);
  ctx.lineTo(-7, -0.5);
  ctx.lineTo(-9, -2.6);
  ctx.lineTo(-11.5, -2.6);
  ctx.closePath();
  ctx.moveTo(-10, 0.5);
  ctx.lineTo(-7, 0.5);
  ctx.lineTo(-9, 2.6);
  ctx.lineTo(-11.5, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tint && !explosive ? '#f0fbff' : '#d8dce6';
  ctx.beginPath();
  ctx.moveTo(5.5, -2);
  ctx.lineTo(10, 0);
  ctx.lineTo(5.5, 2);
  ctx.closePath();
  ctx.fill();
  if (explosive) {
    ctx.fillStyle = '#7a2a18';
    ctx.beginPath();
    ctx.roundRect(1, -2.2, 4, 4.4, 1.2);
    ctx.fill();
    ctx.fillStyle = '#fff2a0';
    circlePath(ctx, 3, -2.6, 0.9 + Math.sin(time * 40) * 0.3);
    ctx.fill();
  }
  ctx.restore();
}

/** 杖から放つ魔力の弾 */
export function drawOrb(ctx: C, x: number, y: number, time: number) {
  glow(ctx, x, y, 13, '#b080ff', 0.6);
  ctx.fillStyle = rad(ctx, x - 1, y - 1, 0.3, x, y, 4.5, [
    [0, '#ffffff'],
    [0.45, '#e0c8ff'],
    [1, 'rgba(150,90,255,0)'],
  ]);
  circlePath(ctx, x, y, 4.5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 2; i++) {
    const a = time * 9 + i * Math.PI;
    circlePath(ctx, x + Math.cos(a) * 5.5, y + Math.sin(a) * 3, 0.7);
    ctx.fill();
  }
}

/** 剣閃（飛ぶ斬撃）。fade は残りの寿命 0〜1 */
export function drawSlashWave(ctx: C, x: number, y: number, ang: number, fade: number) {
  glow(ctx, x, y, 22, '#a8d8ff', 0.5 * fade);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha *= Math.min(1, fade * 2);
  ctx.fillStyle = lin(ctx, -6, 0, 8, 0, [
    [0, 'rgba(160,210,255,0)'],
    [0.6, 'rgba(200,230,255,0.85)'],
    [1, '#ffffff'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-4, -15);
  ctx.quadraticCurveTo(14, 0, -4, 15);
  ctx.quadraticCurveTo(5, 0, -4, -15);
  ctx.fill();
  ctx.restore();
}

/** 旋舞剣：自分のまわりを回る光の剣。ang は切っ先の向き */
export function drawOrbitSword(ctx: C, x: number, y: number, ang: number, time: number) {
  glow(ctx, x, y, 16, '#ff7a50', 0.35 + Math.sin(time * 10) * 0.08);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // 残像
  ctx.fillStyle = 'rgba(255,150,100,0.25)';
  ctx.beginPath();
  ctx.moveTo(-14, -2.5);
  ctx.lineTo(4, 0);
  ctx.lineTo(-14, 2.5);
  ctx.closePath();
  ctx.fill();
  // 柄と鍔
  ctx.fillStyle = '#5a3018';
  ctx.fillRect(-10, -1.2, 4, 2.4);
  ctx.fillStyle = '#ffc860';
  ctx.fillRect(-6.4, -3.6, 1.6, 7.2);
  // 刀身
  ctx.fillStyle = lin(ctx, 0, -1.8, 0, 1.8, [
    [0, '#ffffff'],
    [0.5, '#ffd8c0'],
    [1, '#e0704a'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-4.8, -1.8);
  ctx.lineTo(9, -1.2);
  ctx.lineTo(12, 0);
  ctx.lineTo(9, 1.2);
  ctx.lineTo(-4.8, 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawBomb(ctx: C, x: number, y: number, time: number) {
  ctx.fillStyle = rad(ctx, x - 2, y - 2, 0.5, x, y, 6.5, [
    [0, '#7a7a88'],
    [0.4, '#2e2e38'],
    [1, '#111116'],
  ]);
  circlePath(ctx, x, y, 6);
  ctx.fill();
  ctx.strokeStyle = '#8a6a40';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 5);
  ctx.quadraticCurveTo(x + 4, y - 8, x + 6, y - 8);
  ctx.stroke();
  const fl = 0.7 + Math.sin(time * 40) * 0.3;
  glow(ctx, x + 6, y - 8, 6 * fl, '#ffb030', 0.9);
  ctx.fillStyle = '#fff2a0';
  circlePath(ctx, x + 6, y - 8, 1.2);
  ctx.fill();
}

export function drawFireball(ctx: C, x: number, y: number, vx: number, vy: number, time: number) {
  const a = Math.atan2(vy, vx);
  glow(ctx, x, y, 16, '#ff6020', 0.6);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = rad(ctx, 1, 0, 0.5, 0, 0, 9, [
    [0, '#fff8c0'],
    [0.35, '#ffb040'],
    [1, 'rgba(255,80,20,0)'],
  ]);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.quadraticCurveTo(4, -5, -2, -4);
  ctx.quadraticCurveTo(-8, -2 + Math.sin(time * 30) * 1.5, -13, 0);
  ctx.quadraticCurveTo(-8, 2 - Math.sin(time * 30) * 1.5, -2, 4);
  ctx.quadraticCurveTo(4, 5, 5, 0);
  ctx.fill();
  ctx.restore();
}
