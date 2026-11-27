import type { Game } from './game';
import type { Input } from './input';
import { MAX_HP, MAX_MP } from './constants';
import { FIELD_DUNGEONS, RANKS, RANK_B, RUINS, dungeonById, rankDef, trialFor, type DungeonDef } from './dungeons';
import { BOOKS, BOOK_KIND_NAME, APPRAISE_HINT, SCHOOL_NAME, SCHOOL_WEAPON, SKILLS, STANCES, STATS, stanceText, STAT_ICON, STAT_NAME, TREASURE_NAME, bookById, bookMaxLv, bookSummary, bookTag, luckText, lvUpCost, appraisePrice, sellPrice, UNIDENTIFIED_COLOR, UNIDENTIFIED_NAME, spSpent, type BookKind, type School, type Stat } from './skills';
import { BANK_INTEREST_CAP, BANK_RATE, HOTBAR_SIZE, MAX_CARRY, bankInterest, hasSave, spCost, type UnidentifiedBook } from './state';
import { PHASE_ICON, PHASE_NAME, clockText, offText, phaseOf, type SaleTarget } from './daytime';
import type { BookDef } from './skills';
import { ARMORS, ARMOR_EFFECT_TEXT, MATS, MAX_PLUS, ORES, WEAPONS, WEAPON_EFFECT_TEXT, WEAPON_TYPE_ICON, WEAPON_TYPE_NAME, armorById, armorDef, damageRate, eqName, eqSellPrice, forgeCost, forgeOre, matById, oreById, weaponById, weaponStat, weaponStatText, type ArmorDef, type Recipe, type WeaponDef, type WeaponType } from './equipment';

type SmithyTab = 'shop' | 'forge' | 'craft' | 'sell';

type ShopTab = 'buy' | 'sell' | 'appraise';
/** 道具屋の店主のせりふ（タブごと） */
const SHOP_TALK: Record<ShopTab, string> = {
  buy: '店主「いらっしゃい！ ダンジョンに潜るなら準備は万全にな。技の書もパラメタの書も揃ってるぜ。」',
  sell: '店主「本の買い取りかい？ ダブった本なら、いい値で引き取るぜ。」',
  appraise: '店主「宝箱から出てきた本かい？ 見せてみな。目利きには自信があるんだ。力の強い本ほど鑑定料は高くなるぜ。」',
};
/** スキルブックと装備をまとめたウィンドウのタブ */
export type MenuTab = 'book' | 'equip' | 'items';
/** タブの並び（Tab キーで順に切り替える）と、それぞれを開くキー */
const MENU_TABS: MenuTab[] = ['book', 'equip', 'items'];
const MENU_KEY: Record<MenuTab, { code: string; label: string }> = {
  book: { code: 'KeyK', label: 'K' },
  equip: { code: 'KeyC', label: 'C' },
  items: { code: 'KeyI', label: 'I' },
};
/** 押されたキーで開くタブ（なければ null） */
export function menuTabKey(inp: Input): MenuTab | null {
  return MENU_TABS.find((t) => inp.pressed(MENU_KEY[t].code)) ?? null;
}
type ModalKind = 'title' | 'menu' | 'shop' | 'entrance' | 'help' | 'death' | 'clear' | 'shelf' | 'box' | 'smithy' | 'temple' | 'bank' | 'guild' | 'promo';

const CONTROLS = `
<table class="ctrl">
  <tr><td>WASD / 矢印</td><td>移動</td></tr>
  <tr><td>Space / J</td><td>攻撃（長押しで連続攻撃）</td></tr>
  <tr><td>1 〜 5</td><td>ホットバーのスキルを使う</td></tr>
  <tr><td>E / Enter</td><td>調べる・宝箱・階段・お店</td></tr>
  <tr><td>K / C / I</td><td>スキルブック / 装備 / アイテムを開く</td></tr>
  <tr><td>Tab</td><td>ウィンドウを開く・タブを切り替える</td></tr>
  <tr><td>Q / R</td><td>回復薬 / エーテルを使う</td></tr>
  <tr><td>Esc</td><td>ヘルプ・画面を閉じる</td></tr>
</table>`;

export class UI {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private mpFill: HTMLElement;
  private mpText: HTMLElement;
  private locEl: HTMLElement;
  private rankEl: HTMLElement;
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
  /** スキルブック・装備ウィンドウでいま開いているタブ */
  private menuTab: MenuTab = 'book';
  /** ボックスで選んでいる装備（"weapon:steel" など） */
  private boxSel = '';
  /** 道具屋で最後に鑑定した本（正体を見せる）と、それが予備になったか */
  private revealed = '';
  private revealedSpare = false;
  /** 道具屋の「買う／売る／鑑定」 */
  private shopTab: ShopTab = 'buy';
  /** 神殿で直前に授かったSPの数 */
  private templeGot = 0;
  /** 売るボタンを一度押した本（もう一度押すと売る） */
  private sellConfirm = '';
  private statEls: Record<Stat, HTMLElement>;
  private stanceEl: HTMLElement;
  private clockEl: HTMLElement;
  private saleEl: HTMLElement;
  private last = new WeakMap<HTMLElement, Record<string, string>>();

  constructor(private game: Game, root: HTMLElement) {
    const slotHtml = Array.from(
      { length: HOTBAR_SIZE },
      (_, i) => `<div class="slot skill"><span class="key">${i + 1}</span><span class="icon"></span><span class="cost"></span><div class="cd"></div></div>`,
    ).join('');
    root.innerHTML = `
      <div class="hud">
        <div class="name"><span class="rank"></span><span class="loc"></span></div>
        <div class="clock"></div>
        <div class="sale"></div>
        <div class="bar hp"><div class="fill"></div><span class="lbl">HP</span><span class="txt"></span></div>
        <div class="bar mp"><div class="fill"></div><span class="lbl">MP</span><span class="txt"></span></div>
        <div class="stats"><span class="exp"></span><span class="sp"></span><span class="gold"></span></div>
        <div class="params"><span class="pa atk"></span><span class="pa mag"></span><span class="pa def"></span><span class="pa luck"></span></div>
        <div class="stance"></div>
      </div>
      <div class="hotbar">
        ${slotHtml}
        <div class="slot item sep"><span class="key">Q</span><span class="icon">🧪</span><span class="cnt potions"></span></div>
        <div class="slot item"><span class="key">R</span><span class="icon">💧</span><span class="cnt ethers"></span></div>
      </div>
      <div class="log"></div>
      <div class="help">[K] スキルブック　[C] 装備　[I] アイテム　[Esc] ヘルプ</div>
      <div class="modal hidden"></div>`;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.hpFill = q('.bar.hp .fill');
    this.hpText = q('.bar.hp .txt');
    this.mpFill = q('.bar.mp .fill');
    this.mpText = q('.bar.mp .txt');
    this.locEl = q('.hud .loc');
    this.rankEl = q('.hud .rank');
    this.expEl = q('.stats .exp');
    this.spEl = q('.stats .sp');
    this.goldEl = q('.stats .gold');
    this.statEls = { atk: q('.params .atk'), mag: q('.params .mag'), def: q('.params .def'), luck: q('.params .luck') };
    this.stanceEl = q('.hud .stance');
    this.clockEl = q('.hud .clock');
    this.saleEl = q('.hud .sale');
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
    const dg = g.dungeon;
    this.text(this.locEl, g.scene === 'town' ? 'はじまりの町' : g.scene === 'home' ? 'わが家' : !dg ? '' : dg.trial && g.floor >= dg.depths.length ? `${dg.trial.name}の間` : `${dg.name} 地下${g.floor}階`);
    const ph = phaseOf(d.minutes);
    this.text(this.clockEl, `${PHASE_ICON[ph]} ${g.day}日目 ${clockText(d.minutes)}（${PHASE_NAME[ph]}）`);
    const sale = g.todaySale();
    this.text(this.saleEl, sale ? `🏷️ ${sale.shop === 'shop' ? '道具屋' : '武器防具屋'}：${sale.name} ${offText(sale.off)}` : '');
    const rk = rankDef(d.rank);
    this.text(this.rankEl, `ランク ${rk.name}`);
    this.put(this.rankEl, 'c', rk.color, (v) => this.rankEl.style.setProperty('--rc', v));
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
    else if (this.kind === 'menu') {
      // 開いているタブのキーなら閉じ、ほかのタブのキーならそのタブへ。Tab は次のタブへ順に切り替える
      const tab = menuTabKey(inp);
      if (tab) tab === this.menuTab ? this.close() : this.showMenu(tab);
      else if (inp.pressed('Tab')) this.showMenu(MENU_TABS[(MENU_TABS.indexOf(this.menuTab) + 1) % MENU_TABS.length]);
    }
  }

