'use strict';
/* =========================================================
   らくばる君の花火大会
   下から上がってくる花火の玉が、スコープの中に来た瞬間に
   ボタンを押すと花火が開きます。中心に近いほど高得点。
   ========================================================= */

// ===== 1. 設定（ここの数字を変えると遊びやすさが変わります） =====
const GAME_TIME = 60;                        // 制限時間（秒）
const SCOPE = { x: 480, y: 180, r: 46 };     // スコープの位置と大きさ
const JUDGE = { perfect: 10, great: 24 };    // 中心からの距離(px)で判定
const POINTS = { perfect: 300, great: 200, good: 100 };
const RAKU_POINTS = { perfect: 1500, great: 1000, good: 700 }; // らくばる君花火
const RAKU_RATE = 0.12;       // らくばる君花火の玉が出る確率（0.12 = 12%）
const GRAVITY = 300;          // 玉にかかる重力（大きいほど玉が速い）
const EMPTY_COOLDOWN = 0.4;   // からぶりした後、押せなくなる時間（秒）
const LAUNCH_Y = 470;         // 玉が打ち上がる高さ（川の向こう岸）

// ===== 2. 準備 =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// 花火の光は別のキャンバスに描き、少しずつ消していくことで「残像」を出す
const fx = document.createElement('canvas');
fx.width = W; fx.height = H;
const fxc = fx.getContext('2d');

const charImg = new Image();
charImg.src = 'assets/rakubaru.png';

