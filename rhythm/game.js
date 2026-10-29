'use strict';
/*
  らくばる君のリズム配達 — game.js

  上から順に
    1. 設定（判定の厳しさ・点数など）
    2. 素材（画像・曲・効果音）と「曲の時計」
    3. 入力（キーボード・タッチ）
    4. ゲームの進行（スタート・判定・リザルト）
    5. 描画 draw()
    6. ループ
  という並びです。譜面（いつ・どのレーンにチラシが落ちるか）は charts.js に入っています。
*/

// =========================================================
// 1. 設定
// =========================================================
const W = 960, H = 540;
const LANE_COUNT = 4;
const LANE_W = 96;                         // 1レーンの幅
const LANE_X0 = 312;                       // 一番左のレーンの左端
const JUDGE_Y = 452;                       // ポスト（判定ライン）の高さ
const BASE_SPEED = 430;                    // チラシが落ちる速さ（ピクセル/秒）。画面の「落ちる速さ」で倍率が掛かる
const LEAD = 2.2;                          // スタートから曲が鳴るまでの秒数

// 判定の幅（秒）。小さくするほど厳しくなる
const JUDGES = [
  { name: 'ピッタリ！', win: 0.050, rate: 1.0, color: '#ffd23f' },
  { name: 'いいね！',   win: 0.095, rate: 0.7, color: '#7fe0c2' },
  { name: 'おしい',     win: 0.140, rate: 0.3, color: '#9fb4ff' },
];
const MISS = { name: 'ミス', color: '#ff7a7a' };
const MAX_SCORE = 1000000;

// キーとレーンの対応（左から 0,1,2,3）
const KEYMAP = {
  KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3,
  ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3,
};
const KEY_LABELS = ['D', 'F', 'J', 'K'];
const LANE_COLORS = ['#ffd23f', '#ffe9a3', '#ffe9a3', '#ffd23f'];

const DIFF_NAMES = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", Meiryo, sans-serif';
const DISPLAY = '"Dela Gothic One", "M PLUS Rounded 1c", "Hiragino Sans", Meiryo, sans-serif';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const laneX = (lane) => LANE_X0 + lane * LANE_W;          // レーンの左端
const laneCX = (lane) => laneX(lane) + LANE_W / 2;        // レーンの真ん中

