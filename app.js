// Ten Ten Blackjack: UI, pixel art, sound and the session loop.
// Play chips only: no real money, no purchases, nothing to cash out.
(function () {
'use strict';
const $ = s => document.querySelector(s);
const SESSION_HANDS = TT.HANDS_PER_SESSION;
const DAILY_START = 500, TABLE_MAX = 250, TABLE_MIN = 10, CHIP_VALUES = [10, 50, 100];
const VERSION = '1.3.0';

// ---------- Storage (per device, never required) ----------
const KEY = 'ttbj-v1';
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
const P = load();
P.best = P.best || { win: 0, book: 0 };
P.life = P.life || { dec: 0, ok: 0, tenten: 0, sessions: 0, hands: 0, won: 0 };
P.daily = P.daily || {};
if (P.sound === undefined) P.sound = true;

// ---------- Pixel art ----------
const CW = 25, CH = 35;
const FONT = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], 2: ['XX.', '..X', '.X.', 'X..', 'XXX'], 3: ['XX.', '..X', '.X.', '..X', 'XX.'],
  4: ['X.X', 'X.X', 'XXX', '..X', '..X'], 5: ['XXX', 'X..', 'XX.', '..X', 'XX.'], 6: ['.XX', 'X..', 'XXX', 'X.X', 'XXX'],
  7: ['XXX', '..X', '.X.', '.X.', '.X.'], 8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'], 9: ['XXX', 'X.X', 'XXX', '..X', 'XX.'],
  1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'], 0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], J: ['..X', '..X', '..X', 'X.X', '.X.'],
  Q: ['XXX', 'X.X', 'X.X', 'XX.', '.XX'], K: ['X.X', 'XX.', 'X..', 'XX.', 'X.X'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
};
const PIP5 = {
  H: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'], D: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'],
  S: ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'], C: ['.XXX.', '.XXX.', 'XXXXX', 'XXXXX', '.XXX.'],
};
const PIP7 = {
  H: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  D: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  S: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '...X...', '..XXX..'],
  C: ['..XXX..', '..XXX..', 'XX.X.XX', 'XXXXXXX', 'XX.X.XX', '...X...', '..XXX..'],
};
const CROWN = ['X.X.X.X', 'XXXXXXX', 'XXXXXXX', '.XXXXX.'];
const RED = '#d42a2a', BLK = '#161616', GOLD = '#f2b51e', PAPER = '#f6f1de';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); return [c, x]; }
function bits(x, rows, ox, oy, col, rot, W, H) {
  x.fillStyle = col;
  rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') {
    if (rot) x.fillRect(W - 1 - (ox + i), H - 1 - (oy + y), 1, 1); else x.fillRect(ox + i, oy + y, 1, 1);
  } });
}
// Cards are drawn at 50x70 art pixels (twice the old resolution) and shown at the same size,
// so the pixel look stays but ranks get a clear 5x7 font drawn at 2x.
const CARD_W = 50, CARD_H = 70;
const BIG = {
  A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  2: ['.XXX.', 'X...X', '....X', '...X.', '..X..', '.X...', 'XXXXX'],
  3: ['XXXX.', '....X', '....X', '.XXX.', '....X', '....X', 'XXXX.'],
  4: ['...X.', '..XX.', '.X.X.', 'X..X.', 'XXXXX', '...X.', '...X.'],
  5: ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
  6: ['..XX.', '.X...', 'X....', 'XXXX.', 'X...X', 'X...X', '.XXX.'],
  7: ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
  8: ['.XXX.', 'X...X', 'X...X', '.XXX.', 'X...X', 'X...X', '.XXX.'],
  9: ['.XXX.', 'X...X', 'X...X', '.XXXX', '....X', '...X.', '.XX..'],
  1: ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  0: ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'],
  J: ['..XXX', '...X.', '...X.', '...X.', '...X.', 'X..X.', '.XX..'],
  Q: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
  K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
};
// Draw a bitmap at integer scale; rot draws it rotated 180° about the card centre.
function blit(x, rows, ox, oy, col, sc, rot) {
  sc = sc || 1; x.fillStyle = col;
  rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X') {
    const px = ox + i * sc, py = oy + y * sc;
    if (rot) x.fillRect(CARD_W - px - sc, CARD_H - py - sc, sc, sc); else x.fillRect(px, py, sc, sc);
  } });
}
function cardShape(x, edge, fill) {
  const W = CARD_W, H = CARD_H;
  x.fillStyle = edge; x.fillRect(2, 0, W - 4, H); x.fillRect(1, 1, W - 2, H - 2); x.fillRect(0, 2, W, H - 4);
  x.fillStyle = fill; x.fillRect(3, 2, W - 6, H - 4); x.fillRect(2, 3, W - 4, H - 6);
}
function rankWidth(glyphs, sc) { return glyphs.reduce((w, g) => w + BIG[g][0].length * sc, 0) + (glyphs.length - 1) * sc; }
function drawRank(x, glyphs, ox, oy, col, sc, rot) {
  let gx = ox;
  for (const g of glyphs) {
    blit(x, BIG[g], gx, oy, col, sc, rot);
    if (sc > 1) blit(x, BIG[g], gx + 1, oy, col, sc, rot); // faux bold for the big index
    gx += BIG[g][0].length * sc + sc;
  }
}
const imgCache = {};
function cardSrc(card) {
  const k = card.r + card.s;
  if (imgCache[k]) return imgCache[k];
  const [c, x] = canvas(CARD_W, CARD_H);
  const col = (card.s === 'H' || card.s === 'D') ? RED : BLK;
  cardShape(x, BLK, PAPER);
  const glyphs = card.r === '10' ? ['1', '0'] : [card.r];
  // Top-left: big 2x rank and suit, the bit you read when cards overlap.
  drawRank(x, glyphs, 4, 4, col, 2, false);
  blit(x, PIP7[card.s], 4, 21, col, 1, false);
  // Bottom-right: smaller upright index (upright so a 6 never reads as a 9).
  const sw = rankWidth(glyphs, 1);
  drawRank(x, glyphs, CARD_W - 4 - sw, CARD_H - 11, col, 1, false);
  blit(x, PIP7[card.s], CARD_W - 11, CARD_H - 20, col, 1, false);
  if (card.r === 'J' || card.r === 'Q' || card.r === 'K') {
    x.fillStyle = col; x.fillRect(14, 22, 23, 33); x.fillStyle = '#fff6d2'; x.fillRect(15, 23, 21, 31);
    blit(x, CROWN, 18, 26, GOLD, 2, false);
    x.fillStyle = BLK; x.fillRect(22, 29, 2, 2); x.fillRect(28, 29, 2, 2);
    blit(x, PIP7[card.s], 18, 37, col, 2, false);
  } else if (card.r === 'A') {
    blit(x, PIP7[card.s], 15, 25, col, 3, false);
  } else {
    blit(x, PIP7[card.s], 18, 30, col, 2, false);
  }
  return (imgCache[k] = c.toDataURL());
}
let BACK_SRC = null;
function backSrc() {
  if (BACK_SRC) return BACK_SRC;
  const [c, x] = canvas(CARD_W, CARD_H);
  cardShape(x, BLK, '#9c1d2a');
  x.fillStyle = '#c8303f';
  for (let yy = 6; yy < CARD_H - 6; yy++) for (let xx = 6; xx < CARD_W - 6; xx++) if ((xx + yy) % 6 < 2 || (xx - yy + 600) % 6 < 2) x.fillRect(xx, yy, 1, 1);
  x.fillStyle = GOLD; x.fillRect(4, 4, CARD_W - 8, 2); x.fillRect(4, CARD_H - 6, CARD_W - 8, 2); x.fillRect(4, 4, 2, CARD_H - 8); x.fillRect(CARD_W - 6, 4, 2, CARD_H - 8);
  const g = ['1', '0', '1', '0'], w = rankWidth(g, 1);
  x.fillStyle = '#9c1d2a'; x.fillRect((CARD_W - w) / 2 - 3, 27, w + 6, 13);
  drawRank(x, g, (CARD_W - w) / 2, 30, GOLD, 1, false);
  return (BACK_SRC = c.toDataURL());
}
const chipCache = {};
function chipSrc(v) {
  if (chipCache[v]) return chipCache[v];
  const [c, x] = canvas(16, 16);
  const col = v >= 100 ? '#1a1a1a' : v >= 50 ? '#c4262e' : '#2f62d8';
  const R = ['.....XXXXXX.....', '...XXXXXXXXXX...', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XXXXXXXXXXXXXX.', 'XXXXXXXXXXXXXXXX'];
  const rows = R.concat(Array(4).fill('XXXXXXXXXXXXXXXX'), R.slice().reverse());
  bits(x, rows, 0, 0, '#000');
  const inner = rows.map(r => r.replace(/X/, '.').replace(/X(?=\.*$)/, '.'));
  bits(x, inner.slice(1, 15), 0, 1, col);
  x.fillStyle = '#fff';
  [[7, 1], [8, 1], [7, 14], [8, 14], [1, 7], [1, 8], [14, 7], [14, 8], [3, 3], [12, 3], [3, 12], [12, 12]].forEach(([a, b]) => x.fillRect(a, b, 1, 1));
  // centre inlay ring
  bits(x, ['..XXXX..', '.X....X.', 'X......X', 'X......X', 'X......X', 'X......X', '.X....X.', '..XXXX..'], 4, 4, '#fff');
  bits(x, ['XXXX', 'XXXX', 'XXXX', 'XXXX'], 6, 6, '#ffffff55');
  return (chipCache[v] = c.toDataURL());
}
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const cardEls = new WeakMap();
function cardEl(card, down) {
  let im = cardEls.get(card);
  const src = down ? backSrc() : cardSrc(card);
  if (!im) {
    im = new Image();
    im.draggable = false;
    im.className = 'card' + (card.fresh ? ' deal' : '');
    im.addEventListener('animationend', () => im.classList.remove('deal', 'flip'));
    if (card.fresh) setTimeout(() => im.classList.remove('deal'), 600); // in case animationend never fires
    cardEls.set(card, im);
  }
  if (im._src !== src) {
    if (im._src && !down) { im.classList.remove('flip'); void im.offsetWidth; im.classList.add('flip'); }
    im.src = src; im._src = src;
    im.alt = down ? 'face-down card' : card.r + ' of ' + SUIT_NAME[card.s];
  }
  return im;
}

// ---------- Sound (generated, no files) ----------
let AC = null;
function ac() { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, dur, type, vol, when) {
  if (!P.sound) return; const a = ac(); if (!a) return;
  const t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, when) {
  if (!P.sound) return; const a = ac(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = vol || 0.08;
  s.connect(g); g.connect(a.destination); s.start(a.currentTime + (when || 0));
}
const sfx = {
  click: () => tone(660, 0.04, 'square', 0.03),
  deal: () => noise(0.05, 0.05),
  ok: () => { tone(880, 0.07); tone(1320, 0.1, 'square', 0.05, 0.07); },
  bad: () => { tone(160, 0.18, 'sawtooth', 0.06); tone(120, 0.25, 'sawtooth', 0.06, 0.15); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, 'square', 0.05, i * 0.08)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.12)),
  push: () => tone(440, 0.15, 'triangle', 0.07),
  chip: () => { tone(1800, 0.03, 'square', 0.03); tone(2400, 0.03, 'square', 0.02, 0.03); },
  tenten: () => {
    const seq = [523, 523, 0, 659, 659, 0, 784, 784, 1046, 1046, 1046, 1318, 1568];
    seq.forEach((f, i) => { if (f) tone(f, 0.12, 'square', 0.07, 0.06 + i * 0.1); });
    [0.05, 0.55, 1.05, 1.5].forEach(w => noise(0.3, 0.15, w));
    [1568, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'square', 0.06, 1.6 + i * 0.12));
  },
};

