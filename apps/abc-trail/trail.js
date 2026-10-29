/* trail.js: ABC Trail game logic.
   A glowing dot traces one or more letters. Students watch, then guess the letters in order. */
import { initViewport, initFullscreen, hydrateIcons } from '../../assets/js/shared.js';
import { icon } from '../../assets/js/icons.js';
import { LETTER_PATHS } from './letters.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const UPPER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const LOWER = UPPER.map(c => c.toLowerCase());

const TRAIL_FRACTION = [0, 0.055, 0.105, 0.17]; // trail length (None..Long) as a share of each stroke
const UNITS_PER_SECOND = 70;    // trace speed at "Normal", in stage units
const MIN_STROKE_MS = 220;
const DOT_HOLD_MS = 500;        // how long the dot of an i or j stays lit
const LETTER_GAP_MS = 420;      // pause between letters in a sequence
const SAMPLE_SPACING = 0.9;     // stage units the dot travels between trail samples
const MAX_SEGMENTS = 96;        // trail segments are reused, never rebuilt
// Capitals are centred on the stage as drawn. Lowercase letters sit on the same baseline,
// so the short ones (a, c, e, o ...) would hang low; this lifts them (stage units, 100 = canvas height).
const LOWERCASE_LIFT = 7;

/* Teacher's choices (settings screen) and the state of the current round. */
const S = {
  speed: 1,
  trail: 2,
  count: 1,
  caseMode: 'uppercase',
  selected: new Set(UPPER),     // mastered-letter pool
  playing: false,
  revealed: false,
  played: false,                // the trail has run at least once for this sequence
  guesses: [],
  token: 0,                     // bumped to cancel an animation in flight
};
let letters = UPPER;
let sequence = [];
let index = 0;

const $ = id => document.getElementById(id);
const settingsScreen = $('settingsScreen');
const playScreen = $('playScreen');
const stageMain = $('stageMain');
const trailLayer = $('trailLayer');
const dotLayer = $('dotLayer');
const stageShift = $('stageShift');
const answerEl = $('answer');
const answerLetter = $('answerLetter');
const playBtn = $('playBtn');
const revealBtn = $('revealBtn');
const nextBtn = $('nextBtn');
const checkBtn = $('checkBtn');
const startBtn = $('startTrail');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ---- Trail drawing: a fixed pool of segments plus one dot ---------------- */

const segments = Array.from({ length: MAX_SEGMENTS }, () => {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('class', 'trail-segment');
  line.setAttribute('display', 'none');     // hidden pieces must not count toward the glow's area
  dotLayer.append(line);
  return line;
});
const headDot = document.createElementNS(SVG_NS, 'circle');
headDot.setAttribute('class', 'trail-dot');
headDot.setAttribute('r', '2.35');
headDot.setAttribute('display', 'none');
dotLayer.append(headDot);
let shown = 0;

function clearTrail() {
  for (let i = 0; i < shown; i += 1) segments[i].setAttribute('display', 'none');
  shown = 0;
  headDot.setAttribute('display', 'none');
}

function drawTrail(samples) {
  const n = samples.length - 1;
  for (let i = 0; i < n; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const age = i / (n || 1);
    const line = segments[i];
    if (i >= shown) line.removeAttribute('display');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x);
    line.setAttribute('y2', b.y);
    line.setAttribute('opacity', 0.1 + age * 0.55);
    line.setAttribute('stroke-width', 9 + age * 9);
  }
  for (let i = Math.max(0, n); i < shown; i += 1) segments[i].setAttribute('display', 'none');
  shown = Math.max(0, n);
  const head = samples[samples.length - 1];
  headDot.setAttribute('cx', head.x);
  headDot.setAttribute('cy', head.y);
  headDot.removeAttribute('display');
}

function createPath(d) {
  // Measured in the page's own SVG so lengths are exact; removed again after the stroke.
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'none');
  trailLayer.append(path);
  return path;
}

