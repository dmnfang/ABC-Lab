import { ALPHABET, originalSequence, randomSequence } from "./sequences.js";
import { SONGS } from "./songs.js";
import { PlaybackEngine } from "./playback.js";
import { initViewport, initFullscreen, hydrateIcons } from "../../../assets/js/shared.js";
import { icon } from "../../../assets/js/icons.js";
import { renderSongPreview, renderGameChunk, renderEasyChunk, renderEasyChunkPreview, highlightEasyChunkLetter, revealChunkLetter, renderLyricScreen, revealLyricWord, renderMixedScreen, revealMixedEvent } from "./ui.js";

const state = {
  songKey: "standard",
  mode: "original",
  speed: 1.00,
  loops: 1,
  difficulty: "easy",
  letterCase: "uppercase",
  randomSequence: randomSequence(),
  clapLetters: new Set(),
  originalReversed: false
};

const $ = selector => document.querySelector(selector);
const settingsScreen = $("#settingsScreen");
const gameScreen = $("#gameScreen");
const modeContent = $("#modeContent");
const previewInfo = $("#previewInfo");
const launchButton = $("#launchButton");
const chunkStage = $("#chunkStage");
const progressDots = $("#progressDots");
const easyPreviewStage = $("#easyPreviewStage");
const countInStage = $("#countInStage");
const pauseButton = $("#pauseButton");
const difficultyButtons = $("#difficultyButtons");
const letterCaseButtons = $("#letterCaseButtons");

const speedOptions = [0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00];
const loopOptions = [1, 2, 3, 4, 5];
let midiData = null;
let midiReady = false;
let gameSequence = [];
let activeChunk = -1;
let activeRow = null;
let activeLyricRow = null;
let activeMixedRow = null;
let activeEasyBoard = null;
let easyPreviewScreen = -1;

function formatSpeed(value) { return Number(value).toFixed(2); }
function modeLabel() { return state.mode[0].toUpperCase() + state.mode.slice(1); }
function currentSong() { return SONGS[state.songKey]; }

function buildSpeedButtons() {
  const wrap = $("#speedButtons");
  wrap.innerHTML = "";
  speedOptions.forEach(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `toggle-pill${value === state.speed ? " active" : ""}`;
    button.textContent = formatSpeed(value);
    button.addEventListener("click", () => {
      state.speed = value;
      buildSpeedButtons();
      playback.setSpeed(value);
      renderModeContent();
    });
    wrap.appendChild(button);
  });
}

function buildLoopButtons() {
  const wrap = $("#loopButtons");
  wrap.innerHTML = "";
  loopOptions.forEach(value => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `toggle-pill-circle${value === state.loops ? " active" : ""}`;
    button.textContent = String(value);
    button.addEventListener("click", () => {
      state.loops = value;
      buildLoopButtons();
      renderModeContent();
    });
    wrap.appendChild(button);
  });
}

function updateButtons() {
  document.querySelectorAll("[data-song]").forEach(button => button.classList.toggle("active", button.dataset.song === state.songKey));
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === state.mode));
  document.querySelectorAll("[data-difficulty]").forEach(button => button.classList.toggle("active", button.dataset.difficulty === state.difficulty));
  document.querySelectorAll("[data-case]").forEach(button => button.classList.toggle("active", button.dataset.case === state.letterCase));
}

function updatePreviewInfo() {
  const song = currentSong();
  const caseLabel = state.letterCase === "lowercase" ? "lowercase" : "UPPERCASE";
  const text = `${song.name} × ${modeLabel()} × ${caseLabel} × ${state.difficulty[0].toUpperCase() + state.difficulty.slice(1)} × ${formatSpeed(state.speed)} Speed × ${state.loops} ${state.loops === 1 ? "Loop" : "Loops"}`;
  const description = state.mode === "original"
    ? (state.originalReversed ? "The alphabet will be played in reverse order." : "The original alphabet order will be used.")
    : "The order of letters is randomized.";
  const previewInstruction = "Tap any letter in the preview to toggle a clap cue.";

  previewInfo.innerHTML = "";
  const summary = document.createElement("div");
  summary.className = "preview-summary";

  const copy = document.createElement("div");
  copy.className = "preview-summary-copy";
  const strong = document.createElement("strong");
  strong.textContent = text;
  const span = document.createElement("span");
  span.textContent = `${description} ${previewInstruction}`;
  copy.append(strong, span);
  summary.appendChild(copy);

  if (state.mode === "original") {
    const reverse = document.createElement("button");
    reverse.type = "button";
    reverse.className = `preview-action${state.originalReversed ? " active" : ""}`;
    reverse.innerHTML = `${icon("arrow-counter-clockwise")}Reverse`;
    reverse.setAttribute("aria-pressed", String(state.originalReversed));
    reverse.addEventListener("click", () => {
      state.originalReversed = !state.originalReversed;
      renderModeContent();
    });
    summary.appendChild(reverse);
  } else if (state.mode === "random") {
    const shuffle = document.createElement("button");
    shuffle.type = "button";
    shuffle.className = "preview-action";
    shuffle.innerHTML = `${icon("shuffle")}Shuffle`;
    shuffle.addEventListener("click", freshRandom);
    summary.appendChild(shuffle);
  }

  previewInfo.appendChild(summary);
}

