/* jumble.js: ABC Jumble game logic.
   Gameplay: a jumble of letters appears, students guess which letters are in it
   by tapping letters on the alphabet, then Submit reveals the answer. */
import { initViewport, initFullscreen, hydrateIcons } from '../../assets/js/shared.js';

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const MAX_GUESSES = 8;          // no jumble has more than 8 letters
const MAX_SPREAD = 10;          // spread stepper runs 0..10 (shown as %)
const SPREAD_PER_STEP = 0.01;   // each step opens the ring by 1% of its radius
const REVEAL_STAGGER_MS = 180;  // delay between letters flying out on reveal

/* What the teacher picks on the settings screen. */
const settings = {
  caseMode: 'upper',                    // 'upper' | 'lower'
  style: 'solid',                       // 'solid' | 'low' (low opacity)
  color: 'grape',                       // coral | grape | leaf | sky | bubblegum
  allowedCounts: new Set([3, 4, 5, 6]),
  questionLimit: null,                  // null = keep going until the teacher leaves
};

/* The puzzle currently on screen. */
const state = {
  caseMode: 'upper',
  spread: 0,
  letters: [],
  selected: new Set(),
  revealed: false,
  currentQuestion: 1,
};

let revealTimers = [];

const $ = id => document.getElementById(id);
const settingsScreen = $('settingsScreen');
const playScreen = $('playScreen');
const collage = $('collage');
const alphabetEl = $('alphabet');
const resultEl = $('headerResult');
const submitBtn = $('submit');
const nextBtn = $('next');
const spreadDown = $('spreadDown');
const spreadUp = $('spreadUp');
const spreadValue = $('spreadValue');

/* ---- Helpers ---------------------------------------------------------- */

const alphabetFor = mode => (mode === 'lower' ? ALPHABET.map(c => c.toLowerCase()) : ALPHABET);

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function limitReached() {
  return settings.questionLimit !== null && state.currentQuestion >= settings.questionLimit;
}

function clearRevealTimers() {
  revealTimers.forEach(clearTimeout);
  revealTimers = [];
}

/* ---- Puzzle ----------------------------------------------------------- */

function makePuzzle() {
  clearRevealTimers();
  const counts = [...settings.allowedCounts];
  const count = counts[Math.floor(Math.random() * counts.length)];

  state.caseMode = settings.caseMode;
  collage.dataset.style = settings.style;
  collage.dataset.color = settings.color;
  state.spread = 0;
  state.revealed = false;
  state.selected = new Set();
  state.letters = shuffled(alphabetFor(state.caseMode)).slice(0, count);
  updateSpreadUI();

  resultEl.textContent = 'Which letters?';
  submitBtn.hidden = false;
  nextBtn.hidden = true;
  nextBtn.textContent = 'Next Jumble';

  renderAlphabet();
  renderCollage();
}

/* Size and radius come from the real canvas so any screen shape works. */
function getRevealGeometry() {
  const w = collage.clientWidth;
  const h = collage.clientHeight;
  const d = Math.max(1, Math.min(w, h));
  const n = Math.max(1, state.letters.length);
  const margin = Math.max(12, Math.min(28, d * 0.035));
  const halfAngle = Math.PI / n;
  const fitSize = (d - 2 * margin) * Math.sin(halfAngle) / (1 + Math.sin(halfAngle));
  const maxSize = Math.min(520, d * 0.58);
  // Scale the ring-fit size up slightly while leaving every letter distinguishable.
  const size = Math.max(96, Math.min(maxSize, fitSize * 1.05));
  const radius = Math.max(0, d / 2 - size / 2 - margin);
  return { w, h, size, radius };
}

function angleFor(index, total) {
  return -Math.PI / 2 + index * (Math.PI * 2 / total);
}

function renderCollage() {
  collage.innerHTML = '';
  const n = state.letters.length;
  const { w, h, size, radius } = getRevealGeometry();
  // Every puzzle size starts from the same small ring around the centre.
  const startRadius = radius * 0.28;
  const shownRadius = state.revealed
    ? radius
    : startRadius + state.spread * SPREAD_PER_STEP * radius;

  state.letters.forEach((char, i) => {
    const el = document.createElement('div');
    el.className = 'letter';
    el.textContent = char;
    el.style.setProperty('--letter-size', `${size}px`);
    el.style.setProperty('--letter-font', `${Math.round(size * 0.92)}px`);

    const angle = angleFor(i, n);
    el.style.left = `${w / 2 + Math.cos(angle) * shownRadius}px`;
    el.style.top = `${h / 2 + Math.sin(angle) * shownRadius}px`;
    collage.appendChild(el);
  });
}

/* ---- Guessing: tap a letter on, tap it again to turn it off ------------ */

function toggleGuess(char) {
  if (state.revealed) return;
  if (state.selected.has(char)) {
    state.selected.delete(char);
  } else if (state.selected.size < MAX_GUESSES) {
    state.selected.add(char);
  } else {
    return;
  }
  syncAlphabet();
}