const FONT = '"Dela Gothic One", "M PLUS Rounded 1c", sans-serif';
const FONT_BODY = '"M PLUS Rounded 1c", sans-serif';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ===== 3. らくばる君の顔の点データ =====
// 画像の顔の部分を点に分けたもの（3文字で1点：横位置・縦位置・色番号）。
// 画像から直接読むとファイルを直接開いたときに動かないため、データとして入れています。
const FACE_DATA = "\\40]40^40_40`40Z50[50\\50`50a50b50X60Y60Z60\\61^61`61b60c60W70X70d70e70V80W80X81Z81\\81^81`81b81d81e80f80U90V90f90g90T:0U:0V:1X:1Z:1\\:1^:1`:1b:1d:1f:1g:0S;0T;0Z;0h;0R<0S<0T<1V<1X<1Y<0Z<1\\<1^<1`<1b<1d<1f<1h<0i<0R=0i=0Q>0R>1T>1V>1X>0Z>1\\>1^>1`>1b>1d>1f>1h>1i>0P?0Q?0W?0i?0j?0O@0P@0R@1T@1V@1W@0X@1Z@1\\@1^@1`@1b@1d@1f@1h@1i@0j@0OA0VA0iA0NB0OB0PB1RB1TB1VB0XB1ZB1\\B1^B1`B1bB1dB1fB1hB1iB0MC0NC0iC0MD0ND1PD1RD1TD1UD0VD1XD1ZD1\\D1^D1`D1bD1dD1fD1hD1iD0LE0ME0UE0hE0iE0KF0LF0NF1PF1RF1TF0VF1XF1ZF1\\F1^F1`F1bF1dF1fF1hF0iF0KG0TG0hG0JH0KH0LH1NH1PH1RH1TH1VH1XH1ZH1\\H1^H1`H1bH1dH1fH1hH0JI0SI0hI0IJ0JJ1LJ1NJ1PJ1RJ1SJ0TJ1VJ1XJ1ZJ1\\J1^J1`J1bJ1dJ1fJ1hJ0HK0IK0hK0HL0JL1KL0LL0NL1PL1RL0TL0UL0VL0XL1ZL1\\L1^L1`L1bL1dL1fL1gL0hL0GM0HM0RM0XM0YM0ZM0gM0hM0GN0HN1JN1LN1NN1PN1RN0TN1VN1XN1ZN1[N0\\N0^N1`N1bN1dN1fN1gN0hN0FO0GO0^O0_O0gO0FP0HP1JP1LP1NP1PP1QP0RP1TP1VP1XP1ZP1\\P1^P1`P0aP0bP1dP1fP1gP0EQ0FQ0QQ0bQ0cQ0gQ0ER0FR1HR1JR1LR1NR1PR1QR0RR1TR1VR1XR1ZR1\\R1^R1`R1bR1dR1fR1gR0DS0gS0>T0?T0@T0CT0DT0FT1HT1JT1LT1NT1PT0RT1TT1VT1XT1ZT1\\T1^T1`T1bT1dT1fT1gT0<U0=U0>U0?U0@U0AU0BU0CU0DU0EU0FU0GU0HU0IU0JU0KU0LU0MU0NU0OU0PU0fU0gU0;V0>V2@V2BV2DV2FV0GV0HV0IV0JV0LV2OV0PV0QV0RV0SV0TV0VV1XV1ZV1\\V1^V1`V1bV1dV1fV0;W0<W0=W2?W2AW2CW2EW2GW2JW0KW0LW0MW0OW2QW2TW0UW0VW0WW0XW0eW0fW0<X0>X2@X2BX2DX2FX2HX2JX2LX2MX0NX0OX0PX0QX0RX2TX2VX2WX0XX0YX0ZX0[X0\\X1^X1`X1bX1dX1eX0fX0<Y0=Y0?Y2AY2CY2EY2GY2IY2KY2MY2OY2QY0RY0SY0TY0UY2WY2YY2ZY0[Y0\\Y0]Y0eY0fY0=Z0>Z2@Z2BZ2DZ2FZ2HZ2JZ2LZ2NZ2PZ2RZ2TZ0UZ0VZ0WZ0XZ2ZZ2\\Z2]Z0^Z0_Z0`Z0bZ1dZ1fZ0>[0?[2A[2C[2E[2G[2I[2K[2M[2O[2Q[2S[2U[2W[0X[0Y[0Z[0[[2][2_[2`[0a[0b[0f[0?\\0@\\0A\\0B\\0D\\4F\\4H\\4J\\1K\\0L\\0M\\0N\\0O\\0P\\0R\\2T\\2V\\2X\\2Z\\0[\\0\\\\0^\\2`\\2b\\0c\\0d\\0e\\0f\\0?]0S]4U]0V]0W]0Y]2[]2\\]0]]0^]0_]0a]2c]2e]0f]0>^0@^3B^3D^3F^3H^3J^3L^3N^3P^3R^3T^3V^3X^3Z^4[^0\\^0]^0_^0`^0a^0b^0d^2e^0f^0=_0>_0a_0b_0c_0d_0e_0f_0=`0>`3@`3B`3D`0E`0F`0G`0H`3J`3L`3N`3P`3R`3T`3V`3X`3Z`3\\`3^`3``3a`0b`0c`0d`0e`0f`0<a0=a4Da0Ea0Fa0Ga0Ha0Va0Wa0Xa0Ya4aa0ba0ca0da0ea0fa0;b0<b0>b3@b3Bb3Db3Eb0Fb0Gb0Hb0Jb3Lb3Nb3Pb3Rb3Tb0Ub0Vb0Wb0Xb0Yb0Zb3\\b3^b3`b3ab0bb0cb0db0eb0fb0;c0Gc4Hc0Ic0Sc0Tc0Uc0Vc0Wc0Xc0ac0bc0cc0dc0ec0fc0gc0;d0<d3>d3@d3Bd3Dd3Fd3Hd3Jd3Ld3Nd3Pd3Rd3Sd0Td1Vd4Xd3Zd3\\d3^d3`d3ad0bd0cd0dd0ed0fd0gd0:e0;e4Ce4Ee4ae0be0ce0de0ee0fe0ge06f07f08f09f0:f0<f3>f3@f3Bf0Cf0Df0Ef0Ff0Hf3Jf3Lf3Nf3Pf3Rf3Tf3Vf3Xf3Zf3\\f3^f3`f3af0bf0cf0df0ef0ff0gf0hf05g09g0:g0Ag0Bg0Cg0Dg0Eg0Fg0Gg0ag0bg0cg0dg0eg0fg0gg0hg04h05h06h38h39h0:h4<h3>h3@h3Ah0Bh0Ch0Dh0Eh0Fh0Gh0Hh3Jh3Lh3Nh3Ph3Rh3Th3Uh0Vh0Wh0Xh0Yh0Zh3\\h3^h3`h3ah0bh0ch0dh0eh0fh0gh0hh04i09i0Ai0Bi0Ci0Di0Ei0Fi0Gi0Ti0Ui0Vi0Wi0Xi0Yi0Zi0ai4bi0ci0di0ei0fi0gi0hi0ki0li04j06j38j49j0:j3<j3>j3@j3Aj0Bj0Cj0Dj0Ej0Fj0Gj0Hj3Jj3Lj3Nj3Pj3Rj3Tj0Uj0Vj0Wj0Xj0Yj0Zj0\\j3^j3`j3bj0cj0dj0ej0fj0gj0hj0ij0jj0kj0lj0mj0nj04k09k0Ak4Bk0Ck0Dk0Ek0Fk0Tk0Uk0Vk0Wk0Xk0Yk0Zk0ck0dk0ek0fk0gk0hk0nk0ok04l06l38l0:l3<l3>l3@l3Bl3Cl0Dl0El0Fl3Hl3Jl3Ll3Nl3Pl3Rl3Tl0Ul0Vl0Wl0Xl0Yl0Zl0\\l3^l3`l3bl3dl4el0fl0gl0hl3jl3ll3nl3ol04m05m08m09m4;m4=m4?m4Um0Vm0Wm0Xm0Ym0dm0em0fm0om0pm05n06n48n0:n4<n4>n4@n4Bn3Dn3Fn3Hn3Jn3Ln3Nn3Pn3Rn3Tn3Vn1Wn0Xn0Zn3\\n3^n3`n3bn3dn0fn3hn3jn3ln3nn3pn06o08o09o4;o4=o4?o4Ao4[o4]o4do0oo4po06p07p08p0:p4<p4>p4@p4Bp3Dp3Fp3Hp3Jp3Lp3Np3Pp3Rp3Tp3Vp3Xp3Zp4\\p4^p4`p3bp3dp0fp3hp3jp3lp3np3pp08q09q4;q4=q4?q4Aq4Yq4[q4]q4_q4cq0oq0pq08r0:r4<r4>r4@r4Br3Dr3Fr3Hr3Jr3Lr3Nr3Pr3Rr3Tr3Vr3Xr4Zr4\\r4^r4`r4br3cr0dr3fr3hr3jr3lr3nr3or08s09s4;s4=s4?s4As4Hs0Is4Ks0Ls0Ms0Ns0Ws4Ys4[s4]s4_s4cs0ns0os08t09t0:t4<t4>t4@t4Bt3Dt3Ft3Ht0Jt5Lt5Nt5Pt5Qt0Rt3Tt3Vt3Xt4Zt4\\t4^t4`t4bt0dt3ft3ht3jt3lt3mt0nt09u0;u4=u4?u4Hu0Iu5Ku5Mu5Ou5Pu0Wu4Yu4[u4]u4_u4bu0cu0du0lu0mu09v0:v0<v3>v3@v3Bv3Dv3Fv3Hv3Jv5Lv5Nv5Pv1Rv3Tv3Vv3Xv4Zv4\\v4^v4`v4av0bv4dv1ev0fv0gv0hv0iv0jv0kv0:w0Iw0Kw5Mw5Ow0Yw4[w4]w4_w4`w0aw0ew0;x0<x3>x3@x3Bx3Dx3Fx3Hx3Jx0Lx5Nx0Px3Rx3Tx3Vx3Xx3Zx4\\x4^x4`x0bx3dx0;y0<y0Ky0Ly0[y4_y0cy0dy0<z0=z0>z3@z3Bz3Dz3Fz3Hz3Jz3Lz3Nz3Pz3Rz3Tz3Vz3Xz3Zz3\\z3^z0`z3bz1cz0={0>{0?{4]{0b{0";
const FACE_W = 67, FACE_H = 76;
const FACE_COLORS = ['#fff1b8', '#a58bff', '#ffd23f', '#ff9a5a', '#ff4d86', '#ffffff'];
const FACE = [];
for (let k = 0; k < FACE_DATA.length; k += 3) {
  FACE.push({
    i: FACE_DATA.charCodeAt(k) - 48,
    j: FACE_DATA.charCodeAt(k + 1) - 48,
    c: Number(FACE_DATA[k + 2]),
  });
}