function renderModeContent() {
  modeContent.innerHTML = "";
  updatePreviewInfo();
  const song = currentSong();

  if (state.mode === "original") {
    const sequence = state.originalReversed ? [...ALPHABET].reverse() : ALPHABET;
    renderSongPreview(modeContent, sequence, song, true, state.letterCase, { clapLetters: state.clapLetters, onToggleClap: toggleClapLetter });
    launchButton.disabled = false;
    return;
  }

  if (state.mode === "random") {
    const board = document.createElement("div");
    board.className = "preview-board random-board";
    renderSongPreview(board, state.randomSequence, song, true, state.letterCase, { clapLetters: state.clapLetters, onToggleClap: toggleClapLetter });
    modeContent.appendChild(board);
    launchButton.disabled = false;
    return;
  }

  launchButton.disabled = !midiReady;
}

function toggleClapLetter(letter) {
  if (!letter) return;
  if (state.clapLetters.has(letter)) state.clapLetters.delete(letter);
  else state.clapLetters.add(letter);
  renderModeContent();
}

function freshRandom() {
  state.randomSequence = randomSequence();
  renderModeContent();
}

function buildProgressDots() {
  progressDots.innerHTML = "";
  const song = currentSong();
  song.chunks.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = "seq-dot";
    dot.dataset.chunk = String(index);
    progressDots.appendChild(dot);
  });
}

// Pips: coming up = sand, current screen = outline, earlier screens = solid. `null` clears them.
function setProgress(screenIndex) {
  document.querySelectorAll("#progressDots .seq-dot").forEach(dot => {
    const at = Number(dot.dataset.chunk);
    dot.classList.toggle("active", screenIndex !== null && at === screenIndex);
    dot.classList.toggle("done", screenIndex === "all" || (typeof screenIndex === "number" && at < screenIndex));
  });
}

// One place that empties the stage; the same few lines used to be pasted in five spots.
function resetStage({ keepCountIn = false } = {}) {
  activeChunk = -1;
  activeRow = null;
  activeLyricRow = null;
  activeMixedRow = null;
  activeEasyBoard = null;
  easyPreviewScreen = -1;
  chunkStage.innerHTML = "";
  easyPreviewStage.innerHTML = "";
  easyPreviewStage.classList.remove("has-preview");
  if (!keepCountIn) countInStage.innerHTML = "";
}

function renderCountIn(event) {
  if (!countInStage) return;
  if (event.type === "clear") {
    countInStage.innerHTML = "";
    countInStage.classList.remove("visible");
    return;
  }
  if (event.type === "gap") {
    // The previous loop's last screen must go before the pause dots appear.
    resetStage({ keepCountIn: true });
    setProgress("all");
    countInStage.innerHTML = "";
    const dots = document.createElement("div");
    dots.className = "loop-gap-dots";
    for (let i = 0; i < 4; i += 1) {
      const dot = document.createElement("span");
      dot.className = "loop-gap-dot";
      dots.appendChild(dot);
    }
    countInStage.appendChild(dots);
    countInStage.classList.add("visible");
    return;
  }
  countInStage.innerHTML = "";
  const row = document.createElement("div");
  const isCountdown = event.type === "countdown";
  row.className = `count-in-row ${isCountdown ? "count-in-countdown" : event.type === "sequence" ? "count-in-sequence" : "count-in-single"}`;

  const values = isCountdown ? [event.value] : (event.values ?? []);
  values.forEach((value, index) => {
    const text = document.createElement("div");
    text.className = "count-word";
    text.textContent = value;
    row.appendChild(text);
    if (index >= (event.animateFrom ?? 0)) {
      requestAnimationFrame(() => {
        text.classList.remove("count-pop");
        void text.offsetWidth;
        text.classList.add("count-pop");
      });
    } else {
      text.classList.add("count-pop");
      text.style.animation = "none";
      text.style.opacity = "1";
      text.style.transform = "translateY(0) scale(1)";
    }
  });
  countInStage.appendChild(row);
  countInStage.classList.add("visible");
}