// ---------- Async control flow ----------
let gen = 0, waiter = null;
const ABORT = { abort: true };
function sleep(ms) { const g = gen; return new Promise((res, rej) => setTimeout(() => g === gen ? res() : rej(ABORT), ms)); }
function setControls(btns) {
  const c = $('#controls'); c.innerHTML = '';
  c.className = btns.length ? 'c' + Math.min(5, btns.length) : '';
  for (const b of btns) {
    const e = document.createElement('button');
    e.className = 'btn ' + (b.cls || '');
    if (b.img) { const im = new Image(); im.src = b.img; e.appendChild(im); e.appendChild(document.createTextNode(b.label)); }
    else { e.textContent = b.label; if (b.small) { const s = document.createElement('small'); s.textContent = b.small; e.appendChild(s); } }
    e.disabled = !!b.disabled; e.dataset.id = b.id;
    e.onclick = () => press(b.id);
    c.appendChild(e);
  }
}
function waitFor(btns) {
  const g = gen;
  setControls(btns);
  return new Promise((res, rej) => { waiter = { res: v => (g === gen ? res(v) : rej(ABORT)), btns }; });
}
function press(id) {
  if (!waiter) return;
  const b = waiter.btns.find(x => x.id === id);
  if (!b || b.disabled) return;
  sfx.click();
  const w = waiter; waiter = null; w.res(id);
}
document.addEventListener('keydown', e => {
  if (!waiter || $('#modal').classList.contains('on') || $('#menu').classList.contains('on')) return;
  const map = { h: 'H', s: 'S', d: 'D', p: 'P', ' ': 'next', Enter: 'next', y: 'ins', n: 'noins' };
  const id = map[e.key]; if (id) { e.preventDefault(); press(id === 'next' && waiter.btns[0] ? waiter.btns[0].id : id); }
});