// 保存（ブラウザによっては使えないので try で囲む）
const store = {
  get(k, d) { try { const v = localStorage.getItem('rakubaru-rhythm:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('rakubaru-rhythm:' + k, JSON.stringify(v)); } catch { /* 保存できなくても遊べる */ } },
};

// =========================================================
// 2. 素材と「曲の時計」
// =========================================================
const img = new Image();
img.src = 'assets/rakubaru.png';
const SONG_URL = 'assets/rakubaru.mp3';

// 音を鳴らす仕組み。GitHub Pages などWebサーバー上では Web Audio（ずれが少ない）、
// index.html を直接開いたときは <audio> タグで鳴らします。
const AC = window.AudioContext || window.webkitAudioContext;
const actx = AC ? new AC() : null;
let songBuffer = null;     // Web Audio 用に読み込んだ曲
let songSource = null;
let audioEl = null;        // <audio> 用
let audioMode = 'loading'; // 'webaudio' | 'element' | 'loading'

async function loadSong() {
  if (actx && location.protocol !== 'file:') {
    try {
      const res = await fetch(SONG_URL);
      const buf = await res.arrayBuffer();
      songBuffer = await new Promise((ok, ng) => actx.decodeAudioData(buf, ok, ng));
      audioMode = 'webaudio';
      return;
    } catch (e) { /* だめなら下の方法へ */ }
  }
  audioEl = new Audio(SONG_URL);
  audioEl.preload = 'auto';
  audioMode = 'element';
}
loadSong();

// 曲の時計：いま曲の何秒目を「聞いている」か。マイナスは曲が始まる前
const clock = {
  startAt: 0,     // webaudio: 曲を鳴らし始める actx 時刻 / element: 0秒目に当たる performance.now()
  pausedAt: null,
  elStarted: false,
  now() {
    if (this.pausedAt !== null) return this.pausedAt;
    if (audioMode === 'webaudio') {
      const lat = actx.outputLatency || actx.baseLatency || 0;
      return actx.currentTime - this.startAt - lat;
    }
    return (performance.now() - this.startAt) / 1000;
  },
};

function startSong() {
  stopSong();
  clock.pausedAt = null;
  if (actx && actx.state === 'suspended') actx.resume();
  if (audioMode === 'webaudio') {
    songSource = actx.createBufferSource();
    songSource.buffer = songBuffer;
    songSource.connect(actx.destination);
    clock.startAt = actx.currentTime + LEAD;
    songSource.start(clock.startAt);
  } else {
    clock.startAt = performance.now() + LEAD * 1000;
    clock.elStarted = false;
    audioEl.currentTime = 0;
    // iPhone などは「タップした瞬間」に一度再生しておかないと後で鳴らせないので、無音で準備しておく
    audioEl.muted = true;
    audioEl.play().then(() => { audioEl.pause(); audioEl.currentTime = 0; audioEl.muted = false; }).catch(() => { audioEl.muted = false; });
  }
}

function stopSong() {
  if (songSource) { try { songSource.stop(); } catch { /* もう止まっている */ } songSource = null; }
  if (audioEl) { audioEl.pause(); }
}

// <audio> で鳴らしているときは、毎フレーム時計と曲の位置のずれを少しずつ直す
function syncElementClock() {
  if (audioMode !== 'element' || clock.pausedAt !== null) return;
  const t = clock.now();
  if (!clock.elStarted && t >= 0) {
    clock.elStarted = true;
    audioEl.currentTime = t;
    audioEl.muted = false;
    audioEl.play().catch(() => {});
  }
  if (clock.elStarted && !audioEl.paused && audioEl.currentTime > 0.2) {
    const drift = audioEl.currentTime - t;
    if (Math.abs(drift) > 0.25) clock.startAt -= drift * 1000;
    else clock.startAt -= drift * 1000 * 0.03;
  }
}

function pauseSong() {
  clock.pausedAt = clock.now();
  if (audioMode === 'webaudio') actx.suspend();
  else audioEl.pause();
}
function resumeSong() {
  const t = clock.pausedAt;
  if (audioMode === 'webaudio') {
    clock.pausedAt = null;
    actx.resume();
  } else {
    clock.pausedAt = null;
    clock.startAt = performance.now() - t * 1000;
    if (clock.elStarted) audioEl.play().catch(() => {});
  }
}

// 叩いた音（ポンッ）。曲のじゃまにならないよう小さめ
function popSound(good) {
  if (!actx || !$('sfx').checked || actx.state !== 'running') return;
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(good ? 1320 : 990, t);
  o.frequency.exponentialRampToValueAtTime(good ? 660 : 495, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + 0.1);
}

// =========================================================
// 3. 入力
// =========================================================
const held = [false, false, false, false];     // いま押されているレーン（光らせる用）
const laneFlash = [0, 0, 0, 0];

window.addEventListener('keydown', (e) => {
  // 設定パネルを操作中（遊んでいないとき）は、ボタンや選択肢のふつうの動きを優先する
  const onControl = e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement;
  const enterOnInput = e.code === 'Enter' && e.target instanceof HTMLInputElement;
  if (onControl && game.scene !== 'play' && !enterOnInput) return;
  if (e.code in KEYMAP) {
    e.preventDefault();
    if (e.repeat) return;
    press(KEYMAP[e.code]);
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (game.scene === 'title' || game.scene === 'result') { e.preventDefault(); startGame(); }
    else if (game.scene === 'paused') { e.preventDefault(); togglePause(); }
  }
  if (e.code === 'Escape') togglePause();
  if (game.scene === 'title' || game.scene === 'result') {
    const pick = { Digit1: 'easy', Digit2: 'normal', Digit3: 'hard' }[e.code];
    if (pick) { document.querySelector(`input[name=diff][value=${pick}]`).checked = true; }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code in KEYMAP) held[KEYMAP[e.code]] = false;
});

// タッチ・クリック：画面を左右4つに分けてレーンにする
const pointerLane = new Map();
let touchMode = false;   // タッチで遊んでいるときは、画面下にタップの区切りを表示する
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touchMode = e.pointerType === 'touch';
  canvas.focus();
  if (game.scene === 'title' || game.scene === 'result') { startGame(); return; }
  if (game.scene === 'paused') { togglePause(); return; }
  const r = canvas.getBoundingClientRect();
  const lane = clamp(Math.floor(((e.clientX - r.left) / r.width) * LANE_COUNT), 0, 3);
  pointerLane.set(e.pointerId, lane);
  press(lane);
});
const releasePointer = (e) => {
  const lane = pointerLane.get(e.pointerId);
  if (lane !== undefined) { held[lane] = false; pointerLane.delete(e.pointerId); }
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);

$('start').addEventListener('click', () => startGame());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.scene === 'play') togglePause();
});