function launchGame() {
  // Never start the visual clock without the MIDI that supplies its audio clock.
  if (!midiReady || !midiData?.[state.songKey]) return;
  const letterSequence = state.mode === "original"
    ? (state.originalReversed ? [...ALPHABET].reverse() : originalSequence())
    : [...state.randomSequence];
  gameSequence = letterSequence.map(letter => state.clapLetters.has(letter) ? "👏" : letter);

  resetStage();
  updateLoopBadge(1);
  pauseButton.disabled = false;
  buildProgressDots();
  settingsScreen.hidden = true;
  gameScreen.hidden = false;
  playback.load({ alphabetSequence: gameSequence, songKey: state.songKey, speed: state.speed, loops: state.loops, midiData: midiData?.[state.songKey] ?? null });

  playback.play();
}

function resetGameVisuals() {
  resetStage();
  buildProgressDots();
}

function returnToSettings() {
  playback.stop();
  gameScreen.hidden = true;
  settingsScreen.hidden = false;
}

function updateLoopBadge(loopNumber, text = null) {
  const badge = $("#loopBadge");
  badge.hidden = state.loops <= 1;
  badge.textContent = text ?? `Loop ${Math.max(1, loopNumber)} of ${state.loops}`;
}

function getLetterLabelsForScreen(song, screenIndex) {
  const chunk = song.chunks[screenIndex];
  if (!chunk) return [];
  return chunk
    .map(eventIndex => song.events[eventIndex])
    .filter(item => item?.type === "letter")
    .map(item => gameSequence[item.letterIndex] ?? "");
}

function maybeShowEasyLookahead(positionBeat) {
  if (state.difficulty !== "easy" || gameScreen.hidden) return;
  const song = currentSong();
  const currentScreen = activeChunk;
  if (currentScreen < 0) return;
  const nextScreen = currentScreen + 1;
  if (nextScreen >= song.chunks.length || easyPreviewScreen === nextScreen) return;
  const nextStart = song.screenStarts[nextScreen];
  const lookaheadBeats = 1.5;
  if (nextStart == null || positionBeat < nextStart - lookaheadBeats || positionBeat >= nextStart) return;
  const labels = getLetterLabelsForScreen(song, nextScreen);
  if (!labels.length) return;
  easyPreviewStage.innerHTML = "";
  easyPreviewStage.classList.add("has-preview");
  renderEasyChunkPreview(easyPreviewStage, labels, state.letterCase);
  easyPreviewScreen = nextScreen;
}

