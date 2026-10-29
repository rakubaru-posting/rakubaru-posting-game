'use strict';
/*
  らくばる君のポスティング大作戦 — game.js

  このファイル1つにゲームの動きがすべて入っています。
  上から順に
    1. 設定（数字を変えると難しさが変わる）
    2. 素材と効果音
    3. 入力（キーボード・タッチ）
    4. ゲームの状態づくり
    5. 更新 update() … 毎フレーム「動かす・当たり判定する」
    6. 描画 draw()   … 毎フレーム「絵を描く」
    7. ループ（1秒に約60回 update → draw を繰り返す）
  という並びです。
*/

// =========================================================
// 1. 設定 — まずはここの数字をいじってみるのがおすすめ
// =========================================================
const W = 960, H = 540;          // 画面の大きさ（ゲーム内の座標）
const GAME_TIME = 60;            // 制限時間（秒）
const CRASH_PENALTY = 3;         // 障害物に当たったときに減る残り時間（秒）
const START_SPEED = 240;         // 走る速さ（ピクセル/秒）
const SPEED_UP = 3;              // 1秒ごとに速くなる量
const REFUSE_RATE = 0.22;        // 「チラシ禁止」ポストが出る確率（0〜1）
const PLAYER_SPEED = 320;        // 左右移動の速さ
const PLAYER_X_MIN = 90, PLAYER_X_MAX = 520;

const SIDEWALK_Y = 278;          // 歩道の上端（家の土台）
const ROAD_Y = 300;              // 道路の上端
const LANES = [368, 448, 528];   // 3つの車線（タイヤが接地するy座標）
const MAILBOX_Y = 232;           // ポストの上端
const MAILBOX_W = 42, MAILBOX_H = 30;
const PLAYER_H = 118;            // らくばる君の表示サイズ（高さ）

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", Meiryo, sans-serif';
const DISPLAY = '"Dela Gothic One", "M PLUS Rounded 1c", "Hiragino Sans", Meiryo, sans-serif';

const WALLS = ['#f6e7c8', '#e9d3c0', '#dfe8d2', '#f3dcd8', '#d9e4ef', '#efe2b8'];
const ROOFS = ['#b5482f', '#3f5a7a', '#5c4a3d', '#2f6a5a', '#7a3f55'];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 小さな便利関数
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[randInt(arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =========================================================
// 2. 素材と効果音
// =========================================================
const playerImg = new Image();
playerImg.src = 'assets/rakubaru.png';

// 効果音：音声ファイルを使わず、ブラウザの機能で「ピコッ」という音を作る
let audio = null;
let muted = false;
function beep(freq, dur = 0.08, type = 'square', vol = 0.07, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* 音が出せない環境では何もしない */ }
}
const sfx = {
  throw: () => beep(660, 0.06, 'triangle', 0.06, 220),
  good:  () => { beep(880, 0.07); setTimeout(() => beep(1320, 0.1), 60); },
  bad:   () => beep(220, 0.28, 'sawtooth', 0.08, -140),
  crash: () => beep(130, 0.3, 'square', 0.1, -70),
  empty: () => beep(150, 0.08, 'square', 0.05),
  start: () => [523, 784].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'triangle'), i * 90)),
  end:   () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'triangle'), i * 120)),
};

const muteBtn = document.getElementById('mute');
function toggleMute() {
  muted = !muted;
  if (muteBtn) {
    muteBtn.textContent = muted ? '音：オフ' : '音：オン';
    muteBtn.setAttribute('aria-pressed', String(muted));
  }
}
if (muteBtn) muteBtn.addEventListener('click', toggleMute);

// =========================================================
// 3. 入力 — キーボードとタッチボタン
// =========================================================
const keys = { left: false, right: false };

