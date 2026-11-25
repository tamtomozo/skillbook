import type { Game } from './game';
import type { Input } from './input';
import { MAX_HP, MAX_MP } from './constants';
import { FINAL_FLOOR } from './map';
import { BOOKS, BOOK_KIND_NAME, CURSED_NAME, CURSE_COLOR, CURSE_POWER, SCHOOL_WEAPON, SKILLS, STANCES, STATS, stanceText, STAT_ICON, STAT_NAME, TREASURE_NAME, bookById, bookMaxLv, bookSummary, bookTag, luckText, pinchValueText, lvUpCost, pinchText, purifyPrice, sellPrice, spSpent, type BookKind, type Stat } from './skills';
import { HOTBAR_SIZE, MAX_CARRY, hasSave, spCost, type CursedBook } from './state';
import type { BookDef } from './skills';
import { ARMORS, ARMOR_EFFECT_TEXT, MATS, MAX_PLUS, ORES, WEAPONS, WEAPON_EFFECT_TEXT, WEAPON_TYPE_ICON, WEAPON_TYPE_NAME, armorById, armorDef, damageRate, eqName, eqSellPrice, forgeCost, forgeOre, matById, oreById, weaponById, weaponStatText, type Recipe } from './equipment';

type SmithyTab = 'shop' | 'forge' | 'craft' | 'sell';

type ModalKind = 'title' | 'book' | 'shop' | 'inn' | 'entrance' | 'help' | 'death' | 'clear' | 'shelf' | 'smithy' | 'temple';

const CONTROLS = `
<table class="ctrl">
  <tr><td>WASD / 矢印</td><td>移動</td></tr>
  <tr><td>Space / J</td><td>攻撃（長押しで連続攻撃）</td></tr>
  <tr><td>1 〜 5</td><td>ホットバーのスキルを使う</td></tr>
  <tr><td>E / Enter</td><td>調べる・宝箱・階段・お店</td></tr>
  <tr><td>K / Tab</td><td>スキルブックを開く</td></tr>
  <tr><td>Q / R</td><td>回復薬 / エーテルを使う</td></tr>
  <tr><td>Esc</td><td>ヘルプ・画面を閉じる</td></tr>
</table>`;

const CHECKPOINTS = [1, 4, 7];

export class UI {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private mpFill: HTMLElement;
  private mpText: HTMLElement;
  private locEl: HTMLElement;
  private expEl: HTMLElement;
  private spEl: HTMLElement;
  private goldEl: HTMLElement;
  private slots: { root: HTMLElement; icon: HTMLElement; cost: HTMLElement; cd: HTMLElement }[] = [];
  private potionEl: HTMLElement;
  private etherEl: HTMLElement;
  private logEl: HTMLElement;
  private modal: HTMLElement;

  private kind: ModalKind | null = null;
  private closable = true;
  private onAct: ((act: string, arg: string) => void) | null = null;
  private bookSel = '';
  /** 神殿で最後に浄化した本（正体を見せる）と、それが予備になったか */
  private revealed = '';
  private revealedSpare = false;
  /** 道具屋の「買う／売る」 */
  private shopTab: 'buy' | 'sell' = 'buy';
  /** 売るボタンを一度押した本（もう一度押すと売る） */
  private sellConfirm = '';
  private statEls: Record<Stat, HTMLElement>;
  private pinchEl: HTMLElement;
  private stanceEl: HTMLElement;
  private last = new WeakMap<HTMLElement, Record<string, string>>();

