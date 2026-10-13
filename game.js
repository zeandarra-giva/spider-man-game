'use strict';

/* =========================================================
   Spidey Sense: a memory + reflex posing party game
   Plain HTML/CSS/JS, no build step, no external assets.
   ========================================================= */

/* ---------- Pose list (edit poses/poses.js, drop PNGs in poses/) ---------- */

const POSES = window.SPIDEY_POSES || [];

function poseArt(pose) {
  return `<img src="poses/${encodeURI(pose.file)}" alt="${esc(pose.name)} pose" onerror="this.parentNode.classList.add('missing')">
    <span class="placeholder"><span>Add <code>poses/${esc(pose.file)}</code></span></span>`;
}

/* ---------- Game data ---------- */

const COLORS = [
  { id: 'red',    name: 'RED',    hex: '#ff3b3b', ink: '#fff',    symbol: '●' },
  { id: 'blue',   name: 'BLUE',   hex: '#2f7bff', ink: '#fff',    symbol: '▲' },
  { id: 'yellow', name: 'YELLOW', hex: '#ffd21f', ink: '#111522', symbol: '■' },
  { id: 'green',  name: 'GREEN',  hex: '#1fcf6a', ink: '#111522', symbol: '◆' },
  { id: 'purple', name: 'PURPLE', hex: '#a24bff', ink: '#fff',    symbol: '★' },
  { id: 'orange', name: 'ORANGE', hex: '#ff8a1f', ink: '#111522', symbol: '✚' },
];

const DIFFICULTY = {
  easy:   { label: 'Easy',   react: 4000, memorize: 15 },
  normal: { label: 'Normal', react: 3000, memorize: 10 },
  hard:   { label: 'Hard',   react: 2200, memorize: 7 },
};
const DEFAULT_NAMES = ['Peter', 'Miles', 'Gwen', 'Miguel', 'Jessica', 'Pavitr'];
const DEFAULT_TEAMS = ['Team Spider', 'Team Venom'];
const TEAM_NAMES = [DEFAULT_NAMES, ['Eddie', 'Felicia', 'Harry', 'Mary Jane']]; // default player names per team
const MAX_LIVES = 3;
const MIN_REACT = 900;
const REACT_DECAY = 0.94; // reaction window shrinks ~6% every round
const BASE_POINTS = { single: 100, mysterio: 150, docock: 120, venom: 50, chain: 200, kraven: 150, whoswho: 150 };
const DANGER_HEAL = 4; // a correct pose calms the city a little

/* ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

let timers = [];
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

/* ---------- Sound (Web Audio, synthesized) ---------- */

const Sound = {
  ctx: null, master: null, muted: store.get('spidey.muted', false),
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) {
    this.muted = m;
    store.set('spidey.muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  },
  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, to = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.3, from = 4000, to = 600 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  // Rising, wobbling hum plus a heartbeat that speeds up.
  tingle(ms) {
    if (!this.ctx) return;
    const s = ms / 1000, t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.12, t + s * 0.8);
    out.gain.exponentialRampToValueAtTime(0.0001, t + s);
    const trem = this.ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    depth.gain.value = 0.5;
    lfo.frequency.setValueAtTime(6, t);
    lfo.frequency.linearRampToValueAtTime(18, t + s);
    lfo.connect(depth).connect(trem.gain);
    [620, 627].forEach((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + s);
      o.connect(trem);
      o.start(t);
      o.stop(t + s + 0.05);
    });
    trem.connect(out).connect(this.master);
    lfo.start(t);
    lfo.stop(t + s + 0.05);
    let at = 0.1, gap = 0.6;
    while (at < s - 0.1) {
      this.tone(70, 0.12, { vol: 0.5, at });
      this.tone(58, 0.1, { vol: 0.35, at: at + 0.16 });
      at += gap;
      gap = Math.max(0.28, gap * 0.85);
    }
  },
  thwip() { this.noise(0.18, { vol: 0.6, from: 5000, to: 700 }); this.tone(1400, 0.12, { type: 'sawtooth', vol: 0.08, to: 400 }); },
  freeze() { this.tone(140, 0.4, { type: 'square', vol: 0.18 }); this.tone(147, 0.4, { type: 'square', vol: 0.12 }); },
  good() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.2, at: i * 0.08 })); },
  bad() { this.tone(220, 0.45, { type: 'sawtooth', vol: 0.15, to: 80 }); },
  pop() { this.tone(660, 0.1, { type: 'square', vol: 0.08, to: 1320 }); },
  flicker() { this.noise(0.08, { vol: 0.25, from: 8000, to: 3000 }); },
  // Heartbeat that keeps speeding up while the timer drains, plus ticks in the last second.
  pressure(ms) {
    if (!this.ctx) return;
    const s = ms / 1000;
    for (let at = 0.05; at < s;) {
      this.tone(64, 0.11, { vol: 0.55, at });
      this.tone(54, 0.09, { vol: 0.4, at: at + 0.14 });
      at += 0.55 - 0.37 * (at / s);
    }
    for (let at = Math.max(0, s - 1); at < s - 0.05; at += 0.2) this.tone(1900, 0.03, { type: 'square', vol: 0.07, at });
  },
  alarm() {
    for (let i = 0; i < 4; i++) {
      this.tone(880, 0.18, { type: 'sawtooth', vol: 0.12, at: i * 0.4 });
      this.tone(660, 0.18, { type: 'sawtooth', vol: 0.12, at: i * 0.4 + 0.2 });
    }
  },
};

/* ---------- State ---------- */

const game = {
  settings: {
    count: 3, names: [], rounds: 10, difficulty: 'normal', villains: true,
    mode: 'single', teams: [], rosters: [[], []],
    ...store.get('spidey.settings', {}),
  },
  players: [], // every player has a `side`: 0 in one-team mode, 0 or 1 in head to head
  sides: [], // one entry per team on screen: { name, danger }
  round: 0,
  phase: 'title',
  event: null,
  lastType: null,
  briefIndex: 0,
  verdicts: {},
  suddenDeath: false,
  soloCount: [0, 0], // head to head: one-team-only rounds given to each team, kept even
};
if (game.settings.mode !== 'versus') game.settings.mode = 'single';

const VERSUS_KEYS = 'QWERTY';
const versus = () => game.settings.mode === 'versus';
const teamName = (k) => game.settings.teams[k] || DEFAULT_TEAMS[k];
const sidePlayers = (k) => game.players.filter((p) => p.side === k);
const aliveOn = (k) => sidePlayers(k).filter((p) => !p.out);
const alivePlayers = () => game.players.filter((p) => !p.out);
const level = () => Math.floor((game.round - 1) / 3);
const reactMs = () => (game.suddenDeath ? MIN_REACT
  : Math.max(MIN_REACT, Math.round(DIFFICULTY[game.settings.difficulty].react * REACT_DECAY ** (game.round - 1))));
const dangerPerMiss = (k) => Math.ceil(100 / (sidePlayers(k).length * MAX_LIVES * 0.6));
const poseOf = (part, p) => (part.poses && part.poses[p.idx]) || p.pose;
// Judge keys: 1–6 for the first (or only) team, Q–Y for the second team.
const keyFor = (p) => (p.side === 1 ? VERSUS_KEYS[sidePlayers(1).indexOf(p)] : String(sidePlayers(0).indexOf(p) + 1));

