export type SkillKind = 'active' | 'passive';

/** パラメタ：攻撃力（剣・弓・盾の威力）、魔力（杖と魔術の威力）、防御力（受けるダメージを減らす）、運（会心・ドロップ・ゴールド） */
export type Stat = 'atk' | 'mag' | 'def' | 'luck';
export const STATS: Stat[] = ['atk', 'mag', 'def', 'luck'];
export const STAT_NAME: Record<Stat, string> = { atk: '攻撃力', mag: '魔力', def: '防御力', luck: '運' };
export const STAT_ICON: Record<Stat, string> = { atk: '⚔️', mag: '🔮', def: '🛡️', luck: '🍀' };

/** 会心の一撃（ダメージ1.5倍）の確率。基本5%、運1につき +0.5%、最大50% */
export function critRate(luck: number): number {
  return Math.min(0.5, 0.05 + luck * 0.005);
}

/** 敵が回復薬・エーテル・鉱石を落とす確率の倍率（運40で2倍） */
export function dropMult(luck: number): number {
  return 1 + luck / 40;
}

/** 敵が落とすゴールドの倍率（運1につき +1%） */
export function goldMult(luck: number): number {
  return 1 + luck / 100;
}

/** 運の効果の説明 */
export function luckText(luck: number): string {
  return `会心率 ${Math.round(critRate(luck) * 100)}%・ドロップ率 ×${dropMult(luck).toFixed(2)}・ゴールド +${Math.round((goldMult(luck) - 1) * 100)}%`;
}

/** 技の系統。どの技も、対応する武器（剣・弓・杖・盾）を装備しているときだけ使える */
export type School = 'sword' | 'bow' | 'magic' | 'shield';
export const SCHOOL_NAME: Record<School, string> = { sword: '剣', bow: '弓', magic: '魔術', shield: '盾' };
/** 系統ごとに必要な武器の種類（equipment.ts の WeaponType） */
export const SCHOOL_WEAPON: Record<School, 'sword' | 'bow' | 'staff' | 'shield'> = { sword: 'sword', bow: 'bow', magic: 'staff', shield: 'shield' };

export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  /** 本がこのレベルに達すると覚える */
  lv: number;
  /** 使用時の消費MP */
  mp: number;
  /** クールタイム(秒) */
  cd: number;
  icon: string;
  desc: string;
  /** 2段階の書の1段目：使うと、このフロアにいる間ずっとこの状態になる */
  stance?: string;
  /** 2段階の書の2段目：この状態のときだけ使える */
  needs?: string;
}

/**
 * 2段階の書の「状態」。1段目の技で入り、そのフロアにいる間（階段を降りる・町へ戻るまで）続く。
 * 状態そのものにも小さな効果があり、状態のあいだは2段目の技が何度でも使える
 */
export interface StanceDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** パラメタを 15% 上げる。crit は会心率 +15% */
  boost: Stat | 'crit';
}
export const STANCE_BOOST = 0.15;
export const STANCES: Record<string, StanceDef> = {
  kenki: { id: 'kenki', name: '剣気', icon: '⚜️', color: '#ff7a50', boost: 'atk' },
  hawkeye: { id: 'hawkeye', name: '鷹の構え', icon: '🔭', color: '#ffd84a', boost: 'crit' },
  manaflow: { id: 'manaflow', name: '魔力覚醒', icon: '💠', color: '#b890ff', boost: 'mag' },
  oath: { id: 'oath', name: '守護の誓い', icon: '🔰', color: '#fff0a0', boost: 'def' },
};

/** 状態の効果の説明（例：「攻撃力 +15%」） */
export function stanceText(st: StanceDef): string {
  const v = `+${Math.round(STANCE_BOOST * 100)}%`;
  return st.boost === 'crit' ? `会心率 ${v}` : `${STAT_NAME[st.boost]} ${v}`;
}