// ===== 4. 背景（星と街並み）は最初に一度だけ作る =====
const stars = Array.from({ length: 110 }, () => ({
  x: rand(0, W), y: rand(0, 400), r: rand(0.4, 1.4), p: rand(0, Math.PI * 2),
}));

const skyline = document.createElement('canvas');
skyline.width = W; skyline.height = H;
(function drawSkyline() {
  const c = skyline.getContext('2d');
  // 向こう岸の街並み
  c.fillStyle = '#0d1230';
  let x = 0;
  while (x < W) {
    const w = rand(24, 60), h = rand(8, 46);
    c.fillRect(x, LAUNCH_Y - h, w, h + 4);
    // ところどころ窓の明かり
    c.fillStyle = 'rgba(255, 210, 120, 0.55)';
    for (let wy = LAUNCH_Y - h + 6; wy < LAUNCH_Y - 4; wy += 8) {
      for (let wx = x + 5; wx < x + w - 5; wx += 9) {
        if (Math.random() < 0.18) c.fillRect(wx, wy, 3, 3);
      }
    }
    c.fillStyle = '#0d1230';
    x += w + rand(0, 6);
  }
  c.fillRect(0, LAUNCH_Y - 4, W, 8);
})();

// ===== 5. 音（ブラウザの中で作る効果音） =====
const sfx = (() => {
  let ac = null, master = null, noiseBuf = null, muted = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, gain, t0 = 0, type = 'lowpass') {
    if (!ac) return;
    const t = ac.currentTime + t0;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, t0 = 0, type = 'sine', freqEnd) {
    if (!ac) return;
    const t = ac.currentTime + t0;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    init,
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    launch() { tone(500, 0.7, 0.025, 0, 'sine', 1500); noise(0.25, 900, 0.05, 0, 'bandpass'); },
    boom(size = 1) {
      noise(1.3 * size, 320, 0.9 * size);
      tone(90, 0.5, 0.5 * size, 0, 'sine', 40);
    },
    crackle() {
      for (let i = 0; i < 14; i++) noise(0.04, 4000, 0.18, 0.6 + Math.random() * 0.9, 'highpass');
    },
    raku() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 0.12, 0.15 + i * 0.08, 'triangle'));
    },
    fizzle() { noise(0.35, 600, 0.12); },
    blank() { tone(180, 0.12, 0.12, 0, 'square', 120); },
  };
})();

