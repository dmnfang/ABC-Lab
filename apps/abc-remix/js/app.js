import { ALPHABET, originalSequence, randomSequence } from "./sequences.js";
import { SONGS } from "./songs.js";
import { PlaybackEngine } from "./playback.js";
import { renderSongPreview, renderCustomEditor, renderGameChunk, renderEasyChunk, renderEasyChunkPreview, highlightEasyChunkLetter, revealChunkLetter, renderLyricScreen, revealLyricWord, renderMixedScreen, revealMixedEvent } from "./ui.js";

const state = {
  songKey: "standard",
  mode: "original",
  speed: 1.00,
  loops: 1,
  difficulty: "easy",
  randomSequence: randomSequence(),
  customSequence: Array(26).fill(null),
  originalReversed: false
};

const $ = selector => document.querySelector(selector);
const icon = (name, size = 18) => {
  const paths = {
    shuffle: '<path d="M3 6h2.5a4 4 0 0 1 3.2 1.6l6.6 8.8A4 4 0 0 0 18.5 18H21"/><path d="m19 15 2 3-2 3"/><path d="M3 18h2.5a4 4 0 0 0 3.2-1.6l1.1-1.5"/><path d="M16.5 6H18.5A4 4 0 0 1 21 7"/><path d="m19 4 2 3-2 3"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'
  };
  return `<svg class="lucide-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
};
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

const speedOptions = [0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00];
const loopOptions = [1, 2, 3, 4, 5];
let midiData = null;
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
    button.className = `speed-pill${value === state.speed ? " active" : ""}`;
    button.textContent = formatSpeed(value);
    button.addEventListener("click", () => {
      state.speed = value;
      $("#speedValue").textContent = formatSpeed(value);
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
    button.className = `pill${value === state.loops ? " active" : ""}`;
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
}

function updatePreviewInfo() {
  const song = currentSong();
  const text = `${song.name} × ${modeLabel()} × ${state.difficulty[0].toUpperCase() + state.difficulty.slice(1)} × ${formatSpeed(state.speed)} Speed × ${state.loops} ${state.loops === 1 ? "Loop" : "Loops"}`;
  const description = state.mode === "original"
    ? (state.originalReversed ? "The alphabet will be played in reverse order." : "The original alphabet order will be used.")
    : state.mode === "random"
      ? "The order of letters are randomized."
      : "Tap letters from the bottom to customize your alphabet order.";

  previewInfo.innerHTML = "";
  const summary = document.createElement("div");
  summary.className = "preview-summary";

  const copy = document.createElement("div");
  copy.className = "preview-summary-copy";
  const strong = document.createElement("strong");
  strong.textContent = text;
  const span = document.createElement("span");
  span.textContent = description;
  copy.append(strong, span);
  summary.appendChild(copy);

  if (state.mode === "original") {
    const reverse = document.createElement("button");
    reverse.type = "button";
    reverse.className = `preview-action reverse-button${state.originalReversed ? " active" : ""}`;
    reverse.textContent = "Reverse";
    reverse.setAttribute("aria-pressed", String(state.originalReversed));
    reverse.addEventListener("click", () => {
      state.originalReversed = !state.originalReversed;
      renderModeContent();
    });
    summary.appendChild(reverse);
  } else if (state.mode === "random") {
    const shuffle = document.createElement("button");
    shuffle.type = "button";
    shuffle.className = "preview-action shuffle-button";
    shuffle.textContent = "Shuffle";
    shuffle.addEventListener("click", freshRandom);
    summary.appendChild(shuffle);
  } else if (state.mode === "custom") {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "preview-action reset-button";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      state.customSequence = Array(26).fill(null);
      renderModeContent();
    });
    summary.appendChild(reset);
  }

  previewInfo.appendChild(summary);
}

function renderModeContent() {
  modeContent.innerHTML = "";
  updatePreviewInfo();
  const song = currentSong();

  if (state.mode === "original") {
    const sequence = state.originalReversed ? [...ALPHABET].reverse() : ALPHABET;
    renderSongPreview(modeContent, sequence, song, true);
    launchButton.disabled = false;
    return;
  }

  if (state.mode === "random") {
    const board = document.createElement("div");
    board.className = "preview-board random-board";
    renderSongPreview(board, state.randomSequence, song, true);
    modeContent.appendChild(board);
    launchButton.disabled = false;
    return;
  }

  renderCustomEditor(modeContent, state.customSequence, song, {
    onTopLetter: index => {
      state.customSequence[index] = null;
      renderModeContent();
    },
    onTrayLetter: letter => {
      if (state.customSequence.includes(letter)) return;
      const emptyIndex = state.customSequence.findIndex(item => item === null);
      if (emptyIndex === -1) return;
      state.customSequence[emptyIndex] = letter;
      renderModeContent();
    },
    onReset: () => {
      state.customSequence = Array(26).fill(null);
      renderModeContent();
    }
  });
  launchButton.disabled = state.customSequence.every(letter => !letter);
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
    dot.className = "progress-dot";
    dot.dataset.chunk = String(index);
    progressDots.appendChild(dot);
  });
}

function renderCountIn(event) {
  if (!countInStage) return;
  if (event.type === "clear") {
    countInStage.innerHTML = "";
    countInStage.classList.remove("visible");
    return;
  }
  if (event.type === "gap") {
    // The previous loop's final lyric/chunk must be removed before the pause
    // dots appear. countInStage is layered over the game body, so leaving the
    // old content mounted makes the dots visually overlap it.
    activeChunk = -1;
    activeRow = null;
    activeLyricRow = null;
    activeMixedRow = null;
    activeEasyBoard = null;
    easyPreviewScreen = -1;
    chunkStage.innerHTML = "";
    if (easyPreviewStage) {
      easyPreviewStage.innerHTML = "";
      easyPreviewStage.classList.remove("has-preview");
    }
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
  row.className = `count-in-row ${event.type === "sequence" ? "count-in-sequence" : "count-in-single"}`;
  event.values.forEach((value, index) => {
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
  if (state.mode === "original") gameSequence = state.originalReversed ? [...ALPHABET].reverse() : originalSequence();
  else if (state.mode === "random") gameSequence = [...state.randomSequence];
  else gameSequence = [...state.customSequence];
  if (state.mode === "custom" && state.customSequence.some(letter => !letter)) return;

  activeChunk = -1;
  activeRow = null;
  activeLyricRow = null;
  activeMixedRow = null;
  activeEasyBoard = null;
  easyPreviewScreen = -1;
  chunkStage.innerHTML = "";
  if (easyPreviewStage) {
    easyPreviewStage.innerHTML = "";
    easyPreviewStage.classList.remove("has-preview");
  }
  if (countInStage) countInStage.innerHTML = "";
  const badge = $("#loopBadge");
  if (badge) badge.textContent = `Loop 1 of ${state.loops}`;
  pauseButton.disabled = false;
  buildProgressDots();
  $("#gameTitle").textContent = `${currentSong().name} × ${modeLabel()}`;
  settingsScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  playback.load({ alphabetSequence: gameSequence, songKey: state.songKey, speed: state.speed, loops: state.loops, midiData: midiData?.[state.songKey] ?? null });
  playback.play();
}

function resetGameVisuals() {
  activeChunk = -1;
  activeRow = null;
  activeLyricRow = null;
  activeMixedRow = null;
  activeEasyBoard = null;
  easyPreviewScreen = -1;
  chunkStage.innerHTML = "";
  if (easyPreviewStage) {
    easyPreviewStage.innerHTML = "";
    easyPreviewStage.classList.remove("has-preview");
  }
  if (countInStage) countInStage.innerHTML = "";
  buildProgressDots();
}

function returnToSettings() {
  playback.stop();
  gameScreen.classList.add("hidden");
  settingsScreen.classList.remove("hidden");
  if (document.fullscreenElement) document.exitFullscreen?.();
}

async function toggleFullscreen(target = gameScreen) {
  try {
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.();
    } else if (document.fullscreenElement === target) {
      await document.exitFullscreen?.();
    } else {
      await document.exitFullscreen?.();
      await target.requestFullscreen?.();
    }
  } catch (error) {
    console.warn("Fullscreen toggle failed", error);
  }
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
  if (state.difficulty !== "easy" || !gameScreen || gameScreen.classList.contains("hidden")) return;
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
  if (easyPreviewStage) {
    easyPreviewStage.innerHTML = "";
    easyPreviewStage.classList.add("has-preview");
    renderEasyChunkPreview(easyPreviewStage, labels);
  }
  easyPreviewScreen = nextScreen;
}

const playback = new PlaybackEngine({
  onSlot: ({ index, display, event, song }) => {
    const screenIndex = event.screen;
    const screenEvents = song.events.filter(item => item.screen === screenIndex);
    const lyricOnly = screenEvents.every(item => item.type === "lyric");

    if (screenIndex !== activeChunk) {
      activeChunk = screenIndex;
      if (easyPreviewStage) {
        easyPreviewStage.innerHTML = "";
        easyPreviewStage.classList.remove("has-preview");
      }
      easyPreviewScreen = -1;
      activeRow = null;
      activeLyricRow = null;
      activeMixedRow = null;
      const hasLetters = screenEvents.some(item => item.type === "letter");
      const hasLyrics = screenEvents.some(item => item.type === "lyric");
      if (hasLetters && hasLyrics) {
        const mixedEvents = screenEvents.map(item => ({ ...item, _index: song.events.indexOf(item) }));
        activeEasyBoard = null;
        activeMixedRow = renderMixedScreen(chunkStage, mixedEvents, gameSequence, state.difficulty === "easy");
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
        activeEasyBoard = renderEasyChunk(chunkStage, labels);
      } else {
        const chunk = song.chunks[screenIndex];
        activeRow = renderGameChunk(chunkStage, chunk.length, false);
      }
      document.querySelectorAll(".progress-dot").forEach(dot => dot.classList.remove("active", "done"));
      document.querySelector(`.progress-dot[data-chunk="${screenIndex}"]`)?.classList.add("active");
      document.querySelectorAll(".progress-dot").forEach(dot => {
        if (Number(dot.dataset.chunk) < screenIndex) dot.classList.add("done");
      });
    }

    if (activeMixedRow) {
      const mixedEvents = screenEvents;
      const position = mixedEvents.indexOf(event);
      revealMixedEvent(activeMixedRow, position, event, gameSequence, state.difficulty === "easy");
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
      revealChunkLetter(activeRow, position, display, event.type);
    }
  },
  onCountIn: renderCountIn,
  onTimeline: positionBeat => maybeShowEasyLookahead(positionBeat),
  onState: stateName => {
    const playIcon = pauseButton.querySelector(".play-icon");
    const pauseIcon = pauseButton.querySelector(".pause-icon");
    const playing = stateName === "playing";
    const finished = stateName === "finished";
    if (stateName === "loop-start" || stateName === "ready") {
      activeChunk = -1;
      activeRow = null;
      activeLyricRow = null;
      activeEasyBoard = null;
      easyPreviewScreen = -1;
      chunkStage.innerHTML = "";
      if (easyPreviewStage) {
        easyPreviewStage.innerHTML = "";
        easyPreviewStage.classList.remove("has-preview");
      }
      if (countInStage) countInStage.innerHTML = "";
    }
    pauseButton.disabled = finished;
    playIcon.classList.toggle("hidden", playing);
    pauseIcon.classList.toggle("hidden", !playing);
    pauseButton.setAttribute("aria-label", playing ? "Pause" : finished ? "Finished" : "Play");
    pauseButton.title = playing ? "Pause" : finished ? "Use Replay to start again" : "Play";
    const badge = $("#loopBadge");
    if (badge) {
      if (stateName === "gap") badge.textContent = "4 second pause";
      else if (stateName === "finished") badge.textContent = "Finished";
      else badge.textContent = `Loop ${Math.max(1, playback.loopNumber)} of ${playback.loops}`;
    }
  }
});

$("#songVersionButtons").addEventListener("click", event => {
  const button = event.target.closest("[data-song]");
  if (!button) return;
  state.songKey = button.dataset.song;
  updateButtons();
  renderModeContent();
});

$("#modeButtons").addEventListener("click", event => {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  if (button.dataset.mode === "random") {
    state.mode = "random";
    state.randomSequence = randomSequence();
  } else {
    state.mode = button.dataset.mode;
  }
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
$("#gameFullscreen").addEventListener("click", () => toggleFullscreen(gameScreen));
$("#settingsFullscreen").addEventListener("click", () => toggleFullscreen(settingsScreen));

document.addEventListener("fullscreenchange", () => {
  const fullscreen = Boolean(document.fullscreenElement);
  document.body.classList.toggle("presentation", fullscreen);
});

Promise.all([
  fetch("./data/standard.json").then(r => r.json()),
  fetch("./data/lmno.json").then(r => r.json())
]).then(([standardMidi, lmnoMidi]) => {
  midiData = { standard: standardMidi, lmno: lmnoMidi };
}).catch(() => {
  midiData = null;
});

$("#speedValue").textContent = formatSpeed(state.speed);
buildSpeedButtons();
buildLoopButtons();
updateButtons();
renderModeContent();