document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
  if (e.repeat) return; // 押しっぱなしの連打は無視
  if (k === 'ArrowUp' || k === 'w' || k === 'W') doAction('up');
  if (k === 'ArrowDown' || k === 's' || k === 'S') doAction('down');
  if (k === ' ' || k === 'z' || k === 'Z' || k === 'Enter') doAction('throw');
  if (k === 'm' || k === 'M') toggleMute();
});
document.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
});

// スマホ用ボタン（data-act の値で動きを決める）
document.querySelectorAll('[data-act]').forEach((btn) => {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (act === 'left' || act === 'right') keys[act] = true;
    else doAction(act);
  });
  const release = () => { if (act === 'left' || act === 'right') keys[act] = false; };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
});

// 画面タップでもスタート・投げるができる
// 注意：ここで e.preventDefault() を呼ぶと、ブラウザが「キーボードの入力先」を
// ゲーム画面に移してくれなくなり、キー操作が効かなくなる（埋め込み表示のとき）。
// そのため preventDefault は使わず、自分でフォーカス（入力先）をゲームに移す。
canvas.addEventListener('pointerdown', () => {
  canvas.focus({ preventScroll: true });
  doAction('throw');
});

// キーボードの入力先がゲームにあるかどうか（ないときは画面に案内を出す）
let hasFocus = document.hasFocus();
window.addEventListener('focus', () => { hasFocus = true; });
window.addEventListener('blur', () => { hasFocus = false; keys.left = keys.right = false; });

function doAction(a) {
  if (state === 'title') { if (a === 'throw') startGame(); return; }
  if (state === 'result') { if (a === 'throw' && resultWait <= 0) startGame(); return; }
  const p = g.player;
  if (a === 'up') p.lane = Math.max(0, p.lane - 1);
  if (a === 'down') p.lane = Math.min(LANES.length - 1, p.lane + 1);
  if (a === 'throw') throwFlyer();
}

// =========================================================
// 4. ゲームの状態づくり
// =========================================================
let state = 'title';  // 'title'（タイトル） / 'play'（プレイ中） / 'result'（結果）
let g = null;         // ゲーム中のデータ全部をまとめた箱
let resultWait = 0;   // 結果画面ですぐに再スタートしないための待ち時間
let best = loadBest();

function loadBest() {
  try { return Number(localStorage.getItem('rakubaru-posting-best')) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('rakubaru-posting-best', String(v)); } catch (e) { /* 保存できなくても遊べる */ }
}

function newWorld() {
  g = {
    time: GAME_TIME, elapsed: 0, speed: START_SPEED,
    score: 0, combo: 0, maxCombo: 0,
    delivered: 0, complaints: 0, missed: 0, thrown: 0, crashes: 0,
    houses: [], obstacles: [], air: [], texts: [], particles: [],
    clouds: Array.from({ length: 6 }, () => ({ x: rand(0, W), y: rand(30, 150), s: rand(0.6, 1.2) })),
    obstacleTimer: 1.6, throwCd: 0, invincible: 0, shake: 0, roadOffset: 0,
    player: { x: 200, y: LANES[1], lane: 1, bob: 0 },
    newBest: false,
  };
  let x = -40;
  while (x < W + 200) {
    const h = makeHouse(x);
    x += h.w + rand(30, 100);
  }
}

function makeHouse(x) {
  const w = rand(170, 230);
  const house = {
    x, w, h: rand(115, 165),
    wall: pick(WALLS), roof: pick(ROOFS),
    mbOff: rand(18, w - MAILBOX_W - 18),  // 家の中でのポストの位置
    mb: { refuse: Math.random() < REFUSE_RATE, done: false, angry: false, passed: false },
  };
  g.houses.push(house);
  return house;
}

function startGame() {
  newWorld();
  // 最初かららくばる君より左にあるポストは数えない
  g.houses.forEach((h) => { if (h.x + h.mbOff < g.player.x + 40) h.mb.passed = true; });
  state = 'play';
  sfx.start();
}

function endGame() {
  if (state !== 'play') return;
  state = 'result';
  resultWait = 1.2;
  if (g.score > best) { best = g.score; g.newBest = true; saveBest(best); }
  sfx.end();
}

