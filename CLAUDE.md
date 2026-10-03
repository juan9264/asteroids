# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids clone. Pure HTML5 Canvas + vanilla JS (ES6+). No dependencies, no bundler, no package.json, no tests, no linter. UI text and comments are in Spanish; keep that.

## Run

Open `index.html` in browser, or serve locally: `npx serve .` (http://localhost:3000). No build step.

## Architecture

All logic in single `game.js`, loaded by `index.html` via plain `<script>`. Canvas fixed 800x600 (`W`, `H` constants hardcoded in `game.js`, matching `<canvas>` attrs in `index.html` — change both together).

Structure of `game.js` (top to bottom, marked by `// ──` section headers):
- Input: `keys` (held) and `justPressed` (edge-triggered). Read edge via `pressed(code)`, which consumes the flag. Use for Space (shoot/restart).
- Entity classes (`Bullet`, `Asteroid`, `Ship`, `Particle`): each has `update(dt)`, `draw()`, `dead` flag. Dead entities are filtered out of arrays after update, not removed inline.
- Global mutable state (`ship`, `bullets`, `asteroids`, `particles`, `score`, `lives`, `level`, `state`, `deadTimer`) reset by `initGame()`.
- `state` machine: `'playing'` | `'dead'` (2s respawn timer, ship hidden) | `'gameover'` (Space restarts). `update()` early-returns per state.
- `loop()`: `requestAnimationFrame`, dt in seconds, clamped to 0.05 max.

Gotchas:
- World is toroidal: positions use `wrap()`. Particles do not wrap.
- Asteroid size is 1/2/3 and indexes `RADII`, `SPEEDS`, `POINTS` arrays (index 0 unused). Smaller size = more points. `split()` yields two of `size - 1`.
- Collision is circle-based via `dist()`. Ship vs asteroid uses `ship.radius + a.radius * 0.82`. Ship invincibility (`invincible` seconds) skips ship collision and drives blink in `Ship.draw()`.
- Level progression: `nextLevel()` spawns `3 + level` asteroids, away from center (`SAFE_DIST`).
- README mentions power-ups and "estrella fugaz" asteroid; these are not implemented in current `game.js`.
