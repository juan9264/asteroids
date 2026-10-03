'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Power-ups (disparo triple, asteroides lentos) ─────────────────────────────
const TRIPLE_DURATION = 10;       // segundos de disparo triple
const TRIPLE_SPREAD   = 0.26;     // rad entre balas del abanico (~15°)
const SLOW_DURATION   = 6;        // segundos de asteroides lentos
const SLOW_FACTOR     = 0.5;      // multiplicador de velocidad de asteroides
const SLOW_MIN_LEVEL  = 3;        // el power-up lento aparece desde este nivel
const HYPER_DURATION  = 8;        // segundos de hiperpropulsión
const HYPER_THRUST_MULT = 2.5;    // multiplica aceleración y velocidad máxima
const HYPER_MIN_LEVEL = 2;        // la hiperpropulsión puede aparecer desde este nivel
const HYPER_CHANCE    = 0.5;      // probabilidad de que un nivel la incluya
const SHIELD_DURATION = 5;        // segundos de escudo (o hasta absorber un golpe)
const SHIELD_RADIUS   = 20;       // radio del círculo de energía
const SHIELD_GRACE    = 1;        // segundos de invulnerabilidad tras absorber un golpe
const SHIELD_CHANCE   = 0.5;      // probabilidad de que un nivel lo incluya
const NOVA_MIN_LEVEL  = 2;      // la Bomba Nova puede aparecer desde este nivel
const NOVA_CHANCE     = 0.3;      // probabilidad de que un nivel la incluya (escasa)
const NOVA_FLASH      = 0.4;      // segundos del destello al detonar
const ASTEROIDS_PER_BIG = 7;      // grande + 2 medianos + 4 pequeños
const POWERUP_MIN_FRAC  = 0.15;   // el drop ocurre entre el 15% y el 60%
const POWERUP_MAX_FRAC  = 0.60;   // de los asteroides destruidos del nivel

const POWERUP_TYPES = {
  triple: { label: '3', color: '#4af' },
  slow:   { label: 'S', color: '#fa4' },
  nova:   { label: 'N', color: '#f6f' },
  hyper:  { label: 'H', color: '#4f8' },
  shield: { label: 'E', color: '#0ff' },
};