  constructor(private game: Game, root: HTMLElement) {
    const slotHtml = Array.from(
      { length: HOTBAR_SIZE },
      (_, i) => `<div class="slot skill"><span class="key">${i + 1}</span><span class="icon"></span><span class="cost"></span><div class="cd"></div></div>`,
    ).join('');
    root.innerHTML = `
      <div class="hud">
        <div class="name"><span>トレジャーハンター</span><span class="loc"></span></div>
        <div class="bar hp"><div class="fill"></div><span class="lbl">HP</span><span class="txt"></span></div>
        <div class="bar mp"><div class="fill"></div><span class="lbl">MP</span><span class="txt"></span></div>
        <div class="stats"><span class="exp"></span><span class="sp"></span><span class="gold"></span></div>
        <div class="params"><span class="pa atk"></span><span class="pa mag"></span><span class="pa def"></span><span class="pa luck"></span></div>
        <div class="pinch"></div>
        <div class="stance"></div>
      </div>
      <div class="hotbar">
        ${slotHtml}
        <div class="slot item sep"><span class="key">Q</span><span class="icon">🧪</span><span class="cnt potions"></span></div>
        <div class="slot item"><span class="key">R</span><span class="icon">💧</span><span class="cnt ethers"></span></div>
      </div>
      <div class="log"></div>
      <div class="help">[K] スキルブック　[Esc] ヘルプ</div>
      <div class="modal hidden"></div>`;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.hpFill = q('.bar.hp .fill');
    this.hpText = q('.bar.hp .txt');
    this.mpFill = q('.bar.mp .fill');
    this.mpText = q('.bar.mp .txt');
    this.locEl = q('.hud .loc');
    this.expEl = q('.stats .exp');
    this.spEl = q('.stats .sp');
    this.goldEl = q('.stats .gold');
    this.statEls = { atk: q('.params .atk'), mag: q('.params .mag'), def: q('.params .def'), luck: q('.params .luck') };
    this.pinchEl = q('.hud .pinch');
    this.stanceEl = q('.hud .stance');
    this.potionEl = q('.cnt.potions');
    this.etherEl = q('.cnt.ethers');
    this.logEl = q('.log');
    this.modal = q('.modal');
    root.querySelectorAll<HTMLElement>('.slot.skill').forEach((el) => {
      this.slots.push({ root: el, icon: el.querySelector('.icon')!, cost: el.querySelector('.cost')!, cd: el.querySelector('.cd')! });
    });
    this.modal.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || (el instanceof HTMLButtonElement && el.disabled)) return;
      this.onAct?.(el.dataset.act ?? '', el.dataset.arg ?? '');
    });
  }

  // ================================================================ HUD

  private put(el: HTMLElement, key: string, val: string, apply: (v: string) => void) {
    let rec = this.last.get(el);
    if (!rec) {
      rec = {};
      this.last.set(el, rec);
    }
    if (rec[key] !== val) {
      rec[key] = val;
      apply(val);
    }
  }

  private text(el: HTMLElement, v: string) {
    this.put(el, 'text', v, (s) => (el.textContent = s));
  }

  private cls(el: HTMLElement, name: string, on: boolean) {
    this.put(el, 'cls:' + name, String(on), () => el.classList.toggle(name, on));
  }

  update() {
    const g = this.game;
    const d = g.data;
    const p = g.player;
    this.put(this.hpFill, 'w', `${((Math.max(0, p.hp) / MAX_HP) * 100).toFixed(1)}%`, (v) => (this.hpFill.style.width = v));
    this.put(this.mpFill, 'w', `${((p.mp / MAX_MP) * 100).toFixed(1)}%`, (v) => (this.mpFill.style.width = v));
    this.text(this.hpText, `${Math.ceil(Math.max(0, p.hp))} / ${MAX_HP}`);
    this.text(this.mpText, `${Math.floor(p.mp)} / ${MAX_MP}`);
    this.text(this.locEl, g.scene === 'town' ? 'はじまりの町' : g.scene === 'home' ? 'わが家' : `地下 ${g.floor} 階`);
    const cost = spCost(d.spBought);
    this.text(this.expEl, `EXP ${d.exp}/${cost}`);
    this.cls(this.expEl, 'ready', d.exp >= cost);
    this.text(this.spEl, `SP ${d.sp}`);
    this.cls(this.spEl, 'ready', d.sp > 0);
    this.text(this.goldEl, `${d.gold} G`);
    this.text(this.potionEl, `×${d.potions}`);
    this.text(this.etherEl, `×${d.ethers}`);
    for (const k of STATS) {
      const v = g.stat(k);
      this.text(this.statEls[k], `${STAT_ICON[k]} ${STAT_NAME[k]} ${v}`);
      this.cls(this.statEls[k], 'up', v > g.baseStat(k));
    }
    const pinch = g.activePinch();
    this.text(this.pinchEl, pinch.length ? `🔥 窮地 発動中：${pinch.map((b) => b.name.replace('の書', '')).join('・')}` : '');
    this.cls(this.pinchEl, 'on', pinch.length > 0);
    const stances = [...g.stances].map((id) => STANCES[id]);
    this.text(this.stanceEl, stances.map((st) => `${st.icon} ${st.name}（${stanceText(st)}）`).join('　'));
    this.cls(this.stanceEl, 'on', stances.length > 0);

    this.slots.forEach((s, i) => {
      const id = d.hotbar[i];
      const sk = id ? SKILLS[id] : null;
      this.text(s.icon, sk ? sk.icon : '');
      const mp = sk ? g.mpCost(sk.id) : 0;
      this.text(s.cost, sk ? String(mp) : '');
      const block = sk ? g.skillBlock(sk.id) : null;
      const away = !!block;
      this.put(s.root, 'title', sk ? (block ? `${sk.name}（${block}）` : `${sk.name} (MP ${mp})`) : '空きスロット', (v) => (s.root.title = v));
      this.cls(s.root, 'away', away);
      const cd = sk && sk.cd > 0 ? (g.cooldowns[sk.id] ?? 0) / sk.cd : 0;
      this.put(s.cd, 'h', `${(cd * 100).toFixed(0)}%`, (v) => (s.cd.style.height = v));
      this.cls(s.root, 'nomp', !!sk && p.mp < mp);
      this.cls(s.root, 'empty', !sk);
    });
  }

  log(msg: string, color = '#f3ead8') {
    const div = document.createElement('div');
    div.className = 'msg';
    div.style.color = color;
    div.textContent = msg;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 6) this.logEl.firstElementChild?.remove();
    setTimeout(() => div.classList.add('fade'), 7000);
    setTimeout(() => div.remove(), 8000);
  }

  // ================================================================ モーダル

  get modalOpen(): boolean {
    return this.kind !== null;
  }

  private open(kind: ModalKind, html: string, onAct: (act: string, arg: string) => void, closable = true) {
    this.kind = kind;
    this.closable = closable;
    this.onAct = onAct;
    this.modal.innerHTML = html;
    this.modal.classList.remove('hidden');
  }

  close() {
    this.kind = null;
    this.onAct = null;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  handleKeys(inp: Input) {
    if (!this.kind) return;
    if (this.closable && inp.pressed('Escape')) this.close();
    else if (this.kind === 'book' && inp.pressed('KeyK', 'Tab')) this.close();
  }

  showTitle() {
    this.open(
      'title',
      `<div class="panel title-panel">
        <div class="logo"><span class="logo-icon">📖</span>スキルブック・ハンター</div>
        <p class="sub">伝説の秘宝『${TREASURE_NAME}』が眠る古代遺跡。<br>スキルブックを集めて腕を磨き、地下${FINAL_FLOOR}階の最深部を目指せ！</p>
        <div class="btns">
          <button data-act="new">はじめから</button>
          <button data-act="cont" ${hasSave() ? '' : 'disabled'}>つづきから</button>
        </div>
        ${CONTROLS}
      </div>`,
      (act) => {
        if (act === 'new') {
          if (hasSave() && !confirm('セーブデータを上書きして、最初から始めますか？')) return;
          this.close();
          this.game.newGame();
        } else if (act === 'cont') {
          this.close();
          this.game.continueGame();
        }
      },
      false,
    );
  }

  showHelp() {
    this.open(
      'help',
      `<div class="panel help-panel">
        <div class="phead"><h2>❔ 遊び方</h2><button class="x" data-act="close">✕</button></div>
        ${CONTROLS}
        <ul class="tips">
          <li><b>スキルブック</b>は3系統。<b>SP</b>を使って本の<b>レベル</b>を上げると効果が強くなる。
            <br>・<b>パラメタの書</b>（剛力・叡智・堅守・幸運）：レベルごとに攻撃力・魔力・防御力・運が上がる。
            <br>・<b>技の書</b>（剣技・弓術・魔術・盾術）：決まったレベルで技を覚える。<b>剣の技は剣、弓の技は弓、魔術は杖、盾の技は盾</b>を装備しているときだけ使える。アクティブな技はホットバー(1〜5)にセットして使う。
            <br>・<b>窮地の書</b>：体力が減ったときに発動し、パラメタを上げたり、防御力を攻撃力に回したりする。
            <br>・<b>2段階の書</b>（地下5階から宝箱で見つかる）：1段目の技で「剣気」などの<b>状態</b>に入ると、<b>そのフロアにいる間</b>パラメタが少し上がり、2段目の大技が何度でも使えるようになる。階段を降りたり町へ戻ったりすると状態は解ける。</li>
          <li><b>攻撃力</b>は通常攻撃と剣・弓・盾の技、<b>魔力</b>は杖の攻撃と魔術の威力を上げる。<b>防御力</b>が高いほど受けるダメージが減り（防御力50で半分）、盾の技の威力も上がる。<b>運</b>が高いと会心の一撃（ダメージ1.5倍）が出やすくなり、敵がアイテムやゴールドを多く落とす。</li>
          <li><b>SP</b>は敵を倒して得た<b>経験値(EXP)</b>を変換して獲得する。変換するたびに必要EXPは増えていく。</li>
          <li>初級・中級の書は<b>道具屋</b>で買える（中級は地下3階に到達すると入荷）。上級の書と窮地の書は<b>ダンジョンの宝箱</b>から見つかる。</li>
          <li>本は手に入れた時点では<b>レベル0（効果なし）</b>。SPでレベルを上げると効果が出る。</li>
          <li>宝箱で拾った本は<b>呪われていて</b>、正体が分からず使えない。町の<b>神殿</b>でゴールドを払って浄化すると、正体が分かり使えるようになる。呪われた本はかばんの枠を使わない。</li>
          <li>宝箱からは持っている本と<b>同じ本</b>が出ることもある。同じ本は<b>予備</b>になり、<b>道具屋の「本を売る」</b>で売れる。使っている本も売れる（上げるのに使ったSPは全部戻り、その本の技は忘れる）。</li>
          <li>持ち歩けるスキルブックは<b>3冊まで</b>。残りは<b>わが家の本棚</b>にしまい、家で入れ替える。本棚にある本のスキルは、覚えていても使えず、レベルも上げられない。</li>
          <li>体力・MPの上限は<b>100で固定</b>。スキルブックと装備で強くなろう。</li>
          <li><b>武器防具屋</b>では武器（剣・弓・杖・盾）と鎧を売っている。剣・弓は攻撃力、杖は魔力、盾と鎧は防御力を上げる。通常攻撃は、剣なら斬る、弓なら矢、杖なら魔力の弾、盾なら盾で殴る。深い階に到達すると品ぞろえが増える。店の<b>鍛冶場</b>では、代金と<b>鉱石</b>で持っている装備を最大+5まで鍛えられる。<b>装備を売る</b>タブでは、使わない装備を買い取ってもらえる（値段と鍛えた代金の合計の半額。装備中の品は売れない）。鉱石は遺跡の壁ぎわの鉱脈を [E] で3回たたいて掘るほか、敵（特にゴーレム）や宝箱からも手に入る。</li>
          <li>魔物は倒すと、ときどき<b>素材</b>（スライムゼリー・コウモリの翼・ゴブリンの牙など）を落とす。武器防具屋の<b>装備作成</b>タブで、素材と鉱石から<b>店では買えない特別な武器と防具</b>を作れる。作った装備には追加効果がある。</li>
          <li>宿屋で休むと全回復＆セーブ。倒れると所持金の半分を失って町へ戻される。</li>
        </ul>
        <div class="btns"><button data-act="close">閉じる</button></div>
      </div>`,
      () => this.close(),
    );
  }

  // ---------------------------------------------------------------- スキルブック

  private skillCard(id: string): string {
    const s = SKILLS[id];
    const d = this.game.data;
    const learned = d.learned.includes(id);
    const carried = this.game.isCarried(this.bookSel);
    const block = this.game.skillBlock(id);
    const mp = this.game.mpCost(id);
    const meta = s.kind === 'active' ? `消費MP ${mp}${mp < s.mp ? `（元 ${s.mp}）` : ''}・CT ${s.cd}秒` : '常時発動';
    let act: string;
    if (!learned) {
      act = `<span class="lvreq">本が Lv${s.lv} に<br>なると覚える</span>`;
    } else if (s.kind === 'active') {
      const btns = Array.from(
        { length: HOTBAR_SIZE },
        (_, i) => `<button class="sb ${d.hotbar[i] === id ? 'on' : ''}" data-act="slot" data-arg="${id}:${i}" title="スロット${i + 1}にセット">${i + 1}</button>`,
      ).join('');
      act = `<div class="slotlbl">${block ?? 'セット先'}</div><div class="slots">${btns}</div>`;
    } else {
      act = block ? `<span class="lock">習得済み<br>（${block.replace('ので使えない', 'ので無効')}）</span>` : `<span class="done">習得済み</span>`;
    }
    return `
      <div class="skill ${learned ? 'learned' : 'unlearned'} ${carried && !(learned && block) ? '' : 'shelved'}">
        <div class="sicon">${s.icon}</div>
        <div class="sinfo">
          <div class="sname"><span class="slv">Lv${s.lv}</span>${s.name}<span class="tag ${s.kind}">${s.kind === 'active' ? 'アクティブ' : 'パッシブ'}</span></div>
          <div class="smeta">${meta}</div>
          <div class="sdesc">${s.desc}</div>
        </div>
        <div class="sact">${act}</div>
      </div>`;
  }

  /** パラメタの書・窮地の書の、いまのレベルでの効果 */
  private bookEffect(b: BookDef, lv = this.game.bookLv(b.id)): string {
    if (b.stat) return `${STAT_ICON[b.stat.key]} ${STAT_NAME[b.stat.key]} +${b.stat.perLv * lv}`;
    if (b.pinch) return `🔥 ${pinchText(b, lv)}`;
    return '';
  }

  /** パラメタの書・窮地の書の詳細（技の書のスキルカードの代わり） */
  private effectCard(b: BookDef): string {
    const g = this.game;
    const lv = g.bookLv(b.id);
    const carried = g.isCarried(b.id);
    const cur = lv < 1 ? 'なし' : this.bookEffect(b);
    const rows = Array.from({ length: b.maxLv }, (_, i) => {
      const n = i + 1;
      return `<li class="${n <= lv ? 'on' : ''} ${n === lv ? 'cur' : ''}"><span class="n">Lv${n}</span>${this.bookEffect(b, n).replace(/^\S+ /, '')}</li>`;
    }).join('');
    let state: string;
    if (!carried) state = '<span class="lock">本棚にあるので効果がない</span>';
    else if (lv < 1) state = '<span class="lock">Lv0なので効果がない。SPでレベルを上げよう</span>';
    else if (b.pinch) {
      const on = g.activePinch().includes(b);
      state = on ? '<span class="pinch-on">🔥 発動中！</span>' : `<span class="done">かばんの中で待機中（体力${Math.round(b.pinch.hp * 100)}%以下で発動）</span>`;
    } else state = '<span class="done">かばんに入れている間、効果がある</span>';
    return `
      <div class="effect-card ${b.kind}">
        <div class="ecur"><div class="elbl">いまの効果</div><div class="eval">${cur}</div>${b.stat?.key === 'luck' ? `<div class="elbl">運の合計 ${g.stat('luck')}：${luckText(g.stat('luck'))}</div>` : ''}${state}</div>
        <ul class="elv">${rows}</ul>
      </div>`;
  }

  showSkillbook() {
    const g = this.game;
    const d = g.data;
    // 呪われた本は 'curse:通し番号' で選ぶ
    const selCurse = d.cursed.find((c) => `curse:${c.no}` === this.bookSel);
    if (!selCurse && !d.books.includes(this.bookSel)) this.bookSel = d.carried[0] ?? d.books[0];
    const book = bookById(selCurse ? selCurse.book : this.bookSel);
    const cost = spCost(d.spBought);
    const owned = BOOKS.filter((b) => d.books.includes(b.id));
    const item = (b: BookDef) => {
      const lv = g.bookLv(b.id);
      const max = bookMaxLv(b);
      const carried = d.carried.includes(b.id);
      const learnable = lv < max && d.sp >= lvUpCost(lv);
      return `<li class="${b.id === this.bookSel ? 'sel' : ''} ${carried ? '' : 'shelved'}" data-act="book" data-arg="${b.id}">
          <span class="bk" style="--c:${b.color}"></span><span class="bn">${b.name}<i class="kmini ${b.kind}">${BOOK_KIND_NAME[b.kind]}</i></span>
          ${learnable && carried ? '<span class="dot" title="レベルを上げられる"></span>' : ''}<small>${g.sparesOf(b.id) ? `<i class="spare">予備${g.sparesOf(b.id)}</i>` : ''}Lv${lv}/${max}</small></li>`;
    };
    const cursedItem = (c: CursedBook) => `<li class="${`curse:${c.no}` === this.bookSel ? 'sel' : ''} cursed" data-act="book" data-arg="curse:${c.no}">
          <span class="bk" style="--c:${CURSE_COLOR}"></span><span class="bn">${this.cursedName(c)}<i class="kmini curse">呪い</i></span><small>Lv?</small></li>`;
    const inBag = d.carried.map(bookById);
    const onShelf = owned.filter((b) => !d.carried.includes(b.id));
    const list =
      `<li class="group">🎒 かばん ${inBag.length} / ${MAX_CARRY}</li>` +
      inBag.map(item).join('') +
      (onShelf.length ? `<li class="group">📚 本棚（家で持ち替え）</li>` + onShelf.map(item).join('') : '') +
      (d.cursed.length ? `<li class="group">🔒 呪われた本（神殿で浄化）</li>` + d.cursed.map(cursedItem).join('') : '');
    const lv = g.bookLv(book.id);
    const max = bookMaxLv(book);
    const lvCost = lvUpCost(lv);
    const track = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      let icons: string;
      if (book.kind === 'tech') icons = book.skills.filter((id) => SKILLS[id].lv === n).map((id) => SKILLS[id].icon).join('') || '・';
      else if (book.stat) icons = `+${book.stat.perLv * n}`;
      else icons = pinchValueText(book, i);
      return `<div class="lvstep ${n <= lv ? 'on' : ''} ${n === lv ? 'cur' : ''} ${book.kind}"><span class="n">Lv${n}</span><span class="i">${icons}</span></div>`;
    }).join('');
    const lvAct =
      lv >= max
        ? '<span class="done">最大レベル</span>'
        : !d.carried.includes(book.id)
          ? '<span class="lock">本棚にあるので<br>レベルを上げられない</span>'
          : `<button data-act="lvup" data-arg="${book.id}" ${d.sp >= lvCost ? '' : 'disabled'}>レベルアップ <small>SP ${lvCost}</small></button>`;
    let nextTxt: string;
    if (book.kind === 'tech') {
      const next = book.skills.map((id) => SKILLS[id]).filter((sk) => sk.lv > lv).sort((a, b) => a.lv - b.lv)[0];
      nextTxt = next ? `次は <b>Lv${next.lv}</b> で『${next.name}』を覚える` : 'この本の技をすべて覚えた！';
    } else {
      nextTxt = lv < max ? `次の <b>Lv${lv + 1}</b> で ${this.bookEffect(book, lv + 1)}` : 'これ以上は強くならない。';
    }
    const wt = book.school ? SCHOOL_WEAPON[book.school] : null;
    const need = wt
      ? `<div class="wneed ${g.weaponType === wt ? 'ok' : 'ng'}">${WEAPON_TYPE_ICON[wt]} ${WEAPON_TYPE_NAME[wt]}を装備しているときだけ使える${g.weaponType === wt ? '' : '（いまは装備していない）'}</div>`
      : '';
    const cursed = !!selCurse;
    const body = cursed
      ? `<div class="curse-card"><div class="cicon">📕</div><div>この本は呪われていて、ページを開くことすらできない。正体も分からない。<br>町の<b>神殿</b>で浄化（${purifyPrice(book)} G）してもらうと、正体が分かり使えるようになる。浄化した本はレベル0から始まる。すでに持っている本だった場合は予備になり、道具屋で売れる。</div></div>`
      : book.kind === 'tech'
        ? need + book.skills.map((id) => this.skillCard(id)).join('')
        : this.effectCard(book);
    const head = cursed
      ? `<div class="bhead cursed" style="--c:${CURSE_COLOR}">
              <h3>${this.cursedName(selCurse!)}<span class="ktag curse">正体不明</span></h3><p>禍々しい気配に包まれた本。遺跡の宝箱で見つけた。</p>
              <div class="lvrow"><div class="lvtrack"></div><div class="lvact"><span class="lock">呪われていて<br>使えない</span></div></div>
            </div>`
      : `<div class="bhead" style="--c:${book.color}">
              <h3>${book.name}<span class="ktag ${book.kind}">${bookTag(book)}</span><span class="blv">Lv ${lv} / ${max}</span></h3><p>${book.desc}</p>
              <div class="lvrow"><div class="lvtrack">${track}</div><div class="lvact">${lvAct}</div></div>
              <div class="lvnext">${nextTxt}</div>
              ${g.sparesOf(book.id) ? `<div class="lvnext">同じ本の予備が <b>${g.sparesOf(book.id)}冊</b> ある（道具屋で ${sellPrice(book)} G で売れる）</div>` : ''}
            </div>`;
    const slots = d.hotbar
      .map((id, i) => `<div class="hslot"><span class="k">${i + 1}</span>${id ? `${SKILLS[id].icon} ${SKILLS[id].name}` : '<em>空き</em>'}</div>`)
      .join('');
    const params = STATS.map((k) => {
        const v = g.stat(k);
        return `<span class="${v > g.baseStat(k) ? 'up' : ''}" ${k === 'luck' ? `title="${luckText(v)}"` : ''}>${STAT_ICON[k]} ${STAT_NAME[k]} <b>${v}</b></span>`;
      })
      .join('') + `<span class="luckfx">${luckText(g.stat('luck'))}</span>`;

    this.open(
      'book',
      `<div class="panel book-panel">
        <div class="phead">
          <h2>📖 スキルブック</h2>
          <div class="pstats">
            <span>SP <b class="spv">${d.sp}</b></span>
            <span>EXP <b>${d.exp}</b></span>
            <button data-act="convert" ${d.exp >= cost ? '' : 'disabled'}>EXP ${cost} → SP +1</button>
          </div>
          <button class="x" data-act="close">✕</button>
        </div>
        <div class="bparams">${params}</div>
        <div class="book-body">
          <ul class="book-list">
            ${list}
            <li class="hint">所持 ${owned.length} / ${BOOKS.length} 冊<br>本は道具屋やダンジョンの宝箱で手に入る。宝箱の本は呪われているので、神殿で浄化しよう。同じ本は予備になり、道具屋で売れる。<br>本はLv0（効果なし）から始まる。<br>持ち歩けるのは${MAX_CARRY}冊まで</li>
          </ul>
          <div class="book-detail">
            ${head}
            ${body}
          </div>
        </div>
        <div class="hotbar-edit"><span class="hl">ホットバー</span>${slots}</div>
      </div>`,
      (act, arg) => {
        if (act === 'close') return this.close();
        if (act === 'book') this.bookSel = arg;
        else if (act === 'convert') g.convertExp();
        else if (act === 'lvup') g.levelUpBook(arg);
        else if (act === 'slot') {
          const [id, i] = arg.split(':');
          g.assignSlot(id, Number(i));
        }
        const scroll = this.modal.querySelector('.book-detail')?.scrollTop ?? 0;
        const keepScroll = act !== 'book';
        this.showSkillbook();
        const det = this.modal.querySelector('.book-detail');
        if (det && keepScroll) det.scrollTop = scroll;
      },
    );
  }

  // ---------------------------------------------------------------- 本棚

  private shelfCard(b: BookDef, carried: boolean, full: boolean): string {
    const d = this.game.data;
    const lv = this.game.bookLv(b.id);
    const spares = this.game.sparesOf(b.id);
    const skills =
      b.kind === 'tech'
        ? b.skills
            .map((id) => {
              const sk = SKILLS[id];
              const l = d.learned.includes(id);
              return `<span class="sk ${l ? 'on' : ''}" title="${sk.name}（${l ? '覚えている' : `Lv${sk.lv}で覚える`}）">${sk.icon}${sk.name}</span>`;
            })
            .join('')
        : `<span class="sk ${lv >= 1 ? 'on' : ''}">${lv >= 1 ? this.bookEffect(b) : '効果なし（Lv0）'}</span>`;
    const btn = carried
      ? `<button class="sub" data-act="store" data-arg="${b.id}">本棚にしまう</button>`
      : `<button data-act="carry" data-arg="${b.id}" ${full ? 'disabled' : ''}>かばんに入れる</button>`;
    const name = `${b.name} <small class="blv">Lv${lv}/${bookMaxLv(b)}</small><span class="ktag ${b.kind}">${bookTag(b)}</span>${spares ? `<i class="spare">予備${spares}</i>` : ''}`;
    return `<div class="bcard" style="--c:${b.color}">
      <div class="spine"></div>
      <div class="binfo"><div class="bname">${name}</div><div class="bskills">${skills}</div></div>
      <div class="bact">${btn}</div>
    </div>`;
  }

  showShelf() {
    const g = this.game;
    const d = g.data;
    const owned = BOOKS.filter((b) => d.books.includes(b.id));
    const bag = d.carried.map(bookById);
    const shelf = owned.filter((b) => !d.carried.includes(b.id));
    const full = bag.length >= MAX_CARRY;
    const bagHtml =
      bag.map((b) => this.shelfCard(b, true, full)).join('') +
      Array.from({ length: MAX_CARRY - bag.length }, () => '<div class="bcard empty">空き</div>').join('');
    const shelfHtml = shelf.length ? shelf.map((b) => this.shelfCard(b, false, full)).join('') : '<p class="note">本棚は空っぽだ。</p>';
    this.open(
      'shelf',
      `<div class="panel shelf-panel">
        <div class="phead"><h2>📚 本棚</h2><div class="pstats"><span>かばん <b>${bag.length}</b> / ${MAX_CARRY} 冊</span></div><button class="x" data-act="close">✕</button></div>
        <p class="note">持ち歩けるスキルブックは${MAX_CARRY}冊まで。本棚にある本のスキルは、習得していても使えない。どの本を持っていくか選ぼう。${d.cursed.length ? `<br>呪われた本が ${d.cursed.length} 冊ある。町の神殿で浄化しよう。` : ''}</p>
        <div class="shelf-body">
          <section><h4>🎒 かばん（持ち歩く本）</h4>${bagHtml}</section>
          <section><h4>📚 本棚</h4>${shelfHtml}</section>
        </div>
      </div>`,
      (act, arg) => {
        if (act === 'close') return this.close();
        if (act === 'carry') g.carryBook(arg);
        else if (act === 'store') g.storeBook(arg);
        this.showShelf();
      },
    );
  }

  // ---------------------------------------------------------------- 道具屋

  showShop() {
    const g = this.game;
    const d = g.data;
    const items = [
      { id: 'potion', icon: '🧪', name: '回復薬', desc: '体力を50回復する。[Q]で使用', price: 30, have: d.potions },
      { id: 'ether', icon: '💧', name: 'エーテル', desc: 'MPを50回復する。[R]で使用', price: 40, have: d.ethers },
    ];
    const itemRows = items
      .map(
        (it) => `<div class="srow">
          <div class="sicon">${it.icon}</div>
          <div class="sinfo"><div class="sname">${it.name} <small>所持 ${it.have}</small></div><div class="sdesc">${it.desc}</div></div>
          <div class="sact"><button data-act="buy" data-arg="${it.id}" ${d.gold >= it.price ? '' : 'disabled'}>${it.price} G</button></div>
        </div>`,
      )
      .join('');
    const bookRow = (b: BookDef) => {
        const owned = d.books.includes(b.id);
        const locked = d.maxFloor < b.minFloor;
        const act = owned
          ? '<span class="done">購入済み</span>'
          : locked
            ? `<span class="lock">地下${b.minFloor}階到達で入荷</span>`
            : `<button data-act="buybook" data-arg="${b.id}" ${d.gold >= b.price ? '' : 'disabled'}>${b.price} G</button>`;
        return `<div class="srow ${owned ? 'learned' : ''}">
          <div class="sicon book" style="--c:${b.color}">📕</div>
          <div class="sinfo"><div class="sname">${b.name}<span class="ktag ${b.kind}">${bookTag(b)}</span></div><div class="sdesc">${b.desc}<br><small>${b.kind === 'tech' ? '収録' : '効果'}: ${locked ? '？？？' : bookSummary(b)}</small></div></div>
          <div class="sact">${act}</div>
        </div>`;
    };
    const shopBooks = BOOKS.filter((b) => b.source === 'shop');
    const bookRows = (kind: BookKind) =>
      shopBooks
        .filter((b) => b.kind === kind)
        .sort((a, b) => a.tier - b.tier)
        .map(bookRow)
        .join('');
    const tabBtn = (id: 'buy' | 'sell', label: string) => `<button class="tab ${this.shopTab === id ? 'on' : ''}" data-act="tab" data-arg="${id}">${label}</button>`;
    const tabs = `<div class="tabs">${tabBtn('buy', '🛒 買う')}${tabBtn('sell', '💰 本を売る')}</div>`;
    const buyList = `
          <h4>道具</h4>${itemRows}
          <h4>技の書</h4>${bookRows('tech')}
          <h4>パラメタの書</h4>${bookRows('stat')}
          <p class="note">上級の書と、体力が減ると発動する「窮地の書」は、遺跡の宝箱で見つかるらしい。ただし宝箱の本は呪われていて、神殿で浄化するまで使えないそうだ。</p>`;
    const sellRow = (b: BookDef) => {
      const price = sellPrice(b);
      const lv = g.bookLv(b.id);
      const spares = g.sparesOf(b.id);
      const sp = spSpent(lv);
      const where = d.carried.includes(b.id) ? '🎒 かばん' : '📚 本棚';
      const confirm = (key: string, label: string) =>
        this.sellConfirm === key ? `<button class="danger" data-act="sell" data-arg="${key}">本当に売る？<br><small>${price} G</small></button>` : `<button data-act="ask" data-arg="${key}">${label}<br><small>${price} G</small></button>`;
      let act: string;
      if (price <= 0) act = '<span class="lock">思い出の本なので<br>売れない</span>';
      else {
        act = '';
        if (spares > 0) act += `<button data-act="sellspare" data-arg="${b.id}">予備を売る<br><small>${price} G</small></button>`;
        act += confirm(`main:${b.id}`, spares > 0 ? '使っている本を売る' : '売る');
      }
      const note =
        price <= 0
          ? ''
          : spares > 0
            ? `予備が ${spares} 冊ある。予備を売っても今の本はそのまま。`
            : `売ると${lv > 0 ? `、上げるのに使った <b>SP ${sp}</b> が戻り` : ''}、${b.kind === 'tech' ? 'この本で覚えた技は忘れる' : 'この本の効果はなくなる'}。`;
      return `<div class="srow sell">
          <div class="sicon book" style="--c:${b.color}">📕</div>
          <div class="sinfo"><div class="sname">${b.name}<span class="ktag ${b.kind}">${bookTag(b)}</span>${spares ? `<i class="spare">予備${spares}</i>` : ''}</div><div class="sdesc">Lv${lv}/${bookMaxLv(b)}・${where}<br><small>${note}</small></div></div>
          <div class="sact sellact">${act}</div>
        </div>`;
    };
    const owned = BOOKS.filter((b) => d.books.includes(b.id));
    const sellList = `
          <p class="note">いらなくなった本や、同じ本の予備を買い取ってもらえる。店の本は売値の半額、遺跡の本はパラメタ 300 G・窮地 400 G・技 500 G。売った本は、また道具屋で買ったり宝箱で見つけたりできる。</p>
          ${[...owned.filter((b) => g.sparesOf(b.id) > 0), ...owned.filter((b) => g.sparesOf(b.id) === 0)].map(sellRow).join('')}
          ${d.cursed.length ? `<p class="note">呪われた本（${d.cursed.length}冊）は買い取れない。神殿で浄化してから持ってこよう。</p>` : ''}`;
    this.open(
      'shop',
      `<div class="panel shop-panel">
        <div class="phead"><h2>🏪 道具屋</h2><div class="pstats"><span>所持金 <b>${d.gold}</b> G</span></div><button class="x" data-act="close">✕</button></div>
        <p class="npc">${this.shopTab === 'buy' ? '店主「いらっしゃい！ 遺跡に潜るなら準備は万全にな。技の書もパラメタの書も揃ってるぜ。」' : '店主「本の買い取りかい？ ダブった本なら、いい値で引き取るぜ。」'}</p>
        ${tabs}
        <div class="shop-list">${this.shopTab === 'buy' ? buyList : sellList}
        </div>
      </div>`,
      (act, arg) => {
        if (act === 'close') {
          this.shopTab = 'buy';
          this.sellConfirm = '';
          return this.close();
        }
        const prev = this.sellConfirm;
        this.sellConfirm = '';
        if (act === 'tab') this.shopTab = arg === 'sell' ? 'sell' : 'buy';
        else if (act === 'buy') g.buyItem(arg === 'ether' ? 'ether' : 'potion');
        else if (act === 'buybook') g.buyBook(arg);
        else if (act === 'sellspare') g.sellSpare(arg);
        else if (act === 'ask') this.sellConfirm = arg;
        else if (act === 'sell' && prev === arg) g.sellBook(arg.replace(/^main:/, ''));
        const scroll = this.modal.querySelector('.shop-list')?.scrollTop ?? 0;
        this.showShop();
        const nl = this.modal.querySelector('.shop-list');
        if (nl && act !== 'tab') nl.scrollTop = scroll;
      },
    );
  }

  // ---------------------------------------------------------------- 武器防具屋

  private smithyTab: SmithyTab = 'shop';
  /** 装備を売るときの確認中の品（"weapon:steel" など） */
  private eqConfirm = '';

  /** 武器防具屋。売り場・鍛冶場・買い取りのタブがある。forged は直前に鍛えた品（光らせる） */
  showSmithy(tab?: SmithyTab, forged?: string) {
    if (tab) this.smithyTab = tab;
    const g = this.game;
    const d = g.data;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const defTxt = (v: number) => `防御力 +${v}`;
    const w = weaponById(d.weapon);
    const a = armorById(d.armor);
    const wp = g.plusOf(w.id);
    const ap = g.plusOf(a.id);
    const eqnow = `<div class="eqnow"><span>装備中</span><b>${w.icon} ${eqName(w.name, wp)}</b><small>${weaponStatText(w, wp)}${w.effect ? `・${WEAPON_EFFECT_TEXT[w.effect]}` : ''}</small><b>${a.icon} ${eqName(a.name, ap)}</b><small>${defTxt(armorDef(a, ap))}${a.effect ? `・${ARMOR_EFFECT_TEXT[a.effect]}` : ''}（いまの被ダメージ -${pct(1 - damageRate(g.stat('def')))}）</small></div>`;
    const tabBtn = (id: SmithyTab, label: string) => `<button class="tab ${this.smithyTab === id ? 'on' : ''}" data-act="tab" data-arg="${id}">${label}</button>`;
    const tabs = `<div class="tabs">${tabBtn('shop', '🛒 売り場')}${tabBtn('forge', '🔨 鍛冶場')}${tabBtn('craft', '🔧 装備作成')}${tabBtn('sell', '💰 装備を売る')}</div>`;

    type Item = { kind: 'weapon' | 'armor'; id: string; icon: string; name: string; desc: string; price: number; minFloor: number; craft?: Recipe; fx?: string; stat: (plus: number) => string };
    const items: Item[] = [
      ...WEAPONS.map((x) => ({ ...x, kind: 'weapon' as const, fx: x.effect && WEAPON_EFFECT_TEXT[x.effect], stat: (p: number) => weaponStatText(x, p) })),
      ...ARMORS.map((x) => ({ ...x, kind: 'armor' as const, fx: x.effect && ARMOR_EFFECT_TEXT[x.effect], stat: (p: number) => defTxt(armorDef(x, p)) })),
    ];
    const owns = (it: Item) => (it.kind === 'weapon' ? d.weapons : d.armors).includes(it.id);
    const wears = (it: Item) => (it.kind === 'weapon' ? d.weapon : d.armor) === it.id;

    let npc: string;
    let section: (kind: 'weapon' | 'armor') => string;
    if (this.smithyTab === 'shop') {
      npc = '親方「体力ばかりは鍛えても増えんからな。そのぶん、いい武器といい鎧で補うんだ。技の書を使うなら、剣の技は剣、弓は弓、魔術は杖、盾の技は盾を持っていけよ。」';
      section = (kind) =>
        items
          .filter((it) => it.kind === kind && !it.craft)
          .map((it) => {
            const owned = owns(it);
            const equipped = wears(it);
            const locked = d.maxFloor < it.minFloor;
            const plus = g.plusOf(it.id);
            const act = equipped
              ? '<span class="done">装備中</span>'
              : owned
                ? `<button class="sub" data-act="equip" data-arg="${it.kind}:${it.id}">装備する</button>`
                : locked
                  ? `<span class="lock">地下${it.minFloor}階到達で入荷</span>`
                  : `<button data-act="buyeq" data-arg="${it.kind}:${it.id}" ${d.gold >= it.price ? '' : 'disabled'}>${it.price} G</button>`;
            return `<div class="srow ${equipped ? 'equipped' : ''}">
              <div class="sicon">${locked ? '❔' : it.icon}</div>
              <div class="sinfo"><div class="sname">${locked ? '？？？' : eqName(it.name, plus)}<span class="eqstat">${it.stat(plus)}</span></div><div class="sdesc">${locked ? '腕のいい職人が、まだ仕上げている途中だ。' : it.desc}</div></div>
              <div class="sact">${act}</div>
            </div>`;
          })
          .join('');
    } else if (this.smithyTab === 'craft') {
      npc = '親方「魔物の素材と鉱石を持ってきな。店には並べられない、とっておきの武器と防具をこしらえてやる。素材は魔物を倒すと、ときどき落とすぞ。」';
      const chip = (icon: string, name: string, have: number, n: number) => `<span class="oreneed ${have >= n ? 'ok' : 'short'}">${icon} ${name} ${have}/${n}</span>`;
      section = (kind) =>
        items
              .filter((it) => it.kind === kind && it.craft)
              .map((it) => {
                const r = it.craft!;
                const locked = d.maxFloor < it.minFloor;
                const plus = g.plusOf(it.id);
                const needs = [
                  ...Object.entries(r.mats).map(([id, n]) => chip(matById(id).icon, matById(id).name, g.matOf(id), n)),
                  ...Object.entries(r.ores).map(([id, n]) => chip(oreById(id).icon, oreById(id).name, g.oreOf(id), n)),
                ].join('');
                const act = wears(it)
                  ? '<span class="done">装備中</span>'
                  : owns(it)
                    ? `<button class="sub" data-act="equip" data-arg="${it.kind}:${it.id}">装備する</button>`
                    : locked
                      ? `<span class="lock">地下${it.minFloor}階到達で<br>作り方が分かる</span>`
                      : `<button data-act="craft" data-arg="${it.kind}:${it.id}" ${g.canCraft(r) ? '' : 'disabled'}>作る<br><small>${r.gold} G</small></button>`;
                const body = locked
                  ? '<div class="sdesc">親方「こいつの作り方は、もっと深い階の魔物を見てからだな。」</div>'
                  : `<div class="sdesc">${it.desc}<br><span class="eqfx">✨ ${it.fx ?? ''}</span>${owns(it) ? '' : `<div class="recipe">${needs}</div>`}</div>`;
                return `<div class="srow craft-row ${wears(it) ? 'equipped' : ''} ${forged === `${it.kind}:${it.id}` ? 'forged' : ''}">
              <div class="sicon">${locked ? '❔' : it.icon}</div>
              <div class="sinfo"><div class="sname">${locked ? '？？？' : eqName(it.name, plus)}<span class="eqstat">${it.stat(plus)}</span></div>${body}</div>
              <div class="sact">${act}</div>
            </div>`;
              })
              .join('');
    } else if (this.smithyTab === 'sell') {
      npc = '親方「使わなくなった装備かい？ 鍛えた分の手間賃も、半分なら色をつけてやるよ。」';
      section = (kind) =>
        items
          .filter((it) => it.kind === kind && owns(it))
          .map((it) => {
            const plus = g.plusOf(it.id);
            const price = eqSellPrice(it.price, plus);
            const key = `${it.kind}:${it.id}`;
            let act: string;
            let note: string;
            if (price <= 0) {
              act = '<span class="lock">旅立ちの品なので<br>売れない</span>';
              note = '';
            } else if (wears(it)) {
              act = '<span class="lock">装備中なので<br>売れない</span>';
              note = 'ほかの装備に持ち替えると売れる。';
            } else {
              act =
                this.eqConfirm === key
                  ? `<button class="danger" data-act="sell" data-arg="${key}">本当に売る？<br><small>${price} G</small></button>`
                  : `<button data-act="ask" data-arg="${key}">売る<br><small>${price} G</small></button>`;
              note = plus > 0 ? `売ると鍛えた分（+${plus}）はなくなる。使った鉱石は戻らない。` : '売っても、また売り場で買える。';
            }
            return `<div class="srow sell ${wears(it) ? 'equipped' : ''}">
              <div class="sicon">${it.icon}</div>
              <div class="sinfo"><div class="sname">${eqName(it.name, plus)}${wears(it) ? '<span class="eqtag">装備中</span>' : ''}<span class="eqstat">${it.stat(plus)}</span></div><div class="sdesc"><small>${note}</small></div></div>
              <div class="sact sellact">${act}</div>
            </div>`;
          })
          .join('');
    } else {
      npc = `親方「遺跡で掘った鉱石を持ってきな。鉄なら +2 まで、魔法銀なら +4、竜炎石があれば +${MAX_PLUS} まで鍛えてやる。」`;
      section = (kind) =>
        items
          .filter((it) => it.kind === kind && owns(it))
          .map((it) => {
            const plus = g.plusOf(it.id);
            const max = plus >= MAX_PLUS;
            const cost = forgeCost(it.price, plus);
            const need = forgeOre(plus);
            const have = g.oreOf(need.ore.id);
            const enough = have >= need.n;
            const pips = '★'.repeat(plus) + '☆'.repeat(MAX_PLUS - plus);
            const stat = max
              ? it.stat(plus)
              : `${it.stat(plus)} → <b>${it.stat(plus + 1)}</b><span class="oreneed ${enough ? 'ok' : 'short'}">${need.ore.icon} ${need.ore.name} ${have}/${need.n}</span>`;
            const act = max
              ? '<span class="done">最大まで<br>鍛えた</span>'
              : `<button data-act="forge" data-arg="${it.kind}:${it.id}" ${d.gold >= cost && enough ? '' : 'disabled'}>鍛える <small>${cost} G</small></button>`;
            const key = `${it.kind}:${it.id}`;
            return `<div class="srow forge-row ${wears(it) ? 'equipped' : ''} ${forged === key ? 'forged' : ''}">
              <div class="sicon">${it.icon}</div>
              <div class="sinfo"><div class="sname">${eqName(it.name, plus)}${wears(it) ? '<span class="eqtag">装備中</span>' : ''}<span class="pips">${pips}</span></div><div class="sdesc">${stat}</div></div>
              <div class="sact">${act}</div>
            </div>`;
          })
          .join('');
    }

    this.open(
      'smithy',
      `<div class="panel shop-panel">
        <div class="phead"><h2>⚒️ 武器防具屋</h2><div class="pstats"><span>所持金 <b>${d.gold}</b> G</span></div><button class="x" data-act="close">✕</button></div>
        ${tabs}
        <p class="npc">${npc}</p>
        ${eqnow}
        ${this.smithyTab === 'sell' ? '<p class="note">買い取り値は、売り場の値段と鍛えるのに払った代金を合わせた半額。装備中の品は売れない。</p>' : ''}
        ${this.smithyTab === 'forge' || this.smithyTab === 'craft' ? `<div class="orebag"><span>鉱石</span>${ORES.map((o) => `<b class="${g.oreOf(o.id) > 0 ? '' : 'none'}">${o.icon} ${o.name} ×${g.oreOf(o.id)}</b>`).join('')}</div>` : ''}
        ${this.smithyTab === 'craft' ? `<div class="orebag mats"><span>魔物の素材</span>${MATS.map((m) => `<b class="${g.matOf(m.id) > 0 ? '' : 'none'}">${m.icon} ${m.name} ×${g.matOf(m.id)}</b>`).join('')}</div>` : ''}
        <div class="shop-list">
          ${this.smithyTab === 'craft' ? `<h4>作れる武器</h4>${section('weapon')}<h4>作れる防具</h4>${section('armor')}` : `<h4>武器</h4>${section('weapon')}
          <h4>防具</h4>${section('armor')}`}
        </div>
      </div>`,
      (act, arg) => {
        const prev = this.eqConfirm;
        this.eqConfirm = '';
        if (act === 'close') return this.close();
        if (act === 'tab') return this.showSmithy(arg === 'forge' || arg === 'sell' || arg === 'craft' ? arg : 'shop');
        const [kind, id] = arg.split(':');
        const k = kind === 'armor' ? 'armor' : 'weapon';
        let forgedNow: string | undefined;
        if (act === 'buyeq') g.buyEquip(k, id);
        else if (act === 'equip') g.equip(k, id);
        else if (act === 'forge' && g.forge(k, id)) forgedNow = arg;
        else if (act === 'craft' && g.craftEquip(k, id)) forgedNow = arg;
        else if (act === 'ask') this.eqConfirm = arg;
        else if (act === 'sell' && prev === arg) g.sellEquip(k, id);
        const scroll = this.modal.querySelector('.shop-list')?.scrollTop ?? 0;
        this.showSmithy(undefined, forgedNow);
        const nl = this.modal.querySelector('.shop-list');
        if (nl) nl.scrollTop = scroll;
      },
    );
  }

  // ---------------------------------------------------------------- 神殿

  /** 呪われた本の呼び名（拾った順の通し番号をつける） */
  private cursedName(c: CursedBook): string {
    return `${CURSED_NAME} #${c.no}`;
  }

  showTemple() {
    const g = this.game;
    const d = g.data;
    const rows = d.cursed
      .map((c) => {
        const b = bookById(c.book);
        const price = purifyPrice(b);
        return `<div class="srow cursed">
          <div class="sicon book" style="--c:${CURSE_COLOR}">📕</div>
          <div class="sinfo"><div class="sname">${this.cursedName(c)}<span class="ktag curse">正体不明</span></div><div class="sdesc"><span class="cpow ${b.kind}">${CURSE_POWER[b.kind]}</span>がかかっている。</div></div>
          <div class="sact"><button data-act="purify" data-arg="${c.no}" ${d.gold >= price ? '' : 'disabled'}>浄化する<br><small>${price} G</small></button></div>
        </div>`;
      })
      .join('');
    const rb = this.revealed ? bookById(this.revealed) : null;
    const reveal = rb
      ? `<div class="reveal" style="--c:${rb.color}">
          <div class="rlbl">✨ 呪いが解けた！ 本の正体は…</div>
          <div class="srow learned">
            <div class="sicon book" style="--c:${rb.color}">📗</div>
            <div class="sinfo"><div class="sname">${rb.name}<span class="ktag ${rb.kind}">${bookTag(rb)}</span></div><div class="sdesc">${rb.desc}<br><small>${rb.kind === 'tech' ? '収録' : '効果'}: ${bookSummary(rb)}</small></div></div>
          </div>
          <p class="note">${this.revealedSpare ? `すでに持っている本なので<b>予備</b>になった。道具屋で ${sellPrice(rb)} G で売れる。` : 'Lv0から始まる。スキルブック [K] でSPを使ってレベルを上げよう。'}</p>
        </div>`
      : '';
    this.open(
      'temple',
      `<div class="panel shop-panel temple-panel">
        <div class="phead"><h2>⛪ 神殿</h2><div class="pstats"><span>所持金 <b>${d.gold}</b> G</span></div><button class="x" data-act="close">✕</button></div>
        <p class="npc">神官「遺跡の書には古の呪いが染みついております。祈りを捧げれば呪いは祓われ、本来の姿を取り戻しましょう。強い力を秘めた書ほど呪いも強く、お布施も多くいただきます。」</p>
        <div class="shop-list">
          ${reveal}
          <h4>呪われた本</h4>
          ${rows || '<p class="note">呪われた本は持っていない。遺跡の宝箱で見つけた本は呪われているので、ここへ持ってこよう。</p>'}
        </div>
      </div>`,
      (act, arg) => {
        if (act === 'close') {
          this.revealed = '';
          return this.close();
        }
        if (act === 'purify') {
          const c = d.cursed.find((x) => x.no === Number(arg));
          const spare = !!c && d.books.includes(c.book);
          const id = g.purifyBook(Number(arg));
          if (id) {
            this.revealed = id;
            this.revealedSpare = spare;
          }
        }
        this.showTemple();
      },
    );
  }

  // ---------------------------------------------------------------- 宿屋・入口

  showInn() {
    this.open(
      'inn',
      `<div class="panel small-panel">
        <h2>🛏️ 宿屋</h2>
        <p class="npc">女将「ようこそ。ひと晩休んでいくかい？ ハンターさんからお代はもらわないよ。」</p>
        <p class="note">体力・MPが全回復し、冒険の記録をセーブします。</p>
        <div class="btns"><button data-act="rest">休む</button><button data-act="close" class="sub">やめる</button></div>
      </div>`,
      (act) => {
        if (act === 'rest') this.game.rest();
        this.close();
      },
    );
  }

  showEntrance() {
    const d = this.game.data;
    const btns = CHECKPOINTS.filter((f) => f === 1 || d.maxFloor >= f)
      .map((f) => `<button data-act="go" data-arg="${f}">地下 ${f} 階から</button>`)
      .join('');
    this.open(
      'entrance',
      `<div class="panel small-panel">
        <h2>🏛️ 古代遺跡</h2>
        <p class="npc">ひんやりとした空気が流れ出ている…。</p>
        <p class="note">最深到達: ${d.maxFloor > 0 ? `地下 ${d.maxFloor} 階` : 'なし'}（地下4階・7階に到達すると、そこから挑戦できる）</p>
        <div class="btns col">${btns}<button data-act="close" class="sub">やめる</button></div>
      </div>`,
      (act, arg) => {
        this.close();
        if (act === 'go') this.game.enterDungeon(Number(arg));
      },
    );
  }

  showDeath(lost: number) {
    this.open(
      'death',
      `<div class="panel small-panel death">
        <h2>💀 力尽きた…</h2>
        <p>通りがかった冒険者に助けられ、町へ運ばれた。</p>
        <p class="note">所持金 <b>${lost} G</b> を失った。（経験値・スキルは失われない）</p>
        <div class="btns"><button data-act="ok">立ち上がる</button></div>
      </div>`,
      () => this.close(),
    );
  }

  showClear() {
    this.open(
      'clear',
      `<div class="panel small-panel clear">
        <div class="logo">✨ GAME CLEAR ✨</div>
        <p>ついに伝説の秘宝『<b>${TREASURE_NAME}</b>』を手に入れた！</p>
        <p class="note">トレジャーハンターの名は、遺跡の伝説とともに語り継がれるだろう。<br>このまま冒険を続けることもできる。</p>
        <div class="btns"><button data-act="ok">冒険を続ける</button></div>
      </div>`,
      () => this.close(),
    );
  }
}