// ===== 6. ゲームの状態 =====
let state = 'title';      // 'title'（タイトル） / 'play'（プレイ中） / 'result'（結果）
let score = 0, combo = 0, maxCombo = 0, timeLeft = GAME_TIME;
let stats = { perfect: 0, great: 0, good: 0, miss: 0, blank: 0, raku: 0 };
let shells = [];          // 上がっていく花火の玉
let parts = [];           // 花火の火花
let faces = [];           // らくばる君花火
let popups = [];          // 「うまい！」などの文字
let spawnTimer = 0, cooldown = 0, flash = 0, resultTimer = 0, demoTimer = 0;
let isNewBest = false;
let best = 0;
try { best = Number(localStorage.getItem('rakubaru-hanabi-best')) || 0; } catch (e) { best = 0; }

// らくばる君の様子
const kun = { mood: 'idle', t: 0, say: '', sayT: 0 };
function kunReact(mood, text) {
  kun.mood = mood; kun.t = 0;
  if (text) { kun.say = text; kun.sayT = 1.4; }
}

function startGame() {
  state = 'play';
  score = 0; combo = 0; maxCombo = 0; timeLeft = GAME_TIME;
  stats = { perfect: 0, great: 0, good: 0, miss: 0, blank: 0, raku: 0 };
  shells = []; popups = [];
  spawnTimer = 0.9; cooldown = 0; isNewBest = false;
  addPopup('スタート！', SCOPE.x, SCOPE.y + 110, '#ffd23f', 40);
  kunReact('jump', 'いくよ〜！');
}

function endGame() {
  state = 'result';
  resultTimer = 0;
  for (const s of shells) fizzleSparks(s);
  shells = [];
  if (score > best) {
    best = score; isNewBest = true;
    try { localStorage.setItem('rakubaru-hanabi-best', String(best)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  kunReact('jump', isNewBest ? 'ベスト更新！' : 'おつかれさま！');
}

// 経過の割合（0 = はじめ、1 = おわり）
const progress = () => clamp(1 - timeLeft / GAME_TIME, 0, 1);

// ===== 7. 花火の玉を打ち上げる =====
function launchShell() {
  const p = progress();
  const raku = Math.random() < RAKU_RATE;
  // 頂点の高さをバラバラにする：スコープのすぐ上で止まる玉はゆっくり、高く上がる玉は速い
  const apexY = SCOPE.y - rand(28, 210);
  // 時間がたつほど速くなる
  const speed = 1 + p * 0.5 + rand(-0.05, 0.3) * p;
  const g = GRAVITY * speed * speed;
  const vy = -Math.sqrt(2 * g * (LAUNCH_Y - apexY));
  // スコープの高さに届くまでの時間
  const tScope = (-vy - Math.sqrt(vy * vy - 2 * g * (LAUNCH_Y - SCOPE.y))) / g;
  // 15秒をすぎると、ななめに上がる玉が出てくる
  const spread = p < 0.25 ? 0 : (p - 0.25) / 0.75 * 260;
  const x0 = SCOPE.x + rand(-spread, spread);
  const aimErr = rand(-16, 16) * Math.min(1, p * 2.5); // 中心から少しずれて通る
  const vx = (SCOPE.x + aimErr - x0) / tScope;
  shells.push({ x: x0, y: LAUNCH_Y, vx, vy, g, raku, t: 0, apexT: -1, hue: rand(0, 360) });
  sfx.launch();
}

function scheduleNext() {
  const p = progress();
  spawnTimer = rand(lerp(1.1, 0.5, p), lerp(2.5, 1.5, p));
  // 後半はたまに2連発
  if (p > 0.45 && Math.random() < 0.25) {
    setTimeout(() => { if (state === 'play') launchShell(); }, rand(180, 420));
  }
}

// ===== 8. 火花 =====
function addPart(x, y, ang, spd, o) {
  parts.push({
    x, y, px: x, py: y,
    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    life: o.life, max: o.life, col: o.col, col2: o.col2 || null,
    drag: o.drag ?? 0.975, g: o.g ?? 60, w: o.w ?? 2.2, tw: o.tw || false,
  });
}

const hsl = (h, s = 100, l = 62) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

// 球状に広がる向き（真上から見た球の形になるように）
function sphere(n, cb) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const c = rand(-1, 1);
    cb(a, Math.sqrt(1 - c * c));
  }
}

const TYPES = ['peony', 'peony', 'chrysanthemum', 'ring', 'willow', 'strobe', 'double', 'double'];

function burst(x, y, size = 1) {
  const type = pick(TYPES);
  const h = rand(0, 360);
  const col = hsl(h), col2 = hsl(h + pick([60, 120, 180, 200]));
  const v = 240 * size;
  switch (type) {
    case 'peony': // 牡丹：まんまるに開く
      sphere(Math.round(120 * size), (a, k) => addPart(x, y, a, v * k * rand(0.92, 1), { life: rand(1.2, 1.6), col }));
      break;
    case 'chrysanthemum': // 菊：途中で色が変わる
      sphere(Math.round(130 * size), (a, k) => addPart(x, y, a, v * k * rand(0.95, 1.05), { life: rand(1.5, 1.9), col, col2, w: 1.8 }));
      break;
    case 'ring': { // 輪：ななめの輪
      const tilt = rand(0.35, 1), rot = rand(0, Math.PI);
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a) * tilt;
        const ang = Math.atan2(dx * Math.sin(rot) + dy * Math.cos(rot), dx * Math.cos(rot) - dy * Math.sin(rot));
        addPart(x, y, ang, v * Math.hypot(dx, dy), { life: 1.4, col, w: 2.6 });
      }
      sphere(30, (a, k) => addPart(x, y, a, v * 0.35 * k, { life: 1.0, col: col2 }));
      break;
    }
    case 'willow': // 柳：金色がしだれる
      sphere(Math.round(100 * size), (a, k) => addPart(x, y, a, v * 0.8 * k, { life: rand(2.4, 3), col: '#ffcf6b', drag: 0.955, g: 95, w: 1.6, tw: true }));
      sfx.crackle();
      break;
    case 'strobe': // 錦：キラキラ点滅
      sphere(Math.round(110 * size), (a, k) => addPart(x, y, a, v * k, { life: rand(1.6, 2.1), col: '#fff4d6', col2: col, tw: true, w: 2 }));
      sfx.crackle();
      break;
    default: // 芯入り：内と外で2色
      sphere(Math.round(100 * size), (a, k) => addPart(x, y, a, v * k * rand(0.95, 1), { life: 1.5, col }));
      sphere(Math.round(50 * size), (a, k) => addPart(x, y, a, v * 0.5 * k, { life: 1.2, col: col2, w: 2.6 }));
  }
  flash = Math.max(flash, 0.35 * size);
  sfx.boom(Math.min(1.2, size));
}

