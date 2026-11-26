import { FONT, LIGHT_R, MAX_HP, MAX_MP, TILE } from './constants';
import { Input } from './input';
import { FINAL_FLOOR, T, TileMap, buildHome, buildTown, generateDungeon, type Furniture, type Label } from './map';
import {
  Enemy,
  Player,
  type Box,
  type Chest,
  type Effect,
  type FloatText,
  type Pickup,
  type Projectile,
  type Vein,
} from './entities';
import { ARMORS, MAX_PLUS, WEAPONS, WEAPON_TYPE_NAME, armorById, armorDef, damageRate, eqName, eqSellPrice, forgeCost, forgeOre, matById, matDropRate, matOfEnemy, oreById, rollOre, weaponById, weaponStat, type ArmorEffect, type Recipe, type WeaponEffect, type WeaponType } from './equipment';
import { BOOKS, CURSE_COLOR, SCHOOL_WEAPON, STANCES, STANCE_BOOST, sellPrice, spSpent, SKILLS, TREASURE_NAME, bookById, bookMaxLv, bookOfSkill, critRate, dropMult, goldMult, isMagic, lvUpCost, purifyPrice, type BookDef, type Stat } from './skills';
import { HOTBAR_SIZE, MAX_CARRY, bankInterest, loadGame, newSave, saveGame, spCost, type SaveData } from './state';
import { drawArrow, drawBook, drawOrb, drawChest, drawWhite, drawEnemy, drawFireball, drawHunter, drawOreVein, drawPickup, drawSlashWave, ellipsePath, glow, groundShadow, hoverOf } from './art';
import { Terrain, type Light, type Sortable, type View } from './terrain';
import { UI } from './ui';

interface Interact {
  label: string;
  act: () => void;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function moveBox(map: TileMap, b: Box, dx: number, dy: number) {
  if (dx !== 0) {
    b.x += dx;
    if (map.boxHits(b.x, b.y, b.w, b.h)) {
      if (dx > 0) b.x = Math.floor((b.x + b.w / 2) / TILE) * TILE - b.w / 2 - 0.01;
      else b.x = (Math.floor((b.x - b.w / 2) / TILE) + 1) * TILE + b.w / 2 + 0.01;
    }
  }
  if (dy !== 0) {
    b.y += dy;
    if (map.boxHits(b.x, b.y, b.w, b.h)) {
      if (dy > 0) b.y = Math.floor((b.y + b.h / 2) / TILE) * TILE - b.h / 2 - 0.01;
      else b.y = (Math.floor((b.y - b.h / 2) / TILE) + 1) * TILE + b.h / 2 + 0.01;
    }
  }
}

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly input = new Input();
  readonly ui: UI;

  data: SaveData = newSave();
  scene: 'town' | 'dungeon' | 'home' = 'town';
  /** わが家の家具（本棚・ベッドを調べるのに使う） */
  private furniture: Furniture[] = [];
  floor = 0;
  map = new TileMap(1, 1, T.GRASS);
  labels: Label[] = [];
  player = new Player();
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  floats: FloatText[] = [];
  pickups: Pickup[] = [];
  chests: Chest[] = [];
  veins: Vein[] = [];
  cooldowns: Record<string, number> = {};
  started = false;
  detected = false;

  private camX = 0;
  private camY = 0;
  private shake = 0;
  private time = 0;
  private flameT = 0;
  private flameTick = 0;
  private bladesT = 0;
  private bladesTick = 0;
  /** 盾の技の効果時間 */
  private ironwallT = 0;
  /** 2段階の書の1段目で入った状態（このフロアにいる間だけ続く） */
  stances = new Set<string>();
  private reflectT = 0;
  private sanctT = 0;
  private bulwarkT = 0;
  /** 発動中の窮地の書（発動した瞬間を知らせるのに使う） */
  private pinchOn = '';
  private bannerText = '';
  private bannerT = 0;
  private interact: Interact | null = null;
  private lastTime = 0;