/* ---------- Screens ---------- */

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${id}`));
  if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
  $('#hud').classList.toggle('hidden', !['play', 'judge'].includes(id));
  if (id !== 'howto') clearInterval(demoTimer);
}

function seg(container, options, current, onChange) {
  container.innerHTML = '';
  options.forEach(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = value === current ? 'on' : '';
    b.addEventListener('click', () => { onChange(value); seg(container, options, value, onChange); });
    container.appendChild(b);
  });
}

function renderSetup() {
  const s = game.settings;
  $('#setup-error').hidden = true;
  $('#mode-chip').textContent = MODE_LABEL[s.mode];
  seg($('#rounds-seg'), [[5, '5'], [10, '10'], [15, '15'], [20, '20']], s.rounds, (n) => { s.rounds = n; });
  seg($('#diff-seg'), Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label]), s.difficulty, (k) => { s.difficulty = k; });
  $('#villains-toggle').checked = s.villains;
  syncMode();
}

function syncMode() {
  const s = game.settings;
  const vs = versus();
  if (vs && s.count > 4) s.count = 4; // two teams of up to 4 keeps the split screen readable
  seg($('#count-seg'), (vs ? [2, 3, 4] : [2, 3, 4, 5, 6]).map((n) => [n, String(n)]), s.count, (n) => { saveNameInputs(); s.count = n; renderNames(); });
  $('#teams-block').hidden = !vs;
  $('#name-list').hidden = vs;
  $('#count-label').textContent = vs ? 'Spiders per team' : 'Spiders';
  renderNames();
}

function nameInputs(list, names, defaults) {
  list.innerHTML = Array.from({ length: game.settings.count }, (_, i) =>
    `<label class="name-field"><span>Spider ${i + 1}</span><input type="text" maxlength="16" placeholder="${defaults[i]}" value="${esc(names[i] || '')}"></label>`).join('');
}

function renderNames() {
  const s = game.settings;
  nameInputs($('#name-list'), s.names, DEFAULT_NAMES);
  [0, 1].forEach((k) => nameInputs($(`#roster-${k}`), s.rosters[k] || [], TEAM_NAMES[k]));
  document.querySelectorAll('#teams-block .team-name').forEach((input, k) => {
    input.value = s.teams[k] || '';
    input.placeholder = DEFAULT_TEAMS[k];
  });
}

// Keep typed names when the player count or mode changes.
function saveNameInputs() {
  const s = game.settings;
  const read = (sel, prev = []) => {
    const typed = [...document.querySelectorAll(sel)].map((i) => i.value.trim());
    return typed.length ? typed.concat(prev.slice(typed.length)) : prev;
  };
  s.names = read('#name-list input', s.names);
  s.rosters = [0, 1].map((k) => read(`#roster-${k} input`, s.rosters[k]));
  s.teams = read('#teams-block .team-name', s.teams);
}

function startFromSetup() {
  saveNameInputs();
  const s = game.settings;
  if (POSES.length < s.count) {
    alertBox(`Only ${POSES.length} poses are listed in poses/poses.js. Add more or pick fewer spiders.`);
    return;
  }
  s.villains = $('#villains-toggle').checked;
  store.set('spidey.settings', s);
  newGame();
}

function alertBox(msg) {
  const box = $('#setup-error');
  box.textContent = msg;
  box.hidden = false;
}

function setEndButtons([primary, primaryAction], [secondary, secondaryAction]) {
  Object.assign($('#end-primary'), { textContent: primary }).dataset.action = primaryAction;
  Object.assign($('#end-secondary'), { textContent: secondary }).dataset.action = secondaryAction;
}

function newGame() {
  const s = game.settings;
  const sides = versus() ? [0, 1] : [0];
  game.sides = sides.map((k) => ({ name: versus() ? teamName(k) : '', danger: 0 }));
  document.body.classList.toggle('versus', versus());
  game.players = [];
  // Each team gets its own colors and poses, so RED can mean a different pose for each team.
  sides.forEach((k) => {
    const names = versus() ? s.rosters[k] || [] : s.names;
    const colors = shuffle(COLORS.slice(0, Math.max(s.count, 3))).slice(0, s.count);
    const poses = shuffle(POSES).slice(0, s.count);
    for (let i = 0; i < s.count; i++) {
      game.players.push({
        idx: game.players.length, side: k,
        name: names[i] || (versus() ? TEAM_NAMES[k] : DEFAULT_NAMES)[i],
        color: colors[i], pose: poses[i],
        lives: MAX_LIVES, score: 0, streak: 0, best: 0, out: false,
      });
    }
  });
  game.round = 0;
  game.suddenDeath = false;
  game.soloCount = [0, 0];
  $('#stage').classList.remove('sudden', 'critical');
  game.lastType = null;
  game.briefIndex = 0;
  game.phase = 'brief';
  show('brief');
  renderBrief();
}

/* ---------- Fit to viewport ---------- */

// Make the active screen fit without scrolling: try layouts from roomiest to densest (wide cards, then
// narrower cards so more fit per row, then hiding card descriptions) and keep the one with the biggest art.
function fitToViewport(screen) {
  const fits = () => screen.scrollHeight <= screen.clientHeight + 1;
  const set = ([h, min, tight]) => {
    screen.style.setProperty('--art-h', `${h}px`);
    screen.style.setProperty('--card-min', `${min}px`);
    screen.classList.toggle('tight', tight);
  };
  let best = null;
  for (const [min, tight] of [[170, false], [130, false], [130, true], [100, true]]) {
    for (let h = 320; h >= 60; h = Math.round(h * 0.9)) {
      set([h, min, tight]);
      if (fits()) {
        // A denser layout only wins if it gives clearly bigger pose art.
        if (!best || h > best[0] * 1.25) best = [h, min, tight];
        break;
      }
    }
  }
  set(best || [50, 100, true]);
}

const FIT_SCREENS = ['screen-brief', 'screen-memorize', 'screen-judge'];
window.addEventListener('resize', () => {
  const active = document.querySelector('.screen.active');
  if (active && FIT_SCREENS.includes(active.id)) fitToViewport(active);
});

/* ---------- Cards ---------- */

function poseCard(p, { showName = true, pose = p.pose } = {}) {
  return `<article class="pose-card" style="--c:${p.color.hex};--on:${p.color.ink}">
    <header><span class="sym">${p.color.symbol}</span><span class="cname">${p.color.name}</span>${showName ? `<span class="pname">${esc(p.name)}</span>` : ''}</header>
    <figure class="art">${poseArt(pose)}</figure>
    <div class="pose-text"><h3>${pose.name}</h3><p>${pose.cue}</p></div>
  </article>`;
}

/* ---------- Briefing ---------- */