// らくばる君花火：火花が飛んでいって、らくばる君の顔の形に並ぶ
function faceBurst(x, y) {
  const s = 3.6;
  const dots = FACE.map((d) => ({
    tx: x + (d.i - FACE_W / 2) * s,
    ty: y + (d.j - FACE_H / 2) * s,
    col: FACE_COLORS[d.c],
    delay: rand(0, 0.12),
    vy: 0,
  }));
  faces.push({ x, y, t: 0, dots });
  // まわりに金色の輪
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    addPart(x, y, a, 330, { life: 1.6, col: '#ffd23f', w: 2.4 });
  }
  sphere(60, (a, k) => addPart(x, y, a, 420 * k, { life: 2.2, col: '#fff4d6', tw: true, drag: 0.96, g: 70 }));
  flash = 0.6;
  sfx.boom(1.3);
  sfx.raku();
}

function fizzleSparks(s) {
  for (let i = 0; i < 10; i++) {
    addPart(s.x, s.y, rand(0, Math.PI * 2), rand(20, 60), { life: 0.5, col: '#7d7f99', w: 1.5 });
  }
}

function addPopup(text, x, y, col, size = 28) {
  popups.push({ text, x, y, col, size, t: 0 });
}

// ===== 9. ボタンを押したとき =====
function press() {
  sfx.init();
  if (state === 'title') { startGame(); return; }
  if (state === 'result') { if (resultTimer > 1) startGame(); return; }
  if (cooldown > 0) return;

  // スコープの中にいる玉のうち、いちばん中心に近いもの
  let target = null, dist = Infinity;
  for (const s of shells) {
    const d = Math.hypot(s.x - SCOPE.x, s.y - SCOPE.y);
    if (d < SCOPE.r + 6 && d < dist) { dist = d; target = s; }
  }

  if (!target) { // からぶり
    cooldown = EMPTY_COOLDOWN;
    combo = 0;
    stats.blank++;
    addPopup('からぶり', SCOPE.x, SCOPE.y + SCOPE.r + 30, '#8f9bd0', 22);
    sfx.blank();
    return;
  }

  shells.splice(shells.indexOf(target), 1);
  const grade = dist <= JUDGE.perfect ? 'perfect' : dist <= JUDGE.great ? 'great' : 'good';
  stats[grade]++;
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  const mult = 1 + Math.min(4, Math.floor(combo / 5)) * 0.5; // 5コンボごとに×0.5、最大×3
  const base = target.raku ? RAKU_POINTS[grade] : POINTS[grade];
  const gain = Math.round(base * mult);
  score += gain;

  const label = { perfect: 'どんぴしゃ！', great: 'うまい！', good: 'おしい' }[grade];
  const color = { perfect: '#ffd23f', great: '#7dff9a', good: '#9fd0ff' }[grade];

  if (target.raku) {
    stats.raku++;
    faceBurst(target.x, target.y);
    addPopup('らくばる君花火！', SCOPE.x, SCOPE.y + 170, '#ff8ac6', 34);
    addPopup(`+${gain}`, SCOPE.x, SCOPE.y + 210, '#ffd23f', 26);
    kunReact('jump', 'ぼくの花火だ！');
  } else {
    const size = { perfect: 1.25, great: 1, good: 0.75 }[grade];
    burst(target.x, target.y, size);
    addPopup(label, SCOPE.x, SCOPE.y + SCOPE.r + 34, color, grade === 'perfect' ? 34 : 28);
    addPopup(`+${gain}`, SCOPE.x, SCOPE.y + SCOPE.r + 68, '#ffffff', 20);
    if (combo > 0 && combo % 10 === 0) kunReact('jump', 'かぎや〜！');
    else if (grade === 'perfect') kunReact('jump', 'たまや〜！');
    else kunReact('jump');
  }
}