function runStroke(path, length, duration, fraction, token) {
  return new Promise(resolve => {
    const cutoff = length * fraction;
    const start = performance.now();
    let samples = [];
    const frame = () => {
      if (token !== S.token) { resolve(); return; }
      const t = Math.min(1, (performance.now() - start) / duration);
      const pt = path.getPointAtLength(length * t);
      const last = samples[samples.length - 1];
      if (!last || t === 1 || Math.hypot(pt.x - last.x, pt.y - last.y) >= SAMPLE_SPACING) {
        samples.push({ x: pt.x, y: pt.y });
        // drop the samples that are older than the trail length
        let back = 0;
        let keep = 0;
        for (let i = samples.length - 1; i > 0; i -= 1) {
          back += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
          if (back > cutoff) { keep = i; break; }
        }
        if (S.trail === 0) samples = samples.slice(-1);
        else if (keep) samples = samples.slice(keep);
        if (samples.length > MAX_SEGMENTS + 1) samples = samples.slice(-(MAX_SEGMENTS + 1));
        drawTrail(samples);
      }
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

async function animateLetter(letter, token) {
  const fraction = TRAIL_FRACTION[S.trail];
  for (const d of LETTER_PATHS[letter] || []) {
    if (token !== S.token) return false;
    const path = createPath(d);
    const length = path.getTotalLength();
    const isDot = length < 0.5;                       // the dot of an i or j
    const duration = isDot
      ? DOT_HOLD_MS
      : Math.max(MIN_STROKE_MS, (length / (UNITS_PER_SECOND * S.speed)) * 1000);
    await runStroke(path, length, duration, fraction, token);
    path.remove();
  }
  return token === S.token;
}

/* ---- Round flow ------------------------------------------------------- */

function makeSequence() {
  const pool = [...S.selected];
  if (!pool.length) return [];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(S.count, pool.length));
}

function setButtons({ play, reveal, next }) {
  playBtn.disabled = !play;
  revealBtn.disabled = !reveal;
  nextBtn.disabled = !next;
}

function setPlayLabel(replay) {
  playBtn.innerHTML = `${icon(replay ? 'arrow-counter-clockwise' : 'play')}${replay ? 'Replay' : 'Play'}`;
}

function renderSequence() {
  const wrap = $('sequence');
  wrap.innerHTML = '';
  sequence.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = `seq-dot${i === index ? ' active' : i < index ? ' done' : ''}`;
    wrap.append(dot);
  });
}

function hideAnswer() {
  answerEl.classList.remove('show');
  answerLetter.textContent = '';
}

function showAnswer() {
  answerLetter.textContent = sequence.join('');
  fitAnswer();
  answerEl.classList.remove('show');
  void answerEl.offsetWidth;          // restart the bloom animation
  answerEl.classList.add('show');
}

function fitAnswer() {
  if (!answerLetter.textContent) return;
  let size = Math.min(58 * window.innerHeight / 100, 460);
  answerLetter.style.fontSize = `${size}px`;
  const maxWidth = Math.max(120, stageMain.clientWidth || 900) - 36;
  let guard = 0;
  while (answerLetter.scrollWidth > maxWidth && size > 40 && guard++ < 30) {
    size *= 0.9;
    answerLetter.style.fontSize = `${size}px`;
  }
}

function setupSequence() {
  S.token += 1;                       // cancels any animation still running
  clearTrail();
  hideAnswer();
  S.revealed = false;
  S.played = false;
  S.guesses = [];
  index = -1;                         // no letter in progress yet
  setPlayLabel(false);
  setButtons({ play: true, reveal: false, next: false });
  renderSequence();
  renderGuess();
}

async function animate() {
  if (S.playing || !sequence.length) return;
  S.playing = true;
  S.revealed = false;
  S.played = false;
  S.guesses = [];
  S.token += 1;
  const token = S.token;
  index = -1;
  clearTrail();
  hideAnswer();
  setButtons({ play: false, reveal: false, next: false });
  renderSequence();
  renderGuess();

  for (let i = 0; i < sequence.length; i += 1) {
    if (token !== S.token) return;
    index = i;
    renderSequence();
    clearTrail();
    if (!(await animateLetter(sequence[i], token))) return;
    if (i < sequence.length - 1) await sleep(LETTER_GAP_MS);
  }
  if (token !== S.token) return;

  S.playing = false;
  S.played = true;
  index = sequence.length;            // every pip is done
  setButtons({ play: true, reveal: true, next: true });
  setPlayLabel(true);
  renderSequence();
  renderGuess();
}

/* Ends the round: shows the answer and locks the guess. */
function showResult() {
  S.revealed = true;
  clearTrail();
  showAnswer();
  setButtons({ play: true, reveal: false, next: true });
  renderGuess();
}

function reveal() {
  if (S.playing || S.revealed) return;
  showResult();
}

function checkGuess() {
  if (!canGuess() || S.guesses.length !== sequence.length) return;
  showResult();
}

function next() {
  if (S.playing) return;
  sequence = makeSequence();
  setupSequence();
}

function startTrail() {
  if (!S.selected.size) return;
  sequence = makeSequence();
  settingsScreen.hidden = true;
  playScreen.hidden = false;          // show first so the stage can be measured
  setupSequence();
}

function showSettings() {
  S.token += 1;
  S.playing = false;
  playScreen.hidden = true;
  settingsScreen.hidden = false;
  clearTrail();
  hideAnswer();
  S.revealed = false;
  S.played = false;
  S.guesses = [];
  setButtons({ play: true, reveal: false, next: false });
  renderGuess();
}

/* ---- Guessing: tap a letter on (numbered by position), tap again to remove */

const canGuess = () => S.played && !S.playing && !S.revealed;

function toggleGuess(ch) {
  if (!canGuess()) return;
  const at = S.guesses.indexOf(ch);
  if (at >= 0) S.guesses.splice(at, 1);
  else if (S.guesses.length < sequence.length) S.guesses.push(ch);
  else return;
  renderGuess();
}

function renderGuessGrid() {
  const grid = $('guessGrid');
  grid.innerHTML = '';
  letters.forEach(ch => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'guess-letter';
    button.dataset.char = ch;
    button.textContent = ch;
    button.addEventListener('click', () => toggleGuess(ch));
    grid.append(button);
  });
  renderGuess();
}