function addText(str, x, y, color = '#fff', size = 20) {
  g.texts.push({ str, x, y, color, size, life: 1 });
}
function burst(x, y) {
  for (let i = 0; i < 12; i++) {
    g.particles.push({
      x, y, vx: rand(-160, 160), vy: rand(-260, -60), life: rand(0.4, 0.8),
      color: pick(['#ffd23f', '#e8541e', '#ffffff']),
    });
  }
}

function throwFlyer() {
  if (g.throwCd > 0) return;
  const p = g.player;
  g.thrown++;
  g.throwCd = 0.16;
  g.air.push({ x: p.x + 8, y: p.y - 80, vy: -1000, rot: 0 });
  sfx.throw();
}

// =========================================================
// 5. 更新 — 毎フレーム呼ばれる。dt は前回からの経過秒数
// =========================================================
function update(dt) {
  // 文字と紙吹雪はどの画面でも動かす
  g.texts.forEach((t) => { t.y -= 40 * dt; t.life -= dt; });
  g.texts = g.texts.filter((t) => t.life > 0);
  g.particles.forEach((q) => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; q.life -= dt; });
  g.particles = g.particles.filter((q) => q.life > 0);

  if (state === 'result') { resultWait -= dt; return; }

  if (state === 'play') {
    g.elapsed += dt;
    g.time -= dt;
    g.speed = START_SPEED + g.elapsed * SPEED_UP;
    if (g.time <= 0) { g.time = 0; endGame(); return; }
  }

  // --- 街を左へ流す（らくばる君が進んでいるように見える） ---
  const dx = g.speed * dt * (state === 'play' ? 1 : 0.6);
  g.houses.forEach((h) => { h.x -= dx; });
  g.houses = g.houses.filter((h) => h.x + h.w > -60);
  const last = g.houses[g.houses.length - 1];
  if (last.x + last.w < W + 100) makeHouse(last.x + last.w + rand(30, 100));
  g.clouds.forEach((c) => { c.x -= dx * 0.15; if (c.x < -120) { c.x = W + 60; c.y = rand(30, 150); } });
  g.roadOffset = (g.roadOffset + dx) % 80;

  if (state !== 'play') return; // タイトル画面では街が流れるだけ

  // --- らくばる君を動かす ---
  const p = g.player;
  if (keys.left) p.x -= PLAYER_SPEED * dt;
  if (keys.right) p.x += PLAYER_SPEED * dt;
  p.x = clamp(p.x, PLAYER_X_MIN, PLAYER_X_MAX);
  p.y += (LANES[p.lane] - p.y) * Math.min(1, dt * 14); // 車線変更をなめらかに
  p.bob += dt * 12;
  g.throwCd = Math.max(0, g.throwCd - dt);
  g.invincible = Math.max(0, g.invincible - dt);
  g.shake = Math.max(0, g.shake - dt);

  // --- 飛んでいるチラシとポストの当たり判定 ---
  g.air.forEach((f) => {
    f.y += f.vy * dt;
    f.rot += dt * 14;
    for (const h of g.houses) {
      if (h.mb.done) continue;
      const mx = h.x + h.mbOff;
      const hitX = f.x > mx - 14 && f.x < mx + MAILBOX_W + 14;
      const hitY = f.y < MAILBOX_Y + MAILBOX_H + 6 && f.y > MAILBOX_Y - 20;
      if (hitX && hitY) { hitMailbox(h, mx); f.dead = true; break; }
    }
    if (f.y < MAILBOX_Y - 40) f.dead = true; // 外れて飛んでいった
  });
  g.air = g.air.filter((f) => !f.dead);

  // --- 通り過ぎたポスト（配り残し）を数える ---
  g.houses.forEach((h) => {
    const mx = h.x + h.mbOff;
    if (!h.mb.done && !h.mb.passed && mx + MAILBOX_W < p.x - 24) {
      h.mb.passed = true;
      if (!h.mb.refuse) {
        g.missed++;
        if (g.combo > 0) addText('配り残し…', mx + 20, MAILBOX_Y - 14, '#d6dcef', 15);
        g.combo = 0;
      }
    }
  });

  // --- 障害物を出す ---
  g.obstacleTimer -= dt;
  if (g.obstacleTimer <= 0) {
    const lane = randInt(LANES.length);
    const type = Math.random() < 0.6 ? 'cone' : 'cat';
    g.obstacles.push({ type, lane, x: W + 40, y: LANES[lane], extra: type === 'cat' ? 70 : 0, w: type === 'cone' ? 34 : 46, t: 0 });
    g.obstacleTimer = rand(0.9, 1.8) * Math.max(0.55, 1 - g.elapsed / 120); // だんだん増える
  }

  // --- 障害物にぶつかったか ---
  g.obstacles.forEach((o) => {
    o.x -= (g.speed + o.extra) * dt;
    o.t += dt;
    const near = Math.abs(p.y - o.y) < 26 && Math.abs(p.x - o.x) < o.w / 2 + 36;
    if (near && g.invincible <= 0) {
      g.time = Math.max(0, g.time - CRASH_PENALTY); // 残り時間を減らす
      g.crashes++;
      g.invincible = 1.6;
      g.combo = 0;
      g.shake = 0.35;
      sfx.crash();
      addText(`${o.type === 'cat' ? 'ネコだ！' : 'ゴツン！'} -${CRASH_PENALTY}秒`, p.x, p.y - 130, '#ff7b6b', 24);
      if (g.time <= 0) endGame();
    }
  });
  g.obstacles = g.obstacles.filter((o) => o.x > -60);

}