// ===== 10. 毎フレームの更新 =====
function update(dt) {
  cooldown = Math.max(0, cooldown - dt);
  flash = Math.max(0, flash - dt * 1.6);
  kun.t += dt;
  kun.sayT = Math.max(0, kun.sayT - dt);

  if (state === 'play') {
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endGame(); }
    spawnTimer -= dt;
    if (spawnTimer <= 0 && state === 'play') { launchShell(); scheduleNext(); }
  } else if (state === 'title') {
    // タイトル画面ではお手本の花火を上げておく
    demoTimer -= dt;
    if (demoTimer <= 0) {
      demoTimer = rand(0.9, 1.7);
      if (Math.random() < 0.15) faceBurst(rand(300, 660), rand(150, 210));
      else burst(rand(140, 820), rand(90, 260), rand(0.8, 1.2));
    }
  } else {
    resultTimer += dt;
  }

  // 玉の動き
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.t += dt;
    s.x += s.vx * dt;
    s.vy += s.g * dt;
    s.y += s.vy * dt;
    // しっぽの火花
    if (Math.random() < 0.8) {
      parts.push({
        x: s.x + rand(-1.5, 1.5), y: s.y + 4, px: s.x, py: s.y + 4,
        vx: rand(-12, 12), vy: rand(10, 40), life: 0.45, max: 0.45,
        col: s.raku ? hsl(s.t * 600 + s.hue, 100, 70) : '#ffb36b', col2: null,
        drag: 0.95, g: 40, w: s.raku ? 2 : 1.4, tw: s.raku,
      });
    }
    if (s.vy > 0 && s.apexT < 0) s.apexT = s.t;
    // 頂点をすぎて落ちてきたら不発
    const fallen = s.apexT >= 0 && (s.t - s.apexT > 0.55 || s.y > SCOPE.y + SCOPE.r + 14);
    if (fallen) {
      shells.splice(i, 1);
      fizzleSparks(s);
      sfx.fizzle();
      if (state === 'play') {
        stats.miss++;
        combo = 0;
        addPopup('不発…', s.x, s.y - 20, '#8f9bd0', 22);
        kunReact('sad', Math.random() < 0.5 ? 'あっ…' : 'おしい！');
      }
    }
  }

  // 火花の動き
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.px = p.x; p.py = p.y;
    const drag = Math.pow(p.drag, dt * 60);
    p.vx *= drag; p.vy *= drag;
    p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  if (parts.length > 3000) parts.splice(0, parts.length - 3000);

  // らくばる君花火
  for (let i = faces.length - 1; i >= 0; i--) {
    faces[i].t += dt;
    if (faces[i].t > 3.2) faces.splice(i, 1);
  }

  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt;
    if (popups[i].t > 1.1) popups.splice(i, 1);
  }
}

// ===== 11. 描画 =====
function drawFx() {
  // 前のフレームの光を少しだけ消す（これが残像になる）
  fxc.globalCompositeOperation = 'destination-out';
  fxc.fillStyle = 'rgba(0, 0, 0, 0.2)';
  fxc.fillRect(0, 0, W, H);

  fxc.globalCompositeOperation = 'lighter';
  fxc.lineCap = 'round';
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.tw && k < 0.7 && Math.random() < 0.45) continue; // 点滅
    fxc.globalAlpha = Math.min(1, k * 1.4);
    fxc.strokeStyle = p.col2 && k < 0.5 ? p.col2 : p.col;
    fxc.lineWidth = p.w * (0.5 + k * 0.5);
    fxc.beginPath();
    fxc.moveTo(p.px, p.py);
    fxc.lineTo(p.x + 0.01, p.y);
    fxc.stroke();
  }

  // らくばる君花火の点（色が白く飛ばないように普通の重ね方で描く）
  fxc.globalCompositeOperation = 'source-over';
  for (const f of faces) {
    for (const d of f.dots) {
      const t = f.t - d.delay;
      if (t <= 0) continue;
      const k = 1 - Math.pow(1 - Math.min(1, t / 0.55), 3); // 最初は速く、だんだんゆっくり
      let x = lerp(f.x, d.tx, k), y = lerp(f.y, d.ty, k);
      let a = 1;
      if (f.t > 2.1) { // しだれて消える
        const ft = f.t - 2.1;
        y += ft * ft * 70;
        a = Math.max(0, 1 - ft / 1.1);
      } else if (f.t > 0.6) {
        a = rand(0.75, 1); // キラキラ
      }
      fxc.globalAlpha = a;
      fxc.fillStyle = d.col;
      fxc.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    }
  }
  fxc.globalAlpha = 1;
}