// 設定パネル
const speedIn = $('speed'), offsetIn = $('offset');
speedIn.value = store.get('speed', 1);
offsetIn.value = store.get('offset', 0);
$('sfx').checked = store.get('sfx', true);
const savedDiff = store.get('diff', 'normal');
const diffInput = document.querySelector(`input[name=diff][value=${savedDiff}]`);
if (diffInput) diffInput.checked = true;
function showSettings() {
  $('speed-out').textContent = Number(speedIn.value).toFixed(1);
  const o = Number(offsetIn.value);
  $('offset-out').textContent = (o > 0 ? '+' : '') + o + 'ms';
}
speedIn.addEventListener('input', () => { showSettings(); store.set('speed', Number(speedIn.value)); });
offsetIn.addEventListener('input', () => { showSettings(); store.set('offset', Number(offsetIn.value)); });
$('sfx').addEventListener('change', () => store.set('sfx', $('sfx').checked));
showSettings();

function showBest() {
  for (const d of Object.keys(DIFF_NAMES)) {
    const b = store.get('best-' + d, null);
    $('best-' + d).textContent = b ? `ベスト ${b.score.toLocaleString()} ${b.rank}` : 'ベスト —';
  }
}
showBest();

// =========================================================
// 4. ゲームの進行
// =========================================================
const game = {
  scene: 'title',     // title → play ⇄ paused → result
  diff: 'normal',
  notes: [],
  score: 0, combo: 0, maxCombo: 0,
  counts: [0, 0, 0, 0],   // ピッタリ・いいね・おしい・ミス
  perNote: 0,
  speed: 1, offset: 0,
  popups: [],         // 判定の文字
  bursts: [],         // 配達成功のキラキラ
  flyers: [],         // らくばる君から飛んでいくチラシ
  mood: 0, moodT: 0,  // らくばる君の表情 1=うれしい -1=あせる
  result: null,
};

function startGame() {
  if (audioMode === 'loading') return;
  game.diff = document.querySelector('input[name=diff]:checked').value;
  store.set('diff', game.diff);
  game.speed = Number(speedIn.value);
  game.offset = Number(offsetIn.value) / 1000;
  game.notes = CHARTS[game.diff].map(([t, lane]) => ({ t, lane, done: false }));
  game.notes.sort((a, b) => a.t - b.t);
  game.perNote = MAX_SCORE / game.notes.length;
  game.score = 0; game.combo = 0; game.maxCombo = 0;
  game.counts = [0, 0, 0, 0];
  game.popups = []; game.bursts = []; game.flyers = [];
  game.mood = 0; game.result = null;
  game.scene = 'play';
  $('panel').classList.add('playing');
  canvas.focus();
  startSong();
}

function togglePause() {
  if (game.scene === 'play') { game.scene = 'paused'; pauseSong(); }
  else if (game.scene === 'paused') { game.scene = 'play'; resumeSong(); canvas.focus(); }
}

// 判定に使う時刻（タイミング調整のぶんだけずらす）
const playTime = () => clock.now() - game.offset;

function press(lane) {
  held[lane] = true;
  laneFlash[lane] = 1;
  if (game.scene !== 'play') return;
  const t = playTime();
  // このレーンで、まだ配っていない一番近いチラシを探す
  let target = null;
  for (const n of game.notes) {
    if (n.done || n.lane !== lane) continue;
    if (n.t - t > JUDGES[2].win) break;
    if (Math.abs(n.t - t) <= JUDGES[2].win) { target = n; break; }
  }
  if (!target) return;
  const dt = Math.abs(target.t - t);
  const j = JUDGES.findIndex((jj) => dt <= jj.win);
  target.done = true;
  game.counts[j]++;
  game.combo++;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  game.score += game.perNote * JUDGES[j].rate;
  popup(JUDGES[j].name, JUDGES[j].color, target.t < t ? 'おそい' : 'はやい', j);
  burst(lane, JUDGES[j].color, j === 0 ? 14 : 8);
  game.flyers.push({ lane, life: 0 });
  game.mood = 1; game.moodT = 0.35;
  popSound(j === 0);
}