/** 体力が減ったときに発動する効果 */
export type PinchEffect =
  /** パラメタを ◯% 上げる */
  | { kind: 'boost'; stat: Stat }
  /** from の ◯% を to に加算する */
  | { kind: 'convert'; from: Stat; to: Stat };

export type BookKind = 'stat' | 'tech' | 'pinch';
export const BOOK_KIND_NAME: Record<BookKind, string> = { stat: 'パラメタ', tech: '技', pinch: '窮地' };

export interface BookDef {
  id: string;
  name: string;
  kind: BookKind;
  /** 1 = 初級, 2 = 中級, 3 = 上級（窮地の書は 0） */
  tier: number;
  source: 'start' | 'shop' | 'dungeon';
  price: number;
  /** shop: この階に到達すると入荷 / dungeon: この階以降の宝箱に出現 */
  minFloor: number;
  color: string;
  desc: string;
  maxLv: number;
  /** 技の書：収録スキル */
  skills: string[];
  /** 技の書：系統 */
  school?: School;
  /** パラメタの書：レベル1つごとに増える値 */
  stat?: { key: Stat; perLv: number };
  /** 窮地の書：体力がこの割合以下で発動。values[レベル-1] が効果量（0.3 = 30%） */
  pinch?: { hp: number; effect: PinchEffect; values: number[] };
}

export const TIER_NAME = ['', '初級', '中級', '上級', '二段'];