function hitMailbox(h, mx) {
  h.mb.done = true;
  if (h.mb.refuse) {
    h.mb.angry = true;
    g.score = Math.max(0, g.score - 150);
    g.complaints++;
    g.combo = 0;
    g.shake = 0.25;
    addText('お断りです！ -150', mx + 20, MAILBOX_Y - 18, '#ff7b6b', 20);
    sfx.bad();
    return;
  }
  g.combo++;
  g.maxCombo = Math.max(g.maxCombo, g.combo);
  const pts = 100 + Math.min(g.combo - 1, 20) * 10; // コンボが続くほど高得点
  g.score += pts;
  g.delivered++;
  if (h.mb.passed) g.missed--; // 通り過ぎた直後に届いた場合
  addText(`+${pts}`, mx + 20, MAILBOX_Y - 18, '#ffd23f', 24);
  if (g.combo >= 3) addText(`${g.combo}コンボ`, mx + 20, MAILBOX_Y - 44, '#ffffff', 16);
  burst(mx + MAILBOX_W / 2, MAILBOX_Y + 10);
  sfx.good();
}

// =========================================================
// 6. 描画
// =========================================================
function draw() {
  ctx.save();
  if (g.shake > 0) ctx.translate(rand(-8, 8) * g.shake, rand(-8, 8) * g.shake);

  drawSky();
  g.houses.forEach(drawHouse);
  drawStreet();

  // 奥（上）にあるものから順に描くと、重なりが自然になる
  const things = [];
  g.obstacles.forEach((o) => things.push({ y: o.y, draw: () => drawObstacle(o) }));
  if (state !== 'title') things.push({ y: g.player.y + 0.1, draw: drawPlayer });
  things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());

  g.air.forEach(drawFlyer);
  g.particles.forEach((q) => {
    ctx.globalAlpha = Math.max(0, q.life * 1.5);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
  });
  ctx.globalAlpha = 1;
  g.texts.forEach(drawFloatText);
  ctx.restore();

  if (state === 'play') drawHUD();
  if (state === 'title') drawTitle();
  if (state === 'result') drawResult();
  if (!hasFocus && state === 'play') drawFocusHint();
}