function popup(text, color, sub, j) {
  game.popups = [{ text, color, sub: j > 0 ? sub : '', life: 0 }];
}

function burst(lane, color, n) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = 160 + Math.random() * 220;
    game.bursts.push({ x: laneCX(lane), y: JUDGE_Y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, color, rot: Math.random() * 6 });
  }
}

function update(dt) {
  for (let i = 0; i < 4; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt * 5);
  for (const p of game.popups) p.life += dt;
  game.popups = game.popups.filter((p) => p.life < 0.6);
  for (const b of game.bursts) { b.life += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 900 * dt; b.rot += dt * 8; }
  game.bursts = game.bursts.filter((b) => b.life < 0.6);
  for (const f of game.flyers) f.life += dt;
  game.flyers = game.flyers.filter((f) => f.life < 0.35);
  game.moodT -= dt;
  if (game.moodT <= 0) game.mood = 0;

  if (game.scene !== 'play') return;
  syncElementClock();
  const t = playTime();

  // 通り過ぎたチラシはミス
  for (const n of game.notes) {
    if (n.done) continue;
    if (n.t > t) break;
    if (t - n.t > JUDGES[2].win) {
      n.done = true;
      game.counts[3]++;
      game.combo = 0;
      popup(MISS.name, MISS.color, '', 3);
      game.mood = -1; game.moodT = 0.5;
    }
  }

  // 曲が終わったらリザルトへ
  if (clock.now() >= SONG.duration) finish();
}

function rankOf(score) {
  if (score >= 950000) return 'S';
  if (score >= 850000) return 'A';
  if (score >= 700000) return 'B';
  if (score >= 500000) return 'C';
  return 'D';
}

function finish() {
  stopSong();
  const score = Math.round(game.score);
  const rank = rankOf(score);
  const fullCombo = game.counts[3] === 0;
  const prev = store.get('best-' + game.diff, null);
  const isBest = !prev || score > prev.score;
  if (isBest) store.set('best-' + game.diff, { score, rank });
  game.result = { score, rank, fullCombo, isBest };
  game.scene = 'result';
  $('panel').classList.remove('playing');
  showBest();
}

// =========================================================
// 5. 描画
// =========================================================
// 星と家並み（背景）は最初に一度だけ作っておく
const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * 300, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 }));
const houses = [];
for (let x = -40; x < W + 200;) {
  const w = 70 + Math.random() * 70, h = 60 + Math.random() * 70;
  houses.push({ x, w, h, win: Math.random() < 0.6 });
  x += w + 6 + Math.random() * 20;
}
const HOUSE_SPAN = houses[houses.length - 1].x + houses[houses.length - 1].w + 20;

function beatInfo(t) {
  const beat = 60 / SONG.bpm;
  const b = (t - SONG.firstBeat) / beat;
  return { index: Math.floor(b), phase: ((b % 1) + 1) % 1, beat };
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141a33');
  g.addColorStop(0.65, '#2a2f63');
  g.addColorStop(1, '#4a3b6b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(s.p + t * 1.5);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 家並み（ゆっくり流れる＝スクーターで走っている）
  const scroll = (Math.max(0, t) * 40) % HOUSE_SPAN;
  ctx.fillStyle = '#1d2147';
  for (const hs of houses) {
    let x = hs.x - scroll;
    if (x + hs.w < -50) x += HOUSE_SPAN;
    const y = 470 - hs.h;
    ctx.fillRect(x, y, hs.w, hs.h + 80);
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + hs.w / 2, y - 30); ctx.lineTo(x + hs.w + 8, y); ctx.fill();
    if (hs.win) {
      ctx.fillStyle = 'rgba(255, 210, 63, 0.55)';
      ctx.fillRect(x + hs.w * 0.25, y + 18, 16, 14);
      ctx.fillStyle = '#1d2147';
    }
  }
  // 道路
  ctx.fillStyle = '#20223f';
  ctx.fillRect(0, 486, W, H - 486);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  const dash = (Math.max(0, t) * 260) % 80;
  for (let x = -dash; x < W; x += 80) ctx.fillRect(x, 512, 40, 4);
}

