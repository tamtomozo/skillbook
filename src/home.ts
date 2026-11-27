/**
 * わが家（室内）の描画。床・壁・暖炉・窓は地面の層、家具は奥行き順に並べて描く。
 * 本棚には、しまってあるスキルブックが実際の表紙の色で並ぶ。BOXには装備していない武器・防具をしまう。
 */
import { TILE } from './constants';
import { RNG } from './rng';
import type { Furniture, TileMap } from './map';
import { ellipsePath, glow, groundShadow } from './art';
import type { Sortable } from './terrain';

type C = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

let WOOD: CanvasPattern | null = null;

/** 木の床板の模様 */
function woodPattern(ctx: C): CanvasPattern {
  if (WOOD) return WOOD;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = new RNG(321);
  const rowH = 24;
  for (let y = 0; y < S; y += rowH) {
    let x = -r.int(0, 120);
    while (x < S) {
      const len = r.int(110, 230);
      g.fillStyle = r.pick(['#a8743e', '#9c6a36', '#b07c44', '#94622f', '#a26e3a']);
      g.fillRect(x, y, len, rowH);
      // 木目
      g.strokeStyle = 'rgba(70,40,15,0.22)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const gy = y + 4 + k * 5 + r.next() * 2;
        g.beginPath();
        g.moveTo(x, gy);
        g.bezierCurveTo(x + len * 0.3, gy + (r.next() - 0.5) * 4, x + len * 0.7, gy + (r.next() - 0.5) * 4, x + len, gy);
        g.stroke();
      }
      if (r.chance(0.3)) {
        g.fillStyle = 'rgba(60,32,12,0.35)';
        g.beginPath();
        g.ellipse(x + r.next() * len, y + rowH / 2, 4, 2.2, 0, 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(40,22,8,0.6)';
      g.fillRect(x, y, 1.5, rowH);
      x += len;
    }
    g.fillStyle = 'rgba(40,22,8,0.65)';
    g.fillRect(0, y + rowH - 1.5, S, 1.5);
    g.fillStyle = 'rgba(255,230,190,0.12)';
    g.fillRect(0, y, S, 1);
  }
  const p = ctx.createPattern(c, 'repeat')!;
  p.setTransform(new DOMMatrix().scale(0.5));
  WOOD = p;
  return p;
}

// ================================================================ 床と壁

export function drawHomeGround(ctx: C, m: TileMap, time: number) {
  const W = m.w * TILE;
  const H = m.h * TILE;
  const backH = 2 * TILE;

  // 床
  ctx.fillStyle = woodPattern(ctx);
  ctx.fillRect(TILE, backH, W - 2 * TILE, H - backH - TILE);

  // 絨毯
  const rx = 4.6 * TILE;
  const ry = 4.2 * TILE;
  const rw = 4.8 * TILE;
  const rh = 3.1 * TILE;
  ctx.fillStyle = '#7a2626';
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 4);
  ctx.fill();
  ctx.strokeStyle = '#d8a040';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(rx + 5, ry + 5, rw - 10, rh - 10, 3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(216,160,64,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rx + 9, ry + 9, rw - 18, rh - 18, 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(216,160,64,0.35)';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    ellipsePath(ctx, rx + rw / 2 + Math.cos(a) * 24, ry + rh / 2 + Math.sin(a) * 16, 6, 4, a);
    ctx.fill();
  }
  ctx.fillStyle = '#e8c070';
  for (let x = rx + 3; x < rx + rw; x += 5) {
    ctx.fillRect(x, ry - 2, 1.2, 2);
    ctx.fillRect(x, ry + rh, 1.2, 2);
  }

  // 奥の壁：漆喰と腰板
  const pg = ctx.createLinearGradient(0, 0, 0, backH);
  pg.addColorStop(0, '#d8c6a2');
  pg.addColorStop(0.6, '#eadcbc');
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, W, backH);
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(0, 0, W, 6);
  const wg = ctx.createLinearGradient(0, 40, 0, backH);
  wg.addColorStop(0, '#8a5e36');
  wg.addColorStop(1, '#5e3c20');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 40, W, backH - 40);
  ctx.strokeStyle = 'rgba(40,22,8,0.45)';
  ctx.lineWidth = 1;
  for (let x = 8; x < W; x += 24) {
    ctx.strokeRect(x, 44, 18, 14);
  }
  ctx.fillStyle = '#3e2614';
  ctx.fillRect(0, 39, W, 2.5);
  ctx.fillRect(0, backH - 4, W, 4);
  // 柱
  for (const px of [TILE * 0.6, W - TILE * 0.6 - 6, TILE * 6.1, TILE * 8.6]) {
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(px, 6, 6, backH - 6);
  }

  // 窓（ベッドの上）と差し込む光
  const wx = 10.2 * TILE;
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(wx - 3, 9, 1.6 * TILE + 6, 28);
  const sky = ctx.createLinearGradient(0, 12, 0, 34);
  sky.addColorStop(0, '#8ac8f0');
  sky.addColorStop(1, '#d8f0ff');
  ctx.fillStyle = sky;
  ctx.fillRect(wx, 12, 1.6 * TILE, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ellipsePath(ctx, wx + 14 + Math.sin(time * 0.2) * 4, 19, 7, 2.6);
  ctx.fill();
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(wx + 0.8 * TILE - 1, 12, 2, 22);
  ctx.fillRect(wx, 22, 1.6 * TILE, 2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,240,200,0.07)';
  ctx.beginPath();
  ctx.moveTo(wx, 34);
  ctx.lineTo(wx + 1.6 * TILE, 34);
  ctx.lineTo(wx + 0.4 * TILE, 6 * TILE);
  ctx.lineTo(wx - 2.2 * TILE, 6 * TILE);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 暖炉
  const fx = 7.5 * TILE;
  ctx.fillStyle = '#7a7268';
  ctx.beginPath();
  ctx.roundRect(fx - 26, 14, 52, backH - 14 + 2, [4, 4, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,36,30,0.5)';
  ctx.lineWidth = 0.7;
  for (let y = 20; y < backH; y += 8) {
    ctx.beginPath();
    ctx.moveTo(fx - 26, y);
    ctx.lineTo(fx + 26, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(fx - 30, 12, 60, 5);
  ctx.fillStyle = '#140a06';
  ctx.beginPath();
  ctx.roundRect(fx - 15, 30, 30, backH - 30, [14, 14, 0, 0]);
  ctx.fill();
  const fl = Math.sin(time * 12) * 0.5 + Math.sin(time * 19) * 0.3;
  glow(ctx, fx, backH - 8, 34, '#ff8a30', 0.55 + fl * 0.06);
  for (const [ox, h, col] of [
    [-6, 13, '#ff7a20'],
    [5, 11, '#ff9a30'],
    [0, 17, '#ffb040'],
    [0, 9, '#fff0a0'],
  ] as const) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(fx + ox - 5, backH - 2);
    ctx.quadraticCurveTo(fx + ox - 4 + fl, backH - h * 0.6, fx + ox + fl * 1.5, backH - h - fl * 2);
    ctx.quadraticCurveTo(fx + ox + 4 + fl, backH - h * 0.5, fx + ox + 5, backH - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(fx - 10, backH - 3, 20, 3);
  // 暖炉の上：ろうそく
  for (const cx of [fx - 20, fx + 20]) {
    ctx.fillStyle = '#f0e8d0';
    ctx.fillRect(cx - 1.5, 5, 3, 7);
    glow(ctx, cx, 3, 8, '#ffb040', 0.5);
    ctx.fillStyle = '#ffd060';
    ellipsePath(ctx, cx, 3 + fl * 0.3, 1.2, 2);
    ctx.fill();
  }

  // 額縁（宝の地図）
  const ax = 12.1 * TILE;
  ctx.fillStyle = '#6a4424';
  ctx.fillRect(ax - 2, 12, 28, 22);
  ctx.fillStyle = '#e8d8a8';
  ctx.fillRect(ax, 14, 24, 18);
  ctx.strokeStyle = 'rgba(120,80,40,0.7)';
  ctx.setLineDash([2, 1.5]);
  ctx.beginPath();
  ctx.moveTo(ax + 3, 28);
  ctx.quadraticCurveTo(ax + 10, 18, ax + 18, 22);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c83a2a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(ax + 16.5, 20.5);
  ctx.lineTo(ax + 20, 24);
  ctx.moveTo(ax + 20, 20.5);
  ctx.lineTo(ax + 16.5, 24);
  ctx.stroke();

  // 床に落ちる暖炉の明かり
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const fg = ctx.createRadialGradient(fx, backH + 4, 0, fx, backH + 4, 70);
  fg.addColorStop(0, `rgba(255,140,50,${0.22 + fl * 0.03})`);
  fg.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(fx - 70, backH, 140, 70);
  ctx.restore();

  // 奥の壁ぎわの影
  const sg = ctx.createLinearGradient(0, backH, 0, backH + 14);
  sg.addColorStop(0, 'rgba(20,10,4,0.45)');
  sg.addColorStop(1, 'rgba(20,10,4,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(TILE, backH, W - 2 * TILE, 14);

  // 横と手前の壁（上から見た壁の天端）
  const top = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#3e2816';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,220,170,0.12)';
    ctx.fillRect(x, y, w, 1.5);
  };
  top(0, backH, TILE, H - backH);
  top(W - TILE, backH, TILE, H - backH);
  top(0, H - TILE, 7 * TILE, TILE);
  top(8 * TILE, H - TILE, W - 8 * TILE, TILE);
  for (const [x, dir] of [
    [TILE, 1],
    [W - TILE, -1],
  ] as const) {
    const g = ctx.createLinearGradient(x, 0, x + dir * 10, 0);
    g.addColorStop(0, 'rgba(20,10,4,0.4)');
    g.addColorStop(1, 'rgba(20,10,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(dir > 0 ? x : x - 10, backH, 10, H - backH - TILE);
  }

  // 出口：玄関マットと外の光
  const ex = 7 * TILE;
  const ey = H - TILE;
  const lg = ctx.createLinearGradient(0, ey, 0, H);
  lg.addColorStop(0, '#9a6a3a');
  lg.addColorStop(1, '#fff2c8');
  ctx.fillStyle = lg;
  ctx.fillRect(ex, ey, TILE, TILE);
  ctx.fillStyle = '#6a5a3a';
  ctx.beginPath();
  ctx.roundRect(ex + 3, ey - 12, TILE - 6, 14, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,10,0.4)';
  ctx.lineWidth = 0.6;
  for (let x = ex + 5; x < ex + TILE - 4; x += 2.5) {
    ctx.beginPath();
    ctx.moveTo(x, ey - 11);
    ctx.lineTo(x, ey + 1);
    ctx.stroke();
  }
}

// ================================================================ 家具

const FILLER = ['#6a4a3a', '#4a5a6a', '#5a6a4a', '#7a6a4a', '#5a4a6a', '#8a7a6a', '#6a3a30', '#3e4e5e'];

function drawShelf(ctx: C, f: Furniture, colors: string[], time: number) {
  const x0 = f.x * TILE;
  const x1 = (f.x + f.w) * TILE;
  const bottom = (f.y + f.h) * TILE;
  const top = bottom - 80;
  const w = x1 - x0;
  groundShadow(ctx, (x0 + x1) / 2, bottom, w / 2 + 4, 6, 0.4);
  const fg = ctx.createLinearGradient(x0, 0, x1, 0);
  fg.addColorStop(0, '#4a2e16');
  fg.addColorStop(0.5, '#6e4826');
  fg.addColorStop(1, '#4a2e16');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.roundRect(x0 + 1, top, w - 2, bottom - top, [3, 3, 1, 1]);
  ctx.fill();
  ctx.fillStyle = '#2a180a';
  ctx.fillRect(x0 + 6, top + 6, w - 12, bottom - top - 12);

  const rows = 4;
  const innerTop = top + 6;
  const rowH = (bottom - top - 12) / rows;
  // しまってあるスキルブックは真ん中の2段に並べる
  const special: string[][] = [[], [], [], []];
  colors.forEach((c, i) => special[1 + (Math.floor(i / 4) % 2)].push(c));

  for (let row = 0; row < rows; row++) {
    const base = innerTop + rowH * (row + 1) - 2.5;
    const r = new RNG(row * 31 + 7);
    let x = x0 + 8;
    for (const col of special[row]) {
      const bh = rowH - 5;
      glow(ctx, x + 4, base - bh / 2, 12, col, 0.3 + Math.sin(time * 2 + x) * 0.08);
      ctx.fillStyle = col;
      ctx.fillRect(x, base - bh, 8, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 6, base - bh, 2, bh);
      ctx.fillStyle = '#e8c050';
      ctx.fillRect(x, base - bh + 2, 8, 1.4);
      ctx.fillRect(x, base - 3.4, 8, 1.4);
      ellipsePath(ctx, x + 3.5, base - bh / 2, 1.5, 1.5);
      ctx.fill();
      x += 9.5;
    }
    if (special[row].length) x += 3;
    // 飾りの古い本
    while (x < x1 - 12) {
      if (r.chance(0.12)) {
        x += r.int(4, 9);
        continue;
      }
      const bw = r.int(3, 6);
      const bh = rowH - 4 - r.int(0, 6);
      ctx.fillStyle = r.pick(FILLER);
      if (r.chance(0.08) && x < x1 - 20) {
        ctx.save();
        ctx.translate(x, base);
        ctx.rotate(0.3);
        ctx.fillRect(0, -bh, bw, bh);
        ctx.restore();
        x += bw + 5;
        continue;
      }
      ctx.fillRect(x, base - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 0.5, base - bh + 2, bw - 1, 1);
      x += bw + 0.6;
    }
    // 棚板
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(x0 + 5, base, w - 10, 3);
    ctx.fillStyle = 'rgba(255,230,190,0.2)';
    ctx.fillRect(x0 + 5, base, w - 10, 0.8);
  }
  // 天板の上の地球儀
  const gx = x1 - 18;
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(gx - 4, top - 3, 8, 3);
  const gg = ctx.createRadialGradient(gx - 2, top - 11, 1, gx, top - 9, 7);
  gg.addColorStop(0, '#8ad0f0');
  gg.addColorStop(1, '#2a6aa0');
  ctx.fillStyle = gg;
  ellipsePath(ctx, gx, top - 9, 6, 6);
  ctx.fill();
  ctx.fillStyle = '#6aa858';
  ellipsePath(ctx, gx - 1.5, top - 10, 2.5, 2);
  ctx.fill();
}

function drawBed(ctx: C, f: Furniture) {
  const x0 = f.x * TILE;
  const x1 = (f.x + f.w) * TILE;
  const top = f.y * TILE;
  const bottom = (f.y + f.h) * TILE;
  const w = x1 - x0;
  groundShadow(ctx, (x0 + x1) / 2, bottom, w / 2 + 4, 6, 0.4);
  // ヘッドボード
  const hg = ctx.createLinearGradient(0, top - 16, 0, top + 6);
  hg.addColorStop(0, '#7a4e2a');
  hg.addColorStop(1, '#4a2e16');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.roundRect(x0 + 1, top - 16, w - 2, 22, [8, 8, 1, 1]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(x0 + 6, top - 11, w - 12, 12, 4);
  ctx.stroke();
  // 枠とシーツ
  ctx.fillStyle = '#5e3a1c';
  ctx.beginPath();
  ctx.roundRect(x0 + 2, top + 2, w - 4, bottom - top - 2, 3);
  ctx.fill();
  ctx.fillStyle = '#f0ece0';
  ctx.beginPath();
  ctx.roundRect(x0 + 4, top + 3, w - 8, bottom - top - 10, 3);
  ctx.fill();
  // 枕
  const pg = ctx.createLinearGradient(0, top + 5, 0, top + 16);
  pg.addColorStop(0, '#ffffff');
  pg.addColorStop(1, '#d8d4c8');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.roundRect(x0 + 9, top + 5, w - 18, 11, 5);
  ctx.fill();
  // 掛け布団（パッチワーク）
  const by = top + 19;
  const bh = bottom - by - 8;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0 + 3, by, w - 6, bh, 3);
  ctx.clip();
  const cols = ['#b8403a', '#d8a040', '#3f6aa8', '#c86048'];
  const cs = 8;
  for (let yy = by, j = 0; yy < by + bh; yy += cs, j++) {
    for (let xx = x0 + 3, i = 0; xx < x1 - 3; xx += cs, i++) {
      ctx.fillStyle = cols[(i + j * 3) % cols.length];
      ctx.fillRect(xx, yy, cs, cs);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x0 + 3, by, w - 6, 4);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,30,10,0.4)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(x0 + 3, by, w - 6, bh, 3);
  ctx.stroke();
  // 足板
  ctx.fillStyle = '#6e4626';
  ctx.fillRect(x0 + 1, bottom - 7, w - 2, 7);
  ctx.fillStyle = 'rgba(255,220,170,0.2)';
  ctx.fillRect(x0 + 1, bottom - 7, w - 2, 1);
}

function drawTable(ctx: C, f: Furniture, time: number, cleared: boolean) {
  const x0 = f.x * TILE;
  const x1 = (f.x + f.w) * TILE;
  const top = f.y * TILE;
  const bottom = (f.y + f.h) * TILE;
  const w = x1 - x0;
  groundShadow(ctx, (x0 + x1) / 2, bottom + 2, w / 2 + 2, 6, 0.35);
  ctx.fillStyle = '#4a2e16';
  for (const lx of [x0 + 5, x1 - 9]) ctx.fillRect(lx, top + 14, 4, bottom - top - 12);
  const tg = ctx.createLinearGradient(0, top - 6, 0, top + 16);
  tg.addColorStop(0, '#b07c48');
  tg.addColorStop(1, '#8a5a30');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.roundRect(x0 + 1, top - 6, w - 2, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#5e3a1c';
  ctx.fillRect(x0 + 2, top + 14, w - 4, 4);
  // 広げた地図
  ctx.save();
  ctx.translate(x0 + 22, top + 4);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#ecdcae';
  ctx.fillRect(-14, -7, 28, 14);
  ctx.strokeStyle = 'rgba(120,80,40,0.6)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-10, 3);
  ctx.quadraticCurveTo(-2, -5, 6, 0);
  ctx.stroke();
  ctx.strokeStyle = '#c83a2a';
  ctx.beginPath();
  ctx.moveTo(5, -3);
  ctx.lineTo(9, 1);
  ctx.moveTo(9, -3);
  ctx.lineTo(5, 1);
  ctx.stroke();
  ctx.restore();
  // ろうそく
  const cx = x1 - 14;
  ctx.fillStyle = '#c8a040';
  ellipsePath(ctx, cx, top + 6, 5, 2);
  ctx.fill();
  ctx.fillStyle = '#f2ead6';
  ctx.fillRect(cx - 2, top - 6, 4, 12);
  const fl = Math.sin(time * 14) * 0.4;
  glow(ctx, cx, top - 10, 16, '#ffb040', 0.5);
  ctx.fillStyle = '#ffd060';
  ellipsePath(ctx, cx + fl * 0.4, top - 9.5, 1.6, 3);
  ctx.fill();
  // クリア後は秘宝を飾る
  if (cleared) {
    const px = x0 + 40;
    const py = top + 2;
    glow(ctx, px, py, 16, '#c080ff', 0.5 + Math.sin(time * 3) * 0.15);
    ctx.fillStyle = '#e8c050';
    ellipsePath(ctx, px, py, 6, 4.5);
    ctx.fill();
    ctx.fillStyle = '#3a2a6a';
    ellipsePath(ctx, px, py, 4.6, 3.3);
    ctx.fill();
    ctx.strokeStyle = '#ffe0ff';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    const a = time * 1.5;
    ctx.moveTo(px - Math.cos(a) * 3.5, py - Math.sin(a) * 2.5);
    ctx.lineTo(px + Math.cos(a) * 3.5, py + Math.sin(a) * 2.5);
    ctx.stroke();
  }
}

function drawPlant(ctx: C, f: Furniture, time: number) {
  const cx = (f.x + 0.5) * TILE;
  const base = (f.y + 1) * TILE - 2;
  groundShadow(ctx, cx, base, 12, 4, 0.4);
  const r = new RNG(99);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.32 + Math.sin(time * 1.2 + i) * 0.03;
    const len = 14 + r.next() * 10;
    ctx.fillStyle = r.pick(['#3e7a3a', '#4f9a46', '#2f6430']);
    ctx.save();
    ctx.translate(cx, base - 14);
    ctx.rotate(a + Math.PI / 2);
    ellipsePath(ctx, 0, -len / 2, 3.2, len / 2);
    ctx.fill();
    ctx.restore();
  }
  const pg = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
  pg.addColorStop(0, '#9a4a26');
  pg.addColorStop(0.5, '#d07a44');
  pg.addColorStop(1, '#9a4a26');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(cx - 9, base - 16);
  ctx.lineTo(cx + 9, base - 16);
  ctx.lineTo(cx + 6.5, base);
  ctx.lineTo(cx - 6.5, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a3a1c';
  ctx.fillRect(cx - 10, base - 17, 20, 3);
}

/** 装備をしまっておく木のBOX（鉄の帯と真鍮の錠前つき） */
function drawBox(ctx: C, f: Furniture) {
  const x0 = f.x * TILE + 4;
  const x1 = (f.x + f.w) * TILE - 4;
  const w = x1 - x0;
  const bottom = (f.y + f.h) * TILE - 3;
  const top = bottom - 34;
  const lidH = 13;
  groundShadow(ctx, (x0 + x1) / 2, bottom, w / 2 + 4, 5, 0.45);
  // ふたの上面（奥行き）
  ctx.fillStyle = '#a06a38';
  ctx.beginPath();
  ctx.roundRect(x0 + 1, top - 6, w - 2, 9, [5, 5, 0, 0]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,230,180,0.18)';
  ctx.fillRect(x0 + 4, top - 4, w - 8, 2);
  // ふたの正面
  const lg = ctx.createLinearGradient(0, top, 0, top + lidH);
  lg.addColorStop(0, '#8a5a2e');
  lg.addColorStop(1, '#6a4220');
  ctx.fillStyle = lg;
  ctx.fillRect(x0, top, w, lidH);
  // 箱の正面
  const bg = ctx.createLinearGradient(0, top + lidH, 0, bottom);
  bg.addColorStop(0, '#7a4e28');
  bg.addColorStop(1, '#4e3016');
  ctx.fillStyle = bg;
  ctx.fillRect(x0, top + lidH, w, bottom - top - lidH);
  // 板の継ぎ目
  ctx.strokeStyle = 'rgba(40,20,6,0.45)';
  ctx.lineWidth = 1;
  for (const y of [top + lidH + 7, top + lidH + 14]) {
    ctx.beginPath();
    ctx.moveTo(x0 + 1, y);
    ctx.lineTo(x1 - 1, y);
    ctx.stroke();
  }
  // ふたと箱のすき間
  ctx.fillStyle = '#2e1a0a';
  ctx.fillRect(x0, top + lidH - 1, w, 2);
  // 鉄の帯（縁と縦の2本）
  ctx.fillStyle = '#4a4e56';
  ctx.fillRect(x0 - 1, top - 1, 3, bottom - top + 1);
  ctx.fillRect(x1 - 2, top - 1, 3, bottom - top + 1);
  for (const bx of [x0 + w * 0.22, x1 - w * 0.22 - 4]) {
    ctx.fillStyle = '#5a606a';
    ctx.fillRect(bx, top - 6, 4, bottom - top + 6);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(bx, top - 6, 1, bottom - top + 6);
    ctx.fillStyle = '#c8c0a8';
    for (const ry of [top + 4, top + lidH + 6, bottom - 5]) ctx.fillRect(bx + 1.5, ry, 1.2, 1.2);
  }
  // 真鍮の錠前
  const cx = (x0 + x1) / 2;
  const lockG = ctx.createLinearGradient(0, top + lidH - 5, 0, top + lidH + 8);
  lockG.addColorStop(0, '#ffe08a');
  lockG.addColorStop(1, '#b88a2a');
  ctx.fillStyle = lockG;
  ctx.beginPath();
  ctx.roundRect(cx - 5, top + lidH - 5, 10, 12, 2);
  ctx.fill();
  ctx.fillStyle = '#3a2408';
  ctx.beginPath();
  ctx.arc(cx, top + lidH, 1.6, 0, TAU);
  ctx.fill();
  ctx.fillRect(cx - 0.7, top + lidH, 1.4, 4);
  // 足
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(x0 + 1, bottom - 2, 5, 3);
  ctx.fillRect(x1 - 6, bottom - 2, 5, 3);
}

export function homeObjects(furniture: Furniture[], shelfColors: string[], time: number, cleared: boolean): Sortable[] {
  return furniture.map((f) => ({
    y: (f.y + f.h) * TILE,
    draw: (ctx: C) => {
      if (f.kind === 'shelf') drawShelf(ctx, f, shelfColors, time);
      else if (f.kind === 'bed') drawBed(ctx, f);
      else if (f.kind === 'table') drawTable(ctx, f, time, cleared);
      else if (f.kind === 'box') drawBox(ctx, f);
      else drawPlant(ctx, f, time);
    },
  }));
}