// キーボードが効かない状態のときに出す案内
function drawFocusHint() {
  ctx.fillStyle = 'rgba(27,35,64,0.88)';
  roundRect(W / 2 - 230, H - 62, 460, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.font = `700 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('画面を1回クリックするとキーボードで操作できます', W / 2, H - 42);
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

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, SIDEWALK_Y);
  grad.addColorStop(0, '#7cc6f2');
  grad.addColorStop(1, '#d8f0ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, SIDEWALK_Y);
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(840, 80, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  g.clouds.forEach((c) => {
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 44 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 26 * c.s, c.y - 10 * c.s, 28 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHouse(h) {
  const top = SIDEWALK_Y - h.h;
  // 壁
  ctx.fillStyle = h.wall;
  ctx.fillRect(h.x, top, h.w, h.h);
  // 屋根
  ctx.fillStyle = h.roof;
  ctx.beginPath();
  ctx.moveTo(h.x - 14, top + 2);
  ctx.lineTo(h.x + h.w / 2, top - 44);
  ctx.lineTo(h.x + h.w + 14, top + 2);
  ctx.closePath();
  ctx.fill();
  // 窓
  ctx.fillStyle = '#5b6b7e';
  [0.22, 0.62].forEach((r) => ctx.fillRect(h.x + h.w * r - 2, top + 20, 40, 32));
  ctx.fillStyle = '#bfe6ff';
  [0.22, 0.62].forEach((r) => {
    ctx.fillRect(h.x + h.w * r, top + 22, 36, 28);
  });
  // ドア（ポストと反対側）
  const doorX = h.mbOff < h.w / 2 ? h.x + h.w - 58 : h.x + 22;
  ctx.fillStyle = '#8a5a3c';
  ctx.fillRect(doorX, SIDEWALK_Y - 66, 36, 66);
  ctx.fillStyle = '#e8c27a';
  ctx.fillRect(doorX + 27, SIDEWALK_Y - 36, 4, 4);
  // 生け垣
  ctx.fillStyle = '#5c9a4c';
  ctx.fillRect(h.x - 6, SIDEWALK_Y - 16, h.w + 12, 16);
  drawMailbox(h);
}

function drawMailbox(h) {
  const mx = h.x + h.mbOff;
  // 支柱
  ctx.fillStyle = '#6b6f78';
  ctx.fillRect(mx + MAILBOX_W / 2 - 4, MAILBOX_Y + MAILBOX_H, 8, SIDEWALK_Y + 4 - (MAILBOX_Y + MAILBOX_H));
  // 箱
  ctx.fillStyle = '#3f6db0';
  roundRect(mx, MAILBOX_Y, MAILBOX_W, MAILBOX_H, 5);
  ctx.fill();
  ctx.fillStyle = '#1f2b44';
  ctx.fillRect(mx + 8, MAILBOX_Y + 9, MAILBOX_W - 16, 4); // 投函口

  if (h.mb.refuse) {
    // 「チラシ禁止」の貼り紙
    ctx.fillStyle = '#e23b2e';
    roundRect(mx - 6, MAILBOX_Y + 14, MAILBOX_W + 12, 17, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('チラシ禁止', mx + MAILBOX_W / 2, MAILBOX_Y + 23);
  }
  if (h.mb.done) {
    const cx = mx + MAILBOX_W / 2, cy = MAILBOX_Y - 14;
    ctx.fillStyle = h.mb.angry ? '#e23b2e' : '#2fa35a';
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (h.mb.angry) {
      ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
      ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
    } else {
      ctx.moveTo(cx - 5, cy); ctx.lineTo(cx - 1, cy + 4); ctx.lineTo(cx + 6, cy - 4);
    }
    ctx.stroke();
  }
}

function drawStreet() {
  // 歩道
  ctx.fillStyle = '#d8ccb4';
  ctx.fillRect(0, SIDEWALK_Y, W, ROAD_Y - SIDEWALK_Y);
  ctx.strokeStyle = '#bfb196';
  ctx.lineWidth = 2;
  for (let x = -(g.roadOffset % 40); x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, SIDEWALK_Y); ctx.lineTo(x, ROAD_Y); ctx.stroke();
  }
  // 縁石と道路
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(0, ROAD_Y - 4, W, 6);
  ctx.fillStyle = '#4b515b';
  ctx.fillRect(0, ROAD_Y + 2, W, H - ROAD_Y);
  // 車線の白い点線
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  [380, 460].forEach((y) => {
    for (let x = -g.roadOffset; x < W; x += 80) ctx.fillRect(x, y - 2, 40, 4);
  });
}

function drawShadow(x, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, 7, 0, 0, Math.PI * 2); ctx.fill();
}

function drawPlayer() {
  const p = g.player;
  if (g.invincible > 0 && Math.floor(g.invincible * 12) % 2 === 0) return; // 点滅
  drawShadow(p.x + 12, p.y, 52);
  const w = PLAYER_H * (playerImg.naturalWidth / playerImg.naturalHeight || 0.9);
  const bob = Math.sin(p.bob) * 1.5;
  if (playerImg.complete && playerImg.naturalWidth) {
    ctx.drawImage(playerImg, p.x - w / 2, p.y - PLAYER_H + bob + 4, w, PLAYER_H);
  } else {
    ctx.fillStyle = '#e8541e';
    ctx.fillRect(p.x - 40, p.y - PLAYER_H, 80, PLAYER_H);
  }
}

function drawObstacle(o) {
  if (o.type === 'cone') {
    drawShadow(o.x, o.y, 22);
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(o.x - 16, o.y - 6); ctx.lineTo(o.x, o.y - 48); ctx.lineTo(o.x + 16, o.y - 6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(o.x - 9, o.y - 30, 18, 6);
    ctx.fillStyle = '#d65f12';
    ctx.fillRect(o.x - 22, o.y - 8, 44, 8);
  } else {
    // ネコ（少し速く走ってくる）
    drawShadow(o.x, o.y, 26);
    const step = Math.sin(o.t * 18) * 4;
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(o.x - 14 + step, o.y - 12, 5, 12);
    ctx.fillRect(o.x + 10 - step, o.y - 12, 5, 12);
    ctx.beginPath(); ctx.ellipse(o.x, o.y - 18, 23, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x - 22, o.y - 28, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(o.x - 31, o.y - 34); ctx.lineTo(o.x - 28, o.y - 46); ctx.lineTo(o.x - 22, o.y - 37);
    ctx.moveTo(o.x - 20, o.y - 37); ctx.lineTo(o.x - 14, o.y - 46); ctx.lineTo(o.x - 12, o.y - 33);
    ctx.fill();
    ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(o.x + 21, o.y - 20);
    ctx.quadraticCurveTo(o.x + 38, o.y - 30 + step, o.x + 32, o.y - 44);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(o.x - 27, o.y - 31, 3, 3);
    ctx.fillRect(o.x - 20, o.y - 31, 3, 3);
  }
}

function drawFlyer(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#e8541e';
  ctx.lineWidth = 2;
  ctx.fillRect(-11, -8, 22, 16);
  ctx.strokeRect(-11, -8, 22, 16);
  ctx.fillStyle = '#e8541e';
  ctx.fillRect(-7, -3, 14, 2);
  ctx.fillRect(-7, 2, 10, 2);
  ctx.restore();
}

function drawFloatText(t) {
  ctx.globalAlpha = Math.min(1, t.life * 2);
  ctx.font = `800 ${t.size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(27,35,64,0.85)';
  ctx.strokeText(t.str, t.x, t.y);
  ctx.fillStyle = t.color;
  ctx.fillText(t.str, t.x, t.y);
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.fillStyle = 'rgba(27,35,64,0.78)';
  ctx.fillRect(0, 0, W, 48);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText('スコア', 18, 25);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText(String(g.score), 70, 25);

  // 残り時間（バーつき）
  const tx = 300;
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText('のこり', tx, 25);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(tx + 52, 18, 160, 14);
  ctx.fillStyle = g.time <= 10 ? '#ff5a5a' : '#ffd23f';
  ctx.fillRect(tx + 52, 18, 160 * (g.time / GAME_TIME), 14);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText(`${Math.ceil(g.time)}秒`, tx + 222, 25);


  if (g.combo >= 2) {
    ctx.textAlign = 'left';
    ctx.font = `800 18px ${FONT}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(27,35,64,0.85)';
    ctx.strokeText(`${g.combo} コンボ中！`, 18, 70);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`${g.combo} コンボ中！`, 18, 70);
  }
}

function drawPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(27,35,64,0.92)';
  roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawTitle() {
  ctx.fillStyle = 'rgba(27,35,64,0.35)';
  ctx.fillRect(0, 0, W, H);
  drawPanel(90, 70, 780, 400);
  if (playerImg.complete && playerImg.naturalWidth) {
    const h = 290, w = h * playerImg.naturalWidth / playerImg.naturalHeight;
    ctx.drawImage(playerImg, 120, 120 + Math.sin(performance.now() / 300) * 4, w, h);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 24px ${DISPLAY}`;
  ctx.fillText('らくばる君の', 410, 150);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `400 46px ${DISPLAY}`;
  ctx.fillText('ポスティング', 410, 208);
  ctx.fillText('大作戦', 410, 262);

  ctx.fillStyle = '#d6dcef';
  ctx.font = `500 16px ${FONT}`;
  const lines = [
    '60秒でポストにチラシを配ろう！',
    '・チラシは真上に飛ぶ。ポストの真下で投げよう',
    '・「チラシ禁止」のポストに入れるとクレーム',
    '・コーンやネコに当たると残り時間が3秒減る',
  ];
  lines.forEach((s, i) => ctx.fillText(s, 410, 304 + i * 26));

  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText(hasFocus ? 'スペースキー ／ 画面クリックでスタート' : '画面をクリックしてスタート', 410, 438);
  }
  if (best > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#aab3d6';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`ハイスコア ${best}`, 850, 100);
  }
}

function rankOf(score) {
  if (score >= 9000) return '伝説のポスティング職人';
  if (score >= 5000) return 'ベテラン配布員';
  if (score >= 2000) return '一人前の配布員';
  return '見習い配布員';
}

function drawResult() {
  ctx.fillStyle = 'rgba(27,35,64,0.45)';
  ctx.fillRect(0, 0, W, H);
  drawPanel(200, 50, 560, 440);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 30px ${DISPLAY}`;
  ctx.fillText('配布おつかれさま！', W / 2, 108);

  ctx.fillStyle = '#ffd23f';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(String(g.score), W / 2, 182);
  ctx.fillStyle = '#d6dcef';
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText(`称号：${rankOf(g.score)}`, W / 2, 218);

  const rows = [
    ['配れたポスト', `${g.delivered} 軒`],
    ['最大コンボ', `${g.maxCombo}`],
    ['配り残し', `${g.missed} 軒`],
    ['クレーム（禁止ポスト）', `${g.complaints} 回`],
    ['ぶつかった回数', `${g.crashes} 回`],
    ['ハイスコア', `${best}${g.newBest ? '（新記録！）' : ''}`],
  ];
  ctx.font = `500 18px ${FONT}`;
  rows.forEach(([label, value], i) => {
    const y = 266 + i * 34;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aab3d6';
    ctx.fillText(label, 270, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, 690, y);
  });

  if (resultWait <= 0 && Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText('スペースキー ／ タップでもう一度', W / 2, 462);
  }
}

// =========================================================
// 7. ループ
// =========================================================
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000); // タブ切替などで大きく飛ばないように
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

newWorld();
requestAnimationFrame(loop);