// ---------- Modal ----------
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function modal(html, buttons) {
  const g = gen;
  const ov = $('#modal'), body = $('#modalBody');
  body.innerHTML = html + '<div class="btns"></div>';
  const box = body.querySelector('.btns');
  ov.classList.add('on'); body.scrollTop = 0;
  return new Promise((res, rej) => {
    buttons.forEach(b => {
      const e = document.createElement('button'); e.className = 'btn ' + (b.cls || ''); e.textContent = b.label;
      e.onclick = () => { sfx.click(); ov.classList.remove('on'); g === gen || b.always ? res(b.id) : rej(ABORT); };
      box.appendChild(e);
    });
  });
}

// ---------- Session state ----------
let S = null;   // the session
let R = null;   // the current round
function newStats() { return { won: 0, lost: 0, push: 0, bj: 0, dec: 0, ok: 0, winStreak: 0, bestWin: 0, bookStreak: 0, bestBook: 0, tenten: 0, mistakes: [] }; }
function isDaily() { return S && S.mode === 'daily'; }
function money(n) { return '£' + (Math.round(n * 100) / 100).toLocaleString('en-GB'); }
function dailyLabel(key) { const d = new Date(key + 'T12:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase(); }

function startSession(mode, seed, resume) {
  gen++; waiter = null;
  closeMenu();
  if (resume) {
    S = resume; S.shoe = TT.Shoe.at(S.seed, S.pos);
  } else {
    const key = TT.dailyKey();
    S = { mode, seed: mode === 'daily' ? TT.dailySeed(key) : seed, dailyKey: mode === 'daily' ? key : null,
      handNo: 0, chips: DAILY_START, lastBet: 50, stats: newStats() };
    S.shoe = new TT.Shoe(S.seed);
  }
  R = { dealer: [], hands: [], active: -1, hole: true };
  document.body.classList.toggle('daily', S.mode === 'daily');
  render();
  runSession().catch(e => { if (e !== ABORT) console.error(e); });
}
function persist() {
  if (!S) return;
  P.cur = { mode: S.mode, seed: S.seed, dailyKey: S.dailyKey, handNo: S.handNo, pos: S.shoe.pos, chips: S.chips, lastBet: S.lastBet, stats: S.stats };
  save();
}

async function runSession() {
  while (S.handNo < SESSION_HANDS) {
    if (isDaily() && S.chips < TABLE_MIN) break;
    persist();
    S.roundDone = false;
    await playRound();
    S.handNo++;
    S.roundDone = true;
    P.life.hands++;
    persist();
    render();
    const over = S.handNo >= SESSION_HANDS || (isDaily() && S.chips < TABLE_MIN);
    await waitFor([{ id: 'next', label: over ? 'SEE RESULTS' : 'NEXT HAND', cls: 'dark' }]);
  }
  finishSession();
}

function deal(arr, down) {
  const c = S.shoe.draw(); c.fresh = true; arr.push(c);
  sfx.deal(); render();
  return sleep(down ? 260 : 300);
}

function optsFor(h) {
  const two = h.cards.length === 2;
  const afford = !isDaily() || S.chips >= h.bet;
  return {
    canDouble: two && !h.splitAces && afford,
    canSplit: two && TT.isPair(h.cards) && R.hands.length < TT.MAX_HANDS && !h.splitAces && afford,
  };
}

async function chooseBet() {
  let bet = Math.min(S.lastBet || 50, TABLE_MAX, Math.floor(S.chips / 10) * 10);
  if (bet < TABLE_MIN) bet = TABLE_MIN;
  for (;;) {
    R.pendingBet = bet; render();
    const max = Math.min(TABLE_MAX, S.chips);
    const btns = CHIP_VALUES.map(v => ({ id: 'c' + v, label: '+' + v, cls: 'chip', img: chipSrc(v), disabled: bet + v > max }));
    btns.push({ id: 'clear', label: 'CLEAR', cls: 'dark', disabled: bet === 0 });
    btns.push({ id: 'deal', label: 'DEAL', small: money(bet), cls: 'stand', disabled: bet < TABLE_MIN || bet > max });
    const id = await waitFor(btns);
    if (id === 'deal') { R.pendingBet = 0; return bet; }
    if (id === 'clear') bet = 0; else { bet += +id.slice(1); sfx.chip(); }
  }
}

async function playRound() {
  R = { dealer: [], hands: [], active: -1, hole: true, ins: 0, pendingBet: 0 };
  setControls([]);
  let bet = 0;
  if (isDaily()) { bet = await chooseBet(); S.chips -= bet; S.lastBet = bet; }
  const h = { cards: [], bet, units: 1, split: false };
  R.hands = [h];
  render();
  await deal(h.cards); await deal(R.dealer); await deal(h.cards); await deal(R.dealer, true);
  const up = R.dealer[0];

  // Insurance / even money: the book always says no.
  if (up.r === 'A') {
    const even = TT.isBlackjack(h.cards);
    const cost = bet / 2;
    const canAfford = !isDaily() || S.chips >= cost;
    let ans = await waitFor([
      { id: 'ins', label: even ? 'EVEN MONEY' : 'INSURANCE', cls: 'hit', disabled: !canAfford, small: isDaily() ? money(cost) : '' },
      { id: 'noins', label: even ? 'NO THANKS' : 'NO INSURANCE', cls: 'stand' },
    ]);
    if (ans === 'noins') record(true, 'NO INSURANCE');
    else {
      record(false);
      ans = await correct({ book: 'NO INSURANCE', you: even ? 'EVEN MONEY' : 'INSURANCE', hand: (even ? 'blackjack' : TT.handLabel(h.cards)) + ' vs dealer Ace', why: TT.INSURANCE_WHY }, 'noins', 'ins');
    }
    if (ans === 'ins' && isDaily()) { S.chips -= cost; R.ins = cost; }
  }

  // Dealer peeks with an Ace or ten up.
  if (TT.val(up.r) >= 10) {
    if (TT.isBlackjack(R.dealer)) {
      reveal(); await sleep(400);
      if (R.ins) S.chips += R.ins * 3;
      toast('DEALER BLACKJACK', 'bad');
      await sleep(700);
      settleAll();
      return;
    }
    if (up.r === 'A') { toast('NO DEALER BLACKJACK'); await sleep(700); }
  }

  if (TT.isBlackjack(h.cards)) { reveal(); await sleep(400); settleAll(); return; }

  for (let i = 0; i < R.hands.length; i++) { R.active = i; render(); await playHand(i); }
  R.active = -1;

  reveal(); await sleep(500);
  const live = R.hands.some(x => TT.total(x.cards).t <= 21);
  if (live) while (TT.dealerShouldHit(R.dealer)) await deal(R.dealer);
  await sleep(250);
  const tenten = TT.isTenTenBust(R.dealer);
  if (tenten) await tenTenBust();
  settleAll();
}

function reveal() { if (R.hole) { R.hole = false; if (R.dealer[1]) R.dealer[1].flip = true; sfx.deal(); render(); } }

async function playHand(i) {
  const h = R.hands[i];
  for (;;) {
    if (h.cards.length === 1) { await deal(h.cards); if (h.splitAces) break; }
    const t = TT.total(h.cards).t;
    if (t > 21) { h.bust = true; render(); sfx.lose(); await sleep(450); break; }
    if (t === 21) { await sleep(250); break; }
    const opts = optsFor(h);
    let a = await waitFor([
      { id: 'H', label: 'HIT', cls: 'hit' },
      { id: 'S', label: 'STAND', cls: 'stand' },
      { id: 'D', label: 'DOUBLE', cls: 'dbl', disabled: !opts.canDouble },
      { id: 'P', label: 'SPLIT', cls: 'split', disabled: !opts.canSplit },
    ]);
    const b = TT.book(h.cards, R.dealer[0], opts);
    if (a === b.action) record(true, TT.NAMES[a]);
    else {
      record(false);
      const vs = ' vs dealer ' + TT.upName(R.dealer[0]);
      a = await correct({ book: TT.NAMES[b.action], you: TT.NAMES[a], hand: TT.handLabel(h.cards) + vs, why: b.why }, b.action, a);
    }
    if (a === 'H') { await deal(h.cards); continue; }
    if (a === 'S') break;
    if (a === 'D') {
      if (isDaily()) { S.chips -= h.bet; h.bet *= 2; }
      h.units = 2; h.doubled = true;
      await deal(h.cards);
      if (TT.total(h.cards).t > 21) { h.bust = true; render(); sfx.lose(); await sleep(450); }
      break;
    }
    if (a === 'P') {
      const c2 = h.cards.pop();
      const aces = c2.r === 'A';
      if (isDaily()) S.chips -= h.bet;
      const nh = { cards: [c2], bet: h.bet, units: 1, split: true, splitAces: aces };
      h.split = true; h.splitAces = aces;
      R.hands.splice(i + 1, 0, nh);
      render(); await sleep(200);
      await deal(h.cards);
      if (aces) break;
      continue;
    }
  }
}

function record(ok, what) {
  const st = S.stats;
  st.dec++; P.life.dec++;
  if (ok) {
    st.ok++; P.life.ok++; st.bookStreak++;
    st.bestBook = Math.max(st.bestBook, st.bookStreak);
    if (st.bookStreak > P.best.book) P.best.book = st.bookStreak;
    toast('BOOK ✓ ' + (what || ''), 'ok'); sfx.ok();
  } else {
    st.bookStreak = 0; sfx.bad();
  }
  save(); renderHud();
}

async function correct(info, bookId, yourId) {
  S.stats.mistakes.push(info.hand + ': ' + info.you + ' → ' + info.book);
  const choice = await modal(
    '<h2>NOT THE BOOK PLAY</h2>' +
    '<p class="say">BOOK SAYS: ' + esc(info.book) + '</p>' +
    '<p class="you">YOU CHOSE: ' + esc(info.you) + '<br>' + esc(info.hand.toUpperCase()) + '</p>' +
    '<div class="why">' + esc(info.why) + '</div>' +
    '<p class="fine" style="margin-top:10px">Book streak reset to 0.</p>',
    [{ id: 'keep', label: 'CONTINUE: ' + info.you, cls: 'stand' }]
  );
  return yourId; // your move stands: no take-backs
}

function settleAll() {
  let units = 0, anyBJ = false;
  for (const h of R.hands) {
    const res = TT.settle(h, R.dealer);
    h.res = res;
    if (res === 'bj') anyBJ = true;
    units += TT.payout(res, h.units);
    if (isDaily()) S.chips += h.bet + TT.payout(res, h.bet);
  }
  const st = S.stats;
  if (units > 0) { st.won++; P.life.won++; st.winStreak++; st.bestWin = Math.max(st.bestWin, st.winStreak); if (st.winStreak > P.best.win) P.best.win = st.winStreak; }
  else if (units < 0) { st.lost++; st.winStreak = 0; }
  else st.push++;
  if (anyBJ) st.bj++;
  save();
  render();
  if (units > 0) sfx.win(); else if (units < 0) sfx.lose(); else sfx.push();
}

async function tenTenBust() {
  S.stats.tenten++; P.life.tenten++; save();
  const ov = $('#tenten'), tc = $('#ttCards');
  tc.innerHTML = '';
  R.dealer.slice(-2).forEach(c => tc.appendChild(cardEl({ r: c.r, s: c.s })));
  $('#ttNote').textContent = 'DEALER BUSTS ' + TT.total(R.dealer).t + ' · TAP TO CONTINUE';
  ov.classList.remove('on'); void ov.offsetWidth; ov.classList.add('on');
  document.body.classList.add('shake');
  sfx.tenten();
  const stop = confetti();
  await sleep(1400);
  document.body.classList.remove('shake');
  await new Promise(res => {
    const done = () => { ov.removeEventListener('click', done); res(); };
    ov.addEventListener('click', done);
    setTimeout(done, 6000);
  });
  stop(); ov.classList.remove('on');
}
function confetti() {
  const c = $('#confetti'), W = 120, H = Math.round(120 * innerHeight / innerWidth);
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const cols = ['#ffd23a', '#fff', '#4fc35a', '#4f86ff', '#e2402f', '#000'];
  const bitsArr = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -Math.random() * H, v: 0.4 + Math.random() * 1.2, c: cols[(Math.random() * cols.length) | 0], s: Math.random() < 0.3 ? 2 : 1, w: Math.random() * 6 }));
  let on = true;
  (function step() {
    if (!on) return;
    x.clearRect(0, 0, W, H);
    for (const b of bitsArr) {
      b.y += b.v; b.w += 0.1; if (b.y > H) { b.y = -2; b.x = Math.random() * W; }
      x.fillStyle = b.c; x.fillRect(Math.round(b.x + Math.sin(b.w) * 2), Math.round(b.y), b.s, b.s);
    }
    requestAnimationFrame(step);
  })();
  return () => { on = false; x.clearRect(0, 0, W, H); };
}