function drawSky(time) {
  const g = ctx.createLinearGradient(0, 0, 0, LAUNCH_Y);
  g.addColorStop(0, '#070a1f');
  g.addColorStop(0.7, '#141a45');
  g.addColorStop(1, '#2b2557');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, LAUNCH_Y);
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.5 + s.p);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  if (flash > 0) { // 花火が開いた瞬間、空が少し明るくなる
    ctx.fillStyle = `rgba(255, 220, 180, ${flash * 0.18})`;
    ctx.fillRect(0, 0, W, LAUNCH_Y);
  }
}

function drawShells(time) {
  for (const s of shells) {
    const r = s.raku ? 8 : 6;
    const col = s.raku ? hsl(time * 400 + s.hue, 100, 65) : '#ffe2b0';
    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3.2);
    glow.addColorStop(0, s.raku ? 'rgba(255, 120, 200, 0.7)' : 'rgba(255, 200, 120, 0.55)');
    glow.addColorStop(1, 'rgba(255, 150, 80, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    if (s.raku) { // らくばる君花火の玉は金のふち＋星
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', s.x, s.y + 1);
    }
  }
}

function drawWater(time) {
  const top = LAUNCH_Y + 4;
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, '#141a45');
  g.addColorStop(1, '#070a1f');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, H - top);
  // 川に花火が映る
  ctx.save();
  ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip();
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(0, top);
  ctx.scale(1, -0.28);
  ctx.drawImage(fx, 0, -top);
  ctx.restore();
  // さざ波
  ctx.strokeStyle = 'rgba(170, 179, 214, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const y = top + 8 + i * 7;
    const x = ((time * 20 * (i % 2 ? 1 : -1)) + i * 97) % W;
    ctx.beginPath();
    ctx.moveTo((x + W) % W, y); ctx.lineTo((x + W) % W + 60, y);
    ctx.moveTo((x + W / 2) % W, y + 3); ctx.lineTo((x + W / 2) % W + 40, y + 3);
    ctx.stroke();
  }
}

function drawKun() {
  // 手前の土手
  ctx.fillStyle = '#0a0e26';
  ctx.beginPath();
  ctx.moveTo(0, 452);
  ctx.quadraticCurveTo(170, 448, 230, 480);
  ctx.quadraticCurveTo(270, 505, 300, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  const size = 180;
  let x = 6, y = 476 - size;
  let rot = 0;
  if (kun.mood === 'jump' && kun.t < 0.5) y -= Math.sin((kun.t / 0.5) * Math.PI) * 22;
  else if (kun.mood === 'sad' && kun.t < 0.8) rot = -0.08 * Math.sin((kun.t / 0.8) * Math.PI);
  else y += Math.sin(kun.t * 2.4) * 1.5;

  if (charImg.complete && charImg.naturalWidth) {
    ctx.save();
    ctx.translate(x + size / 2, y + size);
    ctx.rotate(rot);
    ctx.drawImage(charImg, -size / 2, -size, size, size);
    ctx.restore();
  }

  // ふきだし
  if (kun.sayT > 0 && kun.say) {
    ctx.globalAlpha = Math.min(1, kun.sayT * 4);
    ctx.font = `700 18px ${FONT_BODY}`;
    const tw = ctx.measureText(kun.say).width;
    const bx = x + size * 0.68, by = y + 4, bw = tw + 28, bh = 36;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 18);
    ctx.moveTo(bx + 14, by + bh - 2); ctx.lineTo(bx + 2, by + bh + 12); ctx.lineTo(bx + 28, by + bh - 2);
    ctx.fill();
    ctx.fillStyle = '#1b2340';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(kun.say, bx + 14, by + bh / 2 + 1);
    ctx.globalAlpha = 1;
  }
}

