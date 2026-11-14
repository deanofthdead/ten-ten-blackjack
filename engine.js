// Ten Ten Blackjack: pure game logic (no DOM). Loaded by the page and by the Node tests.
// House rules: 6 decks, dealer stands on all 17s, dealer peeks for blackjack, blackjack pays 3:2,
// double on any first two cards, double after split, split to 4 hands, split Aces get one card each,
// no resplitting Aces, no surrender, insurance offered (and the book says never take it).
(function (root) {
  'use strict';

  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['S', 'H', 'D', 'C'];
  const DECKS = 6;
  const HANDS_PER_SESSION = 25;
  const MAX_HANDS = 4;

  // ---- Seeded randomness -------------------------------------------------
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function rngFor(seed) { const s = cyrb128('ttbj:' + seed); return sfc32(s[0], s[1], s[2], s[3]); }

  const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  function randomSeed() {
    let s = '';
    const buf = new Uint32Array(6);
    (root.crypto || globalThis.crypto).getRandomValues(buf);
    for (let i = 0; i < 6; i++) s += SEED_CHARS[buf[i] % SEED_CHARS.length];
    return s;
  }
  function cleanSeed(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24); }
  // Daily seed: from the UTC date, so everyone gets the same cards on the same day, offline too.
  function dailyKey(d) { d = d || new Date(); return d.toISOString().slice(0, 10); }
  function dailySeed(key) { return 'DAILY-' + key; }

  // ---- Shoe ----------------------------------------------------------------
  function Shoe(seed) {
    this.seed = seed;
    this.rng = rngFor(seed);
    this.cards = [];
    this.pos = 0;
    this.shuffle();
  }
  Shoe.prototype.shuffle = function () {
    const c = [];
    for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) c.push({ r, s });
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const t = c[i]; c[i] = c[j]; c[j] = t; }
    this.cards = c; this.pos = 0;
  };
  Shoe.prototype.draw = function () {
    if (this.pos >= this.cards.length) this.shuffle(); // never happens in 25 hands, but stays deterministic
    const c = this.cards[this.pos++];
    return { r: c.r, s: c.s };
  };
  // Rebuild a shoe at a saved position (resume a session).
  Shoe.at = function (seed, pos) { const sh = new Shoe(seed); while (sh.pos < pos) sh.draw(); return sh; };

  // ---- Hand maths ----------------------------------------------------------
  function val(r) { return r === 'A' ? 11 : (r === '10' || r === 'J' || r === 'Q' || r === 'K') ? 10 : +r; }
  function isTen(c) { return val(c.r) === 10; }
  function total(cards) {
    let t = 0, a = 0;
    for (const c of cards) { t += val(c.r); if (c.r === 'A') a++; }
    while (t > 21 && a) { t -= 10; a--; }
    return { t, soft: a > 0 };
  }
  function isBlackjack(cards) { return cards.length === 2 && total(cards).t === 21; }
  function upName(c) { const v = val(c.r); return v === 11 ? 'Ace' : String(v); }

  // Dealer stands on all 17s (including soft 17).
  function dealerShouldHit(cards) { return total(cards).t < 17; }

  // Dealer busts and the last two cards were both ten-value: TEN TEN BUST.
  function isTenTenBust(cards) {
    if (cards.length < 3 || total(cards).t <= 21) return false;
    return isTen(cards[cards.length - 1]) && isTen(cards[cards.length - 2]);
  }

  // ---- The book (basic strategy for these rules) -------------------------
  // Returns the raw chart code: H, S, D (double else hit), Ds (double else stand), P (split).
  function pairCode(p, u) {
    switch (p) {
      case 11: return 'P';
      case 10: return 'S';
      case 9: return (u <= 9 && u !== 7) ? 'P' : 'S';
      case 8: return 'P';
      case 7: return u <= 7 ? 'P' : 'H';
      case 6: return u <= 6 ? 'P' : 'H';
      case 5: return u <= 9 ? 'D' : 'H';
      case 4: return (u === 5 || u === 6) ? 'P' : 'H';
      default: return u <= 7 ? 'P' : 'H'; // 2s and 3s
    }
  }
  function softCode(t, u) {
    if (t >= 19) return 'S';
    if (t === 18) return (u >= 3 && u <= 6) ? 'Ds' : (u >= 9 ? 'H' : 'S');
    if (t === 17) return (u >= 3 && u <= 6) ? 'D' : 'H';
    if (t >= 15) return (u >= 4 && u <= 6) ? 'D' : 'H';
    if (t >= 13) return (u >= 5 && u <= 6) ? 'D' : 'H';
    return 'H'; // soft 12 (A,A you can't split)
  }
  function hardCode(t, u) {
    if (t >= 17) return 'S';
    if (t >= 13) return u <= 6 ? 'S' : 'H';
    if (t === 12) return (u >= 4 && u <= 6) ? 'S' : 'H';
    if (t === 11) return u <= 10 ? 'D' : 'H';
    if (t === 10) return u <= 9 ? 'D' : 'H';
    if (t === 9) return (u >= 3 && u <= 6) ? 'D' : 'H';
    return 'H';
  }
  function isPair(cards) { return cards.length === 2 && val(cards[0].r) === val(cards[1].r); }

  const NAMES = { H: 'HIT', S: 'STAND', D: 'DOUBLE', P: 'SPLIT', I: 'TAKE INSURANCE', N: 'NO INSURANCE' };

  // opts: { canDouble, canSplit }
  function book(cards, up, opts) {
    const u = val(up.r);
    const { t, soft } = total(cards);
    let code, kind;
    if (isPair(cards) && opts.canSplit) {
      code = pairCode(val(cards[0].r), u); kind = 'pair';
    } else if (soft) {
      code = softCode(t, u); kind = 'soft';
    } else {
      code = hardCode(t, u); kind = 'hard';
    }
    let action = code, fallback = false;
    if (code === 'D' && !opts.canDouble) { action = 'H'; fallback = true; }
    if (code === 'Ds') { action = opts.canDouble ? 'D' : 'S'; fallback = !opts.canDouble; }
    return { action, code, kind, t, soft, u, fallback, why: explain(cards, up, kind, code, action, fallback) };
  }

  function handLabel(cards) {
    const { t, soft } = total(cards);
    if (isPair(cards)) return 'a pair of ' + (cards[0].r === 'A' ? 'Aces' : val(cards[0].r) === 10 ? 'tens' : cards[0].r + 's');
    return (soft ? 'soft ' : 'hard ') + t;
  }

  function explain(cards, up, kind, code, action, fallback) {
    const u = val(up.r), U = upName(up);
    const { t } = total(cards);
    const weak = u >= 2 && u <= 6;
    let w = '';
    if (kind === 'pair') {
      const p = val(cards[0].r);
      if (p === 11) w = 'Always split Aces. Two hands that each start on 11 are far stronger than one soft 12.';
      else if (p === 10) w = 'Never split tens. 20 wins most of the time; breaking it up throws away a near-certain winner.';
      else if (p === 8) w = 'Always split 8s. 16 is the worst total in blackjack; two hands starting on 8 lose much less, even against a strong card.';
      else if (p === 9) w = code === 'P'
        ? 'Against a ' + U + ', two hands starting on 9 are worth more than one 18, which only pushes or loses to the totals a ' + U + ' tends to make.'
        : (u === 7 ? 'A dealer 7 most often ends on 17, so your 18 is already a winner. Keep it.' : 'Against a ' + U + ' two 9s just make two shaky hands. Standing on 18 is the lesser evil.');
      else if (p === 7) w = code === 'P'
        ? '14 is a poor total. Against a ' + U + ', two hands starting on 7 win more than one 14.'
        : 'Against an ' + U + ' or higher the dealer is strong; splitting 7s just doubles your risk. Play it as hard 14 and hit.';
      else if (p === 6) w = code === 'P'
        ? 'The dealer is likely to bust with a ' + U + ' showing, so split and get more money on the table while they are weak.'
        : 'Against a ' + U + ' two hands starting on 6 are both weak. Play it as hard 12 and hit.';
      else if (p === 5) w = 'Never split 5s. Two 5s are a hard 10, one of the best doubling hands. Play it as 10.';
      else if (p === 4) w = code === 'P'
        ? 'Only against a 5 or 6, the dealer\'s weakest cards, are two 4s (with double after split) worth more than a hard 8.'
        : 'Hard 8 can\'t bust, so just hit. Splitting 4s makes two weak hands.';
      else w = code === 'P'
        ? 'Small pairs split well against a 2 to 7: neither hand can bust on its next card, and you can double after splitting.'
        : 'Against an ' + U + ' or higher the dealer is too strong to put more money out. Just hit.';
      if (p === 5) { /* handled with hard 10 rules below */ }
    } else if (kind === 'soft') {
      if (t >= 19) w = 'Soft ' + t + ' is a strong hand. Stand.';
      else if (t === 18) {
        if (code === 'Ds') w = 'Soft 18 is good, but the dealer\'s ' + U + ' is weak, so doubling wins the most.' + (fallback ? ' You can\'t double now, so the next best play is to stand.' : '');
        else if (code === 'S') w = 'Against a ' + U + ' your 18 wins or pushes against the totals the dealer usually makes. Stand.';
        else w = 'Against a ' + U + ' the dealer often makes 19 to 21, so soft 18 is an underdog. One more card can\'t bust you, so try to improve.';
      } else if (code === 'D') w = 'A soft ' + t + ' can\'t bust on one card, and the dealer\'s ' + U + ' is weak. Double to get more money in while you\'re the favourite.';
      else w = 'A soft ' + t + ' can\'t bust on the next card and is too weak to stand on. Hit.' + (fallback ? ' (The book would double here, but you can\'t double now.)' : '');
    } else {
      if (t >= 17) w = 'Hard ' + t + ' is a made hand. Hitting busts too often to be worth it.';
      else if (t >= 13) w = weak
        ? 'The dealer must hit with a ' + U + ' showing and will bust often. Don\'t risk busting yourself: stand and let them.'
        : 'A dealer ' + U + ' usually makes 17 or more, so ' + t + ' loses if you stand. Hitting is the less bad option.';
      else if (t === 12) w = code === 'S'
        ? 'The dealer busts often with a ' + U + '. Hitting 12 busts on any ten, so let the dealer take the risk.'
        : (u <= 3 ? 'Against a ' + U + ' the dealer doesn\'t bust often enough. Only a ten busts you, so hit.' : 'A dealer ' + U + ' will usually make 17 or more, so 12 loses if you stand. Hit.');
      else if (t === 11) w = code === 'D' && action === 'D'
        ? '11 is the best doubling hand: any ten gives you 21. Double against a ' + U + '.'
        : (u === 11 ? 'Against an Ace (dealer stands on 17, 6 decks) hitting 11 is slightly better than doubling.' : 'The book doubles 11, but you can\'t double now, so hit: you can\'t bust.');
      else if (t === 10) w = code === 'D'
        ? (action === 'D' ? '10 is a great doubling hand: any ten gives 20. You\'re the favourite against a ' + U + ', so double.' : 'The book doubles 10, but you can\'t double now, so hit: you can\'t bust.')
        : 'Against a ' + U + ' the dealer is too strong to double 10 into. Just hit.';
      else if (t === 9) w = code === 'D'
        ? (action === 'D' ? 'Against a weak ' + U + ', doubling 9 earns more: you\'ll often make a good hand and the dealer will often bust.' : 'The book doubles 9 here, but you can\'t double now, so hit.')
        : (u === 2 ? 'A dealer 2 isn\'t weak enough to double 9 into. Just hit.' : 'Against a ' + U + ' the dealer is strong. Hit to improve; you can\'t bust.');
      else w = 'You can\'t bust with one more card, and ' + t + ' is far too low to win by standing. Hit.';
    }
    return w;
  }

  const INSURANCE_WHY = 'Never take insurance. It\'s a side bet that the dealer\'s hole card is a ten. Only 4 in 13 cards are tens, but it pays just 2 to 1, so it loses money over time. Even money on a blackjack is the same bet in disguise.';

  // ---- Practice modes ------------------------------------------------------
  // The player's first two cards in Soft / Split practice. Drawn from their own seeded stream
  // per hand (so they never disturb the shoe), everything after them comes from the shoe.
  const PRACTICE = { soft: 'SOFT PRACTICE', split: 'SPLIT PRACTICE' };
  function practiceCards(seed, mode, handNo) {
    const rng = rngFor(seed + ':' + mode + ':' + handNo);
    const pick = a => a[Math.floor(rng() * a.length)];
    const suit = () => pick(SUITS);
    if (mode === 'soft') {
      // Ace plus 2-9: every soft total from 13 to 20 (Ace-ten would just be blackjack).
      const other = pick(['2', '3', '4', '5', '6', '7', '8', '9']);
      const cards = [{ r: 'A', s: suit() }, { r: other, s: suit() }];
      return rng() < 0.5 ? cards : cards.reverse();
    }
    if (mode === 'split') {
      // Weight ranks by value so tens (10, J, Q, K) come up as often as any other pair.
      const v = pick(['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T']);
      const r = v === 'T' ? pick(['10', 'J', 'Q', 'K']) : v;
      const r2 = v === 'T' && rng() < 0.4 ? pick(['10', 'J', 'Q', 'K']) : r;
      return [{ r, s: suit() }, { r: r2, s: suit() }];
    }
    return null;
  }

  // ---- Settlement ----------------------------------------------------------
  // Returns 'bj' | 'win' | 'push' | 'lose' for one player hand against the dealer's final hand.
  function settle(hand, dealerCards) {
    const p = total(hand.cards).t;
    if (p > 21) return 'lose';
    const pbj = !hand.split && isBlackjack(hand.cards);
    const dbj = isBlackjack(dealerCards);
    if (pbj && dbj) return 'push';
    if (pbj) return 'bj';
    if (dbj) return 'lose';
    const d = total(dealerCards).t;
    if (d > 21) return 'win';
    if (p > d) return 'win';
    if (p < d) return 'lose';
    return 'push';
  }
  // Net chip change for a hand with this stake.
  function payout(result, stake) {
    return result === 'bj' ? stake * 1.5 : result === 'win' ? stake : result === 'lose' ? -stake : 0;
  }

  const api = {
    RANKS, SUITS, DECKS, HANDS_PER_SESSION, MAX_HANDS, NAMES, INSURANCE_WHY,
    rngFor, randomSeed, cleanSeed, dailyKey, dailySeed, Shoe,
    val, isTen, total, isBlackjack, upName, dealerShouldHit, isTenTenBust,
    pairCode, softCode, hardCode, isPair, book, handLabel, settle, payout, PRACTICE, practiceCards,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TT = api;
})(typeof self !== 'undefined' ? self : this);