  showTitle() {
    this.open(
      'title',
      `<div class="panel title-panel">
        <div class="logo"><span class="logo-icon">📖</span>スキルブック・ハンター</div>
        <p class="sub">伝説の秘宝『${TREASURE_NAME}』が眠る古代遺跡。<br>ハンターギルドでランクを上げ、遺跡の最深部（地下${RUINS.depths.length}階）を目指せ！</p>
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
          <li><b>ハンターギルド</b>でランク（E→D→C→B）が決まり、挑めるダンジョンが増えていく。ダンジョンの最後の階にある<b>踏破の宝箱</b>を開けると、ギルドで<b>昇格試験</b>を受けられる。試験の最後に待つボスを倒せば昇格。<b>古代遺跡</b>にはランクB から入れる。</li>
          <li>ダンジョンの各階には<b>危険度</b>があり、高いほど敵が強く、宝箱や鉱石が豪華になる。高い危険度の階に到達すると、お店の品ぞろえが増える。</li>
          <li><b>スキルブック</b>は2系統。<b>SP</b>を使って本の<b>レベル</b>を上げると効果が強くなる。
            <br>・<b>パラメタの書</b>（剛力・叡智・堅守・幸運）：レベルごとに攻撃力・魔力・防御力・運が上がる。
            <br>・<b>技の書</b>（剣技・魔術・盾術）：決まったレベルで技を覚える。<b>剣の技は剣、魔術は杖、盾の技は盾</b>を装備しているときだけ使える。アクティブな技はホットバー(1〜5)にセットして使う。
            <br>・<b>2段階の書</b>（危険度5以上の階の宝箱で見つかる）：1段目の技で「剣気」などの<b>状態</b>に入ると、<b>そのフロアにいる間</b>パラメタが少し上がり、2段目の大技が何度でも使えるようになる。階段を降りたり町へ戻ったりすると状態は解ける。</li>
          <li><b>攻撃力</b>は通常攻撃と剣・盾の技、<b>魔力</b>は杖の攻撃と魔術の威力を上げる。<b>防御力</b>が高いほど受けるダメージが減り（防御力50で半分）、盾の技の威力も上がる。<b>運</b>が高いと会心の一撃（ダメージ1.5倍）が出やすくなり、敵がアイテムやゴールドを多く落とす。</li>
          <li><b>SP</b>は敵を倒して得た<b>経験値(EXP)</b>を、町の<b>神殿</b>で変換してもらって獲得する。変換するたびに必要EXPは増えていく。</li>
          <li>初級・中級の書は<b>道具屋</b>で買える（中級は危険度3の階に到達すると入荷）。上級の書と二段の書は<b>ダンジョンの宝箱</b>から見つかる。</li>
          <li>本は手に入れた時点では<b>レベル0（効果なし）</b>。SPでレベルを上げると効果が出る。</li>
          <li>宝箱で拾った本は<b>未鑑定</b>で、正体が分からず使えない。<b>道具屋の「鑑定」</b>でゴールドを払って鑑定してもらうと、正体が分かり使えるようになる。未鑑定の本はかばんの枠を使わない。</li>
          <li>宝箱からは持っている本と<b>同じ本</b>が出ることもある。同じ本は<b>予備</b>になり、<b>道具屋の「本を売る」</b>で売れる。使っている本も売れる（上げるのに使ったSPは全部戻り、その本の技は忘れる）。</li>
          <li>持ち歩けるスキルブックは<b>3冊まで</b>。残りは<b>わが家の本棚</b>にしまい、家で入れ替える。本棚にある本のスキルは、覚えていても使えず、レベルも上げられない。</li>
          <li>体力・MPの上限は<b>100で固定</b>。スキルブックと装備で強くなろう。</li>
          <li><b>武器防具屋</b>では武器（剣・杖・盾）と鎧を売っている。剣は攻撃力、杖は魔力、盾と鎧は防御力を上げる。通常攻撃は、剣なら斬る、杖なら魔力の弾、盾なら盾で殴る。危険度の高い階に到達すると品ぞろえが増える。店の<b>鍛冶場</b>では、代金と<b>鉱石</b>で持っている装備を最大+5まで鍛えられる。<b>装備を売る</b>タブでは、使わない装備を買い取ってもらえる（値段と鍛えた代金の合計の半額。装備中の品は売れない）。買った装備はその場で身につけ、外した装備は<b>わが家のボックス</b>にしまわれる。装備の持ち替えはボックスでできる。鉱石はダンジョンの壁ぎわの鉱脈を [E] で3回たたいて掘るほか、敵（特にゴーレム）や宝箱からも手に入る。</li>
          <li>魔物は倒すと、ときどき<b>素材</b>（スライムゼリー・コウモリの翼・ゴブリンの牙など）を落とす。武器防具屋の<b>装備作成</b>タブで、素材と鉱石から<b>店では買えない特別な武器と防具</b>を作れる。作った装備には追加効果がある。</li>
          <li>わが家のベッドで休むと全回復＆セーブ。夕方6時から朝6時のあいだにベッドに入ると、次の朝まで眠る。倒れると所持金の半分を失って町へ戻される。</li>
          <li>町には<b>1日</b>の流れがある（現実の12分で1日。メニューを開いているあいだは時間が止まる）。朝焼け・夕焼けに染まり、夜は街灯や窓に灯りがともる。日付は夜明け（5時）に変わる。</li>
          <li>ときどき<b>道具屋</b>や<b>武器防具屋</b>で<b>割引セール</b>がある。セールはその日限りで、夜が明けると入れ替わる。今日のセールは画面左上に出る。</li>
          <li><b>銀行</b>に預けたゴールドは、倒れても減らない。ダンジョンで階段を降りるたびに少し利息もつく。買い物をするときは引き出そう。</li>
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
    // まだ覚えていない技は、名前も効果も伏せておく
    if (!learned) {
      return `
      <div class="skill unlearned hidden ${carried ? '' : 'shelved'}">
        <div class="sicon">❔</div>
        <div class="sinfo">
          <div class="sname"><span class="slv">Lv${s.lv}</span>？？？</div>
          <div class="sdesc">まだ覚えていない技。本のレベルを上げると明らかになる。</div>
        </div>
        <div class="sact"><span class="lvreq">本が Lv${s.lv} に<br>なると覚える</span></div>
      </div>`;
    }
    const block = this.game.skillBlock(id);
    const mp = this.game.mpCost(id);
    const meta = s.kind === 'active' ? `消費MP ${mp}${mp < s.mp ? `（元 ${s.mp}）` : ''}・CT ${s.cd}秒` : '常時発動';
    let act: string;
    if (s.kind === 'active') {
      const btns = Array.from(
        { length: HOTBAR_SIZE },
        (_, i) => `<button class="sb ${d.hotbar[i] === id ? 'on' : ''}" data-act="slot" data-arg="${id}:${i}" title="スロット${i + 1}にセット">${i + 1}</button>`,
      ).join('');
      act = `<div class="slotlbl">${block ?? 'セット先'}</div><div class="slots">${btns}</div>`;
    } else {
      act = block ? `<span class="lock">習得済み<br>（${block.replace('ので使えない', 'ので無効')}）</span>` : `<span class="done">習得済み</span>`;
    }
    return `
      <div class="skill learned ${carried && !block ? '' : 'shelved'}">
        <div class="sicon">${s.icon}</div>
        <div class="sinfo">
          <div class="sname"><span class="slv">Lv${s.lv}</span>${s.name}<span class="tag ${s.kind}">${s.kind === 'active' ? 'アクティブ' : 'パッシブ'}</span></div>
          <div class="smeta">${meta}</div>
          <div class="sdesc">${s.desc}</div>
        </div>
        <div class="sact">${act}</div>
      </div>`;
  }

  /** パラメタの書の、いまのレベルでの効果 */
  private bookEffect(b: BookDef, lv = this.game.bookLv(b.id)): string {
    if (b.stat) return `${STAT_ICON[b.stat.key]} ${STAT_NAME[b.stat.key]} +${b.stat.perLv * lv}`;
    return '';
  }

  /** パラメタの書の詳細（技の書のスキルカードの代わり） */
  private effectCard(b: BookDef): string {
    const g = this.game;
    const lv = g.bookLv(b.id);
    const carried = g.isCarried(b.id);
    const cur = lv < 1 ? 'なし' : this.bookEffect(b);
    const rows = Array.from({ length: b.maxLv }, (_, i) => {
      const n = i + 1;
      return `<li class="${n <= lv ? 'on' : ''} ${n === lv ? 'cur' : ''}"><span class="n">Lv${n}</span>${this.bookEffect(b, n).replace(/^\S+ /, '')}</li>`;
    }).join('');
    // 効果がないときだけ、その理由を知らせる
    let state = '';
    if (!carried) state = '<span class="lock">本棚にあるので効果がない</span>';
    else if (lv < 1) state = '<span class="lock">Lv0なので効果がない。SPでレベルを上げよう</span>';
    return `
      <div class="effect-card ${b.kind}">
        <div class="ecur"><div class="elbl">いまの効果</div><div class="eval">${cur}</div>${b.stat?.key === 'luck' ? `<div class="elbl">運の合計 ${g.stat('luck')}：${luckText(g.stat('luck'))}</div>` : ''}${state}</div>
        <ul class="elv">${rows}</ul>
      </div>`;
  }

  /** スキルブックと装備をまとめたウィンドウ。tab を省くと前回のタブで開く */
  showMenu(tab: MenuTab = this.menuTab) {
    this.menuTab = tab;
    const g = this.game;
    const d = g.data;
    const tabBtn = (id: MenuTab, label: string) =>
      `<button class="tab ${tab === id ? 'on' : ''}" data-act="mtab" data-arg="${id}">${label} <small>[${MENU_KEY[id].label}]</small></button>`;
    const stats = `<div class="pstats">
            <span>SP <b class="spv">${d.sp}</b></span>
            <span>EXP <b>${d.exp}</b> / ${spCost(d.spBought)}</span>
          </div>`;
    this.open(
      'menu',
      `<div class="panel book-panel">
        <div class="phead">
          <div class="tabs mtabs">${tabBtn('book', '📖 スキルブック')}${tabBtn('equip', '🛡️ 装備')}${tabBtn('items', '🧪 アイテム')}</div>
          ${stats}
          <button class="x" data-act="close">✕</button>
        </div>
        <div class="bparams">${this.menuParams()}</div>
        ${tab === 'book' ? this.bookTab() : tab === 'equip' ? this.equipTab() : this.itemsTab()}
      </div>`,
      (act, arg) => {
        if (act === 'close') return this.close();
        if (act === 'mtab') return this.showMenu(arg === 'equip' || arg === 'items' ? arg : 'book');
        if (act === 'use') {
          if (arg === 'ether') g.useEther();
          else g.usePotion();
          return this.showMenu();
        }
        if (act === 'book') this.bookSel = arg;
        else if (act === 'lvup') g.levelUpBook(arg);
        else if (act === 'slot') {
          const [id, i] = arg.split(':');
          g.assignSlot(id, Number(i));
        }
        const scroll = this.modal.querySelector('.book-detail')?.scrollTop ?? 0;
        const keepScroll = act !== 'book';
        this.showMenu();
        const det = this.modal.querySelector('.book-detail');
        if (det && keepScroll) det.scrollTop = scroll;
      },
    );
  }

  /** 消費アイテムのタブの中身（その場で使える） */
  private itemsTab(): string {
    const g = this.game;
    const d = g.data;
    const p = g.player;
    const items = [
      { id: 'potion', icon: '🧪', name: '回復薬', key: 'Q', desc: '体力を50回復する。', have: d.potions, now: `体力 ${Math.ceil(p.hp)} / ${MAX_HP}`, full: p.hp >= MAX_HP, fullTxt: '体力は満タン' },
      { id: 'ether', icon: '💧', name: 'エーテル', key: 'R', desc: 'MPを50回復する。', have: d.ethers, now: `MP ${Math.floor(p.mp)} / ${MAX_MP}`, full: p.mp >= MAX_MP, fullTxt: 'MPは満タン' },
    ];
    const rows = items
      .map((it) => {
        const act =
          it.have <= 0
            ? '<span class="lock">持っていない</span>'
            : it.full
              ? `<span class="done">${it.fullTxt}</span>`
              : `<button data-act="use" data-arg="${it.id}">使う</button>`;
        return `<div class="srow ${it.have <= 0 ? 'learned' : ''}">
          <div class="sicon">${it.icon}</div>
          <div class="sinfo"><div class="sname">${it.name} <small>×${it.have}</small><span class="ikey">[${it.key}]</span></div><div class="sdesc">${it.desc}<br><small>いまの${it.now}</small></div></div>
          <div class="sact">${act}</div>
        </div>`;
      })
      .join('');
    return `<div class="shop-list item-list">${rows}</div>`;
  }

  /** タブの外に出す、パラメタの合計（そのうち装備による分も添える） */
  private menuParams(): string {
    const g = this.game;
    const d = g.data;
    const w = weaponById(d.weapon);
    const a = armorById(d.armor);
    const fromEq = (k: Stat) => weaponStat(w, k, g.plusOf(w.id)) + (k === 'def' ? armorDef(a, g.plusOf(a.id)) : 0);
    const cut = Math.round((1 - damageRate(g.stat('def'))) * 100);
    return (
      STATS.map((k) => {
        const v = g.stat(k);
        const eq = fromEq(k);
        return `<span class="${v > g.baseStat(k) ? 'up' : ''}" ${k === 'luck' ? `title="${luckText(v)}"` : ''}>${STAT_ICON[k]} ${STAT_NAME[k]} <b>+${v}</b>${eq > 0 ? `<small class="peq">装備 +${eq}</small>` : ''}</span>`;
      }).join('') + `<span class="luckfx">受けるダメージ -${cut}%　${luckText(g.stat('luck'))}</span>`
    );
  }

  /** スキルブックのタブの中身 */
  private bookTab(): string {
    const g = this.game;
    const d = g.data;
    // かばんに入れている本だけを載せる（本棚の本・未鑑定の本は載せない）
    if (!d.carried.includes(this.bookSel)) this.bookSel = d.carried[0] ?? '';
    const item = (b: BookDef) => {
      const lv = g.bookLv(b.id);
      const max = bookMaxLv(b);
      const learnable = lv < max && d.sp >= lvUpCost(lv);
      return `<li class="${b.id === this.bookSel ? 'sel' : ''}" data-act="book" data-arg="${b.id}">
          <span class="bk" style="--c:${b.color}"></span><span class="bn">${b.name}<i class="kmini ${b.kind}">${BOOK_KIND_NAME[b.kind]}</i></span>
          ${learnable ? '<span class="dot" title="レベルを上げられる"></span>' : ''}<small>${g.sparesOf(b.id) ? `<i class="spare">予備${g.sparesOf(b.id)}</i>` : ''}Lv${lv}/${max}</small></li>`;
    };
    const inBag = d.carried.map(bookById);
    const list = `<li class="group">🎒 かばん ${inBag.length} / ${MAX_CARRY}</li>` + inBag.map(item).join('');
    const detail = this.bookSel
      ? this.bookDetail(bookById(this.bookSel))
      : '<p class="note">かばんに本が入っていない。家の本棚で本をかばんに入れよう。</p>';
    const slots = d.hotbar
      .map((id, i) => `<div class="hslot"><span class="k">${i + 1}</span>${id ? `${SKILLS[id].icon} ${SKILLS[id].name}` : '<em>空き</em>'}</div>`)
      .join('');
    return `
        <div class="book-body">
          <ul class="book-list">
            ${list}
          </ul>
          <div class="book-detail">
            ${detail}
          </div>
        </div>
        <div class="hotbar-edit"><span class="hl">ホットバー</span>${slots}</div>`;
  }

  /** スキルブックの右側：選んだ本の詳細 */
  private bookDetail(book: BookDef): string {
    const g = this.game;
    const d = g.data;
    const lv = g.bookLv(book.id);
    const max = bookMaxLv(book);
    const lvCost = lvUpCost(lv);
    const track = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      let icons: string;
      if (book.kind === 'tech')
        icons = book.skills.filter((id) => SKILLS[id].lv === n).map((id) => (d.learned.includes(id) ? SKILLS[id].icon : '❔')).join('') || '・';
      else icons = `+${(book.stat?.perLv ?? 0) * n}`;
      return `<div class="lvstep ${n <= lv ? 'on' : ''} ${n === lv ? 'cur' : ''} ${book.kind}"><span class="n">Lv${n}</span><span class="i">${icons}</span></div>`;
    }).join('');
    const lvAct =
      lv >= max
        ? ''
        : `<button data-act="lvup" data-arg="${book.id}" ${d.sp >= lvCost ? '' : 'disabled'}>レベルアップ <small>SP ${lvCost}</small></button>`;
    const wt = book.school ? SCHOOL_WEAPON[book.school] : null;
    // 使える武器を装備していないときだけ知らせる
    const need = wt && g.weaponType !== wt
      ? `<div class="wneed ng">${WEAPON_TYPE_ICON[wt]} ${WEAPON_TYPE_NAME[wt]}を装備しているときだけ使える</div>`
      : '';
    const body = book.kind === 'tech' ? need + book.skills.map((id) => this.skillCard(id)).join('') : this.effectCard(book);
    const head = `<div class="bhead" style="--c:${book.color}">
              <h3>${book.name}<span class="ktag ${book.kind}">${bookTag(book)}</span><span class="blv">Lv ${lv} / ${max}</span></h3><p>${book.desc}</p>
              <div class="lvrow"><div class="lvtrack">${track}</div><div class="lvact">${lvAct}</div></div>
              ${g.sparesOf(book.id) ? `<div class="lvnext">同じ本の予備が <b>${g.sparesOf(book.id)}冊</b> ある（道具屋で ${sellPrice(book)} G で売れる）</div>` : ''}
            </div>`;
    return head + body;
  }

  // ---------------------------------------------------------------- 装備

  /** 装備のタブの中身（見るだけ。持ち替えはわが家のボックス、鍛えるのは町の武器防具屋） */
  private equipTab(): string {
    const g = this.game;
    const d = g.data;
    const w = weaponById(d.weapon);
    const a = armorById(d.armor);
    const wp = g.plusOf(w.id);
    const ap = g.plusOf(a.id);
    const plusTxt = (p: number) => `<span class="eplus">鍛冶 +${p} / ${MAX_PLUS}</span>`;
    const card = (slot: string, icon: string, name: string, plus: number, stat: string, fx: string | undefined, desc: string) => `
      <div class="eqcard">
        <div class="eslot">${slot}</div>
        <div class="sicon">${icon}</div>
        <div class="sinfo">
          <div class="sname">${eqName(name, plus)}${plusTxt(plus)}</div>
          <div class="estat">${stat}</div>
          ${fx ? `<div class="efx">✨ ${fx}</div>` : ''}
          <div class="sdesc">${desc}</div>
        </div>
      </div>`;
    return `
        <div class="equip-body">
          <section>
            <h4>武器</h4>
            ${card('武器', w.icon, w.name, wp, weaponStatText(w, wp), w.effect && WEAPON_EFFECT_TEXT[w.effect], w.desc)}
          </section>
          <section>
            <h4>防具</h4>
            ${card('防具', a.icon, a.name, ap, `防御力 +${armorDef(a, ap)}`, a.effect && ARMOR_EFFECT_TEXT[a.effect], a.desc)}
          </section>
        </div>
`;
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
              return l
                ? `<span class="sk on" title="${sk.name}（覚えている）">${sk.icon}${sk.name}</span>`
                : `<span class="sk" title="Lv${sk.lv}で覚える">❔？？？</span>`;
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
        <div class="phead"><h2>📚 本棚</h2><button class="x" data-act="close">✕</button></div>
        <p class="note">持ち歩けるスキルブックは${MAX_CARRY}冊まで。本棚にある本のスキルは、習得していても使えない。どの本を持っていくか選ぼう。${d.cursed.length ? `<br>未鑑定の本が ${d.cursed.length} 冊ある。町の道具屋で鑑定しよう。` : ''}</p>
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

  // ---------------------------------------------------------------- ボックス（わが家）

  /** わが家のボックス：装備していない武器・防具をしまっておき、ここで持ち替える（スキルブックと同じ、左に一覧・右に詳細） */
  showBox() {
    const g = this.game;
    const d = g.data;
    const cw = weaponById(d.weapon);
    const ca = armorById(d.armor);
    const cwp = g.plusOf(cw.id);
    const cap = g.plusOf(ca.id);
    const boxW = WEAPONS.filter((x) => d.weapons.includes(x.id) && x.id !== d.weapon);
    const boxA = ARMORS.filter((x) => d.armors.includes(x.id) && x.id !== d.armor);

    // 一覧の並び（"weapon:id" / "armor:id"）。選んでいる品がなくなっていたら、しまってある最初の品を選ぶ
    const keys = [`weapon:${cw.id}`, `armor:${ca.id}`, ...boxW.map((x) => `weapon:${x.id}`), ...boxA.map((x) => `armor:${x.id}`)];
    if (!keys.includes(this.boxSel)) this.boxSel = keys[2] ?? keys[0];

    const item = (key: string, icon: string, name: string, plus: number, stat: string, worn: boolean) =>
      `<li class="${key === this.boxSel ? 'sel' : ''}" data-act="sel" data-arg="${key}">
          <span class="eqi">${icon}</span><span class="bn">${eqName(name, plus)}${worn ? '<i class="eqtag">装備中</i>' : ''}</span><small>${stat}</small></li>`;
    const wItem = (x: WeaponDef, worn: boolean) => item(`weapon:${x.id}`, x.icon, x.name, g.plusOf(x.id), weaponStatText(x, g.plusOf(x.id)), worn);
    const aItem = (x: ArmorDef, worn: boolean) => item(`armor:${x.id}`, x.icon, x.name, g.plusOf(x.id), `防御力 +${armorDef(x, g.plusOf(x.id))}`, worn);
    const list =
      `<li class="group">身につけている装備</li>${wItem(cw, true)}${aItem(ca, true)}` +
      `<li class="group">📦 武器（${boxW.length}）</li>${boxW.map((x) => wItem(x, false)).join('') || '<li class="none">しまってある武器はない</li>'}` +
      `<li class="group">📦 防具（${boxA.length}）</li>${boxA.map((x) => aItem(x, false)).join('') || '<li class="none">しまってある防具はない</li>'}`;

    this.open(
      'box',
      `<div class="panel book-panel box-panel">
        <div class="phead"><h2>📦 ボックス</h2><button class="x" data-act="close">✕</button></div>
        <div class="bparams">${this.menuParams()}</div>
        <div class="book-body">
          <ul class="book-list">${list}</ul>
          <div class="book-detail">${this.boxDetail(this.boxSel, cw, cwp, ca, cap)}</div>
        </div>
      </div>`,
      (act, arg) => {
        if (act === 'close') return this.close();
        if (act === 'sel') this.boxSel = arg;
        else if (act === 'equip') {
          const [kind, id] = arg.split(':');
          const k = kind === 'armor' ? 'armor' : 'weapon';
          const prev = k === 'weapon' ? weaponById(d.weapon) : armorById(d.armor);
          g.equip(k, id);
          const now = k === 'weapon' ? weaponById(d.weapon) : armorById(d.armor);
          if (now.id === id && prev.id !== id) this.log(`${eqName(now.name, g.plusOf(now.id))}を装備し、${eqName(prev.name, g.plusOf(prev.id))}をボックスにしまった。`);
        }
        const list = this.modal.querySelector('.book-list')?.scrollTop ?? 0;
        this.showBox();
        const nl = this.modal.querySelector('.book-list');
        if (nl) nl.scrollTop = list;
      },
    );
  }

  /** ボックスの右側：選んだ装備の詳細と、いまの装備との比べ */
  private boxDetail(key: string, cw: WeaponDef, cwp: number, ca: ArmorDef, cap: number): string {
    const g = this.game;
    const [kind, id] = key.split(':');
    const isW = kind === 'weapon';
    const x = isW ? weaponById(id) : armorById(id);
    const p = g.plusOf(x.id);
    const worn = x.id === (isW ? cw.id : ca.id);
    const stat = isW ? `${WEAPON_TYPE_ICON[(x as WeaponDef).type]} ${weaponStatText(x as WeaponDef, p)}` : `防御力 +${armorDef(x as ArmorDef, p)}`;
    const fx = isW ? (x as WeaponDef).effect && WEAPON_EFFECT_TEXT[(x as WeaponDef).effect!] : (x as ArmorDef).effect && ARMOR_EFFECT_TEXT[(x as ArmorDef).effect!];

    // いまの装備と比べたパラメタの増減と、武器の種類が変わるときに使える技の系統
    let cmp = '';
    if (!worn) {
      const gain: Partial<Record<Stat, number>> = {};
      if (isW) for (const k of STATS) gain[k] = weaponStat(x as WeaponDef, k, p) - weaponStat(cw, k, cwp);
      else gain.def = armorDef(x as ArmorDef, p) - armorDef(ca, cap);
      const chips = STATS.filter((k) => gain[k])
        .map((k) => `<span class="cmp ${gain[k]! > 0 ? 'up' : 'down'}">${STAT_NAME[k]} ${gain[k]! > 0 ? '+' : ''}${gain[k]}</span>`)
        .join('');
      const techOf = (t: WeaponType) => {
        const sc = (Object.keys(SCHOOL_WEAPON) as School[]).find((k) => SCHOOL_WEAPON[k] === t)!;
        return sc === 'magic' ? SCHOOL_NAME[sc] : `${SCHOOL_NAME[sc]}の技`;
      };
      const t = isW ? (x as WeaponDef).type : null;
      const swap = t && t !== cw.type ? `<span class="cmp swap">${WEAPON_TYPE_ICON[t]} ${techOf(t)}が使えるようになる（${techOf(cw.type)}は使えなくなる）</span>` : '';
      const now = isW ? eqName(cw.name, cwp) : eqName(ca.name, cap);
      cmp = `<h4>いまの装備（${now}）と比べると</h4><div class="cmps">${chips || '<span class="cmp">パラメタは変わらない</span>'}${swap}</div>`;
    }
    const act = worn ? '<span class="done">装備中</span>' : `<button data-act="equip" data-arg="${key}">装備する</button>`;
    return `<div class="bhead">
              <h3><span class="eqi">${x.icon}</span>${eqName(x.name, p)}<span class="blv">${isW ? '武器' : '防具'}</span></h3>
              <p>${x.desc}</p>
              <div class="lvrow"><div class="estat">${stat}<span class="eplus">鍛冶 +${p} / ${MAX_PLUS}</span></div><div class="lvact">${act}</div></div>
              ${fx ? `<div class="efx">✨ ${fx}</div>` : ''}
            </div>
            ${cmp}`;
  }

  // ---------------------------------------------------------------- セール

  /** 値段の表示。セールで安くなっていれば元の値段に線を引く */
  private priceHtml(target: SaleTarget, base: number): string {
    const now = this.game.priceOf(target, base);
    return now < base ? `<s class="was">${base}</s> <b class="salep">${now}</b> G` : `${base} G`;
  }

  /** お店の上に出す今日のセールの知らせ */
  /** 取引画面の上に、今日のセールを別ウィンドウで添える（セールがない日はそのまま） */
  private withSale(shop: 'shop' | 'smithy', panel: string): string {
    const s = this.game.todaySale();
    if (!s) return panel;
    const win =
      s.shop === shop
        ? `<div class="salewin">🏷️ 本日限りのセール！ <b>${s.name}</b>が<b>${offText(s.off)}</b>！</div>`
        : `<div class="salewin other">🏷️ 今日は${s.shop === 'shop' ? '道具屋' : '武器防具屋'}で${s.name}が${offText(s.off)}らしい。</div>`;
    return `<div class="modal-stack">${win}${panel}</div>`;
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
          <div class="sact"><button data-act="buy" data-arg="${it.id}" ${d.gold >= g.priceOf('item', it.price) ? '' : 'disabled'}>${this.priceHtml('item', it.price)}</button></div>
        </div>`,
      )
      .join('');
    const bookRow = (b: BookDef) => {
        const owned = d.books.includes(b.id);
        const locked = d.maxFloor < b.minFloor;
        const act = owned
          ? '<span class="done">購入済み</span>'
          : locked
            ? `<span class="lock">危険度${b.minFloor}の階に<br>到達で入荷</span>`
            : `<button data-act="buybook" data-arg="${b.id}" ${d.gold >= g.priceOf('book', b.price) ? '' : 'disabled'}>${this.priceHtml('book', b.price)}</button>`;
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
    const tabBtn = (id: ShopTab, label: string) => `<button class="tab ${this.shopTab === id ? 'on' : ''}" data-act="tab" data-arg="${id}">${label}</button>`;
    const tabs = `<div class="tabs">${tabBtn('buy', '🛒 買う')}${tabBtn('sell', '💰 本を売る')}${tabBtn('appraise', `🔍 鑑定${d.cursed.length ? ` (${d.cursed.length})` : ''}`)}</div>`;
    const buyList = `
          <h4>道具</h4>${itemRows}
          <h4>技の書</h4>${bookRows('tech')}
          <h4>パラメタの書</h4>${bookRows('stat')}
          <p class="note">上級の書と、二段構えの技を収めた「二段」の書は、ダンジョンの宝箱で見つかるらしい。ただし宝箱の本は未鑑定で、うちで鑑定するまで使えないぜ。</p>`;
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
          <p class="note">いらなくなった本や、同じ本の予備を買い取ってもらえる。店の本は売値の半額、ダンジョンの本はパラメタ 300 G・技 500 G。売った本は、また道具屋で買ったり宝箱で見つけたりできる。</p>
          ${[...owned.filter((b) => g.sparesOf(b.id) > 0), ...owned.filter((b) => g.sparesOf(b.id) === 0)].map(sellRow).join('')}
          ${d.cursed.length ? `<p class="note">未鑑定の本（${d.cursed.length}冊）は買い取れない。「鑑定」タブで鑑定してから売ろう。</p>` : ''}`;
    this.open(
      'shop',
      this.withSale('shop', `<div class="panel shop-panel">
        <div class="phead"><h2>🏪 道具屋</h2><div class="pstats"><span>所持金 <b>${d.gold}</b> G</span></div><button class="x" data-act="close">✕</button></div>
        <p class="npc">${SHOP_TALK[this.shopTab]}</p>
        ${tabs}
        <div class="shop-list">${this.shopTab === 'buy' ? buyList : this.shopTab === 'sell' ? sellList : this.appraiseList()}
        </div>
      </div>`),
      (act, arg) => {
        if (act === 'close') {
          this.shopTab = 'buy';
          this.sellConfirm = '';
          this.revealed = '';
          return this.close();
        }
        const prev = this.sellConfirm;
        this.sellConfirm = '';
        if (act === 'tab') {
          this.shopTab = arg === 'sell' || arg === 'appraise' ? arg : 'buy';
          this.revealed = '';
        } else if (act === 'appraise') this.appraise(Number(arg));
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
      npc = '親方「体力ばかりは鍛えても増えんからな。そのぶん、いい武器といい鎧で補うんだ。技の書を使うなら、剣の技は剣、魔術は杖、盾の技は盾を持っていけよ。買った品はその場で着けていきな。外した品は家のボックスに届けておく。」';
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
                ? '<span class="done">📦 ボックスにある</span>'
                : locked
                  ? `<span class="lock">危険度${it.minFloor}の階に<br>到達で入荷</span>`
                  : `<button data-act="buyeq" data-arg="${it.kind}:${it.id}" ${d.gold >= g.priceOf(it.kind, it.price) ? '' : 'disabled'}>${this.priceHtml(it.kind, it.price)}</button>`;
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
                    ? '<span class="done">📦 ボックスにある</span>'
                    : locked
                      ? `<span class="lock">危険度${it.minFloor}の階に到達で<br>作り方が分かる</span>`
                      : `<button data-act="craft" data-arg="${it.kind}:${it.id}" ${g.canCraft(r) ? '' : 'disabled'}>作る<br><small>${this.priceHtml('craft', r.gold)}</small></button>`;
                const body = locked
                  ? '<div class="sdesc">親方「こいつの作り方は、もっと危ない階の魔物を見てからだな。」</div>'
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
              note = 'わが家のボックスでほかの装備に持ち替えると売れる。';
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
      npc = `親方「ダンジョンで掘った鉱石を持ってきな。鉄なら +2 まで、魔法銀なら +4、竜炎石があれば +${MAX_PLUS} まで鍛えてやる。」`;
      section = (kind) =>
        items
          .filter((it) => it.kind === kind && owns(it))
          .map((it) => {
            const plus = g.plusOf(it.id);
            const max = plus >= MAX_PLUS;
            const base = forgeCost(it.price, plus);
            const cost = g.priceOf('forge', base);
            const need = forgeOre(plus);
            const have = g.oreOf(need.ore.id);
            const enough = have >= need.n;
            const pips = '★'.repeat(plus) + '☆'.repeat(MAX_PLUS - plus);
            const stat = max
              ? it.stat(plus)
              : `${it.stat(plus)} → <b>${it.stat(plus + 1)}</b><span class="oreneed ${enough ? 'ok' : 'short'}">${need.ore.icon} ${need.ore.name} ${have}/${need.n}</span>`;
            const act = max
              ? '<span class="done">最大まで<br>鍛えた</span>'
              : `<button data-act="forge" data-arg="${it.kind}:${it.id}" ${d.gold >= cost && enough ? '' : 'disabled'}>鍛える <small>${this.priceHtml('forge', base)}</small></button>`;
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
      this.withSale('smithy', `<div class="panel shop-panel">
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
      </div>`),
      (act, arg) => {
        const prev = this.eqConfirm;
        this.eqConfirm = '';
        if (act === 'close') return this.close();
        if (act === 'tab') return this.showSmithy(arg === 'forge' || arg === 'sell' || arg === 'craft' ? arg : 'shop');
        const [kind, id] = arg.split(':');
        const k = kind === 'armor' ? 'armor' : 'weapon';
        let forgedNow: string | undefined;
        if (act === 'buyeq') g.buyEquip(k, id);
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

  // ---------------------------------------------------------------- 道具屋の鑑定

  /** 未鑑定の本の呼び名（拾った順の通し番号をつける） */
  private unidentifiedName(c: UnidentifiedBook): string {
    return `${UNIDENTIFIED_NAME} #${c.no}`;
  }

  /** 道具屋の「鑑定」タブの中身 */
  private appraiseList(): string {
    const d = this.game.data;
    const rows = d.cursed
      .map((c) => {
        const b = bookById(c.book);
        const price = appraisePrice(b);
        return `<div class="srow unid">
          <div class="sicon book" style="--c:${UNIDENTIFIED_COLOR}">📕</div>
          <div class="sinfo"><div class="sname">${this.unidentifiedName(c)}<span class="ktag unid">正体不明</span></div><div class="sdesc"><span class="cpow ${b.kind}">${APPRAISE_HINT[b.kind]}</span>を秘めているようだ。</div></div>
          <div class="sact"><button data-act="appraise" data-arg="${c.no}" ${d.gold >= price ? '' : 'disabled'}>鑑定する<br><small>${price} G</small></button></div>
        </div>`;
      })
      .join('');
    const rb = this.revealed ? bookById(this.revealed) : null;
    const reveal = rb
      ? `<div class="reveal" style="--c:${rb.color}">
          <div class="rlbl">🔍 鑑定が終わった！ 本の正体は…</div>
          <div class="srow learned">
            <div class="sicon book" style="--c:${rb.color}">📗</div>
            <div class="sinfo"><div class="sname">${rb.name}<span class="ktag ${rb.kind}">${bookTag(rb)}</span></div><div class="sdesc">${rb.desc}<br><small>${rb.kind === 'tech' ? '収録' : '効果'}: ${
              rb.kind === 'tech'
                ? rb.skills.map((s) => `Lv${SKILLS[s].lv} ${d.learned.includes(s) ? `${SKILLS[s].icon}${SKILLS[s].name}` : '❔？？？'}`).join('・')
                : bookSummary(rb)
            }</small></div></div>
          </div>
          <p class="note">${this.revealedSpare ? `すでに持っている本なので<b>予備</b>になった。「本を売る」タブで ${sellPrice(rb)} G で売れる。` : 'Lv0から始まる。スキルブック [K] でSPを使ってレベルを上げよう。'}</p>
        </div>`
      : '';
    return `
          ${reveal}
          <h4>未鑑定の本</h4>
          ${rows || '<p class="note">未鑑定の本は持っていない。ダンジョンの宝箱で見つけた本は未鑑定なので、ここへ持ってこよう。</p>'}`;
  }

  /** 未鑑定の本（通し番号 no）を鑑定し、正体を見せる */
  private appraise(no: number) {
    const d = this.game.data;
    const c = d.cursed.find((x) => x.no === no);
    const spare = !!c && d.books.includes(c.book);
    const id = this.game.appraiseBook(no);
    if (id) {
      this.revealed = id;
      this.revealedSpare = spare;
    }
  }

  // ---------------------------------------------------------------- 神殿

  showTemple() {
    const g = this.game;
    const d = g.data;
    const cost = spCost(d.spBought);
    const ready = d.exp >= cost;
    const got = this.templeGot
      ? `<div class="reveal" style="--c:#f0d878"><div class="rlbl">✨ 神の祝福を受け、SP +${this.templeGot} を授かった！</div><p class="note">スキルブック [K] でSPを使って本のレベルを上げよう。</p></div>`
      : '';
    this.open(
      'temple',
      `<div class="panel shop-panel temple-panel">
        <div class="phead"><h2>⛪ 神殿</h2><div class="pstats"><span>SP <b class="spv">${d.sp}</b></span><span>EXP <b>${d.exp}</b></span></div><button class="x" data-act="close">✕</button></div>
        <p class="npc">神官「よくぞ戻られました。戦いで積んだ経験を祈りとして捧げれば、神はあなたに新たな力、スキルポイントを授けてくださいます。祈りを重ねるほど、より多くの経験が要りますぞ。」</p>
        <div class="shop-list">
          ${got}
          <h4>経験値をスキルポイントに変える</h4>
          <div class="srow">
            <div class="sicon">🙏</div>
            <div class="sinfo"><div class="sname">祈りを捧げる</div><div class="sdesc">EXP ${cost} を捧げて SP +1 を授かる。<br><small>${ready ? '祈りを捧げられる。' : `あと EXP ${cost - d.exp} 必要。`}</small></div></div>
            <div class="sact sellact">
              <button data-act="convert" ${ready ? '' : 'disabled'}>祈る<br><small>EXP ${cost} → SP +1</small></button>
              <button data-act="convertall" ${ready ? '' : 'disabled'}>できるだけ祈る</button>
            </div>
          </div>
          <p class="note">EXPは敵を倒すと手に入る。SPに変えるたびに、次に必要なEXPは増えていく。</p>
        </div>
      </div>`,
      (act) => {
        if (act === 'close') {
          this.templeGot = 0;
          return this.close();
        }
        if (act === 'convert' || act === 'convertall') this.templeGot = g.convertExp(act === 'convertall');
        this.showTemple();
      },
    );
  }

  // ---------------------------------------------------------------- 銀行

  /** 銀行の窓口でのやりとり（直前に預けた／引き出した額） */
  private bankMsg = '';

  showBank() {
    const g = this.game;
    const d = g.data;
    const amounts = [100, 1000];
    const btn = (act: string, n: number, have: number, label: string) =>
      `<button data-act="${act}" data-arg="${n}" ${have > 0 ? '' : 'disabled'}>${label}</button>`;
    const row = (act: 'deposit' | 'withdraw', have: number) =>
      amounts.map((n) => btn(act, n, have >= n ? 1 : 0, `${n} G`)).join('') + btn(act, Infinity, have, `全部<br><small>${have} G</small>`);
    const next = bankInterest(d.bank);
    this.open(
      'bank',
      `<div class="panel bank-panel">
        <div class="phead"><h2>🏦 銀行</h2><button class="x" data-act="close">✕</button></div>
        <p class="npc">頭取「いらっしゃいませ。お預かりしたゴールドは、ダンジョンで力尽きても一枚たりとも減りません。冒険の前にぜひどうぞ。」</p>
        <div class="bank-sum">
          <div class="bcell safe"><div class="blbl">預金</div><div class="bval">${d.bank} G</div><div class="bsub">倒れても減らない</div></div>
          <div class="bcell"><div class="blbl">所持金</div><div class="bval">${d.gold} G</div><div class="bsub">倒れると半分を失う</div></div>
        </div>
        ${this.bankMsg ? `<p class="bank-msg">${this.bankMsg}</p>` : ''}
        <div class="bank-ops">
          <div class="bop"><h4>預ける</h4><div class="bbtns">${row('deposit', d.gold)}</div></div>
          <div class="bop"><h4>引き出す</h4><div class="bbtns">${row('withdraw', d.bank)}</div></div>
        </div>
        <p class="note">利息：ダンジョンで階段を1つ降りるたびに、預金の ${Math.round(BANK_RATE * 100)}%（1回 ${BANK_INTEREST_CAP} G まで）がつく。${next > 0 ? `いまの預金なら 1回 <b>${next} G</b>。` : ''}<br>買い物は所持金でしかできない。手数料はかからない。</p>
      </div>`,
      (act, arg) => {
        if (act === 'close') {
          this.bankMsg = '';
          return this.close();
        }
        if (act === 'deposit') {
          const n = g.deposit(Number(arg));
          if (n > 0) this.bankMsg = `${n} G をお預かりしました。`;
        } else if (act === 'withdraw') {
          const n = g.withdraw(Number(arg));
          if (n > 0) this.bankMsg = `${n} G をお返しします。`;
        }
        this.showBank();
      },
    );
  }

  // ---------------------------------------------------------------- 遺跡の入口

  /** 古代遺跡の入口。ランクB になるまではギルドに封鎖されている */
  showEntrance() {
    const d = this.game.data;
    if (d.rank < RUINS.rank) {
      this.open(
        'entrance',
        `<div class="panel small-panel">
          <h2>🏛️ 古代遺跡</h2>
          <p class="npc">入口には鉄の柵が下ろされ、ハンターギルドの封印札が貼られている。<br>「ランク${rankDef(RUINS.rank).name}以上のハンター以外、立ち入りを禁ず」</p>
          <p class="note">ハンターギルドでランクを上げよう。（いまはランク ${rankDef(d.rank).name}）</p>
          <div class="btns"><button data-act="close">戻る</button></div>
        </div>`,
        () => this.close(),
      );
      return;
    }
    const reached = d.reached[RUINS.id] ?? 0;
    const btns = [1, ...(RUINS.checkpoints ?? [])]
      .filter((f) => f === 1 || reached >= f)
      .map((f) => `<button data-act="go" data-arg="${f}">地下 ${f} 階から<small class="dep">（危険度 ${RUINS.depths[f - 1]}）</small></button>`)
      .join('');
    this.open(
      'entrance',
      `<div class="panel small-panel">
        <h2>🏛️ 古代遺跡</h2>
        <p class="npc">ひんやりとした空気が流れ出ている…。</p>
        <p class="note">最深到達: ${reached > 0 ? `地下 ${reached} 階` : 'なし'}（地下${(RUINS.checkpoints ?? []).join('階・')}階に到達すると、そこから挑戦できる）</p>
        <div class="btns col">${btns}<button data-act="close" class="sub">やめる</button></div>
      </div>`,
      (act, arg) => {
        this.close();
        if (act === 'go') this.game.enterDungeon(RUINS.id, Number(arg));
      },
    );
  }

  // ---------------------------------------------------------------- ハンターギルド

  showGuild() {
    const g = this.game;
    const d = g.data;
    const r = rankDef(d.rank);
    const trial = trialFor(d.rank);
    const req = trial?.requires ? dungeonById(trial.requires) : undefined;
    const ready = !!trial && (!req || d.conquered.includes(req.id));
    const next = trial
      ? ready
        ? `<b>昇格試験</b>を受けられる！ 合格すればランク ${rankDef(d.rank + 1).name}。`
        : `『${req?.name}』を踏破すると、ランク ${rankDef(d.rank + 1).name} への昇格試験を受けられる。`
      : d.rank === RANK_B
        ? '古代遺跡への立ち入りが許されている。最深部の秘宝を手に入れれば、伝説の S ランクだ。'
        : '伝説の秘宝を手に入れた、ギルドの誇り。';
    const ladder = RANKS.map(
      (x, i) => `<span class="${i < d.rank ? 'past' : i === d.rank ? 'cur' : ''}" style="--rc:${x.color}">${x.name}</span>`,
    ).join('<i>›</i>');
    const range = (x: DungeonDef) => {
      const lo = Math.min(...x.depths);
      const hi = Math.max(...x.depths);
      return lo === hi ? `危険度 ${lo}` : `危険度 ${lo}〜${hi}`;
    };
    const rows = FIELD_DUNGEONS.map((x) => {
      const open = d.rank >= x.rank;
      const done = d.conquered.includes(x.id);
      const reached = d.reached[x.id] ?? 0;
      const act = !open
        ? `<span class="lock">ランク${rankDef(x.rank).name}で<br>挑める</span>`
        : x.from === 'ruin'
          ? '<span class="lock">町の遺跡の<br>入口から</span>'
          : `<button data-act="go" data-arg="${x.id}">出発</button>`;
      return `<div class="srow dg ${open ? '' : 'locked'}">
        <div class="sicon">${open ? x.icon : '🔒'}</div>
        <div class="sinfo">
          <div class="sname">${x.name}<span class="rtag" style="--rc:${rankDef(x.rank).color}">ランク${rankDef(x.rank).name}</span>${done ? '<span class="dtag">踏破</span>' : ''}</div>
          <div class="sdesc">${x.desc}<br><small>全${x.depths.length}階・${range(x)}${reached ? `・到達 地下${reached}階` : ''}${x.reward && open ? `・踏破の宝箱 ${done ? Math.round(x.reward / 2) : x.reward} G` : ''}</small></div>
        </div>
        <div class="sact">${act}</div>
      </div>`;
    }).join('');
    const trialRow = trial
      ? `<h4>昇格試験</h4>
        <div class="srow dg trial ${ready ? 'ready' : 'locked'}">
          <div class="sicon">${trial.icon}</div>
          <div class="sinfo">
            <div class="sname">${trial.name}<span class="rtag" style="--rc:${rankDef(d.rank + 1).color}">→ ランク${rankDef(d.rank + 1).name}</span></div>
            <div class="sdesc">${trial.desc}<br><small>全${trial.depths.length}階・${range(trial)}・最後の階でボスと戦う（途中で町へ戻ればやり直せる）</small></div>
          </div>
          <div class="sact">${ready ? `<button data-act="go" data-arg="${trial.id}">試験に挑む</button>` : `<span class="lock">『${req?.name}』を<br>踏破すると受験できる</span>`}</div>
        </div>`
      : '';
    const npc =
      d.rank === 0 && !d.conquered.length
        ? '受付嬢「ようこそ、ハンターギルドへ！ 新人さんはランクE から。まずは森の洞窟の一番奥にある踏破の宝箱を目指してみてください。踏破できたら昇格試験を受けられますよ。」'
        : ready
          ? '受付嬢「踏破の報告、確かに受け取りました！ 昇格試験の準備はできています。腕に自信がついたらいつでもどうぞ。」'
          : d.rank >= RANK_B
            ? '受付嬢「あなたほどのハンターなら、古代遺跡の奥にも挑めるはず。どうかご無事で。」'
            : '受付嬢「ダンジョンの最後の階には、踏破の証になる宝箱があります。開けたら昇格試験を受けられますよ。」';
    this.open(
      'guild',
      `<div class="panel shop-panel guild-panel">
        <div class="phead"><h2>🛡️ ハンターギルド</h2><button class="x" data-act="close">✕</button></div>
        <p class="npc">${npc}</p>
        <div class="guild-card" style="--rc:${r.color}">
          <div class="rank-badge">${r.name}</div>
          <div class="rinfo">
            <div class="rtitle">ランク ${r.name}・${r.title}</div>
            <div class="rnext">${next}</div>
            <div class="rladder">${ladder}</div>
          </div>
        </div>
        <div class="shop-list">
          ${trialRow}
          <h4>ダンジョン</h4>
          ${rows}
        </div>
      </div>`,
      (act, arg) => {
        this.close();
        if (act === 'go') g.enterDungeon(arg);
      },
    );
  }

  /** 昇格試験に合格した */
  showPromotion(rank: number) {
    const r = rankDef(rank);
    const now = FIELD_DUNGEONS.filter((x) => x.rank === rank);
    const where = now.map((x) => `${x.icon} <b>${x.name}</b>${x.from === 'ruin' ? '（町の遺跡の入口から）' : ''}`).join('、');
    this.open(
      'promo',
      `<div class="panel small-panel promo" style="--rc:${r.color}">
        <h2>🎖️ 昇格試験 合格！</h2>
        <div class="rank-badge big">${r.name}</div>
        <p>ランク <b>${r.name}</b>（${r.title}）に認定された！</p>
        ${where ? `<p class="note">${where} に挑めるようになった。</p>` : ''}
        <p class="note">階段から町へ戻ろう。</p>
        <div class="btns"><button data-act="ok">やった！</button></div>
      </div>`,
      () => this.close(),
    );
  }

  showDeath(lost: number) {
    this.open(
      'death',
      `<div class="panel small-panel death">
        <h2>💀 力尽きた…</h2>
        <p>通りがかった冒険者に助けられ、町へ運ばれた。</p>
        <p class="note">所持金 <b>${lost} G</b> を失った。（経験値・スキル・銀行の預金は失われない）</p>
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
        <p>ハンターギルドから、伝説の <b>ランク ${rankDef(this.game.data.rank).name}</b> に認定された！</p>
        <p class="note">トレジャーハンターの名は、遺跡の伝説とともに語り継がれるだろう。<br>このまま冒険を続けることもできる。</p>
        <div class="btns"><button data-act="ok">冒険を続ける</button></div>
      </div>`,
      () => this.close(),
    );
  }
}