function drawScope(time) {
  const { x, y, r } = SCOPE;
  const inside = shells.some((s) => Math.hypot(s.x - x, s.y - y) < r + 6);
  const col = cooldown > 0 ? '#ff5d6c' : inside ? '#ffd23f' : 'rgba(244, 241, 255, 0.75)';
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = inside ? 3.5 : 2.5;
  if (inside) { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 18; }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  // 十字の目盛り
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - 10), y + Math.sin(a) * (r - 10));
    ctx.lineTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10));
    ctx.stroke();
  }
  // まんなか（どんぴしゃ）の印
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(x, y, JUDGE.perfect + 2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (inside && state === 'play') {
    ctx.fillStyle = '#ffd23f';
    ctx.font = `16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 20);
    ctx.fillText('いまだ！', x, y - r - 12);
    ctx.globalAlpha = 1;
  }
}

function drawHud() {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 14px ${FONT_BODY}`;
  ctx.fillText('スコア', 22, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = `30px ${FONT}`;
  ctx.fillText(score.toLocaleString(), 22, 34);
  if (combo >= 2) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = `18px ${FONT}`;
    const mult = 1 + Math.min(4, Math.floor(combo / 5)) * 0.5;
    ctx.fillText(`${combo} コンボ${mult > 1 ? `  ×${mult}` : ''}`, 22, 74);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 14px ${FONT_BODY}`;
  ctx.fillText('のこり', W - 22, 16);
  ctx.fillStyle = timeLeft <= 10 ? '#ff7a5c' : '#ffffff';
  ctx.font = `30px ${FONT}`;
  ctx.fillText(Math.ceil(timeLeft), W - 22, 34);
  // 時間のバー
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(W - 182, 76, 160, 6);
  ctx.fillStyle = timeLeft <= 10 ? '#ff7a5c' : '#ffd23f';
  ctx.fillRect(W - 182, 76, 160 * (timeLeft / GAME_TIME), 6);
}

function drawPopups() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const k = p.t / 1.1;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `${p.size}px ${FONT}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(7, 10, 31, 0.8)';
    const y = p.y - k * 24;
    ctx.strokeText(p.text, p.x, y);
    ctx.fillStyle = p.col;
    ctx.fillText(p.text, p.x, y);
  }
  ctx.globalAlpha = 1;
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(7, 10, 31, 0.78)';
  ctx.strokeStyle = '#3a4677';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill(); ctx.stroke();
}

function drawTitle(time) {
  panel(250, 300, 460, 150);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `30px ${FONT}`;
  ctx.fillText('らくばる君の花火大会', W / 2, 336);
  ctx.font = `700 15px ${FONT_BODY}`;
  ctx.fillStyle = '#aab3d6';
  ctx.fillText('玉がスコープに入った瞬間にドン！ 中心ほど高得点', W / 2, 372);
  ctx.fillStyle = '#ff8ac6';
  ctx.fillText('★ 虹色の玉は「らくばる君花火」で大量得点', W / 2, 396);
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
  ctx.fillStyle = '#ffd23f';
  ctx.font = `18px ${FONT}`;
  ctx.fillText('スペースキー／タップでスタート', W / 2, 428);
  ctx.globalAlpha = 1;
}

function drawResult() {
  panel(270, 120, 420, 300);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aab3d6';
  ctx.font = `700 15px ${FONT_BODY}`;
  ctx.fillText('結果', W / 2, 148);
  ctx.fillStyle = '#ffffff';
  ctx.font = `46px ${FONT}`;
  ctx.fillText(score.toLocaleString(), W / 2, 192);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = isNewBest ? '#ffd23f' : '#aab3d6';
  ctx.fillText(isNewBest ? 'ベスト更新！' : `ベスト ${best.toLocaleString()}`, W / 2, 230);

  const rows = [
    ['どんぴしゃ', stats.perfect, '#ffd23f'],
    ['うまい', stats.great, '#7dff9a'],
    ['おしい', stats.good, '#9fd0ff'],
    ['らくばる君花火', stats.raku, '#ff8ac6'],
    ['不発', stats.miss, '#8f9bd0'],
    ['最大コンボ', maxCombo, '#ffffff'],
  ];
  ctx.font = `700 15px ${FONT_BODY}`;
  rows.forEach(([label, v, c], i) => {
    const cx = i % 2 ? 560 : 400, y = 266 + Math.floor(i / 2) * 28;
    ctx.textAlign = 'right'; ctx.fillStyle = '#aab3d6';
    ctx.fillText(label, cx - 4, y);
    ctx.textAlign = 'left'; ctx.fillStyle = c;
    ctx.fillText(String(v), cx + 8, y);
  });

  if (resultTimer > 1) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = `17px ${FONT}`;
    ctx.fillText('スペースキー／タップでもう一回', W / 2, 392);
  }
}

function draw(time) {
  drawFx();
  drawSky(time);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(fx, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  drawShells(time);
  ctx.drawImage(skyline, 0, 0);
  drawWater(time);
  drawKun();
  if (state === 'play') drawScope(time);
  if (state !== 'title') drawHud();
  drawPopups();
  if (state === 'title') drawTitle(time);
  if (state === 'result') drawResult();
}

// ===== 12. ゲームループ =====
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== 13. 操作 =====
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) press();
  } else if (e.code === 'KeyM') {
    toggleMute();
  }
});
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.focus(); press(); });
document.getElementById('fire').addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });

const muteBtn = document.getElementById('mute');
function toggleMute() {
  const m = sfx.toggle();
  muteBtn.textContent = m ? '音：オフ' : '音：オン';
  muteBtn.setAttribute('aria-pressed', String(m));
}
muteBtn.addEventListener('click', toggleMute);