let toastT = null;
function toast(msg, cls) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show ' + (cls || '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 900);
}

// ---------- Rendering ----------
function totalText(cards) {
  if (TT.isBlackjack(cards)) return 'BLACKJACK';
  const { t, soft } = TT.total(cards);
  if (t > 21) return t + ' BUST';
  return soft && t < 21 ? (t - 10) + '/' + t : String(t);
}
function baseK() {
  const w = Math.min(innerWidth, 520), h = innerHeight;
  let k = Math.floor(w / 125);
  if (h < 700) k = Math.min(k, 3);
  if (h < 600) k = Math.min(k, 2);
  return Math.max(2, Math.min(4, k));
}
function renderHud() {
  if (!S) return;
  $('#handNo').textContent = Math.min(S.roundDone ? S.handNo : S.handNo + 1, SESSION_HANDS) + '/' + SESSION_HANDS;
  $('#chips').textContent = money(S.chips);
  $('#seed').textContent = S.mode === 'daily' ? 'DAILY' : S.seed;
  $('#winStreak').textContent = S.stats.winStreak;
  $('#bookStreak').textContent = S.stats.bookStreak;
}
function render() {
  renderHud();
  if (!R) return;
  const k = baseK();
  const dz = $('#dealerCards'); dz.style.setProperty('--k', k);
  syncCards(dz, R.dealer.map((c, i) => cardEl(c, i === 1 && R.hole)));
  let dl = 'DEALER';
  if (R.dealer.length) dl += ' <b>' + (R.hole ? TT.total([R.dealer[0]]).t : totalText(R.dealer)) + '</b>';
  setHTML($('#dealerLabel'), dl);

  const hz = $('#hands');
  const n = Math.max(1, R.hands.length);
  const avail = Math.min(innerWidth, 520) - 16;
  const hk = n === 1 ? k : Math.max(1.5, Math.min(k - 1, Math.floor((avail / n) / 40 * 2) / 2));
  hz.style.setProperty('--k', hk);
  let boxes;
  if (!R.hands.length) {
    if (!placeholder) { placeholder = document.createElement('div'); placeholder.className = 'box'; }
    setHTML(placeholder, isDaily() && R.pendingBet
      ? '<div class="empty"></div><div class="bet"><img src="' + chipSrc(R.pendingBet >= 100 ? 100 : R.pendingBet >= 50 ? 50 : 10) + '" alt="">' + money(R.pendingBet) + '</div>'
      : '<div class="empty">' + (isDaily() ? 'PLACE<br><br>YOUR BET' : '') + '</div>');
    boxes = [placeholder];
  } else {
    boxes = R.hands.map((h, i) => boxFor(h, i));
  }
  syncCards(hz, boxes);
  // clear one-shot animation flags
  R.dealer.forEach(c => { c.fresh = false; c.flip = false; });
  R.hands.forEach(h => h.cards.forEach(c => { c.fresh = false; }));
}
// Keep existing elements attached (so running animations aren't restarted) and only add/move what changed.
function syncCards(parent, els) {
  els.forEach((el, i) => { if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null); });
  while (parent.children.length > els.length) parent.lastChild.remove();
}
function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }
let placeholder = null;
const boxEls = new WeakMap();
function boxFor(h, i) {
  let b = boxEls.get(h);
  if (!b) {
    b = { el: document.createElement('div'), cards: document.createElement('div'), lab: document.createElement('div'), bet: document.createElement('div'), res: null };
    b.cards.className = 'cards'; b.lab.className = 'label'; b.bet.className = 'bet';
    b.el.append(b.cards, b.lab);
    boxEls.set(h, b);
  }
  const active = i === R.active;
  if (active && !b.el.classList.contains('active')) b.el.style.animationDelay = -((performance.now() % 2200) / 1000) + 's';
  b.el.className = 'box' + (active ? ' active' : '');
  syncCards(b.cards, h.cards.map(c => cardEl(c)));
  const tt = h.split && TT.isBlackjack(h.cards) ? '21' : totalText(h.cards);
  setHTML(b.lab, h.cards.length ? '<b>' + tt + '</b>' + (h.doubled ? ' x2' : '') : '&nbsp;');
  if (isDaily()) {
    setHTML(b.bet, '<img src="' + chipSrc(h.bet >= 100 ? 100 : h.bet >= 50 ? 50 : 10) + '" alt="">' + money(h.bet));
    if (b.bet.parentNode !== b.el) b.el.insertBefore(b.bet, b.res);
  }
  if ((h.res || h.bust) && !b.res) {
    b.res = document.createElement('div');
    const res = h.res || 'bust';
    b.res.className = 'res ' + res;
    b.res.textContent = { win: 'WIN', lose: h.bust ? 'BUST' : 'LOSE', push: 'PUSH', bj: 'BLACKJACK!', bust: 'BUST' }[res];
    b.el.appendChild(b.res);
  }
  return b.el;
}
addEventListener('resize', () => render());