function renderGuess() {
  const open = canGuess();
  const full = S.guesses.length >= sequence.length;
  $('guessGrid').querySelectorAll('.guess-letter').forEach(button => {
    const at = S.guesses.indexOf(button.dataset.char);
    const on = at >= 0;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
    button.disabled = !open || (full && !on);
    let order = button.querySelector('.order');
    if (on) {
      if (!order) {
        order = document.createElement('span');
        order.className = 'order';
        button.append(order);
      }
      order.textContent = at + 1;
    } else if (order) {
      order.remove();
    }
  });
  $('guessCount').textContent = sequence.length ? `${S.guesses.length} of ${sequence.length}` : '';
  checkBtn.disabled = !(open && full && sequence.length > 0);
}

/* ---- Settings --------------------------------------------------------- */

function setActive(id, value) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('active', b.dataset.v === String(value)));
}

function bindGroup(id, onPick) {
  document.querySelectorAll(`#${id} button`).forEach(button => {
    button.addEventListener('click', () => { if (!button.disabled) onPick(button.dataset.v); });
  });
}

function renderPool() {
  const pool = $('pool');
  pool.innerHTML = '';
  letters.forEach(ch => {
    const button = document.createElement('button');
    const on = S.selected.has(ch);
    button.type = 'button';
    button.className = `pool-chip${on ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(on));
    button.textContent = ch;
    button.addEventListener('click', () => {
      if (S.selected.has(ch)) {
        if (S.selected.size === 1) return;           // keep at least one letter
        S.selected.delete(ch);
      } else {
        S.selected.add(ch);
      }
      renderPool();
      syncSettings();
    });
    pool.append(button);
  });
}

/* Sequence sizes above the pool size are switched off; Start needs at least one letter. */
function syncSettings() {
  const max = S.selected.size;
  document.querySelectorAll('#count button').forEach(button => {
    const v = Number(button.dataset.v);
    button.disabled = v > max;
    if (v > max) button.classList.remove('active');
  });
  if (S.count > max) {
    S.count = Math.max(1, max);
    setActive('count', S.count);
  }
  startBtn.disabled = max === 0;
}

function applyCaseShift() {
  stageShift.setAttribute('transform', S.caseMode === 'lowercase' ? `translate(0 ${-LOWERCASE_LIFT})` : '');
}

function setLetterCase(value) {
  S.caseMode = value;
  applyCaseShift();
  letters = value === 'lowercase' ? LOWER : UPPER;
  S.selected = new Set(letters);
  renderPool();
  renderGuessGrid();
  syncSettings();
}

bindGroup('speed', v => { S.speed = Number(v); setActive('speed', v); });
bindGroup('trail', v => { S.trail = Number(v); setActive('trail', v); });
bindGroup('case', v => { setActive('case', v); setLetterCase(v); });
bindGroup('count', v => { S.count = Number(v); setActive('count', v); });
$('selectAll').addEventListener('click', () => { S.selected = new Set(letters); renderPool(); syncSettings(); });
$('clearAll').addEventListener('click', () => { S.selected.clear(); renderPool(); syncSettings(); });

startBtn.addEventListener('click', startTrail);
playBtn.addEventListener('click', animate);
revealBtn.addEventListener('click', reveal);
nextBtn.addEventListener('click', next);
checkBtn.addEventListener('click', checkGuess);
$('settingsBtn').addEventListener('click', showSettings);

// Keep the revealed letters fitted when the stage changes size (rotation, fullscreen).
new ResizeObserver(() => { if (S.revealed) fitAnswer(); }).observe(stageMain);

initViewport();
initFullscreen($('settingsFullscreen'));
initFullscreen($('playFullscreen'));
hydrateIcons();
setPlayLabel(false);
renderPool();
renderGuessGrid();
syncSettings();