function drawLanes(t, pulse) {
  // レーンの土台
  ctx.fillStyle = 'rgba(12, 16, 40, 0.72)';
  roundRect(LANE_X0 - 8, -10, LANE_W * LANE_COUNT + 16, JUDGE_Y + 70, 14);
  ctx.fill();

  for (let i = 0; i < LANE_COUNT; i++) {
    const x = laneX(i);
    if (held[i] || laneFlash[i] > 0) {
      const a = Math.max(held[i] ? 0.5 : 0, laneFlash[i]) * 0.35;
      const g = ctx.createLinearGradient(0, 0, 0, JUDGE_Y);
      g.addColorStop(0, 'rgba(255,210,63,0)');
      g.addColorStop(1, `rgba(255,210,63,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, LANE_W, JUDGE_Y);
    }
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - 1, 0, 2, JUDGE_Y + 50);
    }
  }

  // 小節線（4拍ごと）
  const speed = BASE_SPEED * game.speed;
  const bi = beatInfo(t);
  for (let k = Math.floor(bi.index / 4) * 4; k < bi.index + 16; k += 4) {
    const bt = SONG.firstBeat + k * bi.beat;
    const y = JUDGE_Y - (bt - t) * speed;
    if (y < -5 || y > JUDGE_Y) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(LANE_X0, y, LANE_W * LANE_COUNT, 2);
  }

  // 判定ライン
  ctx.fillStyle = `rgba(255, 210, 63, ${0.5 + pulse * 0.4})`;
  ctx.fillRect(LANE_X0, JUDGE_Y - 2, LANE_W * LANE_COUNT, 4);
}

function drawPost(lane, pulse) {
  const cx = laneCX(lane), y = JUDGE_Y;
  const lit = held[lane] || laneFlash[lane] > 0;
  const s = 1 + pulse * 0.04 + laneFlash[lane] * 0.08;
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(s, s);
  // 柱
  ctx.fillStyle = '#5b6aa8';
  ctx.fillRect(-5, 18, 10, 26);
  // 箱
  ctx.fillStyle = lit ? '#4f8bff' : '#2f63d6';
  roundRect(-32, -24, 64, 46, 10); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = lit ? '#cfe0ff' : '#8fb0ff'; ctx.stroke();
  // 投入口
  ctx.fillStyle = '#0d1a44';
  roundRect(-20, -12, 40, 7, 3); ctx.fill();
  // キー表示
  ctx.fillStyle = '#fff';
  ctx.font = `800 17px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(KEY_LABELS[lane], 0, 9);
  ctx.restore();
}

function drawFlyer(x, y, lane, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(-31, -15, 66, 34, 6); ctx.fill();
  ctx.fillStyle = LANE_COLORS[lane];
  roundRect(-33, -18, 66, 34, 6); ctx.fill();
  ctx.strokeStyle = '#c98a00'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#e8541e';
  ctx.fillRect(-25, -11, 20, 20);
  ctx.fillStyle = 'rgba(120, 80, 0, 0.55)';
  ctx.fillRect(0, -10, 24, 4);
  ctx.fillRect(0, -2, 20, 4);
  ctx.fillRect(0, 6, 24, 4);
  ctx.restore();
}

function drawNotes(t) {
  const speed = BASE_SPEED * game.speed;
  for (const n of game.notes) {
    if (n.done) continue;
    const y = JUDGE_Y - (n.t - t) * speed;
    if (y < -40) break;
    if (y > H + 40) continue;
    drawFlyer(laneCX(n.lane), y, n.lane);
  }
}

// らくばる君（左側）。拍に合わせて弾む
const RK = { x: 28, y: 168, size: 280 };
function drawRakubaru(t, pulse) {
  const bounce = game.scene === 'play' ? pulse : 0.5 + 0.5 * Math.sin(t * 3);
  const sy = 1 - bounce * 0.035, sx = 1 + bounce * 0.02;
  const tilt = game.mood === 1 ? -0.06 : game.mood === -1 ? 0.05 : 0;
  ctx.save();
  ctx.translate(RK.x + RK.size / 2, RK.y + RK.size);
  ctx.rotate(tilt);
  ctx.scale(sx, sy);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(10, -6, RK.size * 0.38, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (img.complete && img.naturalWidth) ctx.drawImage(img, -RK.size / 2, -RK.size, RK.size, RK.size);
  ctx.restore();

  // あせっているときは汗マーク
  if (game.mood === -1) {
    ctx.fillStyle = '#9fd8ff';
    const x = RK.x + RK.size * 0.62, y = RK.y + RK.size * 0.12;
    ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.quadraticCurveTo(x + 10, y + 2, x, y + 6); ctx.quadraticCurveTo(x - 10, y + 2, x, y - 14); ctx.fill();
  }

  // らくばる君の手元からポストへ飛んでいくチラシ
  for (const f of game.flyers) {
    const k = f.life / 0.35;
    const sx0 = RK.x + RK.size * 0.12, sy0 = RK.y + RK.size * 0.45;
    const ex = laneCX(f.lane), ey = JUDGE_Y - 14;
    const x = sx0 + (ex - sx0) * k;
    const y = sy0 + (ey - sy0) * k - Math.sin(k * Math.PI) * 120;
    ctx.globalAlpha = 1 - k * 0.6;
    drawFlyer(x, y, f.lane, 0.45);
    ctx.globalAlpha = 1;
  }
}

function drawHud(t) {
  const x = 730;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('スコア', x, 52);
  ctx.fillStyle = '#fff';
  ctx.font = `400 34px ${DISPLAY}`;
  ctx.fillText(Math.round(game.score).toLocaleString().padStart(7, ' '), x, 90);

  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('コンボ', x, 132);
  ctx.fillStyle = game.combo >= 20 ? '#ffd23f' : '#fff';
  ctx.font = `400 44px ${DISPLAY}`;
  ctx.fillText(String(game.combo), x, 178);

  // 判定の数
  ctx.font = `700 14px ${FONT}`;
  const labels = [...JUDGES.map((j) => [j.name, j.color]), [MISS.name, MISS.color]];
  labels.forEach(([name, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(name, x, 222 + i * 24);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(String(game.counts[i]), x + 190, 222 + i * 24);
    ctx.textAlign = 'left';
  });

  // 曲の進み具合
  const k = clamp(t / SONG.duration, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(x, 330, 190, 8, 4); ctx.fill();
  ctx.fillStyle = '#e8541e';
  roundRect(x, 330, Math.max(8, 190 * k), 8, 4); ctx.fill();
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`♪ らくばる ・ ${DIFF_NAMES[game.diff]}`, x, 360);
}

function drawPopups() {
  for (const p of game.popups) {
    const k = p.life / 0.6;
    const s = 1 + Math.max(0, 0.25 - p.life) * 1.6;
    ctx.save();
    ctx.translate(LANE_X0 + LANE_W * 2, 300 - k * 20);
    ctx.scale(s, s);
    ctx.globalAlpha = 1 - k * k;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha *= 0.9;
    ctx.font = `400 36px ${DISPLAY}`;
    ctx.lineWidth = 6; ctx.strokeStyle = '#141a33';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    if (p.sub) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = '#d8def5';
      ctx.fillText(p.sub, 0, 32);
    }
    if (game.combo >= 5 && p.text !== MISS.name) {
      ctx.font = `800 18px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(`${game.combo} コンボ`, 0, -38);
    }
    ctx.restore();
  }
  for (const b of game.bursts) {
    ctx.save();
    ctx.globalAlpha = 1 - b.life / 0.6;
    ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    ctx.fillStyle = b.color;
    ctx.fillRect(-5, -3.5, 10, 7);
    ctx.restore();
  }
}

function drawCountdown(t) {
  if (t >= 0.3) return;
  const firstNote = game.notes.length ? game.notes[0].t : 0;
  if (t > firstNote) return;
  const left = -t;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `400 30px ${DISPLAY}`;
  ctx.fillText(left > 0.6 ? 'よーい…' : 'スタート！', LANE_X0 + LANE_W * 2, 250);
}

function centerPanel(h) {
  ctx.fillStyle = 'rgba(12, 16, 40, 0.86)';
  roundRect(W / 2 - 300, H / 2 - h / 2, 600, h, 18); ctx.fill();
  ctx.strokeStyle = '#3a4677'; ctx.lineWidth = 3; ctx.stroke();
}

function drawTitle(t) {
  drawBackground(t);
  const bob = Math.sin(t * 3) * 6;
  if (img.complete && img.naturalWidth) ctx.drawImage(img, 40, 120 + bob, 320, 320);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffd23f';
  ctx.font = `400 22px ${DISPLAY}`;
  ctx.fillText('らくばる君の', 400, 170);
  ctx.fillStyle = '#fff';
  ctx.font = `400 62px ${DISPLAY}`;
  ctx.fillText('リズム配達', 396, 240);
  ctx.fillStyle = '#d8def5';
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText('落ちてくるチラシがポストに重なったら', 400, 290);
  ctx.fillText('D F J K キーでポンッと配達！', 400, 318);
  // 飾りのチラシ
  drawFlyer(820, 120 + Math.sin(t * 2) * 10, 0, 0.9);
  drawFlyer(880, 200 + Math.sin(t * 2 + 1) * 10, 1, 0.7);

  const blink = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ffd23f';
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(audioMode === 'loading' ? '曲を読み込み中…' : 'Enter キー か 画面タップ でスタート', 400, 390);
  ctx.globalAlpha = 1;
}

function drawResult() {
  const r = game.result;
  ctx.fillStyle = 'rgba(10, 13, 32, 0.6)';
  ctx.fillRect(0, 0, W, H);
  centerPanel(360);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(`配達おつかれさま！ ・ ${DIFF_NAMES[game.diff]}`, W / 2, 128);

  ctx.font = `400 110px ${DISPLAY}`;
  ctx.fillStyle = { S: '#ffd23f', A: '#ff9f6b', B: '#7fe0c2', C: '#9fb4ff', D: '#aab3d6' }[r.rank];
  ctx.fillText(r.rank, W / 2 - 150, 262);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `400 40px ${DISPLAY}`;
  ctx.fillText(r.score.toLocaleString(), W / 2 - 60, 200);
  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = '#aab3d6';
  ctx.fillText(`最大コンボ ${game.maxCombo} / ${game.notes.length}`, W / 2 - 58, 232);
  if (r.fullCombo) { ctx.fillStyle = '#ffd23f'; ctx.fillText('フルコンボ！ ぜんぶ配達できた！', W / 2 - 58, 260); }
  else if (r.isBest) { ctx.fillStyle = '#ffd23f'; ctx.fillText('ベストスコア更新！', W / 2 - 58, 260); }

  const labels = [...JUDGES.map((j) => [j.name, j.color]), [MISS.name, MISS.color]];
  labels.forEach(([name, color], i) => {
    const x = W / 2 - 240 + i * 125;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(name, x + 50, 312);
    ctx.fillStyle = '#fff';
    ctx.font = `400 28px ${DISPLAY}`;
    ctx.fillText(String(game.counts[i]), x + 50, 348);
  });
  ctx.fillStyle = '#ffd23f';
  ctx.font = `800 17px ${FONT}`;
  ctx.fillText('Enter / タップ でもう一回', W / 2, 400);
}

function drawPaused() {
  ctx.fillStyle = 'rgba(10, 13, 32, 0.5)';
  ctx.fillRect(0, 0, W, H);
  centerPanel(160);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `400 40px ${DISPLAY}`;
  ctx.fillText('ひと休み中', W / 2, 262);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `800 16px ${FONT}`;
  ctx.fillText('Esc / Enter / タップ で再開', W / 2, 300);
}

function draw(realT) {
  if (game.scene === 'title') { drawTitle(realT); return; }
  const t = game.scene === 'result' ? SONG.duration : playTime();
  const bi = beatInfo(t);
  const pulse = t >= 0 && game.scene !== 'result' ? Math.pow(1 - bi.phase, 3) : 0;
  drawBackground(t);
  drawLanes(t, pulse);
  for (let i = 0; i < LANE_COUNT; i++) drawPost(i, pulse);
  drawNotes(t);
  drawRakubaru(realT, pulse);
  drawHud(t);
  drawPopups();
  drawCountdown(t);
  if (touchMode && game.scene === 'play') drawTouchZones();
  if (game.scene === 'paused') drawPaused();
  if (game.scene === 'result') drawResult();
}

// スマホ用：画面を4つに分けたタップの区切り
function drawTouchZones() {
  for (let i = 0; i < LANE_COUNT; i++) {
    const x = (W / LANE_COUNT) * i;
    ctx.fillStyle = held[i] ? 'rgba(255,210,63,0.28)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 4, H - 40, W / LANE_COUNT - 8, 36);
    ctx.fillStyle = '#fff';
    ctx.font = `800 16px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${KEY_LABELS[i]} のポスト`, x + W / LANE_COUNT / 2, H - 22);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// =========================================================
// 6. ループ
// =========================================================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