// ---------- End of session ----------
function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '-'; }
function shareURL(params) { return location.origin + location.pathname + params; }
async function share(text, url) {
  const full = text + '\n' + url;
  try {
    if (navigator.share) { await navigator.share({ text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(full); toast('COPIED!', 'ok'); }
  catch (e) { prompt('Copy this:', full); }
}
function shareText() {
  const st = S.stats;
  if (S.mode === 'daily') {
    return 'Ten Ten Blackjack Daily ' + dailyLabel(S.dailyKey) + ': ' + money(S.chips) + ' from ' + money(DAILY_START) +
      ' · book ' + pct(st.ok, st.dec) + (st.tenten ? ' · ' + st.tenten + '× Ten Ten Bust' : '') + ' (play chips only)';
  }
  return 'Ten Ten Blackjack seed ' + S.seed + ': won ' + st.won + '/' + S.handNo + ', book ' + pct(st.ok, st.dec) +
    ', best book streak ' + st.bestBook + (st.tenten ? ', ' + st.tenten + '× Ten Ten Bust' : '') + '. Same cards, your turn:';
}
async function finishSession() {
  const st = S.stats;
  P.life.sessions++;
  delete P.cur;
  if (S.mode === 'daily' && !P.daily[S.dailyKey]) P.daily[S.dailyKey] = { chips: S.chips, book: pct(st.ok, st.dec), hands: S.handNo };
  save();
  const daily = S.mode === 'daily';
  const broke = daily && S.chips < TABLE_MIN && S.handNo < SESSION_HANDS;
  let html = '<h2>' + (daily ? 'DAILY ' + dailyLabel(S.dailyKey) : 'SESSION COMPLETE') + '</h2>';
  if (daily) html += '<div class="big">' + money(S.chips) + '</div>' + (broke ? '<p>Out of chips after ' + S.handNo + ' hands.</p>' : '');
  html += [
    ['SEED', daily ? 'DAILY' : S.seed], ['HANDS', S.handNo], ['WON / LOST / PUSH', st.won + ' / ' + st.lost + ' / ' + st.push],
    ['BLACKJACKS', st.bj], ['BOOK PLAYS', st.ok + '/' + st.dec + ' (' + pct(st.ok, st.dec) + ')'],
    ['BEST WIN STREAK', st.bestWin], ['BEST BOOK STREAK', st.bestBook], ['TEN TEN BUSTS', st.tenten],
  ].map(([a, b]) => '<div class="stat">' + a + ' <b>' + esc(b) + '</b></div>').join('');
  if (st.mistakes.length) html += '<h3>PLAYS TO REVISE</h3><p class="fine">' + st.mistakes.slice(0, 12).map(esc).join('<br>') + '</p>';
  if (daily) html += '<p class="fine" style="margin-top:8px">Play chips only. No real money, nothing to cash out.</p>';
  setControls([]);
  for (;;) {
    const id = await modal(html, [
      { id: 'share', label: daily ? 'SHARE MY CHIP TOTAL' : 'SHARE THIS SEED', cls: 'dbl', always: true },
      { id: 'again', label: daily ? 'PLAY TODAY AGAIN (PRACTICE)' : 'REPLAY THIS SEED', cls: 'stand', always: true },
      { id: 'menu', label: 'MENU', cls: 'dark', always: true },
    ]);
    if (id === 'share') { await share(shareText(), shareURL(daily ? '?daily' : '?s=' + encodeURIComponent(S.seed))); continue; }
    if (id === 'again') { daily ? startSession('daily') : startSession('main', S.seed); return; }
    openMenu(); return;
  }
}

// ---------- Menu & info screens ----------
function closeMenu() { $('#menu').classList.remove('on'); }
function openMenu(note) {
  const mb = $('#menuBody');
  const key = TT.dailyKey(), dr = P.daily[key];
  const cur = P.cur;
  const inSession = S && R;
  let h = '<div class="logo">TEN TEN<small>BLACKJACK</small></div>' +
    '<div class="tag">LEARN THE BOOK.<br>PLAY THE WHOLE GAME.</div>' + (note ? '<p class="say" style="text-align:center">' + esc(note) + '</p>' : '') + '<div class="btns">';
  if (inSession && S.handNo < SESSION_HANDS) h += '<button class="btn dbl" data-a="back">BACK TO TABLE · HAND ' + (S.handNo + 1) + '</button>';
  else if (cur) h += '<button class="btn dbl" data-a="resume">CONTINUE ' + (cur.mode === 'daily' ? 'DAILY' : 'SEED ' + esc(cur.seed)) + ' · HAND ' + (cur.handNo + 1) + '</button>';
  h += '<button class="btn stand" data-a="new">NEW SESSION · 25 HANDS</button>' +
    '<button class="btn dark" data-a="seed">PLAY A SEED</button>' +
    '<button class="btn hit" data-a="daily">DAILY · ' + dailyLabel(key) + (dr ? '<small>YOUR SCORE ' + money(dr.chips) + ' · BOOK ' + esc(dr.book) + '</small>' : '<small>£500 PLAY CHIPS · £250 TABLE MAX</small>') + '</button>' +
    '<button class="btn split" data-a="chart">BOOK CHART</button>' +
    '<button class="btn dark" data-a="how">HOW IT WORKS</button></div>' +
    '<div class="lifetime">BOOK ACCURACY ' + pct(P.life.ok, P.life.dec) + ' · BEST BOOK STREAK ' + P.best.book + '<br>BEST WIN STREAK ' + P.best.win + ' · TEN TEN BUSTS ' + P.life.tenten + '</div>' +
    '<div class="soundRow"><button class="btn dark" data-a="sound" style="font-size:8px;padding:8px 10px">SOUND ' + (P.sound ? 'ON' : 'OFF') + '</button></div>' +
    '<p class="fine" style="text-align:center;margin:10px 0 0">PLAY CHIPS ONLY. NO REAL MONEY, NO PURCHASES, NOTHING TO WIN OR CASH OUT.<br>v' + VERSION + '</p>';
  mb.innerHTML = h;
  mb.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { sfx.click(); menuAction(b.dataset.a); });
  $('#menu').classList.add('on'); mb.scrollTop = 0;
}
function menuAction(a) {
  ac();
  if (a === 'back') return closeMenu();
  if (a === 'resume') { const cur = P.cur; return startSession(cur.mode, cur.seed, Object.assign({}, cur, { stats: Object.assign(newStats(), cur.stats) })); }
  if (a === 'new') return startSession('main', TT.randomSeed());
  if (a === 'daily') return startSession('daily');
  if (a === 'sound') { P.sound = !P.sound; save(); return openMenu(); }
  if (a === 'seed') return askSeed();
  if (a === 'chart') return showChart();
  if (a === 'how') return showHow();
}
async function askSeed(prefill) {
  closeMenu();
  const id = await modal('<h2>PLAY A SEED</h2><p>Type the seed someone shared with you. Same seed, same cards, in the same order.</p><input id="seedIn" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(prefill || '') + '">',
    [{ id: 'go', label: 'PLAY', cls: 'stand', always: true }, { id: 'x', label: 'BACK', cls: 'dark', always: true }]);
  const v = TT.cleanSeed(($('#seedIn') || {}).value);
  if (id === 'go' && v) startSession('main', v); else openMenu();
}
function chartHTML() {
  const ups = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
  const head = '<tr><th></th>' + ups.map(u => '<th>' + u + '</th>').join('') + '</tr>';
  const row = (label, f) => '<tr><th>' + label + '</th>' + ups.map(u => { const c = f(TT.val(u)); return '<td class="' + c + '">' + (c === 'Ds' ? 'Ds' : c) + '</td>'; }).join('') + '</tr>';
  let h = '<h3>HARD TOTALS</h3><table class="chart">' + head;
  for (let t = 17; t >= 8; t--) h += row(t === 17 ? '17+' : t === 8 ? '5-8' : t, u => TT.hardCode(t, u));
  h += '</table><h3>SOFT TOTALS</h3><table class="chart">' + head;
  for (let x = 9; x >= 2; x--) h += row('A,' + x, u => TT.softCode(11 + x, u));
  h += '</table><h3>PAIRS</h3><table class="chart">' + head;
  for (const p of ['A', '10', '9', '8', '7', '6', '5', '4', '3', '2']) h += row(p + ',' + p, u => TT.pairCode(TT.val(p), u));
  return h + '</table>';
}
async function showChart() {
  closeMenu();
  await modal('<h2>THE BOOK</h2><p class="fine">Basic strategy for this table: 6 decks, dealer stands on all 17s, double after split allowed, no surrender. Your hand down the side, dealer\'s up card across the top.</p>' +
    '<div class="legend"><span class="H" style="background:#e2402f;color:#fff">H HIT</span><span style="background:#ffd23a;color:#000">S STAND</span><span style="background:#4fc35a;color:#000">D DOUBLE (ELSE HIT)</span><span style="background:#8ee08e;color:#000">Ds DOUBLE (ELSE STAND)</span><span style="background:#4f86ff;color:#fff">P SPLIT</span></div>' +
    chartHTML() + '<p class="fine">Insurance and even money: never.</p>', [{ id: 'x', label: 'BACK', cls: 'dark', always: true }]);
  openMenu();
}
async function showHow() {
  closeMenu();
  await modal('<h2>HOW IT WORKS</h2>' +
    '<p>Every session is 25 hands from one shuffled shoe. The shoe comes from the session\'s seed, so anyone who plays the same seed gets the same cards in the same order. Share yours from the results screen.</p>' +
    '<p>Each time you act, your play is checked against the book (basic strategy). Get it right and your BOOK STREAK grows. Get it wrong and you\'ll see what the book says and why, then your move is played: no take-backs.</p>' +
    '<p>Win a hand and your WIN STREAK grows. A push keeps it going; a loss resets it.</p>' +
    '<h3>TEN TEN BUST</h3><p>If the dealer busts and the last two cards they drew are both tens or picture cards, it\'s a TEN TEN BUST.</p>' +
    '<h3>DAILY</h3><p>One shared shoe for everyone each day (by UTC date), with £500 in play chips and a £250 table maximum (£10 minimum). Share your chip total at the end. Your first finish of the day is your score.</p>' +
    '<h3>TABLE RULES</h3><p>6 decks. Dealer stands on all 17s and peeks for blackjack. Blackjack pays 3 to 2. Double on any first two cards, including after a split. Split up to 4 hands; split Aces get one card each and can\'t be resplit. No surrender. Insurance pays 2 to 1.</p>' +
    '<h3>NO REAL MONEY</h3><p>Chips are pretend. There is nothing to buy, nothing to win and nothing to cash out. Everything runs on your phone, works offline once installed, and nothing is sent anywhere.</p>' +
    '<p class="fine">Install: in Safari tap Share, then Add to Home Screen.</p>',
    [{ id: 'x', label: 'BACK', cls: 'dark', always: true }]);
  openMenu();
}
$('#menuBtn').onclick = () => { sfx.click(); openMenu(); };

// ---------- Boot ----------
(function boot() {
  const q = new URLSearchParams(location.search);
  const sharedSeed = TT.cleanSeed(q.get('s'));
  const wantDaily = q.has('daily');
  if (q.toString()) history.replaceState(null, '', location.pathname);
  R = { dealer: [], hands: [], active: -1, hole: true };
  S = null;
  if (sharedSeed) { openMenu(); askSeed(sharedSeed); return; }
  openMenu(wantDaily ? 'TODAY\'S DAILY IS WAITING' : '');
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