  // 画面（CSSピクセル）と拡大率
  private canvas: HTMLCanvasElement;
  private VW = 960;
  private VH = 640;
  private dpr = 1;
  /** ワールド1単位あたりの画面ピクセル数 */
  private zoom = 2;
  private terrain!: Terrain;
  private dark = document.createElement('canvas');
  private darkCtx = this.dark.getContext('2d')!;
  /** 暗闇のキャンバスの解像度（画面に対する倍率）。ぼやけた灯りなので低い解像度で描いて引き伸ばす */
  private darkScale = 0.5;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ui = new UI(this, uiRoot);
    this.resize(window.innerWidth, window.innerHeight);
    this.goTown(false, true);
    this.ui.showTitle();
    requestAnimationFrame(this.loop);
  }

  /** 画面サイズに合わせてキャンバスと拡大率を決める（キャラが画面の高さの約1/10になる大きさ） */
  resize(w: number, h: number) {
    this.VW = w;
    this.VH = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, w < 900 || h < 560 ? 1.5 : 2, this.dprCap);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // 暗闇は幅 960px 以下で描く（灯りの縁はぼやけているので、引き伸ばしても見た目は変わらない）
    this.darkScale = Math.min(0.5, 960 / this.canvas.width);
    this.dark.width = Math.ceil(this.canvas.width * this.darkScale);
    this.dark.height = Math.ceil(this.canvas.height * this.darkScale);
    const fit = Math.max(0.45, Math.min(1, Math.sqrt(w * h) / 1300));
    this.zoom = 2.5 * fit;
    if (this.terrain) this.snapCamera();
  }

  private swing(dur: number) {
    this.player.attackAnim = dur;
    this.player.attackDur = dur;
  }

  // ---------------------------------------------------------------- 重いときは自動で解像度を下げる

  /** 解像度の倍率の上限。重い状態が続くと下げる（このプレイ中は戻さない） */
  private dprCap = Infinity;
  /** 計測中の区間：経過時間・フレーム数・いちばん短いフレーム間隔・重い区間が続いた数 */
  private perf = { t: 0, n: 0, min: Infinity, slow: 0, settle: 1 };

  /**
   * フレームの間隔を 1.5 秒ずつ集計し、50fps を下回る区間が2回続いたら（約3秒）解像度を一段下げる。
   * 画面のリフレッシュレートが低い（30Hz など）ときに誤って下げないよう、
   * いちばん短いフレーム間隔（＝画面の更新間隔）の 1.25 倍も基準にする
   */
  private watchFrameRate(ms: number) {
    // タブを切り替えたときなどの長い中断は数えない
    if (ms <= 0 || ms > 250) return;
    const f = this.perf;
    f.t += ms;
    f.n++;
    if (ms >= 4) f.min = Math.min(f.min, ms);
    if (f.t < 1500) return;
    const avg = f.t / f.n;
    const limit = Math.max(20, f.min * 1.25);
    f.t = f.n = 0;
    f.min = Infinity;
    // 解像度を変えた直後の区間は、落ち着くまで見送る
    if (f.settle > 0) {
      f.settle--;
      return;
    }
    f.slow = avg > limit ? f.slow + 1 : 0;
    if (f.slow < 2) return;
    f.slow = 0;
    const floor = Math.min(1, window.devicePixelRatio || 1);
    const next = [1.75, 1.5, 1.25, 1].find((s) => s < this.dpr - 0.01 && s >= floor);
    if (next === undefined) return;
    const before = this.dpr;
    this.dprCap = next;
    this.resize(this.VW, this.VH);
    f.settle = 1;
    this.ui.log(`画面の動きが重いので、解像度を少し下げました（${before}倍 → ${this.dpr}倍）`, '#a8a8b8');
  }

  private loop = (now: number) => {
    this.watchFrameRate(now - this.lastTime);
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.update(dt);
    this.render();
    this.ui.update();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  };

  // ================================================================ ゲーム進行

  newGame() {
    this.data = newSave();
    this.cooldowns = {};
    this.started = true;
    this.player.hp = MAX_HP;
    this.player.mp = MAX_MP;
    this.goHome(false);
    saveGame(this.data);
    this.ui.log('トレジャーハンターの冒険が始まった！', '#ffd84a');
    this.ui.log('[K] でスキルブックを開き、SPを使って本のレベルを上げよう。本はLv0（効果なし）から始まる。');
    this.ui.log('スキルブックは「パラメタ」「技」「窮地」の3系統。道具屋や遺跡の宝箱で集めよう。宝箱の本は呪われているので、町の神殿で浄化してもらおう。');
    this.ui.log(`本棚では、持ち歩くスキルブック（${MAX_CARRY}冊まで）を入れ替えられる。`);
  }

  continueGame() {
    const d = loadGame();
    if (!d) return this.newGame();
    this.data = d;
    this.cooldowns = {};
    this.started = true;
    this.player.hp = MAX_HP;
    this.player.mp = MAX_MP;
    this.goHome(false);
    this.ui.log('冒険を再開した。', '#ffd84a');
    if (d.notice) {
      this.ui.log(d.notice, '#ffd84a');
      delete d.notice;
      saveGame(d);
    }
  }

  /** スキルが使えるか：習得済みで、その本をかばんに入れて持ち歩き、剣・弓の技ならその武器を装備していること */
  has(id: string): boolean {
    return this.skillBlock(id) === null;
  }

  /** スキルが使えない理由。使えるなら null */
  skillBlock(id: string): string | null {
    if (!this.learned(id)) return 'まだ覚えていない';
    const b = bookOfSkill(id);
    if (!b || !this.isCarried(b.id)) return '本が本棚にあるので使えない';
    if (b.school && this.weaponType !== SCHOOL_WEAPON[b.school]) return `${WEAPON_TYPE_NAME[SCHOOL_WEAPON[b.school]]}を装備していないので使えない`;
    const needs = SKILLS[id]?.needs;
    if (needs && !this.stances.has(needs)) return `「${STANCES[needs].name}」の状態でないので使えない`;
    return null;
  }

  /** 実際の消費MP（魔力解放で魔術が安くなる） */
  mpCost(id: string): number {
    const s = SKILLS[id];
    return isMagic(id) && this.has('focus') ? Math.ceil(s.mp * 0.75) : s.mp;
  }

  get weaponType(): WeaponType {
    return weaponById(this.data.weapon).type;
  }

  /** 装備している武器の追加効果（作成した武器だけにある） */
  get weaponEffect(): WeaponEffect | undefined {
    return weaponById(this.data.weapon).effect;
  }

  /** 装備している防具の追加効果（作成した防具だけにある） */
  get armorEffect(): ArmorEffect | undefined {
    return armorById(this.data.armor).effect;
  }

  learned(id: string): boolean {
    return this.data.learned.includes(id);
  }

  isCarried(bookId: string): boolean {
    return this.data.carried.includes(bookId);
  }

  /**
   * 本を手に入れる。本はレベル0（効果なし）から始まる。かばんに空きがなければ家の本棚へ送る。
   * すでに持っている本なら予備になる（道具屋で売れる）。
   */
  private acquireBook(id: string, verb: string) {
    const d = this.data;
    const b = bookById(id);
    if (d.books.includes(id)) {
      d.spares[id] = (d.spares[id] ?? 0) + 1;
      this.ui.log(`スキルブック『${b.name}』を${verb}！ すでに持っている本なので予備になった。道具屋で売れる。`, '#ffd84a');
      return;
    }
    d.books.push(id);
    d.bookLv[id] = 0;
    if (d.carried.length < MAX_CARRY) {
      d.carried.push(id);
      this.ui.log(`スキルブック『${b.name}』を${verb}！ [K]で開いてレベルを上げよう`, '#ffd84a');
    } else {
      this.ui.log(`スキルブック『${b.name}』を${verb}！ かばんがいっぱいなので家の本棚へ送った。`, '#ffd84a');
    }
  }

  /** 宝箱で呪われた本を拾う。正体は神殿で浄化するまで分からない（かばんの枠は使わない） */
  private pickUpCursed(id: string) {
    const d = this.data;
    d.curseSeq += 1;
    d.cursed.push({ no: d.curseSeq, book: id });
    this.ui.log('呪われたスキルブックを手に入れた！ 町の神殿で浄化してもらおう。', '#c89cff');
  }

  /** 予備の冊数 */
  sparesOf(id: string): number {
    return this.data.spares[id] ?? 0;
  }

  /**
   * 神殿で呪われた本（通し番号 no）を浄化する。正体が分かり、レベル0から使えるようになる。
   * 浄化した本の id を返す（できなければ null）
   */
  purifyBook(no: number): string | null {
    const d = this.data;
    const i = d.cursed.findIndex((c) => c.no === no);
    if (i < 0) return null;
    const id = d.cursed[i].book;
    const price = purifyPrice(bookById(id));
    if (d.gold < price) return null;
    d.gold -= price;
    d.cursed.splice(i, 1);
    this.ui.log(`呪いが解けた！ 本の正体は『${bookById(id).name}』だった。`, '#fff4c0');
    this.acquireBook(id, '浄化した');
    saveGame(d);
    return id;
  }

  /**
   * 道具屋で本を売る。上げたレベルに使った SP は全部戻り、その本で覚えた技は忘れる。
   * 予備があれば予備が残る（レベル0から）。最初の本は売れない。
   */
  sellBook(id: string): boolean {
    const d = this.data;
    const b = bookById(id);
    const price = sellPrice(b);
    if (!d.books.includes(id) || price <= 0) return false;
    const lv = this.bookLv(id);
    const sp = spSpent(lv);
    d.gold += price;
    d.sp += sp;
    for (const s of b.skills) {
      d.learned = d.learned.filter((x) => x !== s);
      d.hotbar = d.hotbar.map((x) => (x === s ? null : x));
    }
    if (this.sparesOf(id) > 0) {
      d.spares[id] -= 1;
      if (d.spares[id] <= 0) delete d.spares[id];
      d.bookLv[id] = 0;
    } else {
      d.books = d.books.filter((x) => x !== id);
      d.carried = d.carried.filter((x) => x !== id);
      delete d.bookLv[id];
    }
    this.ui.log(`『${b.name}』を ${price} G で売った。${sp > 0 ? `SP ${sp} が戻った。` : ''}`, '#ffd84a');
    saveGame(d);
    return true;
  }

  /** 予備の本を1冊売る（使っている本はそのまま） */
  sellSpare(id: string): boolean {
    const d = this.data;
    const b = bookById(id);
    const price = sellPrice(b);
    if (this.sparesOf(id) <= 0 || price <= 0) return false;
    d.spares[id] -= 1;
    if (d.spares[id] <= 0) delete d.spares[id];
    d.gold += price;
    this.ui.log(`予備の『${b.name}』を ${price} G で売った。`, '#ffd84a');
    saveGame(d);
    return true;
  }

  /** 本棚からかばんへ（家の中でだけ呼ばれる） */
  carryBook(id: string): boolean {
    const d = this.data;
    if (!d.books.includes(id) || d.carried.includes(id) || d.carried.length >= MAX_CARRY) return false;
    d.carried.push(id);
    saveGame(d);
    return true;
  }

  /** かばんから本棚へ */
  storeBook(id: string): boolean {
    const d = this.data;
    const i = d.carried.indexOf(id);
    if (i < 0) return false;
    d.carried.splice(i, 1);
    saveGame(d);
    return true;
  }

  // ---------------------------------------------------------------- パラメタ

  /** 装備と、かばんに入れたパラメタの書から決まる値（窮地の効果は含まない） */
  baseStat(s: Stat): number {
    const d = this.data;
    let v = 0;
    v += weaponStat(weaponById(d.weapon), s, this.plusOf(d.weapon));
    if (s === 'def') v += armorDef(armorById(d.armor), this.plusOf(d.armor));
    for (const id of d.carried) {
      const b = bookById(id);
      if (b.stat?.key === s) v += b.stat.perLv * this.bookLv(id);
    }
    return v;
  }

  /** いま発動している窮地の書（かばんに入っていて、体力がしきい値以下） */
  activePinch(): BookDef[] {
    const hp = this.player.hp / MAX_HP;
    if (hp <= 0) return [];
    return this.data.carried.map(bookById).filter((b) => b.pinch && hp <= b.pinch.hp && this.bookLv(b.id) >= 1);
  }

  /** 窮地の書の、いまのレベルでの効果量 */
  pinchValue(b: BookDef): number {
    const v = b.pinch?.values ?? [0];
    return v[Math.max(1, Math.min(v.length, this.bookLv(b.id))) - 1];
  }

  /** 窮地の効果を含めたパラメタ。％アップは装備と本の値に掛かり、加算は相手の元の値から足す */
  stat(s: Stat): number {
    const base = this.baseStat(s);
    let v = base;
    for (const b of this.activePinch()) {
      const e = b.pinch!.effect;
      const val = this.pinchValue(b);
      if (e.kind === 'boost' && e.stat === s) v += base * val;
      if (e.kind === 'convert' && e.to === s) v += this.baseStat(e.from) * val;
    }
    for (const st of this.stances) if (STANCES[st].boost === s) v += base * STANCE_BOOST;
    if (s === 'atk' && this.has('fortress')) v += this.baseStat('def') * 0.3;
    if (s === 'def' && this.ironwallT > 0) v *= 2;
    return Math.round(v);
  }

  get atk(): number {
    return this.stat('atk');
  }

  get mag(): number {
    return this.stat('mag');
  }

  /** 受けるダメージの倍率（防御力で決まる） */
  get damageTaken(): number {
    return damageRate(this.stat('def'));
  }

  /** 鍛冶で鍛えた段階 */
  plusOf(id: string): number {
    return this.data.plus[id] ?? 0;
  }

  private clearWorld() {
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.floats = [];
    this.pickups = [];
    this.chests = [];
    this.veins = [];
    this.detected = false;
    this.flameT = 0;
    this.bladesT = 0;
    this.ironwallT = this.reflectT = this.sanctT = this.bulwarkT = 0;
    this.stances.clear();
    const p = this.player;
    p.kbx = p.kby = 0;
    p.speedBuff = 0;
    p.barrier = 0;
    p.invuln = 0;
  }

  goTown(save = true, atStart: boolean | 'home' = false) {
    const t = buildTown();
    this.scene = 'town';
    this.floor = 0;
    this.map = t.map;
    this.labels = t.labels;
    this.terrain = new Terrain(t.map, 'town', t.buildings);
    this.clearWorld();
    const pos = atStart === 'home' ? t.homeFront : atStart ? t.start : t.dungeonFront;
    this.player.x = pos.x;
    this.player.y = pos.y;
    this.player.dir = 'down';
    this.snapCamera();
    this.banner('はじまりの町');
    if (save) saveGame(this.data);
  }

  /** わが家（室内）へ。save = true は町から入ったとき（玄関に立つ） */
  goHome(save = true) {
    const h = buildHome();
    this.scene = 'home';
    this.floor = 0;
    this.map = h.map;
    this.labels = [];
    this.furniture = h.furniture;
    this.terrain = new Terrain(h.map, 'home', [], h.furniture);
    this.clearWorld();
    const pos = save ? h.door : h.start;
    this.player.x = pos.x;
    this.player.y = pos.y;
    this.player.dir = save ? 'up' : 'down';
    this.snapCamera();
    this.banner('わが家');
    if (save) saveGame(this.data);
  }

  enterDungeon(floor: number) {
    this.scene = 'dungeon';
    this.floor = floor;
    this.data.maxFloor = Math.max(this.data.maxFloor, floor);
    // 持っている本も出る（同じ本は予備になり、道具屋で売れる）
    const eligible = BOOKS.filter((b) => b.source === 'dungeon' && b.minFloor <= floor).map((b) => b.id);
    const g = generateDungeon(floor, eligible);
    this.map = g.map;
    this.labels = [];
    this.terrain = new Terrain(g.map, 'dungeon', []);
    this.clearWorld();
    this.chests = g.chests;
    this.veins = g.veins;
    this.enemies = g.spawns.map((s) => new Enemy(s.def, s.x, s.y, floor));
    this.player.x = g.start.x;
    this.player.y = g.start.y;
    this.updateExplore();
    this.snapCamera();
    this.banner(`地下 ${floor} 階`);
    if (floor >= FINAL_FLOOR) this.ui.log('最深部だ…強い秘宝の気配がする！', '#e0a0ff');
  }

  private banner(text: string) {
    this.bannerText = text;
    this.bannerT = 2.2;
  }

  private die() {
    // 銀行に預けたお金は減らない
    const lost = Math.floor(this.data.gold / 2);
    this.data.gold -= lost;
    this.player.hp = MAX_HP;
    this.player.mp = MAX_MP;
    this.goTown(true);
    this.ui.showDeath(lost);
  }

  /** 階段を降りる。銀行の預金に利息がつく */
  private descend() {
    const d = this.data;
    const interest = bankInterest(d.bank);
    if (interest > 0) {
      d.bank += interest;
      this.ui.log(`銀行の預金に利息 ${interest} G がついた。（預金 ${d.bank} G）`, '#ffd84a');
    }
    this.enterDungeon(this.floor + 1);
  }

  /** 銀行にお金を預ける。預けた額を返す */
  deposit(amount: number): number {
    const d = this.data;
    const n = Math.min(Math.floor(amount), d.gold);
    if (n <= 0) return 0;
    d.gold -= n;
    d.bank += n;
    saveGame(d);
    return n;
  }

  /** 銀行からお金を引き出す。引き出した額を返す */
  withdraw(amount: number): number {
    const d = this.data;
    const n = Math.min(Math.floor(amount), d.bank);
    if (n <= 0) return 0;
    d.bank -= n;
    d.gold += n;
    saveGame(d);
    return n;
  }

  // ================================================================ UIから呼ばれる操作

  convertExp(): boolean {
    const cost = spCost(this.data.spBought);
    if (this.data.exp < cost) return false;
    this.data.exp -= cost;
    this.data.sp += 1;
    this.data.spBought += 1;
    return true;
  }

  bookLv(bookId: string): number {
    return this.data.bookLv[bookId] ?? 0;
  }

  /** SPを使って本のレベルを上げる（かばんに入れている本だけ） */
  levelUpBook(bookId: string): boolean {
    const d = this.data;
    const b = bookById(bookId);
    const lv = this.bookLv(bookId);
    const cost = lvUpCost(lv);
    if (!d.books.includes(bookId) || !d.carried.includes(bookId)) return false;
    if (lv >= bookMaxLv(b) || d.sp < cost) return false;
    d.sp -= cost;
    d.bookLv[bookId] = lv + 1;
    this.ui.log(`『${b.name}』が Lv${lv + 1} になった！`, '#ffd84a');
    this.learnFromBook(bookId);
    return true;
  }

  /** 本のレベルに達したスキルを覚える。アクティブスキルは空いているスロットへ */
  private learnFromBook(bookId: string) {
    const d = this.data;
    const lv = this.bookLv(bookId);
    for (const id of bookById(bookId).skills) {
      const s = SKILLS[id];
      if (s.lv > lv || d.learned.includes(id)) continue;
      d.learned.push(id);
      if (s.kind === 'active') {
        const empty = d.hotbar.indexOf(null);
        if (empty >= 0) d.hotbar[empty] = id;
      }
      this.ui.log(`スキル『${s.name}』を覚えた！`, '#9fe870');
    }
  }

  assignSlot(id: string, slot: number) {
    const hb = this.data.hotbar;
    if (slot < 0 || slot >= HOTBAR_SIZE || !this.learned(id)) return;
    if (hb[slot] === id) {
      hb[slot] = null;
      return;
    }
    const prev = hb.indexOf(id);
    if (prev >= 0) hb[prev] = null;
    hb[slot] = id;
  }

  buyItem(kind: 'potion' | 'ether') {
    const price = kind === 'potion' ? 30 : 40;
    if (this.data.gold < price) return;
    this.data.gold -= price;
    if (kind === 'potion') this.data.potions++;
    else this.data.ethers++;
    saveGame(this.data);
  }

  buyBook(id: string) {
    const b = bookById(id);
    if (b.source !== 'shop' || this.data.books.includes(id) || this.data.gold < b.price || this.data.maxFloor < b.minFloor) return;
    this.data.gold -= b.price;
    this.acquireBook(id, '購入した');
    saveGame(this.data);
  }

  /** 武器防具屋：買ってそのまま装備する */
  buyEquip(kind: 'weapon' | 'armor', id: string) {
    const d = this.data;
    const def = kind === 'weapon' ? WEAPONS.find((w) => w.id === id) : ARMORS.find((a) => a.id === id);
    const owned = kind === 'weapon' ? d.weapons : d.armors;
    if (!def || owned.includes(id) || d.gold < def.price || d.maxFloor < def.minFloor) return;
    d.gold -= def.price;
    owned.push(id);
    this.ui.log(`${def.name}を購入した！`, '#ffd84a');
    this.equip(kind, id);
  }

  /** 武器防具屋に装備を売る。装備中の品と最初の装備は売れない。鍛えた分（+n）はなくなる */
  sellEquip(kind: 'weapon' | 'armor', id: string): boolean {
    const d = this.data;
    const def = kind === 'weapon' ? weaponById(id) : armorById(id);
    const owned = kind === 'weapon' ? d.weapons : d.armors;
    const worn = kind === 'weapon' ? d.weapon : d.armor;
    const plus = this.plusOf(id);
    const price = eqSellPrice(def.price, plus);
    if (def.id !== id || !owned.includes(id) || worn === id || price <= 0) return false;
    d.gold += price;
    owned.splice(owned.indexOf(id), 1);
    delete d.plus[id];
    this.ui.log(`${eqName(def.name, plus)}を ${price} G で売った。`, '#ffd84a');
    saveGame(d);
    return true;
  }

  /** 鍛冶場：持っている武器・防具を代金を払って +1 する */
  forge(kind: 'weapon' | 'armor', id: string): boolean {
    const d = this.data;
    const def = kind === 'weapon' ? weaponById(id) : armorById(id);
    const owned = kind === 'weapon' ? d.weapons : d.armors;
    const plus = this.plusOf(id);
    const cost = forgeCost(def.price, plus);
    const need = forgeOre(plus);
    if (def.id !== id || !owned.includes(id) || plus >= MAX_PLUS || d.gold < cost || this.oreOf(need.ore.id) < need.n) return false;
    d.gold -= cost;
    d.ores[need.ore.id] -= need.n;
    d.plus[id] = plus + 1;
    this.ui.log(`親方が${def.name}を鍛え上げた！ → ${eqName(def.name, plus + 1)}`, '#ffb060');
    saveGame(d);
    return true;
  }

  oreOf(id: string): number {
    return this.data.ores[id] ?? 0;
  }

  matOf(id: string): number {
    return this.data.mats[id] ?? 0;
  }

  /** レシピの素材とお金が足りているか */
  canCraft(r: Recipe): boolean {
    if (this.data.gold < r.gold) return false;
    for (const [id, n] of Object.entries(r.ores)) if (this.oreOf(id) < n) return false;
    for (const [id, n] of Object.entries(r.mats)) if (this.matOf(id) < n) return false;
    return true;
  }

  /** 鍛冶場：鉱石と魔物の素材から、作成専用の武器・防具を作ってそのまま装備する */
  craftEquip(kind: 'weapon' | 'armor', id: string): boolean {
    const d = this.data;
    const def = kind === 'weapon' ? WEAPONS.find((x) => x.id === id) : ARMORS.find((x) => x.id === id);
    const owned = kind === 'weapon' ? d.weapons : d.armors;
    if (!def?.craft || owned.includes(id) || d.maxFloor < def.minFloor || !this.canCraft(def.craft)) return false;
    const r = def.craft;
    d.gold -= r.gold;
    for (const [k, n] of Object.entries(r.ores)) d.ores[k] -= n;
    for (const [k, n] of Object.entries(r.mats)) d.mats[k] -= n;
    owned.push(id);
    this.ui.log(`親方が${def.name}を作り上げた！`, '#ffb060');
    this.equip(kind, id);
    return true;
  }

  private gainOre(id: string, n: number) {
    this.data.ores[id] = this.oreOf(id) + n;
  }

  /** 鉱脈をたたく。3回で崩れて鉱石がこぼれ出る */
  private mineVein(v: Vein) {
    const p = this.player;
    if (p.attackAnim > 0) return;
    const ore = oreById(v.ore);
    const vx = (v.tx + 0.5) * TILE;
    const vy = (v.ty + 0.5) * TILE;
    const dx = vx - p.x;
    const dy = vy - p.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      p.dir = 'side';
      p.facing = dx < 0 ? -1 : 1;
    } else p.dir = dy < 0 ? 'up' : 'down';
    this.swing(0.26);
    v.hits--;
    this.burst(vx, vy - 12, '#9a90a8', 6, 70);
    this.burst(vx, vy - 12, ore.color[0], 4, 90);
    this.shake = Math.max(this.shake, 0.1);
    if (v.hits > 0) {
      this.float(vx, vy - 34, 'カン！', '#e8e0d0');
      return;
    }
    v.mined = true;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      this.pickups.push({ x: vx + rand(-12, 12), y: vy + rand(4, 14), kind: 'ore', ore: ore.id, amount: 1, t: 0 });
    }
    this.burst(vx, vy - 10, ore.color[0], 16, 120);
    this.ui.log(`${ore.name}の鉱脈を掘りあてた！`, ore.color[0]);
  }

  /** 持っている武器・防具に持ち替える */
  equip(kind: 'weapon' | 'armor', id: string) {
    const d = this.data;
    if (!(kind === 'weapon' ? d.weapons : d.armors).includes(id)) return;
    if (kind === 'weapon') d.weapon = id;
    else d.armor = id;
    saveGame(d);
  }

  rest(msg = 'ぐっすり休んだ。') {
    this.player.hp = MAX_HP;
    this.player.mp = MAX_MP;
    saveGame(this.data);
    this.ui.log(`${msg}体力とMPが全回復した！（セーブしました）`, '#9fe870');
  }

  // ================================================================ 更新

  private update(dt: number) {
    this.time += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.shake > 0) this.shake -= dt;

    const inp = this.input;
    if (this.ui.modalOpen) {
      this.ui.handleKeys(inp);
      return;
    }
    if (!this.started) return;
    if (inp.pressed('KeyK', 'Tab')) {
      this.ui.showSkillbook();
      return;
    }
    if (inp.pressed('Escape')) {
      this.ui.showHelp();
      return;
    }

    this.updatePlayer(dt);
    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    this.separateEnemies();
    this.enemies = this.enemies.filter((e) => e.alive);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
    if (this.scene === 'dungeon') {
      this.updateExplore();
      this.checkTraps();
    }
    this.interact = this.findInteract();
    if (this.interact && inp.pressed('KeyE', 'Enter')) this.interact.act();
    this.updateCamera(dt);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    const inp = this.input;
    let mx = (inp.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (inp.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (inp.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (inp.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      const l = Math.hypot(mx, my);
      mx /= l;
      my /= l;
      p.aimX = mx;
      p.aimY = my;
      if (mx !== 0) p.facing = mx > 0 ? 1 : -1;
      // 上下の入力が強いときは正面/背中、それ以外（斜めを含む）は横向き
      p.dir = Math.abs(my) > Math.abs(mx) ? (my > 0 ? 'down' : 'up') : 'side';
      p.anim += dt * (p.speedBuff > 0 ? 1.7 : 1);
    }
    // 夜翼の外套で少し速くなる
    const speed = 130 * (p.speedBuff > 0 ? 1.7 : 1) * (this.armorEffect === 'swift' ? 1.15 : 1);
    moveBox(this.map, p, (mx * speed + p.kbx) * dt, (my * speed + p.kby) * dt);
    const decay = Math.min(1, dt * 10);
    p.kbx -= p.kbx * decay;
    p.kby -= p.kby * decay;

    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.attackAnim = Math.max(0, p.attackAnim - dt);
    p.speedBuff = Math.max(0, p.speedBuff - dt);
    p.barrier = Math.max(0, p.barrier - dt);
    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    // 自然回復 (上限は常に100)
    p.mp = Math.min(MAX_MP, p.mp + (this.has('mpregen') ? 3 : 1) * dt);
    if (this.has('regen')) p.hp = Math.min(MAX_HP, p.hp + 0.6 * dt);

    if (p.speedBuff > 0 && p.moving && Math.random() < 0.4) {
      this.effects.push({ type: 'particle', x: p.x - p.aimX * 8, y: p.y + 4, t: 0, dur: 0.3, vx: -p.aimX * 40, vy: -20, color: '#e8f4ff', size: 2 });
    }

    if (inp.isDown('Space', 'KeyJ')) this.attack();
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (inp.pressed(`Digit${i + 1}`, `Numpad${i + 1}`)) this.useSkill(this.data.hotbar[i]);
    }
    if (inp.pressed('KeyQ')) this.usePotion();
    if (inp.pressed('KeyR')) this.useEther();

    if (this.flameT > 0) {
      this.flameT -= dt;
      this.flameTick -= dt;
      if (this.flameTick <= 0) {
        this.flameTick = 0.3;
        for (const e of this.enemies) {
          if (e.alive && dist(p.x, p.y, e.x, e.y) < 74 + e.w / 2) this.hitEnemy(e, 8 + this.atk * 0.4, p.x, p.y, 60);
        }
      }
    }
    if (this.bladesT > 0) {
      this.bladesT -= dt;
      this.bladesTick -= dt;
      if (this.bladesTick <= 0) {
        this.bladesTick = 0.15;
        const a = Math.random() * Math.PI * 2;
        const r = rand(20, 60);
        this.effects.push({ type: 'slash', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.75, ang: a + rand(-1, 1), t: 0, dur: 0.2, size: rand(0.9, 1.3) });
        for (const e of this.enemies) {
          if (e.alive && dist(p.x, p.y, e.x, e.y) < 85 + e.w / 2) this.hitEnemy(e, 10 + this.atk * 0.6, p.x, p.y, 70);
        }
      }
    }
    this.updateShieldArts(dt);
    this.checkPinch();
  }

  /** 鉄壁・反射の盾・聖域・奥義不落の時間経過 */
  private updateShieldArts(dt: number) {
    const p = this.player;
    this.ironwallT = Math.max(0, this.ironwallT - dt);
    this.reflectT = Math.max(0, this.reflectT - dt);
    if (this.sanctT > 0) {
      this.sanctT -= dt;
      p.hp = Math.min(MAX_HP, p.hp + 4 * dt);
      for (const e of this.enemies) {
        const d = dist(p.x, p.y, e.x, e.y);
        if (!e.alive || d > 70 + e.w / 2 || d < 0.01) continue;
        const k = e.def.id === 'golem' ? 0.4 : 1;
        e.kbx = ((e.x - p.x) / d) * 240 * k;
        e.kby = ((e.y - p.y) / d) * 240 * k;
      }
      if (Math.random() < 0.3) {
        const a = Math.random() * Math.PI * 2;
        this.effects.push({ type: 'particle', x: p.x + Math.cos(a) * rand(10, 66), y: p.y + Math.sin(a) * rand(8, 46), t: 0, dur: 0.7, vx: 0, vy: -40, color: '#fff0a0', size: 2 });
      }
    }
    if (this.bulwarkT > 0) {
      this.bulwarkT -= dt;
      if (this.bulwarkT <= 0) {
        // 受け止めきったら衝撃波
        this.ring(p.x, p.y, 10, 140, '#ffe080', 0.5);
        this.ring(p.x, p.y, 10, 100, '#ffffff', 0.35);
        this.burst(p.x, p.y - 14, '#ffe080', 24, 160);
        this.shake = 0.3;
        for (const e of this.enemies) {
          if (e.alive && dist(p.x, p.y, e.x, e.y) < 130 + e.w / 2) this.hitEnemy(e, 40 + this.stat('def') * 2, p.x, p.y, 420);
        }
      }
    }
  }

  /** 窮地の書が発動した瞬間に知らせる */
  private checkPinch() {
    const p = this.player;
    const on = this.activePinch();
    const key = on.map((b) => b.id).join(',');
    if (key === this.pinchOn) return;
    const before = this.pinchOn.split(',');
    for (const b of on) {
      if (before.includes(b.id)) continue;
      this.float(p.x, p.y - 48, `${b.name} 発動！`, '#ff7070');
      this.ring(p.x, p.y, 10, 50, '#ff5050', 0.4);
      this.burst(p.x, p.y - 14, '#ff6060', 12, 70);
    }
    this.pinchOn = key;
  }

  private usePotion() {
    const p = this.player;
    if (this.data.potions <= 0) return this.float(p.x, p.y - 34, '回復薬がない', '#ff9090');
    if (p.hp >= MAX_HP) return this.float(p.x, p.y - 34, '体力は満タン', '#cccccc');
    this.data.potions--;
    p.hp = Math.min(MAX_HP, p.hp + 50);
    this.float(p.x, p.y - 34, '+50 HP', '#7af07a');
    this.burst(p.x, p.y - 12, '#7af07a', 12, 60);
  }

  private useEther() {
    const p = this.player;
    if (this.data.ethers <= 0) return this.float(p.x, p.y - 34, 'エーテルがない', '#ff9090');
    if (p.mp >= MAX_MP) return this.float(p.x, p.y - 34, 'MPは満タン', '#cccccc');
    this.data.ethers--;
    p.mp = Math.min(MAX_MP, p.mp + 50);
    this.float(p.x, p.y - 34, '+50 MP', '#7ab8ff');
    this.burst(p.x, p.y - 12, '#7ab8ff', 12, 60);
  }

  private attack() {
    const p = this.player;
    if (p.attackCd > 0) return;
    if (this.weaponType === 'bow') {
      // 弓：矢を放つ
      p.attackCd = this.has('rapid') ? 0.28 : 0.42;
      this.swing(0.26);
      // 白骨の弓：通常攻撃の矢が敵を貫通する
      const pierce = this.weaponEffect === 'pierce';
      this.shootArrow(Math.atan2(p.aimY, p.aimX), 8 + this.atk, 420, pierce ? { pierce: true, tint: '#f0ead0' } : {});
      return;
    }
    if (this.weaponType === 'staff') {
      // 杖：魔力の弾を放つ
      p.attackCd = 0.38;
      this.swing(0.24);
      this.projectiles.push({ x: p.x + p.aimX * 12, y: p.y + p.aimY * 12, vx: p.aimX * 360, vy: p.aimY * 360, r: 6, dmg: 7 + this.mag * 0.9, life: 0.45, maxLife: 0.45, from: 'player', kind: 'orb' });
      return;
    }
    if (this.weaponType === 'shield') {
      // 盾：盾で殴る（シールドバッシュ）。威力は控えめだが大きく吹き飛ばす
      p.attackCd = 0.4;
      this.swing(0.26);
      const bx = p.x + p.aimX * 18;
      const by = p.y + p.aimY * 16;
      this.ring(bx, by, 4, 20, '#f0e8d8', 0.18);
      for (const e of this.enemies) {
        if (e.alive && dist(bx, by, e.x, e.y) < 20 + e.w / 2) this.hitEnemy(e, 8 + this.atk * 0.8 + this.stat('def') * 0.3, p.x, p.y, 340);
      }
      return;
    }
    p.attackCd = this.has('combo') ? 0.22 : 0.32;
    this.swing(this.has('combo') ? 0.18 : 0.24);
    const ax = p.x + p.aimX * 20;
    const ay = p.y + p.aimY * 18;
    this.effects.push({ type: 'slash', x: ax, y: ay, ang: Math.atan2(p.aimY, p.aimX), t: 0, dur: 0.18 });
    const dmg = 10 + this.atk;
    for (const e of this.enemies) {
      if (e.alive && dist(ax, ay, e.x, e.y) < 22 + e.w / 2) this.hitEnemy(e, dmg, p.x, p.y, 220);
    }
  }

  /** 矢を放つ（ang の方向へ） */
  private shootArrow(ang: number, dmg: number, speed: number, opt: { pierce?: boolean; tint?: string; life?: number } = {}) {
    const p = this.player;
    const vx = Math.cos(ang);
    const vy = Math.sin(ang);
    const life = opt.life ?? 0.6;
    this.projectiles.push({
      x: p.x + vx * 10,
      y: p.y + vy * 10,
      vx: vx * speed,
      vy: vy * speed,
      r: opt.pierce ? 7 : 5,
      dmg,
      life,
      maxLife: life,
      from: 'player',
      kind: 'arrow',
      hits: opt.pierce ? [] : undefined,
      tint: opt.tint,
    });
  }

  // ================================================================ スキル

  useSkill(id: string | null) {
    if (!id) return;
    const s = SKILLS[id];
    if (!s || s.kind !== 'active') return;
    const block = this.skillBlock(id);
    if (block) {
      this.float(this.player.x, this.player.y - 34, block.replace('ので使えない', ''), '#cccccc');
      return;
    }
    if ((this.cooldowns[id] ?? 0) > 0) return;
    const p = this.player;
    const mp = this.mpCost(id);
    if (p.mp < mp) {
      this.float(p.x, p.y - 34, 'MPが足りない', '#7ab8ff');
      return;
    }
    if (!this.castSkill(id)) return;
    p.mp -= mp;
    this.cooldowns[id] = s.cd;
  }

  private visibleEnemies(range: number): Enemy[] {
    const p = this.player;
    return this.enemies
      .filter((e) => e.alive && dist(p.x, p.y, e.x, e.y) < range)
      .sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
  }

  /** スキルの効果を発動。発動できなければ false (MPは消費しない) */
  private castSkill(id: string): boolean {
    const p = this.player;
    const aim = Math.atan2(p.aimY, p.aimX);
    // 2段階の書の1段目：このフロアのあいだ続く状態に入る
    const stance = SKILLS[id].stance;
    if (stance) {
      const st = STANCES[stance];
      if (this.stances.has(stance)) {
        this.float(p.x, p.y - 34, `もう${st.name}の状態だ`, '#cccccc');
        return false;
      }
      this.stances.add(stance);
      this.ring(p.x, p.y, 10, 60, st.color, 0.5);
      this.burst(p.x, p.y - 14, st.color, 20, 90);
      this.float(p.x, p.y - 48, `${st.name}！`, st.color);
      this.ui.log(`${st.icon} ${st.name}の状態になった！ このフロアにいる間、2段目の技が使える。`, st.color);
      return true;
    }
    switch (id) {
      // ---------------------------------------------------------------- 剣（攻撃力）
      case 'smash': {
        this.swing(0.3);
        const ax = p.x + p.aimX * 24;
        const ay = p.y + p.aimY * 20;
        this.effects.push({ type: 'slash', x: ax, y: ay, ang: aim, t: 0, dur: 0.26, size: 1.5 });
        this.burst(ax, ay - 12, '#ffe0a0', 8, 90);
        this.shake = Math.max(this.shake, 0.12);
        for (const e of this.enemies) {
          if (e.alive && dist(ax, ay, e.x, e.y) < 34 + e.w / 2) this.hitEnemy(e, 16 + this.atk * 1.5, p.x, p.y, 360);
        }
        return true;
      }
      case 'spin': {
        this.swing(0.28);
        this.ring(p.x, p.y, 20, 66, '#ffffff', 0.25);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.effects.push({ type: 'slash', x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 24, ang: a, t: 0, dur: 0.22 });
        }
        for (const e of this.enemies) {
          if (e.alive && dist(p.x, p.y, e.x, e.y) < 64 + e.w / 2) this.hitEnemy(e, 18 + this.atk, p.x, p.y, 320);
        }
        return true;
      }
      case 'dash':
        p.speedBuff = 4;
        this.ring(p.x, p.y, 10, 40, '#e8f4ff', 0.3);
        return true;
      case 'wave':
        this.swing(0.24);
        this.projectiles.push({ x: p.x + p.aimX * 14, y: p.y + p.aimY * 14, vx: p.aimX * 340, vy: p.aimY * 340, r: 12, dmg: 14 + this.atk, life: 0.65, maxLife: 0.65, from: 'player', kind: 'wave', hits: [] });
        return true;
      case 'rush': {
        const ox = p.x;
        const oy = p.y;
        const hit = new Set<Enemy>();
        for (let s = 0; s < 30; s++) {
          const nx = p.x + p.aimX * 4;
          const ny = p.y + p.aimY * 4;
          if (this.map.boxHits(nx, ny, p.w, p.h)) break;
          p.x = nx;
          p.y = ny;
          if (s % 10 === 5) this.effects.push({ type: 'after', x: p.x, y: p.y, t: 0, dur: 0.3, facing: p.facing, dir: p.dir });
          for (const e of this.enemies) {
            if (!e.alive || hit.has(e) || dist(p.x, p.y, e.x, e.y) >= 26 + e.w / 2) continue;
            hit.add(e);
            this.hitEnemy(e, 20 + this.atk * 1.2, p.x - p.aimX * 30, p.y - p.aimY * 30, 300);
          }
        }
        this.effects.push({ type: 'after', x: ox, y: oy, t: 0, dur: 0.4, facing: p.facing, dir: p.dir });
        this.effects.push({ type: 'slash', x: p.x + p.aimX * 18, y: p.y + p.aimY * 14, ang: aim, t: 0, dur: 0.22, size: 1.2 });
        this.swing(0.25);
        p.invuln = Math.max(p.invuln, 0.35);
        return true;
      }
      case 'flame':
        this.flameT = 4;
        this.flameTick = 0;
        this.ring(p.x, p.y, 10, 74, '#ff8030', 0.3);
        return true;
      case 'blades':
        this.bladesT = 1.5;
        this.bladesTick = 0;
        this.ring(p.x, p.y, 10, 90, '#ffffff', 0.4);
        this.shake = 0.2;
        return true;
      // ---------------------------------------------------------------- 弓（攻撃力）
      case 'triple':
        this.swing(0.26);
        for (const da of [-0.22, 0, 0.22]) this.shootArrow(aim + da, 8 + this.atk * 0.8, 420);
        return true;
      case 'pierce':
        this.swing(0.3);
        this.shootArrow(aim, 18 + this.atk * 1.3, 560, { pierce: true, tint: '#8ad0ff', life: 0.7 });
        this.ring(p.x + p.aimX * 12, p.y + p.aimY * 12, 4, 20, '#8ad0ff', 0.25);
        return true;
      case 'bomb':
        this.swing(0.3);
        this.projectiles.push({ x: p.x + p.aimX * 10, y: p.y + p.aimY * 10, vx: p.aimX * 380, vy: p.aimY * 380, r: 6, dmg: 30 + this.atk * 0.8, life: 0.6, maxLife: 0.6, from: 'player', kind: 'bomb', tint: '#ff8030' });
        return true;
      case 'smoke': {
        for (let i = 0; i < 14; i++) {
          this.effects.push({ type: 'smoke', x: p.x + rand(-50, 50), y: p.y + rand(-40, 30), t: 0, dur: rand(0.8, 1.4), r0: rand(10, 18), r1: rand(26, 40), color: '#c8c8d0' });
        }
        let n = 0;
        for (const e of this.enemies) {
          if (e.alive && dist(p.x, p.y, e.x, e.y) < 130) {
            e.stun = 3;
            n++;
          }
        }
        if (n > 0) this.float(p.x, p.y - 34, `${n}体ひるんだ！`, '#e0e0e0');
        return true;
      }
      case 'detect': {
        if (this.scene !== 'dungeon') {
          this.float(p.x, p.y - 34, 'ここに宝の気配はない', '#cccccc');
          return false;
        }
        this.detected = true;
        this.ring(p.x, p.y, 10, 420, '#ffd84a', 0.9);
        const left = this.chests.filter((c) => !c.opened).length;
        this.ui.log(`鷹の目で宝のありかを見抜いた！ 残りの宝箱: ${left}個`, '#ffd84a');
        return true;
      }
      case 'shadowstep': {
        const ox = p.x;
        const oy = p.y;
        for (let s = 0; s < 28; s++) {
          const nx = p.x + p.aimX * 4;
          const ny = p.y + p.aimY * 4;
          if (this.map.boxHits(nx, ny, p.w, p.h)) break;
          p.x = nx;
          p.y = ny;
        }
        this.effects.push({ type: 'after', x: ox, y: oy, t: 0, dur: 0.4, facing: p.facing, dir: p.dir });
        this.burst(ox, oy - 12, '#6a4aa0', 10, 50);
        p.invuln = Math.max(p.invuln, 0.3);
        return true;
      }
      case 'rain': {
        const targets = this.visibleEnemies(LIGHT_R + 120);
        if (targets.length === 0) {
          this.float(p.x, p.y - 34, '近くに敵がいない', '#cccccc');
          return false;
        }
        this.swing(0.3);
        for (const e of targets) {
          for (let i = 0; i < 4; i++) {
            this.effects.push({ type: 'fall', x: e.x + rand(-14, 14), y: e.y + rand(-6, 6), t: -rand(0, 0.25), dur: 0.22 });
          }
          this.hitEnemy(e, 30 + this.atk * 1.1, e.x, e.y - 1, 60);
        }
        return true;
      }
      // ---------------------------------------------------------------- 魔術（魔力）
      case 'firebolt':
        this.swing(0.2);
        this.projectiles.push({ x: p.x + p.aimX * 12, y: p.y + p.aimY * 12, vx: p.aimX * 300, vy: p.aimY * 300, r: 7, dmg: 12 + this.mag * 1.3, life: 0.8, maxLife: 0.8, from: 'player', kind: 'fireball' });
        return true;
      case 'heal': {
        if (p.hp >= MAX_HP) {
          this.float(p.x, p.y - 34, '体力は満タン', '#cccccc');
          return false;
        }
        const amount = Math.round(25 + this.mag);
        p.hp = Math.min(MAX_HP, p.hp + amount);
        this.float(p.x, p.y - 34, `+${amount} HP`, '#7af07a');
        this.burst(p.x, p.y - 12, '#7af07a', 18, 70);
        this.ring(p.x, p.y, 8, 36, '#7af07a', 0.4);
        return true;
      }
      case 'barrier':
        p.barrier = 3;
        this.ring(p.x, p.y, 10, 30, '#c8a0ff', 0.3);
        return true;
      case 'bolt': {
        const targets = this.visibleEnemies(LIGHT_R + 10);
        if (targets.length === 0) {
          this.float(p.x, p.y - 34, '近くに敵がいない', '#cccccc');
          return false;
        }
        let from = { x: p.x, y: p.y - 14 };
        let cur: Enemy | undefined = targets[0];
        const hit = new Set<Enemy>();
        for (let i = 0; i < 3 && cur; i++) {
          hit.add(cur);
          this.lightning(from.x, from.y, cur.x, cur.y - 10);
          this.hitEnemy(cur, 28 + this.mag, from.x, from.y, 120);
          from = { x: cur.x, y: cur.y - 10 };
          const c: Enemy = cur;
          cur = this.enemies
            .filter((e) => e.alive && !hit.has(e) && dist(c.x, c.y, e.x, e.y) < 130)
            .sort((a, b) => dist(c.x, c.y, a.x, a.y) - dist(c.x, c.y, b.x, b.y))[0];
        }
        return true;
      }
      case 'frost': {
        this.ring(p.x, p.y, 10, 120, '#a8e8ff', 0.5);
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = rand(20, 110);
          this.effects.push({ type: 'particle', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, t: 0, dur: rand(0.5, 0.9), vx: 0, vy: -30, color: Math.random() < 0.5 ? '#e0f8ff' : '#80d0ff', size: 3 });
        }
        for (const e of this.enemies) {
          if (!e.alive || dist(p.x, p.y, e.x, e.y) >= 120 + e.w / 2) continue;
          this.hitEnemy(e, 20 + this.mag * 0.8, p.x, p.y, 40);
          e.stun = Math.max(e.stun, 2.5);
        }
        return true;
      }
      // ---------------------------------------------------------------- 盾（防御力・攻撃力）
      case 'shieldbash': {
        this.swing(0.3);
        const bx = p.x + p.aimX * 22;
        const by = p.y + p.aimY * 18;
        this.ring(bx, by, 6, 36, '#f0e8d8', 0.25);
        this.burst(bx, by - 12, '#e8e0c8', 8, 90);
        this.shake = Math.max(this.shake, 0.14);
        for (const e of this.enemies) {
          if (!e.alive || dist(bx, by, e.x, e.y) >= 30 + e.w / 2) continue;
          this.hitEnemy(e, 14 + this.atk * 0.6 + this.stat('def') * 0.8, p.x, p.y, 450);
          e.stun = Math.max(e.stun, 1.5);
        }
        return true;
      }
      case 'ironwall':
        this.ironwallT = 5;
        this.ring(p.x, p.y, 10, 40, '#a8c8f0', 0.35);
        this.float(p.x, p.y - 48, '防御力 2倍！', '#a8c8f0');
        return true;
      case 'charge': {
        const ox = p.x;
        const oy = p.y;
        const hit = new Set<Enemy>();
        const pow = 12 + this.atk * 0.5 + this.stat('def') * 0.8;
        for (let s = 0; s < 30; s++) {
          const nx = p.x + p.aimX * 4;
          const ny = p.y + p.aimY * 4;
          if (this.map.boxHits(nx, ny, p.w, p.h)) break;
          p.x = nx;
          p.y = ny;
          if (s % 10 === 5) this.effects.push({ type: 'after', x: p.x, y: p.y, t: 0, dur: 0.3, facing: p.facing, dir: p.dir });
          for (const e of this.enemies) {
            if (!e.alive || hit.has(e) || dist(p.x, p.y, e.x, e.y) >= 28 + e.w / 2) continue;
            hit.add(e);
            this.hitEnemy(e, pow, p.x - p.aimX * 10, p.y - p.aimY * 10, 420);
            e.stun = Math.max(e.stun, 1.2);
          }
        }
        this.effects.push({ type: 'after', x: ox, y: oy, t: 0, dur: 0.4, facing: p.facing, dir: p.dir });
        this.ring(p.x + p.aimX * 14, p.y + p.aimY * 12, 6, 34, '#f0e8d8', 0.25);
        this.swing(0.26);
        p.invuln = Math.max(p.invuln, 0.35);
        return true;
      }
      case 'reflect':
        this.reflectT = 4;
        this.ring(p.x, p.y, 10, 34, '#ffe080', 0.3);
        return true;
      case 'sanctuary':
        this.sanctT = 6;
        this.ring(p.x, p.y, 10, 70, '#fff0a0', 0.5);
        return true;
      case 'bulwark':
        this.bulwarkT = 2.5;
        p.barrier = Math.max(p.barrier, 2.5);
        this.ring(p.x, p.y, 10, 44, '#ffe080', 0.4);
        this.float(p.x, p.y - 48, '不落の構え！', '#ffe080');
        return true;
      // ---------------------------------------------------------------- 2段階の書の2段目
      case 'zantetsu':
        this.swing(0.3);
        for (const da of [-0.25, 0, 0.25]) {
          const a = aim + da;
          const vx = Math.cos(a);
          const vy = Math.sin(a);
          this.projectiles.push({ x: p.x + vx * 14, y: p.y + vy * 14, vx: vx * 400, vy: vy * 400, r: 16, dmg: 30 + this.atk * 1.6, life: 0.7, maxLife: 0.7, from: 'player', kind: 'wave', hits: [] });
        }
        this.ring(p.x + p.aimX * 16, p.y + p.aimY * 14, 8, 50, '#ff9a70', 0.3);
        this.shake = Math.max(this.shake, 0.15);
        return true;
      case 'meteorshot':
        this.swing(0.3);
        for (const da of [-0.32, -0.16, 0, 0.16, 0.32]) this.shootArrow(aim + da, 16 + this.atk * 1.2, 560, { pierce: true, tint: '#ffd84a', life: 0.7 });
        this.ring(p.x + p.aimX * 12, p.y + p.aimY * 12, 4, 30, '#ffd84a', 0.3);
        return true;
      case 'meteor': {
        const targets = this.visibleEnemies(LIGHT_R + 60).slice(0, 3);
        if (targets.length === 0) {
          this.float(p.x, p.y - 34, '近くに敵がいない', '#cccccc');
          return false;
        }
        this.swing(0.3);
        for (const e of targets) {
          for (let i = 0; i < 3; i++) this.effects.push({ type: 'fall', x: e.x + rand(-8, 8), y: e.y + rand(-4, 4), t: -rand(0, 0.12), dur: 0.25 });
          this.explode(e.x, e.y, 40 + this.mag * 1.6);
        }
        this.shake = 0.3;
        return true;
      }
      case 'judgment': {
        this.swing(0.3);
        this.ring(p.x, p.y, 10, 120, '#fff0a0', 0.5);
        this.ring(p.x, p.y, 6, 80, '#ffffff', 0.35);
        this.burst(p.x, p.y - 6, '#ffe890', 24, 140);
        this.shake = 0.25;
        for (const e of this.enemies) {
          if (!e.alive || dist(p.x, p.y, e.x, e.y) >= 120 + e.w / 2) continue;
          this.hitEnemy(e, 25 + this.stat('def') * 1.4 + this.atk * 0.5, p.x, p.y, 400);
          e.stun = Math.max(e.stun, 2);
        }
        return true;
      }
      case 'storm': {
        const targets = this.visibleEnemies(LIGHT_R + 120);
        if (targets.length === 0) {
          this.float(p.x, p.y - 34, '近くに敵がいない', '#cccccc');
          return false;
        }
        for (const e of targets) {
          this.lightning(e.x + rand(-20, 20), e.y - 220, e.x, e.y - 10);
          this.hitEnemy(e, 40 + this.mag * 1.5, e.x, e.y - 1, 80);
        }
        this.shake = 0.3;
        return true;
      }
    }
    return false;
  }

  private lightning(x1: number, y1: number, x2: number, y2: number) {
    const pts = [{ x: x1, y: y1 }];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push({ x: x1 + (x2 - x1) * t + rand(-10, 10), y: y1 + (y2 - y1) * t + rand(-10, 10) });
    }
    pts.push({ x: x2, y: y2 });
    this.effects.push({ type: 'bolt', x: x2, y: y2, t: 0, dur: 0.25, pts });
    this.burst(x2, y2, '#bfefff', 8, 80);
  }

  private explode(x: number, y: number, dmg: number) {
    this.ring(x, y, 8, 64, '#ffb030', 0.35);
    this.burst(x, y - 8, '#ff8030', 22, 140);
    this.burst(x, y - 8, '#ffe060', 10, 90);
    this.shake = 0.18;
    for (const e of this.enemies) {
      if (e.alive && dist(x, y, e.x, e.y) < 60 + e.w / 2) this.hitEnemy(e, dmg, x, y, 280);
    }
  }

  // ================================================================ 戦闘

  hitEnemy(e: Enemy, base: number, fx: number, fy: number, kb: number) {
    if (!e.alive) return;
    // 運が高いほど会心の一撃（1.5倍）が出やすい
    const crit = Math.random() < critRate(this.stat('luck')) + (this.stances.has('hawkeye') ? STANCE_BOOST : 0);
    const dmg = Math.max(1, Math.round(base * rand(0.9, 1.1) * (crit ? 1.5 : 1)));
    e.hp -= dmg;
    e.flash = 0.12;
    e.aggro = true;
    const d = Math.max(1, dist(fx, fy, e.x, e.y));
    const k = e.def.id === 'golem' ? kb * 0.25 : kb;
    e.kbx += ((e.x - fx) / d) * k;
    e.kby += ((e.y - fy) / d) * k;
    this.float(e.x + rand(-6, 6), e.y + e.h / 2 - e.def.height - hoverOf(e, this.time) - 4, crit ? `会心 ${dmg}` : String(dmg), crit ? '#ffe040' : '#ffffff');
    // 吸血の剣：当てるたびに体力が少し戻る
    const p = this.player;
    if (this.weaponEffect === 'drain' && p.hp > 0 && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 2);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    e.alive = false;
    this.data.exp += e.exp;
    this.float(e.x, e.y + e.h / 2 - e.def.height - hoverOf(e, this.time) - 16, `+${e.exp} EXP`, '#9fe870');
    this.burst(e.x, e.y - 8, e.def.color, 14, 90);
    const [g0, g1] = e.def.gold;
    const luck = this.stat('luck');
    const gold = Math.round((g0 + Math.random() * (g1 - g0)) * (1 + this.floor * 0.1) * goldMult(luck));
    this.pickups.push({ x: e.x, y: e.y, kind: 'gold', amount: gold, t: 0 });
    if (Math.random() < 0.05 * dropMult(luck)) {
      this.pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-6, 6), kind: Math.random() < 0.6 ? 'potion' : 'ether', amount: 1, t: 0 });
    }
    const oreRate = (e.def.id === 'golem' ? 0.4 : 0.06) * dropMult(luck);
    if (Math.random() < oreRate) {
      this.pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-6, 6), kind: 'ore', ore: rollOre(this.floor, Math.random()).id, amount: 1, t: 0 });
    }
    const mat = matOfEnemy(e.def.id);
    if (mat && Math.random() < matDropRate(e.def.id) * dropMult(luck)) {
      this.pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-6, 6), kind: 'mat', mat: mat.id, amount: 1, t: 0 });
    }
    // 骸骨の鎧：倒した敵の生気で体力が戻る
    if (this.armorEffect === 'vigor' && this.player.hp > 0 && this.player.hp < MAX_HP) {
      this.player.hp = Math.min(MAX_HP, this.player.hp + 3);
    }
    // 霊魂の杖：倒した敵の魂がMPになる
    if (this.weaponEffect === 'soul' && this.player.mp < MAX_MP) {
      this.player.mp = Math.min(MAX_MP, this.player.mp + 5);
      this.burst(e.x, e.y - 10, '#a8f4ff', 6, 50);
    }
    const cost = spCost(this.data.spBought);
    if (this.data.exp >= cost && this.data.exp - e.exp < cost) {
      this.ui.log('EXPが貯まった！ [K] スキルブックでSPに変換できる。', '#9fe870');
    }
  }

  /** from は体当たりしてきた敵（巨像の盾のトゲで反撃する） */
  private damagePlayer(base: number, sx: number, sy: number, from?: Enemy) {
    const p = this.player;
    if (p.invuln > 0) return;
    if (p.barrier > 0) {
      this.float(p.x, p.y - 34, '無効', '#c8a0ff');
      p.invuln = 0.3;
      return;
    }
    if (this.has('evade') && Math.random() < 0.2) {
      this.float(p.x, p.y - 34, 'かわした！', '#e8f4ff');
      this.effects.push({ type: 'after', x: p.x, y: p.y, t: 0, dur: 0.3, facing: p.facing, dir: p.dir });
      p.invuln = 0.4;
      return;
    }
    // 巨像の鎧：受けるダメージ -10%、吹き飛ばされない
    const heavy = this.armorEffect === 'heavy';
    const dmg = Math.max(1, Math.round(base * this.damageTaken * (heavy ? 0.9 : 1)));
    p.hp -= dmg;
    const sturdy = this.has('sturdy');
    p.invuln = sturdy ? 1.3 : 0.8;
    if (!sturdy && !heavy) {
      const d = Math.max(1, dist(sx, sy, p.x, p.y));
      p.kbx = ((p.x - sx) / d) * 260;
      p.kby = ((p.y - sy) / d) * 260;
    }
    this.shake = 0.2;
    this.float(p.x, p.y - 34, `-${dmg}`, '#ff6060');
    if (p.hp <= 0) return this.die();
    if (from && from.alive && this.weaponEffect === 'thorns') {
      this.burst(from.x, from.y - 10, '#60e0ff', 8, 80);
      this.hitEnemy(from, this.stat('def'), p.x, p.y, 240);
    }
    if (this.has('counter')) {
      this.ring(p.x, p.y, 8, 56, '#f0e8d8', 0.25);
      for (const e of this.enemies) {
        if (e.alive && dist(p.x, p.y, e.x, e.y) < 56 + e.w / 2) this.hitEnemy(e, 6 + this.stat('def') * 0.6, p.x, p.y, 260);
      }
    }
  }

  private updateEnemy(e: Enemy, dt: number) {
    const p = this.player;
    e.anim += dt;
    e.flash = Math.max(0, e.flash - dt);
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.max(0.001, Math.hypot(dx, dy));
    let mx = 0;
    let my = 0;

    if (e.stun > 0) {
      e.stun -= dt;
    } else {
      if (d < 210) e.aggro = true;
      else if (d > 400) e.aggro = false;
      if (e.aggro) {
        e.facing = dx > 0 ? 1 : -1;
        if (e.def.ranged) {
          if (d < 110) {
            mx = -dx / d;
            my = -dy / d;
          } else if (d > 170) {
            mx = dx / d;
            my = dy / d;
          }
          e.shootCd -= dt;
          if (e.shootCd <= 0 && d < 300) {
            e.shootCd = 2.2;
            this.projectiles.push({ x: e.x, y: e.y, vx: (dx / d) * 170, vy: (dy / d) * 170, r: 6, dmg: e.dmg, life: 3, maxLife: 3, from: 'enemy', kind: 'fireball' });
          }
        } else {
          mx = dx / d;
          my = dy / d;
        }
        if (e.def.id === 'bat') {
          mx += Math.sin(this.time * 8 + e.seed) * 0.8;
          my += Math.cos(this.time * 7 + e.seed) * 0.8;
        }
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) {
          e.wanderT = rand(1, 3);
          if (Math.random() < 0.4) {
            e.wx = e.wy = 0;
          } else {
            const a = Math.random() * Math.PI * 2;
            e.wx = Math.cos(a);
            e.wy = Math.sin(a);
          }
        }
        mx = e.wx * 0.5;
        my = e.wy * 0.5;
        if (mx !== 0) e.facing = mx > 0 ? 1 : -1;
      }
      // 見た目の向き。追跡中はプレイヤーの方、それ以外は進む方を向く。
      // 斜めのときに横と縦が入れ替わり続けないよう、今の向きを少し優先する
      const fx = e.aggro ? dx : mx;
      const fy = e.aggro ? dy : my;
      if (fx !== 0 || fy !== 0) {
        const ax = Math.abs(fx);
        const ay = Math.abs(fy);
        const vertical = e.dir === 'side' ? ay > ax * 1.3 : ay * 1.3 >= ax;
        e.dir = vertical ? (fy > 0 ? 'down' : 'up') : 'side';
      }
    }
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    moveBox(this.map, e, (mx * e.speed + e.kbx) * dt, (my * e.speed + e.kby) * dt);
    const decay = Math.min(1, dt * 8);
    e.kbx -= e.kbx * decay;
    e.kby -= e.kby * decay;

    if (e.stun <= 0 && Math.abs(e.x - p.x) < (e.w + p.w) / 2 - 2 && Math.abs(e.y - p.y) < (e.h + p.h) / 2 - 2) {
      this.damagePlayer(e.dmg, e.x, e.y, e);
    }
  }

  private separateEnemies() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i];
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = ((a.w + b.w) / 2) * 0.8;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          moveBox(this.map, a, (-dx / d) * push, (-dy / d) * push);
          moveBox(this.map, b, (dx / d) * push, (dy / d) * push);
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      let dead = pr.life <= 0;
      if (!dead && this.map.solidAt(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE))) dead = true;
      if (!dead && pr.from === 'player') {
        for (const e of this.enemies) {
          if (!e.alive || Math.abs(pr.x - e.x) >= e.w / 2 + pr.r || Math.abs(pr.y - e.y) >= e.h / 2 + pr.r + 4) continue;
          if (pr.hits) {
            // 貫通：同じ敵には一度だけ当たり、そのまま飛び続ける
            if (pr.hits.includes(e)) continue;
            pr.hits.push(e);
            this.hitEnemy(e, pr.dmg, pr.x - pr.vx, pr.y - pr.vy, 160);
            continue;
          }
          if (pr.kind !== 'bomb') this.hitEnemy(e, pr.dmg, pr.x - pr.vx, pr.y - pr.vy, 160);
          dead = true;
          break;
        }
      } else if (!dead && pr.from === 'enemy') {
        if (Math.abs(pr.x - p.x) < p.w / 2 + pr.r && Math.abs(pr.y - p.y) < p.h / 2 + pr.r) {
          if (this.reflectT > 0) {
            // 反射の盾：2倍の威力で跳ね返す
            pr.vx = -pr.vx * 1.3;
            pr.vy = -pr.vy * 1.3;
            pr.from = 'player';
            pr.dmg *= 2;
            pr.life = pr.maxLife;
            this.ring(p.x, p.y, 6, 26, '#ffe080', 0.2);
            this.float(p.x, p.y - 34, 'はね返した！', '#ffe080');
          } else {
            // 霊布の衣：飛び道具のダメージが半分
            this.damagePlayer(pr.dmg * (this.armorEffect === 'ward' ? 0.5 : 1), pr.x - pr.vx * 0.1, pr.y - pr.vy * 0.1);
            dead = true;
          }
        }
      }
      if (dead) {
        pr.life = -1;
        if (pr.kind === 'bomb') this.explode(pr.x, pr.y, pr.dmg);
        else this.burst(pr.x, pr.y - 10, pr.kind === 'fireball' ? '#ff8030' : pr.kind === 'wave' ? '#c8e0ff' : pr.kind === 'orb' ? '#d8b0ff' : '#d0d8e0', 5, 50);
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const it of this.pickups) {
      it.t += dt;
      const d = dist(p.x, p.y, it.x, it.y);
      if (it.t > 0.3 && d < 70) {
        const s = Math.min(d, 260 * dt);
        it.x += ((p.x - it.x) / Math.max(d, 0.01)) * s;
        it.y += ((p.y - it.y) / Math.max(d, 0.01)) * s;
      }
      if (it.t > 0.3 && d < 16) {
        it.t = -1;
        if (it.kind === 'gold') {
          const g = it.amount;
          this.data.gold += g;
          this.float(p.x, p.y - 34, `+${g}G`, '#ffd84a');
        } else if (it.kind === 'ore') {
          const ore = oreById(it.ore ?? 'iron');
          this.gainOre(ore.id, it.amount);
          this.float(p.x, p.y - 34, `+${it.amount} ${ore.name}`, ore.color[0]);
          this.ui.log(`${ore.name}を拾った！（${this.oreOf(ore.id)}個）`, ore.color[0]);
        } else if (it.kind === 'mat') {
          const m = matById(it.mat ?? 'jelly');
          this.data.mats[m.id] = this.matOf(m.id) + it.amount;
          this.float(p.x, p.y - 34, `+${it.amount} ${m.name}`, m.color[0]);
          this.ui.log(`${m.icon} ${m.name}を拾った！（${this.matOf(m.id)}個）`, m.color[0]);
        } else if (it.kind === 'potion') {
          this.data.potions += it.amount;
          this.ui.log('回復薬を拾った！');
        } else {
          this.data.ethers += it.amount;
          this.ui.log('エーテルを拾った！');
        }
      }
    }
    this.pickups = this.pickups.filter((it) => it.t >= 0);
  }

  private updateEffects(dt: number) {
    for (const ef of this.effects) {
      ef.t += dt;
      if (ef.type === 'particle') {
        ef.x += (ef.vx ?? 0) * dt;
        ef.y += (ef.vy ?? 0) * dt;
        ef.vy = (ef.vy ?? 0) + 120 * dt;
      }
    }
    this.effects = this.effects.filter((ef) => ef.t < ef.dur);
    if (this.flameT > 0 && Math.random() < 0.8) {
      const p = this.player;
      const a = Math.random() * Math.PI * 2;
      this.effects.push({ type: 'particle', x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 40, t: 0, dur: 0.5, vx: 0, vy: -80, color: Math.random() < 0.5 ? '#ff8030' : '#ffd040', size: 3 });
    }
    for (const f of this.floats) {
      f.t += dt;
      f.y -= 28 * dt;
    }
    this.floats = this.floats.filter((f) => f.t < f.dur);
  }

  private updateExplore() {
    const R = Math.ceil(LIGHT_R / TILE) + 1;
    const px = Math.floor(this.player.x / TILE);
    const py = Math.floor(this.player.y / TILE);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        this.map.explore(px + dx, py + dy);
      }
    }
  }

  private checkTraps() {
    const p = this.player;
    const k = this.map.key(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    if (!this.map.traps.has(k)) return;
    this.map.traps.delete(k);
    this.map.sprung.add(k);
    this.ui.log('罠を踏んでしまった！', '#ff8080');
    this.damagePlayer(10 + this.floor * 2, p.x, p.y - 1);
  }

  // ================================================================ 調べる

  private findInteract(): Interact | null {
    const p = this.player;
    // 宝箱と鉱脈：となり合っていても、いちばん近いものを調べる
    let best: Interact | null = null;
    let bestD = 40;
    for (const c of this.chests) {
      const d = dist(p.x, p.y, (c.tx + 0.5) * TILE, (c.ty + 0.5) * TILE);
      if (c.opened || d >= bestD) continue;
      bestD = d;
      best = { label: c.legendary ? '秘宝の箱を開ける' : c.locked ? '鍵付きの宝箱をこじ開ける' : '宝箱を開ける', act: () => this.openChest(c) };
    }
    for (const v of this.veins) {
      const d = dist(p.x, p.y, (v.tx + 0.5) * TILE, (v.ty + 0.5) * TILE);
      if (v.mined || d >= bestD) continue;
      bestD = d;
      best = { label: `${oreById(v.ore).name}の鉱脈を掘る`, act: () => this.mineVein(v) };
    }
    if (best) return best;
    // わが家の家具：家具の一番近い所までの距離で判定
    if (this.scene === 'home') {
      for (const f of this.furniture) {
        if (f.kind !== 'shelf' && f.kind !== 'bed') continue;
        const nx = Math.max(f.x * TILE, Math.min((f.x + f.w) * TILE, p.x));
        const ny = Math.max(f.y * TILE, Math.min((f.y + f.h) * TILE, p.y));
        if (dist(p.x, p.y, nx, ny) < 22) {
          return f.kind === 'shelf'
            ? { label: '本棚を見る', act: () => this.ui.showShelf() }
            : { label: 'ベッドで休む', act: () => this.rest('ベッドでひと休みした。') };
        }
      }
    }
    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor(p.y / TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = ptx + dx;
        const ty = pty + dy;
        if (dist(p.x, p.y, (tx + 0.5) * TILE, (ty + 0.5) * TILE) > 44) continue;
        switch (this.map.get(tx, ty)) {
          case T.SHOP_DOOR:
            return { label: '道具屋に入る', act: () => this.ui.showShop() };
          case T.SMITHY_DOOR:
            return { label: '武器防具屋に入る', act: () => this.ui.showSmithy() };
          case T.HOME_DOOR:
            return { label: '家に入る', act: () => this.goHome(true) };
          case T.HOME_EXIT:
            return { label: '外に出る', act: () => this.goTown(true, 'home') };
          case T.INN_DOOR:
            return { label: '宿屋に入る', act: () => this.ui.showInn() };
          case T.TEMPLE_DOOR:
            return { label: '神殿に入る', act: () => this.ui.showTemple() };
          case T.BANK_DOOR:
            return { label: '銀行に入る', act: () => this.ui.showBank() };
          case T.ENTRANCE:
            return { label: '遺跡に入る', act: () => this.ui.showEntrance() };
          case T.STAIRS_DOWN:
            return { label: '階段を降りる', act: () => this.descend() };
          case T.STAIRS_UP:
            return { label: '町へ戻る', act: () => this.goTown(true) };
        }
      }
    }
    return null;
  }

  private openChest(c: Chest) {
    c.opened = true;
    const cx = (c.tx + 0.5) * TILE;
    const cy = (c.ty + 0.5) * TILE;
    this.burst(cx, cy - 10, '#ffd84a', 16, 80);
    const ct = c.content;
    switch (ct.kind) {
      case 'gold': {
        const g = ct.amount;
        this.data.gold += g;
        this.ui.log(`${g} ゴールドを手に入れた！`, '#ffd84a');
        this.float(cx, cy - 30, `+${g}G`, '#ffd84a');
        break;
      }
      case 'potion':
        this.data.potions += ct.amount;
        this.ui.log(`回復薬を ${ct.amount} 個手に入れた！`);
        break;
      case 'ether':
        this.data.ethers += ct.amount;
        this.ui.log(`エーテルを ${ct.amount} 個手に入れた！`);
        break;
      case 'ore': {
        const ore = oreById(ct.ore);
        this.gainOre(ore.id, ct.amount);
        this.ui.log(`${ore.name}を ${ct.amount} 個手に入れた！（${this.oreOf(ore.id)}個）`, ore.color[0]);
        this.float(cx, cy - 30, `+${ct.amount} ${ore.name}`, ore.color[0]);
        break;
      }
      case 'book': {
        const b = bookById(ct.book);
        // ダンジョンで拾った本は呪われている
        this.pickUpCursed(b.id);
        this.effects.push({ type: 'icon', x: cx, y: cy, t: 0, dur: 1.6, color: CURSE_COLOR });
        this.ring(cx, cy, 6, 50, CURSE_COLOR, 0.5);
        this.burst(cx, cy - 10, '#5a2a7a', 14, 70);
        break;
      }
      case 'treasure': {
        this.ring(cx, cy, 6, 120, '#e0a0ff', 1);
        this.burst(cx, cy - 10, '#e0a0ff', 40, 160);
        this.data.cleared = true;
        this.ui.log(`伝説の秘宝『${TREASURE_NAME}』を手に入れた！`, '#e0a0ff');
        saveGame(this.data);
        this.ui.showClear();
        break;
      }
    }
  }

  // ================================================================ エフェクト補助

  private float(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, color, t: 0, dur: 0.9 });
  }

  private burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * speed;
      this.effects.push({ type: 'particle', x, y, t: 0, dur: rand(0.3, 0.6), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, color, size: Math.random() < 0.5 ? 2 : 3 });
    }
  }

  private ring(x: number, y: number, r0: number, r1: number, color: string, dur: number) {
    this.effects.push({ type: 'ring', x, y, t: 0, dur, r0, r1, color });
  }

  // ================================================================ カメラ

  private cameraTarget() {
    const mw = this.map.w * TILE;
    const mh = this.map.h * TILE;
    const vw = this.VW / this.zoom;
    const vh = this.VH / this.zoom;
    const tx = mw <= vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, this.player.x - vw / 2));
    const ty = mh <= vh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, this.player.y - 16 - vh / 2));
    return { tx, ty };
  }

  private snapCamera() {
    const { tx, ty } = this.cameraTarget();
    this.camX = tx;
    this.camY = ty;
  }

  private updateCamera(dt: number) {
    const { tx, ty } = this.cameraTarget();
    const k = Math.min(1, dt * 10);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  // ================================================================ 描画

  /** ワールド座標 → 画面（CSSピクセル）座標 */
  private toScreen(x: number, y: number, camX: number, camY: number) {
    return { sx: (x - camX) * this.zoom, sy: (y - camY) * this.zoom };
  }

  private render() {
    const ctx = this.ctx;
    const d = this.dpr;
    const z = this.zoom;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = this.scene === 'dungeon' ? '#050308' : this.scene === 'home' ? '#0e0905' : '#23401d';
    ctx.fillRect(0, 0, this.VW, this.VH);

    const camX = this.camX + (this.shake > 0 ? rand(-3, 3) : 0);
    const camY = this.camY + (this.shake > 0 ? rand(-3, 3) : 0);
    const view: View = { x0: camX, y0: camY, x1: camX + this.VW / z, y1: camY + this.VH / z };

    // ワールド
    const k = d * z;
    ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
    if (this.scene === 'home') {
      this.terrain.shelfColors = this.data.books.filter((b) => !this.data.carried.includes(b)).map((b) => bookById(b).color);
      this.terrain.cleared = this.data.cleared;
    }
    this.terrain.drawGround(ctx, view, this.time);
    this.drawTraps(view);
    for (const it of this.pickups) drawPickup(ctx, it.kind, it.x, it.y, this.time, it.ore ? oreById(it.ore).color : it.mat ? matById(it.mat).color : undefined);
    this.drawActors(view);
    this.drawProjectiles();
    this.drawEffects();

    // 暗闇と灯り
    if (this.scene === 'dungeon') this.drawDarkness(view, camX, camY);

    // 画面に重ねる表示
    ctx.setTransform(d, 0, 0, d, 0, 0);
    if (this.scene === 'town') this.drawLabels(camX, camY);
    if (this.detected) this.drawDetectMarkers(camX, camY);
    this.drawFloats(camX, camY);
    this.drawPrompt(camX, camY);
    if (this.scene === 'dungeon') this.drawMinimap();
    this.drawBanner();
  }

  private drawTraps(v: View) {
    const ctx = this.ctx;
    const m = this.map;
    const draw = (key: number, sprung: boolean) => {
      const tx = key % m.w;
      const ty = Math.floor(key / m.w);
      const cx = (tx + 0.5) * TILE;
      const cy = (ty + 0.5) * TILE;
      if (!m.isExplored(tx, ty) || cx < v.x0 - 32 || cx > v.x1 + 32 || cy < v.y0 - 32 || cy > v.y1 + 32) return;
      ctx.fillStyle = sprung ? '#3a3440' : 'rgba(200,70,70,0.22)';
      ctx.beginPath();
      ctx.roundRect(cx - 11, cy - 11, 22, 22, 3);
      ctx.fill();
      ctx.strokeStyle = sprung ? '#6a6274' : 'rgba(255,120,120,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const px = cx - 6 + i * 6;
          const py = cy - 5 + j * 6;
          if (sprung) {
            ctx.fillStyle = '#d8dce6';
            ctx.beginPath();
            ctx.moveTo(px - 2, py + 2);
            ctx.lineTo(px, py - 5);
            ctx.lineTo(px + 2, py + 2);
            ctx.fill();
          } else {
            ctx.fillStyle = 'rgba(255,140,140,0.7)';
            ellipsePath(ctx, px, py, 1.1, 1.1);
            ctx.fill();
          }
        }
      }
    };
    for (const key of m.sprung) draw(key, true);
    if (this.has('trapsense')) for (const key of m.traps) draw(key, false);
  }

  private drawActors(v: View) {
    const ctx = this.ctx;
    const p = this.player;
    const inView = (x: number, y: number, pad: number) => x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad * 2;
    const list: Sortable[] = this.terrain.objects(v, this.time);

    list.push({
      y: p.y + p.h / 2,
      draw: () => {
        const feet = p.y + p.h / 2;
        if (this.flameT > 0) {
          ctx.save();
          ctx.strokeStyle = `rgba(255,128,48,${0.35 + Math.sin(this.time * 20) * 0.1})`;
          ctx.lineWidth = 2;
          ellipsePath(ctx, p.x, p.y, 74, 50);
          ctx.stroke();
          ctx.restore();
        }
        if (this.sanctT > 0) {
          // 聖域：足元の光の輪
          ctx.save();
          ctx.globalAlpha = Math.min(1, this.sanctT) * (0.55 + Math.sin(this.time * 4) * 0.15);
          ctx.fillStyle = 'rgba(255,240,160,0.12)';
          ctx.strokeStyle = '#ffe890';
          ctx.lineWidth = 1.5;
          ellipsePath(ctx, p.x, p.y + 2, 70, 46);
          ctx.fill();
          ctx.stroke();
          ellipsePath(ctx, p.x, p.y + 2, 58, 38);
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
        }
        if (this.pinchOn) {
          // 窮地の書が発動中：足元から赤いオーラが立ちのぼる
          glow(ctx, p.x, feet - 18, 28, '#ff3030', 0.35 + Math.sin(this.time * 8) * 0.12);
        }
        if (this.ironwallT > 0) glow(ctx, p.x, feet - 20, 26, '#80b0ff', 0.4 + Math.sin(this.time * 6) * 0.1);
        // 2段階の書の状態：足もとにゆらめくオーラ
        for (const st of this.stances) {
          const c = STANCES[st].color;
          glow(ctx, p.x, feet - 14, 24, c, 0.28 + Math.sin(this.time * 4) * 0.08);
          if (Math.random() < 0.15) this.effects.push({ type: 'particle', x: p.x + rand(-10, 10), y: feet - rand(0, 8), t: 0, dur: rand(0.5, 0.9), vx: 0, vy: -40, color: c, size: 2 });
        }
        groundShadow(ctx, p.x, feet, 11, 4);
        const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
        ctx.save();
        if (blink) ctx.globalAlpha = 0.4;
        drawHunter(ctx, p.x, feet, {
          facing: p.facing,
          dir: p.dir,
          walk: p.anim * 17,
          moving: p.moving,
          attack: p.attackAnim > 0 ? 1 - p.attackAnim / p.attackDur : -1,
          time: this.time,
          weapon: this.data.weapon,
          weaponPlus: this.plusOf(this.data.weapon),
          armor: this.data.armor,
          wtype: this.weaponType,
        });
        ctx.restore();
        if (this.reflectT > 0) {
          ctx.save();
          ctx.strokeStyle = `rgba(255,224,128,${0.5 + Math.sin(this.time * 12) * 0.25})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 3]);
          ctx.lineDashOffset = -this.time * 30;
          ellipsePath(ctx, p.x, feet - 20, 22, 27);
          ctx.stroke();
          ctx.restore();
        }
        if (p.barrier > 0) {
          const gold = this.bulwarkT > 0;
          ctx.save();
          ctx.fillStyle = gold ? 'rgba(255,224,128,0.16)' : 'rgba(200,160,255,0.14)';
          ctx.strokeStyle = gold ? `rgba(255,230,140,${0.6 + Math.sin(this.time * 10) * 0.2})` : `rgba(210,175,255,${0.55 + Math.sin(this.time * 10) * 0.2})`;
          ctx.lineWidth = 1.5;
          ellipsePath(ctx, p.x, feet - 20, 20, 25);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      },
    });

    for (const e of this.enemies) {
      if (!inView(e.x, e.y, 60)) continue;
      list.push({
        y: e.y + e.h / 2,
        draw: () => {
          drawEnemy(ctx, e, this.time);
          // 攻撃を受けた瞬間は白く光る
          if (e.flash > 0) {
            const hw = Math.max(24, e.w + 6);
            const top = e.y + e.h / 2 - e.def.height - 30;
            drawWhite(ctx, e.x - hw, top, hw * 2, e.def.height + 36, 0.75, (c) => drawEnemy(c, e, this.time));
          }
          const top = e.y + e.h / 2 - e.def.height - hoverOf(e, this.time);
          if (e.stun > 0) {
            ctx.fillStyle = '#ffe060';
            for (let i = 0; i < 3; i++) {
              const a = this.time * 5 + (i * Math.PI * 2) / 3;
              star(ctx, e.x + Math.cos(a) * 9, top - 3 + Math.sin(a) * 2.5, 2.4);
            }
          }
          if (e.hp < e.maxHp) {
            const w = Math.max(22, e.w);
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(e.x - w / 2 - 0.8, top - 8.8, w + 1.6, 4.2);
            ctx.fillStyle = '#e04040';
            ctx.fillRect(e.x - w / 2, top - 8, (w * Math.max(0, e.hp)) / e.maxHp, 2.6);
          }
        },
      });
    }

    for (const c of this.chests) {
      const cx = (c.tx + 0.5) * TILE;
      const cy = (c.ty + 0.5) * TILE + 9;
      if (this.scene === 'dungeon' && !this.map.isExplored(c.tx, c.ty)) continue;
      if (!inView(cx, cy, 40)) continue;
      list.push({ y: cy, draw: () => drawChest(ctx, cx, cy, c.legendary ? 'legend' : c.locked ? 'locked' : 'normal', c.opened, this.time) });
    }

    for (const v of this.veins) {
      const vx = (v.tx + 0.5) * TILE;
      const vy = (v.ty + 0.5) * TILE + 8;
      if (!this.map.isExplored(v.tx, v.ty) || !inView(vx, vy, 40)) continue;
      const ore = oreById(v.ore);
      list.push({ y: vy, draw: () => drawOreVein(ctx, vx, vy, ore.color, v.mined ? 0 : v.hits, this.time) });
    }

    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.draw(ctx);
  }

  private drawProjectiles() {
    const ctx = this.ctx;
    for (const pr of this.projectiles) {
      if (pr.kind === 'arrow' || pr.kind === 'bomb') {
        groundShadow(ctx, pr.x, pr.y + 2, 5, 1.6, 0.25);
        drawArrow(ctx, pr.x, pr.y - 16, Math.atan2(pr.vy, pr.vx), pr.tint, pr.kind === 'bomb', this.time);
      } else if (pr.kind === 'orb') {
        groundShadow(ctx, pr.x, pr.y + 2, 5, 1.6, 0.2);
        drawOrb(ctx, pr.x, pr.y - 16, this.time);
      } else if (pr.kind === 'wave') {
        drawSlashWave(ctx, pr.x, pr.y - 16, Math.atan2(pr.vy, pr.vx), pr.life / pr.maxLife);
      } else {
        groundShadow(ctx, pr.x, pr.y + 2, 6, 2, 0.2);
        drawFireball(ctx, pr.x, pr.y - 16, pr.vx, pr.vy, this.time);
      }
    }
  }

  private drawEffects() {
    const ctx = this.ctx;
    for (const ef of this.effects) {
      const k = ef.t / ef.dur;
      ctx.save();
      switch (ef.type) {
        case 'slash': {
          // 三日月形の斬撃の軌跡
          const a = ef.ang ?? 0;
          const sc = ef.size ?? 1;
          const cx = ef.x - Math.cos(a) * 10 * sc;
          const cy = ef.y - 16 - Math.sin(a) * 8 * sc;
          const sweep = 1.3;
          const s0 = a - sweep + k * 0.5;
          const s1 = a + sweep * (0.3 + k * 0.7);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(cx, cy, 25 * sc, s0, s1);
          ctx.arc(cx + Math.cos(a) * 5 * sc, cy + Math.sin(a) * 5 * sc, 19 * sc, s1, s0, true);
          ctx.closePath();
          ctx.fill();
          glow(ctx, cx + Math.cos(a) * 20 * sc, cy + Math.sin(a) * 20 * sc, 16 * sc, '#c8e0ff', 0.4 * (1 - k));
          break;
        }
        case 'ring': {
          const r = (ef.r0 ?? 0) + ((ef.r1 ?? 0) - (ef.r0 ?? 0)) * (1 - (1 - k) ** 2);
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = ef.color ?? '#fff';
          ctx.lineWidth = 2.5;
          ellipsePath(ctx, ef.x, ef.y, r, r * 0.7);
          ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.25;
          ctx.lineWidth = 7;
          ctx.stroke();
          break;
        }
        case 'particle': {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = ef.color ?? '#fff';
          ellipsePath(ctx, ef.x, ef.y - 6, (ef.size ?? 2) * 0.7, (ef.size ?? 2) * 0.7);
          ctx.fill();
          break;
        }
        case 'bolt': {
          const pts = ef.pts ?? [];
          ctx.globalAlpha = 1 - k;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const [w, c] of [
            [7, 'rgba(90,200,255,0.35)'],
            [3, '#8ad8ff'],
            [1.2, '#ffffff'],
          ] as const) {
            ctx.strokeStyle = c;
            ctx.lineWidth = w;
            ctx.beginPath();
            pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
            ctx.stroke();
          }
          break;
        }
        case 'after':
        {
          // 残像：白く光る姿だけを描く
          const fy = ef.y + this.player.h / 2;
          drawWhite(ctx, ef.x - 34, fy - 56, 68, 62, 0.45 * (1 - k), (c) =>
            drawHunter(c, ef.x, fy, { facing: ef.facing ?? 1, dir: ef.dir, walk: 0, moving: false, attack: -1, time: this.time, weapon: this.data.weapon, weaponPlus: this.plusOf(this.data.weapon), armor: this.data.armor, wtype: this.weaponType }),
            '#f4f8ff',
          );
          break;
        }
        case 'fall': {
          // 空から降ってくる矢（t が負のあいだは出番待ち）
          if (ef.t < 0) break;
          const lift = 170 * (1 - k);
          ctx.globalAlpha = Math.min(1, (1 - k) * 3);
          drawArrow(ctx, ef.x, ef.y - 12 - lift, Math.PI / 2, undefined, false, this.time);
          if (k > 0.8) glow(ctx, ef.x, ef.y - 6, 10, '#ffffff', 0.4);
          break;
        }
        case 'icon':
          ctx.globalAlpha = Math.min(1, (1 - k) * 2);
          drawBook(ctx, ef.x, ef.y - 40 - k * 30, ef.color ?? '#c8a030', 18);
          break;
        case 'smoke': {
          const r = (ef.r0 ?? 10) + ((ef.r1 ?? 30) - (ef.r0 ?? 10)) * k;
          ctx.globalAlpha = 0.55 * (1 - k);
          const g = ctx.createRadialGradient(ef.x, ef.y - 10, 0, ef.x, ef.y - 10, r);
          g.addColorStop(0, ef.color ?? '#ccc');
          g.addColorStop(1, 'rgba(200,200,210,0)');
          ctx.fillStyle = g;
          ellipsePath(ctx, ef.x, ef.y - 10, r, r);
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }
  }

  /** 暗闇を作り、灯りの部分だけ切り抜いて重ねる */
  private drawDarkness(v: View, camX: number, camY: number) {
    const p = this.player;
    const lights: Light[] = [{ x: p.x, y: p.y - 10, r: LIGHT_R }, ...this.terrain.lights(v)];
    for (const pr of this.projectiles) {
      if (pr.kind === 'fireball') lights.push({ x: pr.x, y: pr.y - 16, r: 60, tint: 'rgba(255,120,40,0.2)' });
      if (pr.kind === 'orb') lights.push({ x: pr.x, y: pr.y - 16, r: 50, tint: 'rgba(190,140,255,0.2)' });
    }
    if (this.sanctT > 0) lights.push({ x: this.player.x, y: this.player.y, r: 120, tint: 'rgba(255,230,140,0.15)' });
    for (const ef of this.effects) {
      if (ef.type === 'ring' && ef.color === '#ffb030') lights.push({ x: ef.x, y: ef.y, r: 140 * (1 - ef.t / ef.dur), tint: 'rgba(255,160,60,0.25)' });
      if (ef.type === 'bolt') lights.push({ x: ef.x, y: ef.y, r: 120 * (1 - ef.t / ef.dur), tint: 'rgba(140,210,255,0.25)' });
    }
    if (this.flameT > 0) lights.push({ x: p.x, y: p.y, r: 150, tint: 'rgba(255,130,50,0.14)' });
    for (const c of this.chests) if (c.legendary && !c.opened) lights.push({ x: (c.tx + 0.5) * TILE, y: (c.ty + 0.5) * TILE, r: 110, tint: 'rgba(200,130,255,0.18)' });

    const g = this.darkCtx;
    const kd = this.zoom * this.dpr * this.darkScale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.dark.width, this.dark.height);
    g.fillStyle = 'rgba(4,2,10,0.94)';
    g.fillRect(0, 0, this.dark.width, this.dark.height);
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const sx = (l.x - camX) * kd;
      const sy = (l.y - camY) * kd;
      const r = l.r * kd;
      if (r <= 0.5 || sx < -r || sy < -r || sx > this.dark.width + r || sy > this.dark.height + r) continue;
      const gr = g.createRadialGradient(sx, sy, r * 0.05, sx, sy, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.45, 'rgba(0,0,0,0.85)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    const ctx = this.ctx;
    const k = this.zoom * this.dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.dark, 0, 0, this.canvas.width, this.canvas.height);
    // 灯りの色味
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.tint) continue;
      const sx = (l.x - camX) * k;
      const sy = (l.y - camY) * k;
      const r = l.r * k * 0.8;
      if (r <= 1) continue;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, l.tint);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  private drawLabels(camX: number, camY: number) {
    const ctx = this.ctx;
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const { sx, sy } = this.toScreen(l.x, l.y, camX, camY);
      const w = ctx.measureText(l.text).width + 22;
      ctx.fillStyle = 'rgba(40,24,12,0.88)';
      ctx.beginPath();
      ctx.roundRect(sx - w / 2, sy - 13, w, 26, 5);
      ctx.fill();
      ctx.strokeStyle = '#d8b060';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffe8b0';
      ctx.fillText(l.text, sx, sy + 1);
    }
    ctx.textBaseline = 'alphabetic';
  }

  private drawDetectMarkers(camX: number, camY: number) {
    const ctx = this.ctx;
    const pulse = 0.65 + Math.sin(this.time * 5) * 0.3;
    const marker = (x: number, y: number, color: string) => {
      const { sx, sy } = this.toScreen(x, y, camX, camY);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 10);
      ctx.lineTo(sx + 7, sy);
      ctx.lineTo(sx, sy + 10);
      ctx.lineTo(sx - 7, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    for (const c of this.chests) if (!c.opened) marker((c.tx + 0.5) * TILE, c.ty * TILE - 14, '#ffd84a');
    const m = this.map;
    for (let i = 0; i < m.tiles.length; i++) {
      if (m.tiles[i] === T.STAIRS_DOWN) marker(((i % m.w) + 0.5) * TILE, Math.floor(i / m.w) * TILE - 6, '#7ad0ff');
    }
  }

  private drawFloats(camX: number, camY: number) {
    const ctx = this.ctx;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    for (const f of this.floats) {
      const { sx, sy } = this.toScreen(f.x, f.y, camX, camY);
      ctx.globalAlpha = Math.min(1, (1 - f.t / f.dur) * 2);
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  private drawPrompt(camX: number, camY: number) {
    if (!this.interact || this.ui.modalOpen || !this.started) return;
    const ctx = this.ctx;
    const p = this.player;
    const { sx, sy: base } = this.toScreen(p.x, p.y - 54, camX, camY);
    const sy = base + Math.sin(this.time * 4) * 2;
    const text = `[E] ${this.interact.label}`;
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(20,14,26,0.88)';
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, sy - 16, w, 24, 5);
    ctx.fill();
    ctx.strokeStyle = '#d8b060';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, sx, sy + 1);
  }

  private drawMinimap() {
    const ctx = this.ctx;
    const m = this.map;
    const s = 3;
    const mw = m.w * s;
    const mh = m.h * s;
    const ox = this.VW - mw - 14;
    const oy = 14;
    ctx.fillStyle = 'rgba(10,6,16,0.72)';
    ctx.beginPath();
    ctx.roundRect(ox - 6, oy - 6, mw + 12, mh + 12, 6);
    ctx.fill();
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const t = m.get(x, y);
        const explored = m.isExplored(x, y);
        if (t === T.STAIRS_DOWN && (explored || this.detected)) ctx.fillStyle = '#7ad0ff';
        else if (!explored) continue;
        else if (t === T.WALL) ctx.fillStyle = '#433a52';
        else if (t === T.STAIRS_UP) ctx.fillStyle = '#f0e0b0';
        else ctx.fillStyle = '#8a8098';
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
      }
    }
    for (const c of this.chests) {
      if (c.opened || !(this.detected || m.isExplored(c.tx, c.ty))) continue;
      ctx.fillStyle = c.legendary ? '#e0a0ff' : '#ffd84a';
      ctx.fillRect(ox + c.tx * s - 1, oy + c.ty * s - 1, s + 2, s + 2);
    }
    for (const v of this.veins) {
      if (v.mined || !m.isExplored(v.tx, v.ty)) continue;
      ctx.fillStyle = oreById(v.ore).color[1];
      ctx.fillRect(ox + v.tx * s, oy + v.ty * s, s, s);
    }
    if (Math.floor(this.time * 4) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + (this.player.x / TILE) * s - 2, oy + (this.player.y / TILE) * s - 2, 4, 4);
    }
  }

  private drawBanner() {
    if (this.bannerT <= 0 || !this.started) return;
    const ctx = this.ctx;
    ctx.globalAlpha = Math.min(1, this.bannerT);
    ctx.font = `bold 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0f08';
    const y = this.VH * 0.24;
    ctx.strokeText(this.bannerText, this.VW / 2, y);
    ctx.fillStyle = '#ffe8b0';
    ctx.fillText(this.bannerText, this.VW / 2, y);
    ctx.globalAlpha = 1;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