const playback = new PlaybackEngine({
  onSlot: ({ index, display, event, song }) => {
    const screenIndex = event.screen;
    const screenEvents = song.events.filter(item => item.screen === screenIndex);
    const lyricOnly = screenEvents.every(item => item.type === "lyric");

    if (screenIndex !== activeChunk) {
      activeChunk = screenIndex;
      easyPreviewStage.innerHTML = "";
      easyPreviewStage.classList.remove("has-preview");
      easyPreviewScreen = -1;
      activeRow = null;
      activeLyricRow = null;
      activeMixedRow = null;
      const hasLetters = screenEvents.some(item => item.type === "letter");
      const hasLyrics = screenEvents.some(item => item.type === "lyric");
      if (hasLetters && hasLyrics) {
        const mixedEvents = screenEvents.map(item => ({ ...item, _index: song.events.indexOf(item) }));
        activeEasyBoard = null;
        activeMixedRow = renderMixedScreen(chunkStage, mixedEvents, gameSequence, state.difficulty === "easy", state.letterCase);
      } else if (lyricOnly) {
        const words = [...new Map(screenEvents.map(item => [item.wordIndex, item.word])).values()];
        activeEasyBoard = null;
        activeLyricRow = renderLyricScreen(chunkStage, words, screenIndex, state.songKey);
      } else if (state.difficulty === "easy") {
        activeLyricRow = null;
        const chunk = song.chunks[screenIndex];
        const labels = chunk
          .map(eventIndex => song.events[eventIndex])
          .filter(item => item.type === "letter")
          .map(item => gameSequence[item.letterIndex] ?? "");
        activeEasyBoard = renderEasyChunk(chunkStage, labels, state.letterCase);
      } else {
        const chunk = song.chunks[screenIndex];
        activeRow = renderGameChunk(chunkStage, chunk.length, false);
      }
      setProgress(screenIndex);
    }

    if (activeMixedRow) {
      const mixedEvents = screenEvents;
      const position = mixedEvents.indexOf(event);
      revealMixedEvent(activeMixedRow, position, event, gameSequence, state.difficulty === "easy", state.letterCase);
    } else if (event.type === "lyric" && activeLyricRow) {
      revealLyricWord(activeLyricRow, event.wordIndex, event.fragment, event.word, event.append);
    } else if (activeEasyBoard && event.type === "letter") {
      const chunk = song.chunks[screenIndex];
      // Easy mode only renders letter events. Some LMNOP screens also
      // contain lyric events (for example Y / and / Z), so the visual
      // position must be calculated from the letter-only subset rather
      // than the raw event index.
      const letterEventIndexes = chunk.filter(eventIndex => song.events[eventIndex]?.type === "letter");
      const position = letterEventIndexes.indexOf(index);
      highlightEasyChunkLetter(activeEasyBoard, position);
    } else if (activeRow) {
      const chunk = song.chunks[screenIndex];
      const position = chunk.indexOf(index);
      revealChunkLetter(activeRow, position, display, event.type, state.letterCase);
    }
  },
  onCountIn: renderCountIn,
  onTimeline: positionBeat => maybeShowEasyLookahead(positionBeat),
  onState: stateName => {
    const playing = stateName === "playing";
    const finished = stateName === "finished";
    if (stateName === "loop-start" || stateName === "ready") {
      resetStage();
      setProgress(null);
    }
    if (finished) setProgress("all");
    pauseButton.disabled = finished;
    pauseButton.innerHTML = icon(playing ? "pause" : "play");
    pauseButton.setAttribute("aria-label", playing ? "Pause" : finished ? "Finished" : "Play");
    pauseButton.title = playing ? "Pause" : finished ? "Use Restart to play again" : "Play";
    updateLoopBadge(playback.loopNumber, finished ? "Finished" : null);
  }
});

$("#songVersionButtons").addEventListener("click", event => {
  const button = event.target.closest("[data-song]");
  if (!button) return;
  state.songKey = button.dataset.song;
  updateButtons();
  renderModeContent();
});

letterCaseButtons.addEventListener("click", event => {
  const button = event.target.closest("[data-case]");
  if (!button) return;
  state.letterCase = button.dataset.case;
  updateButtons();
  renderModeContent();
});

$("#modeButtons").addEventListener("click", event => {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  state.mode = button.dataset.mode;
  if (state.mode === "random") state.randomSequence = randomSequence();
  updateButtons();
  renderModeContent();
});

difficultyButtons.addEventListener("click", event => {
  const button = event.target.closest("[data-difficulty]");
  if (!button) return;
  state.difficulty = button.dataset.difficulty;
  updateButtons();
  renderModeContent();
});

launchButton.addEventListener("click", launchGame);
$("#backButton").addEventListener("click", returnToSettings);
$("#restartButton").addEventListener("click", () => {
  resetGameVisuals();
  playback.restart();
  playback.play();
});
pauseButton.addEventListener("click", () => playback.playing ? playback.pause() : playback.play());

Promise.all([
  fetch("./data/standard.json").then(r => r.json()),
  fetch("./data/lmno.json").then(r => r.json())
]).then(([standardMidi, lmnoMidi]) => {
  midiData = { standard: standardMidi, lmno: lmnoMidi };
  midiReady = true;
  updateButtons();
}).catch(() => {
  midiData = null;
  midiReady = false;
  updateButtons();
});

initViewport();
initFullscreen($("#settingsFullscreen"));
initFullscreen($("#gameFullscreen"));
hydrateIcons();
pauseButton.innerHTML = icon("play");
buildSpeedButtons();
buildLoopButtons();
updateButtons();
renderModeContent();