function renderBrief() {
  const p = game.players[game.briefIndex];
  const mates = sidePlayers(p.side);
  $('#brief-step').textContent = `${versus() ? `${game.sides[p.side].name} · ` : ''}Spider ${mates.indexOf(p) + 1} of ${mates.length}: ${p.name}, this one's yours!`;
  const wrap = $('#brief-card-wrap');
  wrap.innerHTML = poseCard(p);
  wrap.firstElementChild.classList.add('reveal');
  $('#brief-next').textContent = game.briefIndex === game.players.length - 1 ? 'Show everyone ▸' : 'Next spider ▸';
  fitToViewport($('#screen-brief'));
  Sound.thwip();
}

function briefNext() {
  if (game.briefIndex < game.players.length - 1) {
    game.briefIndex++;
    renderBrief();
  } else {
    startMemorize();
  }
}

function startMemorize() {
  game.phase = 'memorize';
  show('memorize');
  // Head to head shows the two teams side by side so each team's cards fit in one row.
  const cards = (k) => `<div class="pose-grid">${sidePlayers(k).map((p) => poseCard(p)).join('')}</div>`;
  $('#mem-grid').innerHTML = versus()
    ? `<div class="mem-teams">${game.sides.map((side, k) => `<section><h3 class="grid-team">${esc(side.name)}</h3>${cards(k)}</section>`).join('')}</div>`
    : cards(0);
  let left = DIFFICULTY[game.settings.difficulty].memorize;
  const timer = $('#mem-timer');
  const tick = () => {
    timer.textContent = left;
    timer.classList.toggle('urgent', left <= 3);
    if (left <= 3) Sound.pop();
    if (left <= 0) { beginRounds(); return; }
    left--;
    later(tick, 1000);
  };
  tick();
  fitToViewport($('#screen-memorize'));
}

function beginRounds() {
  clearTimers();
  show('play');
  nextRound();
}

/* ---------- Rounds ---------- */

