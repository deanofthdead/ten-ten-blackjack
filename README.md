# Ten Ten Blackjack

A retro pixel blackjack trainer for iPhone that lets you play the whole game. Every decision is checked against the book (basic strategy); get one wrong and it tells you the right play and why, then your move stands.

**Play chips only.** There is no real money anywhere: nothing to buy, nothing to win, nothing to cash out.

## Play
- Live: https://deanofthdead.github.io/ten-ten-blackjack/
- On iPhone: open it in Safari, tap Share, then **Add to Home Screen**. Open it once from the home screen while online and it works fully offline after that.

## How it works
- **Sessions** are 25 hands from one seeded 6-deck shoe. Same seed, same cards in the same order. Share a seed with a link like `…/ten-ten-blackjack/?s=K7Q2XB`.
- **Book streak** counts consecutive book-correct decisions (hit, stand, double, split, and turning down insurance). **Win streak** counts hands won in a row; a push keeps it alive.
- **Main mode** has no betting at all, only decisions.
- **Soft Practice** and **Split Practice** are 25-hand sessions (no betting) where your first two cards are always an Ace plus 2 to 9, or always a pair. The dealer and every later card come from the normal shoe. Share links add `&m=soft` or `&m=split`.
- **Daily** gives everyone the same shoe for the day (seeded from the UTC date, computed on the phone), with £500 of play chips, a £10 minimum and £250 table maximum. Share your chip total at the end; your first finish of the day is your score. Link: `…/?daily`.
- **Ten Ten Bust**: when the dealer busts and their last two cards are both tens or picture cards, the game makes a big deal of it.

## Table rules
6 decks, dealer stands on all 17s, dealer peeks for blackjack, blackjack pays 3:2, double on any first two cards, double after split, split to 4 hands, split Aces get one card each (no resplitting Aces), no surrender, insurance pays 2:1. The book chart in the app is generated from the same strategy code the game checks you against.

## Files
- `engine.js`: rules, seeded shoe, basic strategy and explanations (no DOM; also runs in Node).
- `app.js`: table, pixel art (drawn in code), sound (generated), sessions, Daily.
- `index.html`: layout and styles. `sw.js`: offline cache. `manifest.webmanifest` + icons: home-screen install.
- `tests/engine.test.js`: run `node tests/engine.test.js` (checks the full strategy chart, seeding and settlement).

## Hosting
GitHub Pages from `main`, root folder. Bump `CACHE` in `sw.js`, `VERSION` in `app.js` and the `?v=` on the script tags in `index.html` when releasing so installed copies pick up the update.