class PowerUp {
  constructor(x, y, type) {
    this.type = type;
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    this.vx = Math.cos(angle) * 20;
    this.vy = Math.sin(angle) * 20;
    this.radius = 11;
    this.ttl  = 8;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo rápido en los últimos 2 segundos
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const { label, color } = POWERUP_TYPES[this.type];
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, this.x, this.y + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Vértices normalizados (radio 1) del asteroide grande con muesca
const BIG_SHAPE = [
  [-0.11, -0.98], [0.44, -0.82], [0.33, -0.22], [0.89, -0.05], [0.73, 0.56],
  [0.24, 0.54], [0.01, 0.94], [-0.68, 0.61], [-1.00, 0.03], [-0.85, -0.58],
];
const BIG_SHAPE_CHANCE = 0.5;     // probabilidad en asteroides grandes

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    this.verts = [];
    if (size === 3 && Math.random() < BIG_SHAPE_CHANCE) {
      // Forma fija (con muesca) tomada de la imagen de referencia
      for (const [vx, vy] of BIG_SHAPE)
        this.verts.push([vx * this.radius, vy * this.radius]);
    } else {
      // Polígono irregular
      const n = randInt(8, 13);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() {
    this.tripleTimer = 0;   // segundos restantes de disparo triple
    this.hasNova = false;   // Bomba Nova guardada (un solo uso)
    this.hyperTimer = 0;    // segundos restantes de hiperpropulsión
    this.shieldTimer = 0;   // segundos restantes de escudo
    this.reset();
  }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleTimer   > 0) this.tripleTimer   -= dt;
    if (this.hyperTimer    > 0) this.hyperTimer    -= dt;
    if (this.shieldTimer   > 0) this.shieldTimer   -= dt;

    const ROT   = 3.5;   // rad/s
    const THRUST = 260 * (this.hyperTimer > 0 ? HYPER_THRUST_MULT : 1);  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleTimer > 0) {
      return [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD]
        .map(d => new Bullet(ox, oy, this.angle + d));
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    // Escudo: parpadea en el último segundo
    if (this.shieldTimer > 0 && (this.shieldTimer > 1 || Math.floor(this.shieldTimer * 8) % 2 === 1)) {
      ctx.strokeStyle = POWERUP_TYPES.shield.color;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps;
let score, lives, level;
let levelKills;       // asteroides destruidos en este nivel
let levelDrops;       // power-ups del nivel: { type, at, done }
let slowTimer;        // segundos restantes de asteroides lentos
let novaFlash;        // segundos restantes del destello de la Nova
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  // Garantiza cada power-up del nivel, en un momento aleatorio
  const total = count * ASTEROIDS_PER_BIG;
  const types = ['triple'];
  if (level >= SLOW_MIN_LEVEL) types.push('slow');
  if (level >= NOVA_MIN_LEVEL && Math.random() < NOVA_CHANCE) types.push('nova');
  if (level >= HYPER_MIN_LEVEL && Math.random() < HYPER_CHANCE) types.push('hyper');
  if (Math.random() < SHIELD_CHANCE) types.push('shield');
  const used = new Set();
  levelDrops = types.map(type => {
    let at = Math.max(1, Math.round(total * rand(POWERUP_MIN_FRAC, POWERUP_MAX_FRAC)));
    while (used.has(at)) at++;   // nunca dos drops en la misma destrucción
    used.add(at);
    return { type, at, done: false };
  });
  levelKills = 0;

  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerUps  = [];
  slowTimer = 0;
  novaFlash = 0;
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerUps  = [];
  slowTimer = 0;
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

// Bomba Nova: destruye todos los asteroides en pantalla (sin dividirlos)
function detonateNova() {
  for (const a of asteroids) {
    score += POINTS[a.size];
    explode(a.x, a.y, a.size * 5);
  }
  asteroids = [];
  ship.hasNova = false;
  novaFlash = NOVA_FLASH;
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  ship.tripleTimer = 0;
  ship.hyperTimer  = 0;
  ship.shieldTimer = 0;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (novaFlash > 0) novaFlash -= dt;

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt * (slowTimer > 0 ? SLOW_FACTOR : 1)));
    if (slowTimer > 0) slowTimer -= dt;
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Bomba Nova
  if (pressed('KeyB') && ship.hasNova) detonateNova();

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt * (slowTimer > 0 ? SLOW_FACTOR : 1)));
  if (slowTimer > 0) slowTimer -= dt;
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);

  // Nave vs power-up
  for (const p of powerUps) {
    if (dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      if (p.type === 'triple') ship.tripleTimer = TRIPLE_DURATION;
      else if (p.type === 'slow') slowTimer = SLOW_DURATION;
      else if (p.type === 'nova') ship.hasNova = true;
      else if (p.type === 'hyper') ship.hyperTimer = HYPER_DURATION;
      else if (p.type === 'shield') ship.shieldTimer = SHIELD_DURATION;
    }
  }
  powerUps = powerUps.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        levelKills++;
        for (const d of levelDrops) {
          if (!d.done && levelKills >= d.at) {
            powerUps.push(new PowerUp(a.x, a.y, d.type));
            d.done = true;
          }
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        if (ship.shieldTimer > 0) {
          // El escudo absorbe el golpe y se consume
          ship.shieldTimer = 0;
          ship.invincible  = SHIELD_GRACE;
          explode(ship.x, ship.y, 6);
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  ctx.textAlign = 'left';
  let hudY = 46;
  if (ship.tripleTimer > 0) {
    ctx.fillStyle = POWERUP_TYPES.triple.color;
    ctx.fillText(`TRIPLE ${Math.ceil(ship.tripleTimer)}s`, 14, hudY);
    hudY += 20;
  }
  if (ship.hyperTimer > 0) {
    ctx.fillStyle = POWERUP_TYPES.hyper.color;
    ctx.fillText(`HIPER ${Math.ceil(ship.hyperTimer)}s`, 14, hudY);
    hudY += 20;
  }
  if (ship.shieldTimer > 0) {
    ctx.fillStyle = POWERUP_TYPES.shield.color;
    ctx.fillText(`ESCUDO ${Math.ceil(ship.shieldTimer)}s`, 14, hudY);
    hudY += 20;
  }
  if (slowTimer > 0) {
    ctx.fillStyle = POWERUP_TYPES.slow.color;
    ctx.fillText(`LENTO ${Math.ceil(slowTimer)}s`, 14, hudY);
    hudY += 20;
  }
  if (ship.hasNova) {
    ctx.fillStyle = POWERUP_TYPES.nova.color;
    ctx.fillText('NOVA [B]', 14, hudY);
  }
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  powerUps.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (novaFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(0.6 * novaFlash / NOVA_FLASH).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