function renderHUD() {
  $('#hud-round').innerHTML = game.suddenDeath
    ? `<span>Round <b>${game.round}</b></span><small class="sd">SUDDEN DEATH</small>`
    : `<span>Round <b>${game.round}</b>/${game.settings.rounds}</span><small>Level ${level() + 1} · ${(reactMs() / 1000).toFixed(1)}s</small>`;
  // Neutral chips: colors stay hidden so players must remember theirs.
  $('#hud-players').innerHTML = game.sides.map((side, k) => `
    <div class="side-group">
      ${versus() ? `<b class="side-name">${esc(side.name)}</b>` : ''}
      <div class="city${side.danger >= 70 ? ' hot' : ''}" title="City danger: every miss raises it, every hit calms it. At 100% ${versus() ? 'this team loses' : 'the whole team loses'}.">
        <span>NYC</span><div class="meter"><i style="width:${side.danger}%"></i></div><b>${side.danger}%</b>
      </div>
      ${sidePlayers(k).map((p) => `
        <div class="chip${p.out ? ' out' : ''}">
          <span class="nm">${keyFor(p)}. ${esc(p.name)}</span>
          <span class="lives">${Array.from({ length: MAX_LIVES }, (_, i) => `<i class="${i < p.lives ? 'full' : ''}"></i>`).join('')}</span>
          <span class="sc">${p.score}</span>${p.streak >= 2 ? `<span class="streak">🔥${p.streak}</span>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

function setStage(mode) { $('#stage').dataset.mode = mode; }

function splash(html, cls = '') {
  const s = $('#splash');
  s.className = `splash ${cls}`;
  s.innerHTML = html;
  setStage('splash');
}

function nextRound() {
  const alive = alivePlayers();
  if (versus()) {
    const beaten = game.sides.some((side, k) => side.danger >= 100 || aliveOn(k).length === 0);
    if (beaten || game.round >= game.settings.rounds) { endGame(); return; }
  } else {
    if (game.sides[0].danger >= 100) { endGame('city'); return; }
    const over = game.suddenDeath ? alive.length <= 1 : alive.length === 0 || game.round >= game.settings.rounds;
    if (over) { endGame(); return; }
  }
  const prevLevel = game.round ? level() : 0;
  game.round++;
  game.phase = 'play';
  show('play');

  // One team, down to the last two spiders: one life each, shortest timer, play until one is left.
  if (!versus() && !game.suddenDeath && game.players.length >= 3 && alive.length === 2) {
    game.suddenDeath = true;
    alive.forEach((p) => { p.lives = 1; });
    $('#stage').classList.add('sudden');
    renderHUD();
    splash(`<div class="pop sudden">Sudden Death</div><div class="sub">${esc(alive[0].name)} vs ${esc(alive[1].name)}: one life each, fastest timer!</div>`);
    Sound.alarm();
    later(sense, 3000);
    return;
  }

  renderHUD();
  const levelUp = !game.suddenDeath && game.round > 1 && level() > prevLevel;
  splash(`<div class="pop">Round ${game.round}</div>${levelUp ? '<div class="sub">LEVEL UP! Longer chains, sneakier flashes!</div>' : ''}`);
  if (levelUp) Sound.good(); else Sound.pop();
  later(sense, levelUp ? 1800 : 1200);
}

// The round type is shared: in head to head both teams always face the same kind of round.
function pickRoundType(sides) {
  const r = game.round;
  const enough = (n) => sides.every((k) => aliveOn(k).length >= n);
  const opts = [['single', 5]];
  if (r >= 3 && enough(2)) opts.push(['chain', 2]);
  if (r >= 4 && enough(2)) opts.push(['whoswho', 2]);
  if (game.settings.villains) {
    if (r >= 3) opts.push(['mysterio', 2]);
    if (r >= 4 && enough(2)) opts.push(['docock', 2]);
    if (r >= 4 && sides.every((k) => sidePlayers(k).length >= 2)) opts.push(['kraven', 2]);
    if (r >= 5) opts.push(['venom', 1]);
  }
  const roll = () => {
    let n = Math.random() * opts.reduce((sum, [, w]) => sum + w, 0);
    for (const [type, w] of opts) { if ((n -= w) < 0) return type; }
    return 'single';
  };
  let type = roll();
  if (type !== 'single' && type === game.lastType) type = roll();
  game.lastType = type;
  return type;
}

// One team's share of the round: who is called and what they must do.
function buildPart(side, type, chainLen) {
  const alive = aliveOn(side);
  if (type === 'chain') {
    const sequence = [];
    while (sequence.length < chainLen) {
      const p = pick(alive);
      if (sequence[sequence.length - 1] !== p) sequence.push(p);
    }
    return { side, type, sequence, targets: alive.filter((p) => sequence.includes(p)) };
  }
  if (type === 'whoswho') {
    // A pose is shown with no color: its owner strikes it, teammates do the meme's pointing pose at the owner.
    const owner = pick(alive);
    return { side, type, targets: [owner], crowd: alive.filter((p) => p !== owner) };
  }
  if (type === 'kraven') {
    const thief = pick(alive);
    const victim = pick(sidePlayers(side).filter((p) => p !== thief));
    return { side, type, targets: [thief], victim, poses: { [thief.idx]: victim.pose } };
  }
  if (type === 'docock') {
    const n = Math.min(alive.length, Math.random() < 0.5 ? 2 : 3);
    return { side, type, targets: shuffle(alive).slice(0, n) };
  }
  if (type === 'venom') return { side, type, targets: alive };
  const target = pick(alive);
  if (type === 'mysterio') {
    const decoys = sidePlayers(side).map((p) => p.color).filter((c) => c.id !== target.color.id);
    return { side, type, targets: [target], word: pick(decoys.length ? decoys : COLORS.filter((c) => c.id !== target.color.id)) };
  }
  return { side, type, targets: [target] };
}

function pickEvent() {
  const live = game.sides.map((_, k) => k).filter((k) => aliveOn(k).length);
  const type = pickRoundType(live);
  let active = live;
  // Head to head: some rounds call only one team while the other must hold still.
  if (versus() && live.length === 2 && type !== 'venom' && game.round >= 2 && Math.random() < 0.35) {
    const [a, b] = game.soloCount;
    const k = a === b ? pick([0, 1]) : a < b ? 0 : 1;
    game.soloCount[k]++;
    active = [k];
  }
  const chainLen = Math.min(5, 2 + level());
  const parts = live.map((k) => (active.includes(k) ? buildPart(k, type, chainLen) : { side: k, type: 'hold', targets: aliveOn(k) }));
  return {
    type, solo: active.length < live.length ? active[0] : null, parts,
    targets: parts.flatMap((part) => part.targets),
    crowdKeys: parts.filter((part) => part.crowd && part.crowd.length).map((part) => `c${part.side}`),
  };
}

function sense() {
  game.event = pickEvent();
  setStage('sense');
  // Unpredictable build-up: sometimes instant, sometimes agonisingly long.
  const roll = Math.random();
  const dur = Math.round(roll < 0.2 ? rand(400, 800) : roll < 0.35 ? rand(4500, 6500) : rand(1500, 3500));
  Sound.tingle(dur);
  // From level 2, sometimes fake a flash to catch jumpy spiders.
  if (level() >= 1 && dur > 1200 && Math.random() < 0.3) {
    later(() => { $('#stage').classList.add('fakeout'); Sound.flicker(); }, dur * 0.5);
    later(() => $('#stage').classList.remove('fakeout'), dur * 0.5 + 160);
  }
  later({ chain: showChain, whoswho: showWhosWho }[game.event.type] || showCue, dur);
}

function cueBlock(c) {
  return `<div class="cue-block" style="--c:${c.hex};--on:${c.ink}"><span class="cue-sym">${c.symbol}</span><span class="cue-name">${c.name}</span></div>`;
}

// Cue for one team's part: [html, extra reaction time in ms].
function partCue(part) {
  switch (part.type) {
    case 'docock':
      return [`<div class="villain-tag">Doc Ock: ${part.targets.length} arms!</div><div class="cue-split">${part.targets.map((p) => cueBlock(p.color)).join('')}</div>`, 600];
    case 'mysterio':
      return [`<div class="cue-mysterio"><div class="villain-tag">Mysterio's illusion</div><span class="cue-word" style="color:${part.targets[0].color.hex}">${part.word.name}</span><p>Trust the color, not the word!</p></div>`, 400];
    case 'kraven': {
      const [thief, victim] = [part.targets[0], part.victim];
      return [`<div class="villain-tag">Kraven: steal a pose!</div>
        <div class="cue-split kraven">${cueBlock(thief.color)}<div class="steal-arrow">➜</div>${cueBlock(victim.color)}</div>
        <p class="cue-note">${thief.color.symbol} ${thief.color.name} strikes ${victim.color.symbol} ${victim.color.name}'s pose!</p>`, 800];
    }
    case 'venom':
      return ['<div class="cue-venom"><div class="villain-tag">Venom</div><span class="cue-word">FREEZE!</span><p>Nobody move a muscle…</p></div>', 1000];
    case 'hold':
      return ['<div class="cue-hold"><span class="cue-word">HOLD STILL</span><p>Not your round. Don\'t move!</p></div>', 0];
    default:
      return [cueBlock(part.targets[0].color), 0];
  }
}

// One team fills the screen; head to head splits it into a half per team.
function layout(htmlFor) {
  const ev = game.event;
  if (!versus()) return htmlFor(ev.parts[0]);
  return `<div class="cue-versus">${ev.parts.map((part) => `
    <div class="cue-half side-${part.side}${part.type === 'hold' ? ' holding' : ''}">
      <div class="team-banner">${esc(game.sides[part.side].name)}${ev.solo === part.side ? ' ONLY!' : ''}</div>
      <div class="half-body">${htmlFor(part)}</div>
    </div>`).join('')}</div>`;
}

function showCue() {
  let extra = 0;
  const html = layout((part) => {
    const [h, ms] = partCue(part);
    extra = Math.max(extra, ms);
    return h;
  });
  startTimer(html, reactMs() + extra);
}

// Spider-Chain: flash the colors one by one, then the called spiders perform them in order.
function showChain() {
  const ev = game.event;
  const cue = $('#cue');
  const len = ev.parts.find((part) => part.type === 'chain').sequence.length;
  const flash = Math.max(450, 750 - level() * 60);
  const step = flash + 180;
  const other = (part) => partCue(part)[0];
  for (let i = 0; i < len; i++) {
    later(() => {
      cue.innerHTML = layout((part) => (part.type === 'chain'
        ? `<div class="villain-tag">Spider-Chain: remember the order! ${i + 1}/${len}</div>${cueBlock(part.sequence[i].color)}`
        : other(part)));
      setStage('chain');
      Sound.thwip();
    }, i * step);
    later(() => { cue.innerHTML = layout((part) => (part.type === 'chain' ? '' : other(part))); }, i * step + flash);
  }
  const ms = Math.round(reactMs() * 0.6 * len) + 800;
  later(() => startTimer(layout((part) => (part.type === 'chain'
    ? `<div class="cue-chain"><div class="villain-tag">Spider-Chain</div><span class="cue-word">GO!</span>
        <div class="chain-slots">${part.sequence.map((_, i) => `<i>${i + 1}</i>`).join('')}</div>
        <p>Strike the poses in order, one after another!</p></div>`
    : other(part))), ms), len * step);
}

// Who's Who: the meme flashes first, then the mystery pose.
function showWhosWho() {
  const other = (part) => partCue(part)[0];
  $('#cue').innerHTML = layout((part) => (part.type === 'whoswho'
    ? '<div class="cue-meme"><img src="assets/whos-who.jpg" alt=""><span class="cue-word">WHO\'S WHO?!</span></div>'
    : other(part)));
  setStage('chain');
  Sound.alarm();
  later(() => startTimer(layout((part) => (part.type === 'whoswho'
    ? `<div class="cue-who"><div class="villain-tag">Who's Who?</div>
        <figure class="who-pose"><img src="poses/${encodeURI(part.targets[0].pose.file)}" alt=""></figure>
        <p>Your pose? <b>Strike it!</b> Not yours? <b>Do the meme point 👉 at its owner!</b></p></div>`
    : other(part))), reactMs() + 600), 1300);
}

function startTimer(html, ms) {
  $('#cue').innerHTML = html;
  setStage('cue');
  Sound.thwip();
  Sound.pressure(ms);
  const fill = $('#react-fill');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  void fill.offsetWidth;
  fill.style.transition = `width ${ms}ms linear`;
  fill.style.width = '0%';
  const num = $('#react-num');
  const end = performance.now() + ms;
  const tick = () => {
    if ($('#stage').dataset.mode !== 'cue') return;
    num.textContent = (Math.max(0, end - performance.now()) / 1000).toFixed(1);
    requestAnimationFrame(tick);
  };
  tick();
  later(() => $('#stage').classList.add('critical'), Math.max(0, ms - 1000));
  later(freeze, ms);
}

function freeze() {
  $('#stage').classList.remove('critical');
  Sound.freeze();
  splash(`<div class="pop freeze">${game.event.type === 'venom' ? 'Still alive?' : 'FREEZE!'}</div>`, 'freeze-splash');
  later(openJudge, 1000);
}

/* ---------- Judging ---------- */

const EVENT_LABEL = { mysterio: 'Mysterio', docock: 'Doc Ock', venom: 'Venom', chain: 'Spider-Chain', kraven: 'Kraven', whoswho: "Who's Who" };
const JUDGE_TITLES = {
  single: 'Did they nail the pose?',
  mysterio: 'Did the right spider pose?',
  docock: 'Did all the arms land?',
  venom: 'Who moved? Mark them ✘',
  chain: 'Did the chain go in order?',
  kraven: 'Did they steal the right pose?',
  whoswho: 'Right pose? Right pointing?',
};
const isStill = (part) => part.type === 'venom' || part.type === 'hold';

function judgeExtra(part) {
  if (part.type === 'chain') {
    return `<div class="chain-strip">${part.sequence.map((p, i) => `<span style="--c:${p.color.hex};--on:${p.color.ink}"><b>${i + 1}</b>${p.color.symbol} ${esc(p.name)}</span>`).join('<em>➜</em>')}</div>`;
  }
  if (part.type === 'kraven') return `<p class="judge-note">${esc(part.targets[0].name)} had to steal <b>${esc(part.victim.name)}</b>'s ${part.victim.color.name} pose.</p>`;
  if (part.type === 'hold') return '<p class="judge-note">Hold-still round: mark anyone who moved ✘</p>';
  if (part.type === 'whoswho') {
    const owner = part.targets[0];
    return `<p class="judge-note"><b>${owner.pose.name}</b> belongs to <b>${esc(owner.name)}</b>. Everyone else should be pointing at them, meme-style.</p>`;
  }
  return '';
}

function judgeItem(part, p) {
  const card = isStill(part)
    ? `<article class="pose-card mini" style="--c:${p.color.hex};--on:${p.color.ink}"><header><span class="sym">${p.color.symbol}</span><span class="pname">${esc(p.name)}</span></header></article>`
    : poseCard(p, { pose: poseOf(part, p) });
  const [yes, no] = isStill(part) ? ['Stayed frozen', 'Moved'] : ['Nailed it', 'Missed'];
  return `<div class="judge-item" data-idx="${p.idx}">
    <span class="key-badge">${keyFor(p)}</span>${card}
    <div class="verdict">
      <button class="yes" data-action="verdict" data-idx="${p.idx}" data-v="1">✔ ${yes}</button>
      <button class="no" data-action="verdict" data-idx="${p.idx}" data-v="0">✘ ${no}</button>
    </div></div>`;
}

const crowdKey = (side) => (side === 1 ? 'P' : '0');

function crowdItem(part) {
  const key = `c${part.side}`;
  return `<div class="judge-item crowd" data-idx="${key}">
    <span class="key-badge">${crowdKey(part.side)}</span>
    <article class="pose-card mini crowd-card"><header><span class="sym">👉</span><span class="cname">The crowd</span></header>
      <p>${part.crowd.map((p) => esc(p.name)).join(', ')}</p></article>
    <div class="verdict">
      <button class="yes" data-action="verdict" data-idx="${key}" data-v="1">✔ Pointed right</button>
      <button class="no" data-action="verdict" data-idx="${key}" data-v="0">✘ Wrong spider</button>
    </div></div>`;
}

function openJudge() {
  const ev = game.event;
  game.phase = 'judge';
  game.verdicts = {};
  ev.parts.filter(isStill).forEach((part) => part.targets.forEach((p) => { game.verdicts[p.idx] = true; }));
  show('judge');
  $('#judge-eyebrow').textContent = `Round ${game.round}` + (EVENT_LABEL[ev.type] ? ` · ${EVENT_LABEL[ev.type]}` : '')
    + (ev.solo != null ? ` · ${game.sides[ev.solo].name} only` : '');
  $('#judge-title').textContent = JUDGE_TITLES[ev.type];
  const grid = $('#judge-grid');
  grid.style.setProperty('--cols', ev.parts.length);
  grid.innerHTML = ev.parts.map((part) => `
    <section class="judge-col">
      ${versus() ? `<h3 class="judge-team">${esc(game.sides[part.side].name)}</h3>` : ''}
      ${judgeExtra(part)}
      <div class="pose-grid judge-grid${isStill(part) ? ' compact' : ''}">${part.targets.map((p) => judgeItem(part, p)).join('')}${part.crowd && part.crowd.length ? crowdItem(part) : ''}</div>
    </section>`).join('');
  updateJudge();
  fitToViewport($('#screen-judge'));
}

function updateJudge() {
  document.querySelectorAll('.judge-item').forEach((item) => {
    const v = game.verdicts[item.dataset.idx];
    item.classList.toggle('is-yes', v === true);
    item.classList.toggle('is-no', v === false);
  });
  $('#judge-next').disabled = !allJudged();
}

const allJudged = () => game.event.targets.every((p) => game.verdicts[p.idx] !== undefined)
  && game.event.crowdKeys.every((key) => game.verdicts[key] !== undefined);

// idx is a player index, or 'c0' / 'c1' for a team's pointing crowd in Who's Who.
function setVerdict(idx, value) {
  if (!game.event.targets.some((p) => p.idx === idx) && !game.event.crowdKeys.includes(idx)) return;
  game.verdicts[idx] = value;
  updateJudge();
}

function scoreRound() {
  const ev = game.event;
  if (!allJudged()) return;
  const before = game.sides.map((side) => side.danger);
  const tag = (p) => (versus() ? ` <small>${esc(game.sides[p.side].name)}</small>` : '');
  const lines = [];
  ev.parts.forEach((part) => part.targets.forEach((p) => {
    const side = game.sides[p.side];
    if (game.verdicts[p.idx]) {
      if (part.type === 'hold') return; // holding still is expected, not rewarded
      p.streak++;
      p.best = Math.max(p.best, p.streak);
      const pts = BASE_POINTS[part.type] + 50 * Math.min(p.streak - 1, 4);
      p.score += pts;
      side.danger = Math.max(0, side.danger - DANGER_HEAL);
      lines.push(`<li class="ok"><b>${esc(p.name)}</b>${tag(p)} +${pts}${p.streak >= 3 ? ` <em>Spidey Combo x${p.streak}!</em>` : ''}</li>`);
      return;
    }
    p.streak = 0;
    p.lives--;
    if (p.lives <= 0) p.out = true;
    side.danger = Math.min(100, side.danger + dangerPerMiss(p.side));
    lines.push(`<li class="bad"><b>${esc(p.name)}</b>${tag(p)} ${part.type === 'hold' ? 'moved! ' : ''}${p.out ? 'WEBBED OUT!' : '−1 web cartridge'}</li>`);
  }));
  // The crowd's pointing only moves the city meter; nobody loses a life for it.
  ev.crowdKeys.forEach((key) => {
    const k = Number(key.slice(1));
    const side = game.sides[k];
    const who = versus() ? `${esc(side.name)} crowd` : 'The crowd';
    if (game.verdicts[key]) {
      side.danger = Math.max(0, side.danger - DANGER_HEAL);
      lines.push(`<li class="ok"><b>${who}</b> pointed at the right spider!</li>`);
    } else {
      side.danger = Math.min(100, side.danger + dangerPerMiss(k));
      lines.push(`<li class="bad"><b>${who}</b> pointed at the wrong spider!</li>`);
    }
  });
  game.sides.forEach((side, k) => {
    const diff = side.danger - before[k];
    if (diff) lines.push(`<li class="city">${versus() ? `${esc(side.name)} · ` : ''}City danger ${diff > 0 ? '▲' : '▼'} ${side.danger}%</li>`);
  });
  const scored = ev.parts.filter((part) => part.type !== 'hold').flatMap((part) => part.targets);
  const anyGood = scored.some((p) => game.verdicts[p.idx]);
  if (anyGood) Sound.good(); else Sound.bad();
  game.phase = 'play';
  show('play');
  renderHUD();
  const word = game.sides.some((side) => side.danger >= 100) ? 'NOOO!'
    : anyGood ? (scored.every((p) => game.verdicts[p.idx]) ? 'THWIP!' : 'POW!') : 'OOF!';
  splash(`<div class="pop">${word}</div><ul class="results${lines.length > 6 ? ' many' : ''}">${lines.join('')}</ul>`);
  later(nextRound, 2200);
}

/* ---------- End ---------- */

function endGame(reason) {
  clearTimers();
  game.phase = 'end';
  $('#stage').classList.remove('sudden', 'critical');
  show('end');
  if (versus()) { endVersus(); return; }
  const danger = game.sides[0].danger;
  const ranked = game.players.slice().sort((a, b) => b.score - a.score || b.lives - a.lives);
  const alive = alivePlayers();
  const team = game.players.reduce((n, p) => n + p.score, 0);
  let title;
  if (reason === 'city') title = 'New York has fallen!';
  else if (alive.length === 0) title = 'The villains win this time!';
  else if (game.suddenDeath && alive.length === 1) title = `${alive[0].name} survives sudden death!`;
  else title = `${ranked[0].name} is the Ultimate Spider!`;
  $('#end-title').textContent = title;
  $('#end-sub').textContent = `Team score: ${team} · City danger ${danger}% · ${alive.length}/${game.players.length} spiders still swinging`;
  $('#leaderboard').innerHTML = ranked.map((p) => `
    <li style="--c:${p.color.hex};--on:${p.color.ink}">
      <span class="sym">${p.color.symbol}</span>
      <span class="nm">${esc(p.name)}<small>${p.pose.name}</small></span>
      <span class="st">Best combo ${p.best} · ${p.out ? 'webbed out' : `${p.lives} ${p.lives === 1 ? 'web' : 'webs'} left`}</span>
      <span class="sc">${p.score}</span>
    </li>`).join('');
  if (reason === 'city' || alive.length === 0) Sound.bad(); else Sound.good();
  setEndButtons(['Rematch (new colors) ▸', 'rematch'], ['Change team', 'setup']);
}

function endVersus() {
  const teams = game.sides.map((side, k) => {
    const players = sidePlayers(k);
    return {
      k, name: side.name, danger: side.danger,
      score: players.reduce((n, p) => n + p.score, 0),
      fell: side.danger >= 100, alive: aliveOn(k).length,
      mvp: players.slice().sort((a, b) => b.score - a.score)[0],
    };
  });
  const lost = teams.filter((t) => t.fell || t.alive === 0);
  let winner = null;
  let why;
  if (lost.length === 1) {
    winner = teams.find((t) => t !== lost[0]);
    why = lost[0].fell ? `${lost[0].name} let New York fall!` : `${lost[0].name} got webbed out!`;
  } else if (lost.length === 2) {
    why = 'Both teams went down together!';
  } else if (teams[0].score !== teams[1].score) {
    winner = teams[0].score > teams[1].score ? teams[0] : teams[1];
    why = 'Highest score after the final round';
  } else {
    why = 'Same score after the final round';
  }
  $('#end-title').textContent = winner ? `🏆 ${winner.name} wins!` : "It's a tie!";
  $('#end-sub').textContent = `${why} · ${teams[0].name} ${teams[0].score} vs ${teams[1].name} ${teams[1].score}`;
  const ranked = winner ? [winner, teams.find((t) => t !== winner)] : teams;
  $('#leaderboard').innerHTML = ranked.map((t, i) => `
    <li style="--c:${COLORS[t.k].hex};--on:${COLORS[t.k].ink}">
      <span class="sym">${winner ? i + 1 : '='}</span>
      <span class="nm">${esc(t.name)}<small>MVP ${esc(t.mvp.name)}</small></span>
      <span class="st">${t.fell ? 'New York fell' : `City danger ${t.danger}%`} · ${t.alive}/${game.settings.count} spiders standing</span>
      <span class="sc">${t.score}</span>
    </li>`).join('');
  Sound.good();
  setEndButtons(['Rematch (new colors) ▸', 'rematch'], ['Change teams', 'setup']);
}

/* ---------- How to play (slideshow) ---------- */

// Small looping previews of what each round looks like on screen.
const demoBlock = (c, extra = '') => `<div class="d-block" style="--c:${c.hex};--on:${c.ink}"><span class="d-sym">${c.symbol}</span><span class="d-name">${c.name}</span>${extra}</div>`;
const demoCard = (c, pose, name) => `<div class="d-card" style="--c:${c.hex};--on:${c.ink}">
  <div class="d-card-head"><span>${c.symbol} ${c.name}</span><b>${name}</b></div>
  <div class="d-card-art">${pose ? `<img src="poses/${encodeURI(pose.file)}" alt="">` : ''}</div>
  <div class="d-card-name">${pose ? pose.name : ''}</div></div>`;
// Layers shown one after another by runDemoSteps(); the last one can be held for extra beats.
const versusDemo = (left, right, only = '') =>
  `<div class="d-versus"><div class="d-half"><b>${DEFAULT_TEAMS[0]}${only}</b>${left}</div><div class="d-half"><b>${DEFAULT_TEAMS[1]}</b>${right}</div></div>`;
const steps = (layers, holdLast = 1) => layers.map((html, i) =>
  `<div class="d-layer d-step" data-hold="${i === layers.length - 1 ? holdLast : 1}">${html}</div>`).join('');

const [RED, BLUE, YELLOW, GREEN] = COLORS;
const P = (i) => POSES[i % Math.max(POSES.length, 1)];

const SLIDES = [
  {
    tag: 'The basics', title: 'You get a secret color',
    text: (vs) => `Every spider is given a <b>color</b>, and every color is a <b>Spider-Man pose</b>. Your job: remember <i>your</i> color and <i>your</i> pose.${vs ? ' Each team gets its own colors, so RED can be a different pose for each team.' : ''}`,
    demo: () => `<div class="demo cards">${demoCard(RED, P(0), 'Peter')}${demoCard(BLUE, P(1), 'Miles')}${demoCard(YELLOW, P(2), 'Gwen')}</div>`,
  },
  {
    tag: 'The basics', title: 'One look, then it’s gone',
    text: 'Each spider sees their own card, then everyone’s cards show together for a few seconds. After that the poses are <b>hidden for the rest of the game</b>, so memorize fast!',
    demo: () => `<div class="demo cards">${demoCard(GREEN, P(3), 'You')}<div class="d-count">10</div></div>`,
  },
  {
    tag: 'The basics', title: 'Feel the tingle, strike the pose',
    text: 'The Spidey Sense tingles… then a color flashes. <b>If it’s yours, strike your pose</b> before the bar runs out. Everyone else: don’t move!',
    demo: () => `<div class="demo">${steps([
      '<div class="d-sense"><i></i><i></i><i></i><span>Spidey sense tingling…</span></div>',
      demoBlock(RED, '<div class="d-bar"></div>'),
    ])}</div>`,
  },
  {
    tag: 'The basics', title: 'The host judges',
    text: 'After <b>FREEZE!</b> the host checks each pose. Nail it for points, and nail several in a row for a <b>Spidey Combo</b>. Miss and you lose a web cartridge. Lose all 3 and you’re <b>webbed out</b>.',
    demo: () => `<div class="demo judge"><div class="d-verdict"><span class="yes">✔ Nailed it</span><span class="no">✘ Missed</span></div>
      <div class="d-lives"><i class="full"></i><i class="full"></i><i></i></div><div class="d-combo">+200 <em>Combo x3!</em></div></div>`,
  },
  {
    tag: 'The basics', title: 'Protect New York',
    text: (vs) => (vs
      ? 'Each team has its own <b>NYC danger</b> meter. Every miss raises it, every hit calms it down. If <i>your</i> meter reaches <b>100%</b>, your team loses on the spot!'
      : 'Every miss raises the <b>NYC danger</b> meter, every hit calms it down. If it reaches <b>100%</b>, the <i>whole team</i> loses, so cheer each other on!'),
    demo: () => `<div class="demo danger"><span>NYC danger</span><div class="d-meter"><i></i></div></div>`,
  },
  {
    tag: 'Two teams', title: 'Head to head', only: 'versus',
    text: 'The screen splits in two, one half per team, and both teams play <b>at the same time</b>. Sometimes only one team is called and the other must <b>HOLD STILL</b>. Highest score wins, but if your city falls or your whole team is webbed out, you lose on the spot!',
    demo: () => `<div class="demo">${steps([
      versusDemo(demoBlock(RED), demoBlock(BLUE)),
      versusDemo(demoBlock(YELLOW), '<div class="d-hold">HOLD STILL</div>', ' only!'),
    ])}</div>`,
  },
  {
    tag: 'It gets harder', title: 'Faster every round',
    text: 'The timer <b>shrinks every round</b>. The tingle might last half a second… or six. From level 2, <b>fake white flashes</b> try to make you move early.',
    demo: () => `<div class="demo">${steps(['3.0', '2.1', '1.4', '0.9'].map((t) => `<div class="d-num">${t}</div>`))}</div>`,
  },
  {
    tag: 'Round type', title: 'Mysterio: the word lies',
    text: 'Ignore what the word <i>says</i>, follow the <b>color of the letters</b>. Here it says BLUE but it’s painted red, so <b>RED</b> poses.',
    demo: () => `<div class="demo mysterio"><div class="d-tag">Mysterio's illusion</div><span class="d-word" style="color:${RED.hex}">BLUE</span></div>`,
  },
  {
    tag: 'Round type', title: 'Doc Ock: many arms',
    text: 'Two or three colors flash <b>at the same time</b>. Every spider whose color appears poses together.',
    demo: () => `<div class="demo"><div class="d-tag">Doc Ock: 3 arms!</div>${demoBlock(BLUE)}${demoBlock(YELLOW)}${demoBlock(GREEN)}</div>`,
  },
  {
    tag: 'Round type', title: 'Spider-Chain: remember the order',
    text: 'Colors flash <b>one at a time</b>. When you see <b>GO!</b>, those spiders pose one after another <b>in that exact order</b>. Chains get longer each level.',
    demo: () => `<div class="demo">${steps([
      demoBlock(RED, '<b class="d-idx">1</b>'), demoBlock(BLUE, '<b class="d-idx">2</b>'), demoBlock(RED, '<b class="d-idx">3</b>'),
      '<div class="d-go">GO!<div><i>1</i><i>2</i><i>3</i></div></div>',
    ], 2)}</div>`,
  },
  {
    tag: 'Round type', title: 'Kraven: swap poses',
    text: 'An arrow means <b>steal a pose</b>. Here <b>RED</b> must strike <b>GREEN’s</b> pose, so you need to know everyone’s poses, not just your own!',
    demo: () => `<div class="demo"><div class="d-tag">Kraven: steal a pose!</div>${demoBlock(RED)}<div class="d-arrow">➜</div>${demoBlock(GREEN)}</div>`,
  },
  {
    tag: 'Round type', title: 'Who’s Who: point at the owner',
    text: (vs) => `The meme flashes, then a <b>pose</b> appears with no color. Its <b>owner strikes it</b> and everyone else does the <b>meme pointing pose</b> at them${vs ? ' (within your own team)' : ''}!`,
    demo: () => `<div class="demo">${steps([
      '<div class="d-meme"><img src="assets/whos-who.jpg" alt=""><span>WHO\'S WHO?!</span></div>',
      `<div class="d-who"><img src="poses/${encodeURI(P(4).file)}" alt=""><span>Owner strikes it · everyone else 👉</span></div>`,
    ])}</div>`,
  },
  {
    tag: 'Round type', title: 'Venom: nobody moves',
    text: 'Black screen, <b>FREEZE!</b> Nobody moves a muscle until it’s over. The host marks anyone who twitched.',
    demo: () => `<div class="demo venom"><div class="d-tag">Venom</div><span class="d-word">FREEZE!</span></div>`,
  },
  {
    tag: 'Final showdown', title: 'Sudden death', only: 'single',
    text: 'Down to the last two spiders? <b>One life each</b>, the fastest timer and no round limit. Last spider standing wins!',
    demo: () => `<div class="demo sudden"><span class="d-word">SUDDEN DEATH</span></div>`,
  },
  {
    tag: 'Ready?', title: 'Host controls',
    text: (vs) => `<kbd>Space</kbd>/<kbd>Enter</kbd> continue · <kbd>1</kbd>–<kbd>${vs ? 4 : 6}</kbd> mark a player while judging${vs ? ' (second team: <kbd>Q</kbd>–<kbd>R</kbd>)' : ''} · <kbd>0</kbd>${vs ? '/<kbd>P</kbd>' : ''} the pointing crowd · <kbd>M</kbd> mute · <kbd>Esc</kbd> quit. Put it on the biggest screen you have!`,
    demo: () => `<div class="demo ready"><span class="d-word">Suit up!</span></div>`,
  },
];

let slideIndex = 0;
let demoTimer = null;
let howtoMode = null; // 'single' | 'versus' when shown after picking a mode, null from the title screen
let slides = SLIDES;

function runDemoSteps() {
  clearInterval(demoTimer);
  const layers = [...document.querySelectorAll('#slide .d-step')];
  if (!layers.length) return;
  const seq = layers.flatMap((l, i) => Array(Number(l.dataset.hold)).fill(i));
  let k = 0;
  const tick = () => { layers.forEach((l, i) => l.classList.toggle('on', i === seq[k % seq.length])); k++; };
  tick();
  demoTimer = setInterval(tick, 1100);
}

function openHowto(mode = null) {
  clearTimers();
  game.phase = 'howto';
  howtoMode = mode;
  slides = SLIDES.filter((sl) => !sl.only || !mode || sl.only === mode);
  slideIndex = 0;
  show('howto');
  $('#skip-howto').hidden = !mode;
  $('#slide-dots').innerHTML = slides.map((_, i) => `<button data-action="slide-go" data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('');
  renderSlide();
}

function renderSlide() {
  const sl = slides[slideIndex];
  const text = typeof sl.text === 'function' ? sl.text(howtoMode === 'versus') : sl.text;
  const prefix = howtoMode ? `Step 2 of 3 · How to play: ${MODE_LABEL[howtoMode]}` : 'How to play';
  $('#howto-step').textContent = `${prefix} · ${slideIndex + 1}/${slides.length}`;
  $('#slide').innerHTML = `<p class="slide-tag">${sl.tag}</p>${sl.demo()}<h2 class="comic-title">${sl.title}</h2><p class="slide-text">${text}</p>`;
  $('#slide').classList.remove('enter');
  void $('#slide').offsetWidth;
  $('#slide').classList.add('enter');
  $('#slide-prev').disabled = slideIndex === 0 && !howtoMode;
  $('#slide-next').textContent = slideIndex < slides.length - 1 ? 'Next ▸' : howtoMode ? 'Set up players ▸' : 'Suit up ▸';
  document.querySelectorAll('#slide-dots button').forEach((d, i) => d.classList.toggle('on', i === slideIndex));
  runDemoSteps();
}

function goSlide(i) {
  if (i >= slides.length) { if (howtoMode) actions.setup(); else actions.mode(); return; }
  if (i < 0 && howtoMode) { actions.mode(); return; }
  slideIndex = Math.max(0, i);
  renderSlide();
  Sound.pop();
}

const MODE_LABEL = { single: 'One team', versus: 'Head to head' };

function pickMode(mode) {
  game.settings.mode = mode;
  store.set('spidey.settings', game.settings);
  Sound.thwip();
  openHowto(mode);
}

/* ---------- Input ---------- */

const actions = {
  title() { clearTimers(); game.phase = 'title'; $('#stage').classList.remove('sudden', 'critical'); show('title'); },
  setup() { clearTimers(); game.phase = 'setup'; show('setup'); renderSetup(); },
  howto() { openHowto(); },
  mode() { clearTimers(); game.phase = 'mode'; show('mode'); },
  'pick-mode'(b) { pickMode(b.dataset.mode); },
  'slide-prev'() { goSlide(slideIndex - 1); },
  'slide-next'() { goSlide(slideIndex + 1); },
  'slide-go'(b) { goSlide(Number(b.dataset.i)); },
  'brief-next': briefNext,
  begin: beginRounds,
  verdict(b) {
    const raw = b.dataset.idx;
    setVerdict(raw.startsWith('c') ? raw : Number(raw), b.dataset.v === '1');
  },
  'judge-next': scoreRound,
  rematch() { clearTimers(); newGame(); },
  quit() { actions.title(); },
  mute() { toggleMute(); },
};

function toggleMute() {
  Sound.setMuted(!Sound.muted);
  $('#mute-btn').textContent = Sound.muted ? '🔇' : '🔊';
}

function init() {
  $('#mute-btn').textContent = Sound.muted ? '🔇' : '🔊';
  // Decorative corner webs.
  const web = (() => {
    let s = '<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4">';
    for (let a = 0; a <= 90; a += 15) {
      const r = (a * Math.PI) / 180;
      s += `<line x1="0" y1="0" x2="${200 * Math.cos(r)}" y2="${200 * Math.sin(r)}"/>`;
    }
    for (let ring = 30; ring <= 190; ring += 32) {
      let d = '';
      for (let a = 0; a <= 90; a += 15) {
        const r = (a * Math.PI) / 180;
        const x = ring * Math.cos(r), y = ring * Math.sin(r);
        d += a === 0 ? `M${x} ${y}` : ` Q${(ring * 0.82) * Math.cos(r - 0.13)} ${(ring * 0.82) * Math.sin(r - 0.13)} ${x} ${y}`;
      }
      s += `<path d="${d}"/>`;
    }
    return s + '</g></svg>';
  })();
  document.querySelectorAll('.web-deco').forEach((d) => { d.innerHTML = web; });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    Sound.init();
    actions[b.dataset.action](b);
  });

  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    Sound.init();
    startFromSetup();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.repeat) return;
    Sound.init();
    const go = e.key === ' ' || e.key === 'Enter';
    if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
    if (e.key === 'Escape' && game.phase !== 'title') { actions.title(); return; }
    switch (game.phase) {
      case 'title': if (go) { e.preventDefault(); actions.mode(); } break;
      case 'mode': if (e.key === '1') pickMode('single'); else if (e.key === '2') pickMode('versus'); break;
      case 'howto':
        if (go || e.key === 'ArrowRight') { e.preventDefault(); goSlide(slideIndex + 1); }
        else if (e.key === 'ArrowLeft') goSlide(slideIndex - 1);
        break;
      case 'brief': if (go) { e.preventDefault(); briefNext(); } break;
      case 'memorize': if (go) { e.preventDefault(); beginRounds(); } break;
      case 'judge':
      {
        const k = e.key.toUpperCase();
        const p = /^[1-6]$/.test(k) ? sidePlayers(0)[Number(k) - 1]
          : versus() && VERSUS_KEYS.includes(k) ? sidePlayers(1)[VERSUS_KEYS.indexOf(k)] : null;
        const flip = (idx) => setVerdict(idx, game.verdicts[idx] === undefined ? true : !game.verdicts[idx]);
        if (p) flip(p.idx);
        else if (k === '0') flip('c0');
        else if (k === 'P' && versus()) flip('c1');
        else if (go) { e.preventDefault(); scoreRound(); }
      }
        break;
      case 'end': if (go) { e.preventDefault(); $('#end-primary').click(); } break;
      default: break;
    }
  });
}

init();