/* Dark chip = guessed. When 8 are guessed, the rest switch off until one is removed. */
function syncAlphabet() {
  const full = state.selected.size >= MAX_GUESSES;
  alphabetEl.querySelectorAll('.letter-btn').forEach(button => {
    const on = state.selected.has(button.dataset.char);
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
    button.disabled = full && !on;
  });
}

function renderAlphabet() {
  alphabetEl.innerHTML = '';
  alphabetFor(state.caseMode).forEach(char => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter-btn';
    button.dataset.char = char;
    button.textContent = char;
    button.addEventListener('click', () => toggleGuess(char));
    alphabetEl.appendChild(button);
  });
  syncAlphabet();
}

/* ---- Reveal and next -------------------------------------------------- */

function reveal() {
  if (state.revealed) return;
  state.revealed = true;
  submitBtn.hidden = true;

  const total = state.letters.length;
  const found = state.letters.filter(x => state.selected.has(x)).length;
  const strong = document.createElement('strong');
  strong.textContent = `There were ${total} letters`;
  resultEl.replaceChildren(strong, ` · You found ${found}/${total}`);

  const { w, h, radius } = getRevealGeometry();
  [...collage.children].forEach((el, i) => {
    const angle = angleFor(i, total);
    revealTimers.push(setTimeout(() => {
      el.style.left = `${w / 2 + Math.cos(angle) * radius}px`;
      el.style.top = `${h / 2 + Math.sin(angle) * radius}px`;
    }, i * REVEAL_STAGGER_MS));
  });

  nextBtn.textContent = limitReached() ? 'Finish' : 'Next Jumble';
  nextBtn.hidden = false;
}

function nextPuzzle() {
  if (limitReached()) {
    showSettings();
    return;
  }
  state.currentQuestion += 1;
  makePuzzle();
}

/* ---- Screens and settings --------------------------------------------- */

function showSettings() {
  clearRevealTimers();
  playScreen.hidden = true;
  settingsScreen.hidden = false;
  syncSettingsUI();
}

function startQuiz() {
  state.currentQuestion = 1;
  settingsScreen.hidden = true;
  playScreen.hidden = false;   // show first so the canvas can be measured
  makePuzzle();
}

function syncSettingsUI() {
  document.querySelectorAll('[data-setting-case]').forEach(button => {
    button.classList.toggle('active', button.dataset.settingCase === settings.caseMode);
  });
  document.querySelectorAll('[data-count]').forEach(button => {
    button.classList.toggle('active', settings.allowedCounts.has(Number(button.dataset.count)));
  });
  document.querySelectorAll('[data-setting-style]').forEach(button => {
    button.classList.toggle('active', button.dataset.settingStyle === settings.style);
  });
  document.querySelectorAll('[data-setting-color]').forEach(button => {
    const on = button.dataset.settingColor === settings.color;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  });
}

function updateSpreadUI() {
  spreadValue.textContent = `${state.spread}%`;
  spreadDown.disabled = state.spread <= 0;
  spreadUp.disabled = state.spread >= MAX_SPREAD;
}

function changeSpread(delta) {
  const next = state.spread + delta;
  if (next < 0 || next > MAX_SPREAD) return;
  state.spread = next;
  updateSpreadUI();
  renderCollage();
}

/* ---- Wiring ----------------------------------------------------------- */

// The size buttons are in index.html; here we only make them work.
document.querySelectorAll('[data-count]').forEach(button => {
  const n = Number(button.dataset.count);
  button.addEventListener('click', () => {
    if (settings.allowedCounts.has(n)) {
      if (settings.allowedCounts.size === 1) return;   // always keep at least one size
      settings.allowedCounts.delete(n);
    } else {
      settings.allowedCounts.add(n);
    }
    syncSettingsUI();
  });
});

document.querySelectorAll('[data-setting-case]').forEach(button => {
  button.addEventListener('click', () => {
    settings.caseMode = button.dataset.settingCase;
    syncSettingsUI();
  });
});

document.querySelectorAll('[data-setting-style]').forEach(button => {
  button.addEventListener('click', () => {
    settings.style = button.dataset.settingStyle;
    syncSettingsUI();
  });
});

document.querySelectorAll('[data-setting-color]').forEach(button => {
  button.addEventListener('click', () => {
    settings.color = button.dataset.settingColor;
    syncSettingsUI();
  });
});

spreadDown.addEventListener('click', () => changeSpread(-1));
spreadUp.addEventListener('click', () => changeSpread(1));
$('settingsButton').addEventListener('click', showSettings);
$('startQuiz').addEventListener('click', startQuiz);
submitBtn.addEventListener('click', reveal);
nextBtn.addEventListener('click', nextPuzzle);

// Re-fit the letters whenever the canvas changes size (rotation, fullscreen, resize).
new ResizeObserver(() => {
  if (!playScreen.hidden && state.letters.length) renderCollage();
}).observe(collage);

initViewport();
initFullscreen($('settingsFullscreen'));
initFullscreen($('playFullscreen'));
hydrateIcons();
syncSettingsUI();
updateSpreadUI();