const SKILL_LIST: SkillDef[] = [
  // ---- 剣（攻撃力で威力が決まる。剣を装備しているときだけ使える）
  { id: 'smash', name: '強打', kind: 'active', lv: 1, mp: 6, cd: 1, icon: '💥', desc: '力をこめて前方をなぎ払う。通常攻撃より広く重い一撃。' },
  { id: 'spin', name: '回転斬り', kind: 'active', lv: 2, mp: 15, cd: 2, icon: '🌀', desc: '周囲の敵をまとめて斬りつけ、吹き飛ばす。' },
  { id: 'dash', name: '疾風', kind: 'active', lv: 3, mp: 10, cd: 8, icon: '👟', desc: '4秒間、移動速度が大きく上がる。' },
  { id: 'wave', name: '剣閃', kind: 'active', lv: 1, mp: 12, cd: 1, icon: '🌙', desc: '斬撃を飛ばす。敵を貫いてまっすぐ進む。' },
  { id: 'combo', name: '連撃', kind: 'passive', lv: 2, mp: 0, cd: 0, icon: '⚡', desc: '剣の通常攻撃がすばやくなる。' },
  { id: 'rush', name: '突進斬り', kind: 'active', lv: 4, mp: 14, cd: 3, icon: '🏃', desc: '向いている方向へ突進し、通り道の敵を斬る。突進中は無敵。' },
  { id: 'flame', name: '烈火陣', kind: 'active', lv: 1, mp: 30, cd: 8, icon: '🔥', desc: '4秒間、自分の周囲に炎をまとい、近づく敵を焼き続ける。' },
  { id: 'evade', name: '見切り', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '👁️', desc: '敵の攻撃を20%の確率でかわす。' },
  { id: 'blades', name: '奥義・千刃', kind: 'active', lv: 5, mp: 40, cd: 14, icon: '⚔️', desc: '1.5秒間、周囲の敵を無数の刃で斬り刻む。' },
  // ---- 弓（攻撃力で威力が決まる。弓を装備しているときだけ使える）
  { id: 'triple', name: '三連射', kind: 'active', lv: 1, mp: 8, cd: 0.9, icon: '🎯', desc: '扇状に3本の矢を同時に放つ。' },
  { id: 'smoke', name: '煙玉', kind: 'active', lv: 2, mp: 10, cd: 8, icon: '🌫️', desc: '周囲の敵を3秒間ひるませ、動けなくする。' },
  { id: 'trapsense', name: '狩人の勘', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '🐾', desc: '床に隠された罠が見えるようになる。' },
  { id: 'pierce', name: '貫通矢', kind: 'active', lv: 1, mp: 12, cd: 1.2, icon: '➶', desc: '敵を貫いて飛ぶ、強力な矢を放つ。' },
  { id: 'detect', name: '鷹の目', kind: 'active', lv: 2, mp: 15, cd: 5, icon: '🦅', desc: 'このフロアの宝箱と下り階段の位置を見抜き、地図に表示する。' },
  { id: 'shadowstep', name: '影走り', kind: 'active', lv: 4, mp: 12, cd: 2.5, icon: '👤', desc: '向いている方向へ瞬間移動する。移動の瞬間は無敵。' },
  { id: 'bomb', name: '爆裂矢', kind: 'active', lv: 1, mp: 14, cd: 1.2, icon: '💣', desc: '当たると爆発する矢を放つ。範囲内の敵に大ダメージ。' },
  { id: 'rapid', name: '速射', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '🏹', desc: '弓の通常攻撃がすばやくなる。' },
  { id: 'rain', name: '矢の雨', kind: 'active', lv: 5, mp: 45, cd: 14, icon: '🌧️', desc: '周囲にいるすべての敵に矢の雨を降らせる。' },
  // ---- 魔術（魔力で威力が決まる。杖を装備しているときだけ使える）
  { id: 'firebolt', name: '火球', kind: 'active', lv: 1, mp: 6, cd: 0.5, icon: '☄️', desc: '向いている方向に火の玉を放つ。' },
  { id: 'heal', name: 'ヒール', kind: 'active', lv: 2, mp: 20, cd: 3, icon: '💚', desc: '体力を回復する。魔力が高いほど多く回復する。' },
  { id: 'mpregen', name: '魔力循環', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '🔷', desc: 'MPの自然回復速度が3倍になる。' },
  { id: 'bolt', name: '雷撃', kind: 'active', lv: 1, mp: 18, cd: 1.5, icon: '🌩️', desc: '最も近い敵に雷を落とし、近くの敵へ2回まで連鎖する。' },
  { id: 'regen', name: '自然治癒', kind: 'passive', lv: 2, mp: 0, cd: 0, icon: '🌿', desc: '体力が少しずつ自動で回復する。' },
  { id: 'barrier', name: '魔法障壁', kind: 'active', lv: 4, mp: 25, cd: 12, icon: '🔮', desc: '3秒間、あらゆるダメージを無効化する。' },
  { id: 'frost', name: '氷結陣', kind: 'active', lv: 1, mp: 28, cd: 9, icon: '❄️', desc: '周囲の敵を凍りつかせ、ダメージを与えて2.5秒間動けなくする。' },
  { id: 'focus', name: '魔力解放', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '✴️', desc: '魔術の消費MPが25%少なくなる。' },
  { id: 'storm', name: '雷嵐', kind: 'active', lv: 5, mp: 50, cd: 15, icon: '⛈️', desc: '周囲にいるすべての敵に強力な雷を降らせる。' },
  // ---- 盾（防御力と攻撃力で威力が決まる。盾を装備しているときだけ使える）
  { id: 'shieldbash', name: '盾撃', kind: 'active', lv: 1, mp: 8, cd: 1.2, icon: '🛡️', desc: '盾を力いっぱい叩きつけ、前方の敵を大きく吹き飛ばして1.5秒ひるませる。防御力が高いほど強い。' },
  { id: 'ironwall', name: '鉄壁', kind: 'active', lv: 2, mp: 18, cd: 12, icon: '🧱', desc: '5秒間、防御力が2倍になる。' },
  { id: 'counter', name: '反撃', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '💢', desc: '攻撃を受けると、盾で押し返して周囲の敵にダメージを与える。' },
  { id: 'charge', name: '盾突進', kind: 'active', lv: 1, mp: 14, cd: 3, icon: '🐗', desc: '盾を構えて突進し、通り道の敵をはね飛ばしてひるませる。突進中は無敵。' },
  { id: 'sturdy', name: '不動', kind: 'passive', lv: 2, mp: 0, cd: 0, icon: '⛰️', desc: '攻撃を受けても吹き飛ばされず、そのあと無敵でいる時間が長くなる。' },
  { id: 'reflect', name: '反射の盾', kind: 'active', lv: 4, mp: 20, cd: 10, icon: '🪞', desc: '4秒間、敵の飛び道具を2倍の威力で跳ね返す。' },
  { id: 'sanctuary', name: '聖域', kind: 'active', lv: 1, mp: 30, cd: 14, icon: '✨', desc: '6秒間、足元に聖域を張る。体力が少しずつ回復し、近づく敵を押し返す。' },
  { id: 'fortress', name: '要塞', kind: 'passive', lv: 3, mp: 0, cd: 0, icon: '🏰', desc: '防御力の30%が攻撃力に加わる。' },
  { id: 'bulwark', name: '奥義・不落', kind: 'active', lv: 5, mp: 40, cd: 16, icon: '🌟', desc: '2.5秒間あらゆる攻撃を受け止め、最後に周囲へ強烈な衝撃波を放つ。防御力が高いほど強い。' },
  // ---- 2段階の書（1段目で「状態」に入り、そのフロアのあいだ2段目が使える）
  { id: 'kenkiup', name: '剣気解放', kind: 'active', lv: 1, mp: 20, cd: 1, icon: '⚜️', stance: 'kenki', desc: '【1段目】剣気をまとい、このフロアにいる間ずっと攻撃力が15%上がる。剣気のあいだは2段目「斬鉄閃」が使える。' },
  { id: 'zantetsu', name: '斬鉄閃', kind: 'active', lv: 3, mp: 22, cd: 2.5, icon: '💫', needs: 'kenki', desc: '【2段目】剣気のときだけ使える。敵を貫く巨大な斬撃を3本、扇状に飛ばす。' },
  { id: 'hawkup', name: '鷹の構え', kind: 'active', lv: 1, mp: 20, cd: 1, icon: '🔭', stance: 'hawkeye', desc: '【1段目】狙いを研ぎすまし、このフロアにいる間ずっと会心率が15%上がる。構えのあいだは2段目「流星射」が使える。' },
  { id: 'meteorshot', name: '流星射', kind: 'active', lv: 3, mp: 20, cd: 2, icon: '🌠', needs: 'hawkeye', desc: '【2段目】鷹の構えのときだけ使える。敵を貫く光の矢を5本、扇状に放つ。' },
  { id: 'manaup', name: '魔力覚醒', kind: 'active', lv: 1, mp: 20, cd: 1, icon: '💠', stance: 'manaflow', desc: '【1段目】眠れる魔力を呼び覚まし、このフロアにいる間ずっと魔力が15%上がる。覚醒のあいだは2段目「メテオ」が使える。' },
  { id: 'meteor', name: 'メテオ', kind: 'active', lv: 3, mp: 32, cd: 4, icon: '🌋', needs: 'manaflow', desc: '【2段目】魔力覚醒のときだけ使える。近くの敵3体に隕石を落とし、まわりごと吹き飛ばす。' },
  { id: 'oathup', name: '守護の誓い', kind: 'active', lv: 1, mp: 20, cd: 1, icon: '🔰', stance: 'oath', desc: '【1段目】守りを誓い、このフロアにいる間ずっと防御力が15%上がる。誓いのあいだは2段目「審判の盾」が使える。' },
  { id: 'judgment', name: '審判の盾', kind: 'active', lv: 3, mp: 26, cd: 4, icon: '🔆', needs: 'oath', desc: '【2段目】守護の誓いのときだけ使える。盾を大地に打ちつけ、周囲の敵に光の衝撃波を放って2秒間ひるませる。防御力が高いほど強い。' },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(SKILL_LIST.map((s) => [s.id, s]));

/** パラメタの書を作る。初級は Lv3 まで +2 ずつ、中級は Lv4 まで +3 ずつ、上級は Lv5 まで +4 ずつ */
function statBook(stat: Stat, tier: 1 | 2 | 3, name: string, color: string, desc: string): BookDef {
  const src: BookDef['source'] = tier === 3 ? 'dungeon' : 'shop';
  return {
    id: `${stat}${tier}`,
    name: `${name}・${TIER_NAME[tier]}`,
    kind: 'stat',
    tier,
    source: src,
    price: [0, 200, 600, 0][tier],
    minFloor: [0, 0, 3, 4][tier],
    color,
    desc,
    maxLv: tier + 2,
    skills: [],
    stat: { key: stat, perLv: tier + 1 },
  };
}

function techBook(school: School, tier: 1 | 2 | 3 | 4, name: string, color: string, desc: string, skills: string[]): BookDef {
  return {
    id: `${school}${tier}`,
    name: `${name}・${TIER_NAME[tier]}`,
    kind: 'tech',
    tier,
    source: tier >= 3 ? 'dungeon' : school === 'sword' && tier === 1 ? 'start' : 'shop',
    price: [0, 300, 650, 0, 0][tier],
    minFloor: [0, 0, 3, 5, 5][tier],
    color,
    desc,
    maxLv: Math.max(...skills.map((s) => SKILLS[s].lv)),
    skills,
    school,
  };
}

function pinchBook(id: string, name: string, minFloor: number, color: string, desc: string, hp: number, effect: PinchEffect, values: number[]): BookDef {
  return { id, name, kind: 'pinch', tier: 0, source: 'dungeon', price: 0, minFloor, color, desc, maxLv: values.length, skills: [], pinch: { hp, effect, values } };
}

export const BOOKS: BookDef[] = [
  // ---- 技の書
  techBook('sword', 1, '剣技の書', '#a83a32', '駆け出しの剣士が最初に読む教本。', ['smash', 'spin', 'dash']),
  techBook('sword', 2, '剣技の書', '#c0402a', '王国騎士団に伝わる剣の指南書。', ['wave', 'combo', 'rush']),
  techBook('sword', 3, '剣技の書', '#e04a20', '伝説の剣聖が遺した秘伝書。', ['flame', 'evade', 'blades']),
  techBook('bow', 1, '弓術の書', '#5a8a3a', '森の狩人に伝わる弓の手ほどき。', ['triple', 'smoke', 'trapsense']),
  techBook('bow', 2, '弓術の書', '#3f7a4a', '盗賊ギルドの射手が使う技の書。', ['pierce', 'detect', 'shadowstep']),
  techBook('bow', 3, '弓術の書', '#2a6a5a', '天翔ける弓聖の極意が記された書。', ['bomb', 'rapid', 'rain']),
  techBook('magic', 1, '魔術の書', '#5a4ab0', '魔法学院の入門書。', ['firebolt', 'heal', 'mpregen']),
  techBook('magic', 2, '魔術の書', '#3a6ac8', '宮廷魔術師の研究ノート。', ['bolt', 'regen', 'barrier']),
  techBook('magic', 3, '魔術の書', '#3ab0d0', '天空の神殿から持ち出された禁断の魔導書。', ['frost', 'focus', 'storm']),
  techBook('shield', 1, '盾術の書', '#8a7a5a', '城門を守る衛兵の心得をまとめた書。', ['shieldbash', 'ironwall', 'counter']),
  techBook('shield', 2, '盾術の書', '#7a8a9a', '重装騎士団に伝わる盾の戦法。', ['charge', 'sturdy', 'reflect']),
  techBook('shield', 3, '盾術の書', '#c8a040', '聖騎士の誓いと奥義が記された書。', ['sanctuary', 'fortress', 'bulwark']),
  // ---- 2段階の書（遺跡の地下5階から）
  techBook('sword', 4, '剣技の書', '#ff5a3a', '剣気をまとってから放つ、二段構えの剣技の書。', ['kenkiup', 'zantetsu']),
  techBook('bow', 4, '弓術の書', '#c8a020', '構えてから射る、二段構えの弓術の書。', ['hawkup', 'meteorshot']),
  techBook('magic', 4, '魔術の書', '#8a50e0', '魔力を目覚めさせてから唱える、二段構えの魔導書。', ['manaup', 'meteor']),
  techBook('shield', 4, '盾術の書', '#e8d070', '誓いを立ててから振るう、二段構えの盾術の書。', ['oathup', 'judgment']),
  // ---- パラメタの書
  statBook('atk', 1, '剛力の書', '#b8603a', '読むだけで腕に力がみなぎる。'),
  statBook('atk', 2, '剛力の書', '#c84a2a', '鍛錬の極意をまとめた書。'),
  statBook('atk', 3, '剛力の書', '#d83018', '古の闘神の力が宿る書。'),
  statBook('mag', 1, '叡智の書', '#7a5ac8', '魔力の扱い方を説いた書。'),
  statBook('mag', 2, '叡智の書', '#6a3ad0', '大賢者の講義録。'),
  statBook('mag', 3, '叡智の書', '#8a20e0', '星の理が記された書。'),
  statBook('def', 1, '堅守の書', '#5a7a9a', '身を守る心得を説いた書。'),
  statBook('def', 2, '堅守の書', '#4a6aa8', '城塞騎士の守りの書。'),
  statBook('def', 3, '堅守の書', '#2a50b8', '不落の要塞の名を冠した書。'),
  statBook('luck', 1, '幸運の書', '#58a848', '四つ葉のクローバーが挟まった書。'),
  statBook('luck', 2, '幸運の書', '#3a9a6a', '大商人が肌身離さず持っていた書。'),
  statBook('luck', 3, '幸運の書', '#d8b030', '女神の祝福が込められた黄金の書。'),
  // ---- 窮地の書（体力が減ると発動）
  pinchBook('rage', '背水の書', 2, '#c03040', '追いつめられた者ほど強くなる。', 0.3, { kind: 'boost', stat: 'atk' }, [0.25, 0.4, 0.6]),
  pinchBook('endure', '不屈の書', 2, '#6a7a8a', '倒れない意志が身を守る。', 0.3, { kind: 'boost', stat: 'def' }, [0.4, 0.7, 1]),
  pinchBook('awaken', '覚醒の書', 3, '#a040c0', '死の淵で眠れる魔力が目覚める。', 0.3, { kind: 'boost', stat: 'mag' }, [0.25, 0.4, 0.6]),
  pinchBook('reckless', '捨て身の書', 4, '#d06020', '守りを捨て、すべてを攻撃にかける。', 0.4, { kind: 'convert', from: 'def', to: 'atk' }, [0.5, 0.75, 1]),
  pinchBook('aegis', '魔盾の書', 4, '#4090c0', '魔力を盾に変えて身を守る。', 0.4, { kind: 'convert', from: 'mag', to: 'def' }, [0.5, 0.75, 1]),
  pinchBook('fortune', '起死回生の書', 3, '#e0b020', '絶体絶命のときこそ、幸運の女神がほほえむ。', 0.3, { kind: 'boost', stat: 'luck' }, [0.5, 1, 1.5]),
];

export const START_BOOK = 'sword1';

export function bookById(id: string): BookDef {
  return BOOKS.find((b) => b.id === id) ?? BOOKS[0];
}

export function isBook(id: string): boolean {
  return BOOKS.some((b) => b.id === id);
}

/** 本の最大レベル */
export function bookMaxLv(b: BookDef): number {
  return b.maxLv;
}

/** レベル lv の本を次のレベルへ上げるのに必要なSP */
export function lvUpCost(lv: number): number {
  // Lv0→1 は SP 1、それ以降は今のレベルと同じ SP
  if (lv < 1) return 1;
  return lv;
}

/** スキルを収録している本 */
export function bookOfSkill(skillId: string): BookDef | undefined {
  return BOOKS.find((b) => b.skills.includes(skillId));
}

/** 魔術かどうか（魔力解放の対象） */
export function isMagic(skillId: string): boolean {
  return bookOfSkill(skillId)?.school === 'magic';
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 窮地の書の効果の説明。lv = 0 なら「Lv1 での効果」を示す */
export function pinchText(b: BookDef, lv: number): string {
  const p = b.pinch;
  if (!p) return '';
  if (lv < 1) return `体力${pct(p.hp)}以下で発動（Lv0なので効果なし）`;
  const v = p.values[Math.min(p.values.length, lv) - 1];
  const e = p.effect;
  const what = e.kind === 'boost' ? `${STAT_NAME[e.stat]} +${pct(v)}` : `${STAT_NAME[e.from]}の${pct(v)}を${STAT_NAME[e.to]}に加算`;
  return `体力${pct(p.hp)}以下で ${what}`;
}

/** 窮地の書のレベルごとの効果量の短い表示（例：「60%」） */
export function pinchValueText(b: BookDef, i: number): string {
  return `${Math.round((b.pinch?.values[i] ?? 0) * 100)}%`;
}

/** 本の種類の見出し（例：「剣の技・初級」「攻撃力・中級」「窮地」） */
export function bookTag(b: BookDef): string {
  if (b.kind === 'tech' && b.school) return `${SCHOOL_NAME[b.school]}の技・${TIER_NAME[b.tier]}`;
  if (b.kind === 'stat' && b.stat) return `${STAT_NAME[b.stat.key]}・${TIER_NAME[b.tier]}`;
  return '窮地で発動';
}

/** 本の中身の短い説明（道具屋や本棚で使う） */
export function bookSummary(b: BookDef): string {
  if (b.kind === 'stat' && b.stat) return `Lv1ごとに${STAT_NAME[b.stat.key]} +${b.stat.perLv}（最大 +${b.stat.perLv * b.maxLv}）`;
  if (b.kind === 'pinch') return `${pinchText(b, 1)}（Lv${b.maxLv}で ${pinchText(b, b.maxLv).split(' ').slice(1).join(' ')}）`;
  return b.skills.map((s) => `Lv${SKILLS[s].lv} ${SKILLS[s].icon}${SKILLS[s].name}`).join('・');
}

export const TREASURE_NAME = '星詠みの羅針盤';

/** 呪われた本（ダンジョンで拾い、まだ浄化していない本）の見た目と、神殿での浄化の代金 */
export const CURSE_COLOR = '#6a3a8a';
export const CURSED_NAME = '呪われた書';
/** 神殿での浄化の代金は本の系統で変わる（強い本ほど呪いも強い） */
export const PURIFY_PRICE: Record<BookKind, number> = { stat: 150, pinch: 250, tech: 350 };
/** 神官が感じとる呪いの強さ（代金とあわせて、正体の手がかりになる） */
export const CURSE_POWER: Record<BookKind, string> = { stat: '弱い呪い', pinch: '強い呪い', tech: 'とても強い呪い' };
export function purifyPrice(b: BookDef): number {
  return PURIFY_PRICE[b.kind];
}

/** 遺跡でしか見つからない本を道具屋が買い取る値段 */
const DUNGEON_SELL: Record<BookKind, number> = { stat: 300, pinch: 400, tech: 500 };

/** 道具屋が本を買い取る値段。店で売っている本は売値の半額。最初の本は売れない（0） */
export function sellPrice(b: BookDef): number {
  if (b.source === 'start') return 0;
  if (b.source === 'shop') return Math.floor(b.price / 2);
  return DUNGEON_SELL[b.kind];
}

/** Lv0 からレベル lv まで上げるのに使った SP の合計 */
export function spSpent(lv: number): number {
  let sp = 0;
  for (let l = 0; l < lv; l++) sp += lvUpCost(l);
  return sp;
}
