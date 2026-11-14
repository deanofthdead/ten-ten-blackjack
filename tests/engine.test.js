// Run: node tests/engine.test.js
const assert = require('assert');
const TT = require('../engine.js');
const c = (r, s = 'S') => ({ r, s });
const H = (...rs) => rs.map(r => c(r));
let n = 0;
function t(name, fn) { fn(); n++; }

t('same seed gives same card order', () => {
  const a = new TT.Shoe('ABC123'), b = new TT.Shoe('ABC123'), d = new TT.Shoe('ABC124');
  const sa = [], sb = [], sd = [];
  for (let i = 0; i < 100; i++) { sa.push(JSON.stringify(a.draw())); sb.push(JSON.stringify(b.draw())); sd.push(JSON.stringify(d.draw())); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sd);
});
t('shoe has 312 cards, 24 of each rank', () => {
  const s = new TT.Shoe('X'); const cnt = {};
  for (const k of s.cards) cnt[k.r] = (cnt[k.r] || 0) + 1;
  assert.strictEqual(s.cards.length, 312);
  for (const r of TT.RANKS) assert.strictEqual(cnt[r], 24);
});
t('resume at position', () => {
  const a = new TT.Shoe('R'); for (let i = 0; i < 37; i++) a.draw();
  const b = TT.Shoe.at('R', 37);
  assert.deepStrictEqual(a.draw(), b.draw());
});
t('totals', () => {
  assert.deepStrictEqual(TT.total(H('A', '6')), { t: 17, soft: true });
  assert.deepStrictEqual(TT.total(H('A', '6', '10')), { t: 17, soft: false });
  assert.deepStrictEqual(TT.total(H('A', 'A', '9')), { t: 21, soft: true });
  assert.strictEqual(TT.isBlackjack(H('A', 'K')), true);
});
t('dealer stands on soft 17', () => {
  assert.strictEqual(TT.dealerShouldHit(H('A', '6')), false);
  assert.strictEqual(TT.dealerShouldHit(H('10', '6')), true);
});
t('ten ten bust', () => {
  assert.strictEqual(TT.isTenTenBust(H('2', 'K', 'Q')), true);
  assert.strictEqual(TT.isTenTenBust(H('6', '10', '10')), true);
  assert.strictEqual(TT.isTenTenBust(H('10', '6', '9')), false);
  assert.strictEqual(TT.isTenTenBust(H('5', '2', 'J', 'K')), true);
  assert.strictEqual(TT.isTenTenBust(H('10', '10')), false);
});

// Full chart check against the published 4-8 deck, S17, DAS, no-surrender basic strategy.
const UP = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const HARD = {
  8: 'HHHHHHHHHH', 9: 'HDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDH', 12: 'HHSSSHHHHH',
  13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHHH', 16: 'SSSSSHHHHH', 17: 'SSSSSSSSSS',
};
const SOFT = { // A + x, code where Ds marked as 'd'
  2: 'HHHDDHHHHH', 3: 'HHHDDHHHHH', 4: 'HHDDDHHHHH', 5: 'HHDDDHHHHH', 6: 'HDDDDHHHHH',
  7: 'SddddSSHHH', 8: 'SSSSSSSSSS', 9: 'SSSSSSSSSS',
};
const PAIRS = {
  A: 'PPPPPPPPPP', 10: 'SSSSSSSSSS', 9: 'PPPPPSPPSS', 8: 'PPPPPPPPPP', 7: 'PPPPPPHHHH',
  6: 'PPPPPHHHHH', 5: 'DDDDDDDDHH', 4: 'HHHPPHHHHH', 3: 'PPPPPPHHHH', 2: 'PPPPPPHHHH',
};
const all = { canDouble: true, canSplit: true };
t('hard chart', () => {
  const hands = { 8: ['5', '3'], 9: ['5', '4'], 10: ['6', '4'], 11: ['7', '4'], 12: ['10', '2'], 13: ['10', '3'], 14: ['10', '4'], 15: ['10', '5'], 16: ['10', '6'], 17: ['10', '7'] };
  for (const [tot, row] of Object.entries(HARD)) UP.forEach((u, i) => {
    const b = TT.book(H(...hands[tot]), c(u), all);
    assert.strictEqual(b.code, row[i], `hard ${tot} v ${u}: got ${b.code}`);
    assert.ok(b.why.length > 20);
  });
});
t('soft chart', () => {
  for (const [x, row] of Object.entries(SOFT)) UP.forEach((u, i) => {
    const b = TT.book(H('A', x), c(u), all);
    const want = row[i] === 'd' ? 'Ds' : row[i];
    assert.strictEqual(b.code, want, `A,${x} v ${u}: got ${b.code}`);
  });
});
t('pair chart', () => {
  for (const [p, row] of Object.entries(PAIRS)) UP.forEach((u, i) => {
    const b = TT.book(H(p, p), c(u), all);
    assert.strictEqual(b.code, row[i], `${p},${p} v ${u}: got ${b.code}`);
  });
});
t('fallbacks when doubling is not allowed', () => {
  assert.strictEqual(TT.book(H('7', '4'), c('6'), { canDouble: false, canSplit: false }).action, 'H');
  assert.strictEqual(TT.book(H('A', '7'), c('5'), { canDouble: false, canSplit: false }).action, 'S');
  assert.strictEqual(TT.book(H('A', '7'), c('5'), all).action, 'D');
  assert.strictEqual(TT.book(H('3', '2', '6'), c('5'), all).code, 'D');
  // 8,8 with no split available plays as hard 16
  assert.strictEqual(TT.book(H('8', '8'), c('10'), { canDouble: true, canSplit: false }).action, 'H');
});
t('settle and payout', () => {
  const D = (...r) => H(...r);
  assert.strictEqual(TT.settle({ cards: H('A', 'K') }, D('10', '9')), 'bj');
  assert.strictEqual(TT.settle({ cards: H('A', 'K'), split: true }, D('10', '9')), 'win');
  assert.strictEqual(TT.settle({ cards: H('10', '9') }, D('10', '6', '9')), 'win');
  assert.strictEqual(TT.settle({ cards: H('10', '6', '9') }, D('10', '6', '9')), 'lose');
  assert.strictEqual(TT.settle({ cards: H('10', '8') }, D('10', '8')), 'push');
  assert.strictEqual(TT.payout('bj', 10), 15);
});
t('daily seed is date based', () => {
  assert.strictEqual(TT.dailySeed(TT.dailyKey(new Date('2026-11-14T23:00:00Z'))), 'DAILY-2026-11-14');
});
console.log(`ok ${n} tests`);
