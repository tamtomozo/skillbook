// ボタンやタブを押したときの短い音（plane プロジェクトと同じ音）。
// 音のファイルは使わず、WebAudio でその場で作る。
// ボタンは木を軽く叩いたような「コッ」、タブは少し高く軽い「チッ」。

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuffer: AudioBuffer;

/** ブラウザは、ボタンを押すなどの操作のあとでないと音を出せない。最初の操作で作る */
function ensure(): AudioContext | null {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function playClick(kind: 'button' | 'tab') {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const tab = kind === 'tab';
  const len = tab ? 0.035 : 0.06;

  // 音の芯：高いところから一瞬で下がる正弦波
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(tab ? 2300 : 1250, t);
  o.frequency.exponentialRampToValueAtTime(tab ? 1500 : 520, t + len);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(tab ? 0.06 : 0.11, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + len + 0.02);

  // 当たった瞬間の「カ」：ノイズをごく短く
  const n = c.createBufferSource();
  n.buffer = noiseBuffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = tab ? 5000 : 2800;
  bp.Q.value = 1.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(tab ? 0.05 : 0.08, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  n.connect(bp).connect(ng).connect(master);
  n.start(t, Math.random());
  n.stop(t + 0.03);
}

/**
 * ボタン・タブ以外（一覧の行など）を押したときの「カチッ」。
 * スイッチを入れたような、2回の短い当たり：低めの「カ」のすぐあとに、高く乾いた「チッ」。
 */
export function playTick() {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + 0.005;
  const hit = (t: number, freq: number, vol: number, len: number) => {
    const n = c.createBufferSource();
    n.buffer = noiseBuffer;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(bp).connect(g).connect(master);
    n.start(t, Math.random());
    n.stop(t + len + 0.01);
  };
  hit(t0, 2200, 0.16, 0.012); // カ
  hit(t0 + 0.028, 4200, 0.12, 0.02); // チッ

  // 「チッ」に少しだけ金属っぽい芯を足す
  const t = t0 + 0.028;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(3400, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.05);
}

/** ボタン・タブ・一覧の行を押したときに鳴らす。キャプチャで拾うので、途中で stopPropagation されても鳴る。押せないボタンは click が来ない */
export function installClickSound() {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => ensure());
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      const el = target?.closest?.('button, [role="button"]');
      if (el) {
        const kind = el.classList.contains('tab') || el.getAttribute('role') === 'tab' ? 'tab' : 'button';
        setTimeout(() => playClick(kind), 0);
        return;
      }
      // ボタン・タブ以外で押せるもの（スキルブックやボックスの一覧の行など）
      if (target?.closest?.('[data-act]')) setTimeout(playTick, 0);
    },
    true,
  );
}
