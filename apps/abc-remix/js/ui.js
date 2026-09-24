import { ALPHABET } from "./sequences.js";

function displayLetter(letter, letterCase = "uppercase") {
  if (!letter) return "";
  return letterCase === "lowercase" ? letter.toLowerCase() : letter.toUpperCase();
}

export function createWoodBlock(label, className = "") {
  const block = document.createElement("button");
  block.type = "button";
  block.className = `wood-block ${className}`.trim();
  block.textContent = label;
  block.dataset.letter = label;
  return block;
}

function createSlot({ label = null, className = "", onClick = null, title = "" } = {}) {
  const slot = document.createElement("div");
  slot.className = `song-slot ${className}`.trim();
  if (title) slot.title = title;
  if (label !== null) {
    slot.classList.add("filled");
    const block = createWoodBlock(label);
    if (onClick) block.addEventListener("click", onClick);
    slot.appendChild(block);
  }
  return slot;
}

function eventLabel(event, sequence, letterCase = "uppercase") {
  if (event.type === "letter") return displayLetter(sequence[event.letterIndex] ?? "", letterCase);
  return event.display;
}

export function renderSongPreview(container, sequence, song, compact = true, letterCase = "uppercase") {
  container.innerHTML = "";
  const layout = document.createElement("div");
  layout.className = `song-layout ${compact ? "compact" : ""}`;

  // The settings preview is intentionally alphabet-only. Build rows from chunks
  // that actually contain letters so lyric-only gameplay screens never create
  // empty rows or push the LMNOP preview out of view.
  const letterChunks = song.chunks
    .map((chunk, chunkIndex) => ({ chunk, chunkIndex }))
    .filter(({ chunk }) => chunk.some(eventIndex => song.events[eventIndex].type === "letter"));

  for (let i = 0; i < letterChunks.length; i += 2) {
    const row = document.createElement("div");
    row.className = "song-row preview-song-row";

    [letterChunks[i], letterChunks[i + 1]].forEach(item => {
      if (!item) return;
      const groupEl = document.createElement("div");
      groupEl.className = "song-group";
      item.chunk.forEach(eventIndex => {
        const event = song.events[eventIndex];
        if (event.type !== "letter") return;
        groupEl.appendChild(createSlot({
          label: eventLabel(event, sequence, letterCase),
          className: ""
        }));
      });
      if (groupEl.children.length) row.appendChild(groupEl);
    });

    layout.appendChild(row);
  }
  container.appendChild(layout);
}
export function renderCustomEditor(container, sequence, song, { onTopLetter, onTrayLetter, letterCase = "uppercase" }) {
  container.innerHTML = "";
  const editor = document.createElement("div");
  editor.className = "custom-editor";

  const songArea = document.createElement("div");
  songArea.className = "custom-song-area";
  const layout = document.createElement("div");
  layout.className = "song-layout custom-layout";

  // Build the custom editor from the same authoritative chunk list used by
  // the song preview. Keep the row grouping from song.rows, but normalize the
  // small array wrappers used by the row metadata so empty dashed slots are
  // always rendered even when the custom sequence is completely blank.
  song.rows.forEach(rowChunks => {
    const row = document.createElement("div");
    row.className = "song-row";
    rowChunks.forEach(chunkRef => {
      const chunkIndex = Array.isArray(chunkRef) ? chunkRef[0] : chunkRef;
      const chunk = song.chunks[chunkIndex] ?? [];
      const groupEl = document.createElement("div");
      groupEl.className = "song-group";
      chunk.forEach(eventIndex => {
        const event = song.events[eventIndex];
        if (event.type === "lyric") return;

        const letterValue = sequence[event.letterIndex];
        const slot = createSlot({
          label: displayLetter(letterValue, letterCase),
          className: "custom-slot",
          title: letterValue ? `Return ${letterValue} to the letter bank` : "Empty song position"
        });
        if (letterValue) {
          slot.querySelector(".wood-block").addEventListener("click", () => onTopLetter(event.letterIndex));
        }
        groupEl.appendChild(slot);
      });
      row.appendChild(groupEl);
    });
    layout.appendChild(row);
  });
  songArea.appendChild(layout);

  const divider = document.createElement("div");
  divider.className = "custom-divider";

  const tray = document.createElement("div");
  tray.className = "letter-tray";
  ALPHABET.forEach(letter => {
    const used = sequence.includes(letter);
    const cell = document.createElement("div");
    cell.className = `tray-cell${used ? " used" : ""}`;
    if (used) {
      cell.setAttribute("aria-hidden", "true");
    } else {
      const block = createWoodBlock(displayLetter(letter, letterCase), "tray-block");
      block.title = `Add ${displayLetter(letter, letterCase)}`;
      block.addEventListener("click", () => onTrayLetter(letter));
      cell.appendChild(block);
    }
    tray.appendChild(cell);
  });

  editor.append(songArea, divider, tray);
  container.appendChild(editor);
}

export function renderGameChunk(container, chunkLength, lyricChunk = false) {
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = `chunk-row${lyricChunk ? " lyric-chunk-row" : ""}`;
  row.style.setProperty("--chunk-count", chunkLength);
  for (let i = 0; i < chunkLength; i += 1) {
    const slot = document.createElement("div");
    slot.className = "chunk-slot";
    row.appendChild(slot);
  }
  container.appendChild(row);
  return row;
}

export function renderLyricScreen(container, words, screenIndex = null, songKey = "standard") {
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = `lyric-row lyric-count-${words.length}`;
  row.style.setProperty("--lyric-count", String(words.length));
  if (screenIndex != null) row.dataset.screen = String(screenIndex);
  row.dataset.song = songKey;
  words.forEach((word, index) => {
    const slot = document.createElement("div");
    slot.className = "lyric-word";
    slot.dataset.wordIndex = String(index);
    slot.dataset.completeWord = word;

    // Reserve the final word width without rendering the complete word.
    // The old approach hid the slot's text and then appended the live
    // fragments, which caused a second ABCs to remain underneath the reveal.
    const ghost = document.createElement("span");
    ghost.className = "lyric-ghost";
    ghost.textContent = word;
    const live = document.createElement("span");
    live.className = "lyric-live";
    slot.style.width = `${Math.max(1, word.length)}ch`;
    slot.style.minWidth = `${Math.max(1, word.length)}ch`;
    slot.append(ghost, live);
    row.appendChild(slot);
  });
  container.appendChild(row);
  return row;
}

export function revealLyricWord(row, position, fragment, completeWord = fragment, append = false) {
  const slot = row?.querySelector(`[data-word-index="${position}"]`);
  if (!slot) return;

  slot.style.visibility = "visible";
  const live = slot.querySelector(".lyric-live");
  if (!live) return;
  if (append) {
    const part = document.createElement("span");
    part.className = "lyric-part lyric-pop";
    part.textContent = fragment;
    live.appendChild(part);
  } else {
    live.textContent = fragment;
    live.classList.remove("lyric-pop");
    void live.offsetWidth;
    live.classList.add("lyric-pop");
  }
  slot.dataset.completeWord = completeWord;
}



export function renderMixedScreen(container, events, sequence, easy = false, letterCase = "uppercase") {
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = "mixed-song-row";
  row.dataset.count = String(events.length);

  events.forEach((event, position) => {
    const slot = document.createElement("div");
    slot.className = `mixed-song-slot mixed-position-${position}`;
    slot.dataset.position = String(position);
    slot.dataset.eventType = event.type;
    slot.dataset.eventIndex = String(event._index ?? "");

    if (event.type === "letter") {
      const label = displayLetter(sequence[event.letterIndex] ?? "", letterCase);
      const block = createWoodBlock(label);
      if (!easy) block.style.visibility = "hidden";
      slot.appendChild(block);
    } else {
      const text = document.createElement("div");
      text.className = "mixed-lyric-text mixed-inline-lyric";
      text.textContent = event.display;
      text.style.visibility = "hidden";
      slot.appendChild(text);
    }
    row.appendChild(slot);
  });

  container.appendChild(row);
  return row;
}

export function revealMixedEvent(row, position, event, sequence, easy = false, letterCase = "uppercase") {
  const slot = row?.querySelector(`[data-position="${position}"]`);
  if (!slot) return;

  if (event.type === "letter") {
    const block = slot.querySelector(".wood-block");
    if (!block) return;
    block.style.visibility = "visible";
    slot.classList.add("called");
    block.classList.remove("letter-jiggle");
    void block.offsetWidth;
    block.classList.add("letter-jiggle");
  } else {
    const text = slot.querySelector(".mixed-inline-lyric");
    if (!text) return;
    text.style.visibility = "visible";
    text.classList.remove("lyric-pop");
    void text.offsetWidth;
    text.classList.add("lyric-pop");
  }
}

export function renderEasyChunk(container, labels, letterCase = "uppercase") {
  container.innerHTML = "";
  const row = document.createElement("div");
  row.className = "chunk-row easy-chunk-row";
  row.style.setProperty("--chunk-count", String(labels.length));
  labels.forEach((label, index) => {
    const slot = document.createElement("div");
    slot.className = "chunk-slot easy-chunk-slot";
    slot.dataset.position = String(index);
    const block = createWoodBlock(displayLetter(label, letterCase));
    // Easy mode reveals the whole chunk quietly. Movement is reserved
    // exclusively for the letter when its musical timing is called.
    block.style.animation = "none";
    slot.appendChild(block);
    row.appendChild(slot);
  });
  container.appendChild(row);
  return row;
}

export function renderEasyChunkPreview(container, labels, letterCase = "uppercase") {
  const row = document.createElement("div");
  row.className = "chunk-row easy-chunk-row easy-next-preview";
  row.style.setProperty("--chunk-count", String(labels.length));
  labels.forEach((label, index) => {
    const slot = document.createElement("div");
    slot.className = "chunk-slot easy-chunk-slot";
    slot.dataset.position = String(index);
    const block = createWoodBlock(displayLetter(label, letterCase));
    block.style.animation = "none";
    slot.appendChild(block);
    row.appendChild(slot);
  });
  container.appendChild(row);
  return row;
}

export function highlightEasyChunkLetter(row, position) {
  const slots = [...(row?.querySelectorAll(".chunk-slot") ?? [])];
  slots.forEach((slot, index) => {
    slot.classList.toggle("called", index === position);
    slot.querySelector(".wood-block")?.classList.toggle("letter-jiggle", index === position);
  });
  const block = slots[position]?.querySelector(".wood-block");
  if (!block) return;
  block.classList.remove("letter-jiggle");
  void block.offsetWidth;
  block.classList.add("letter-jiggle");
}

// Kept for compatibility with older callers.
export function renderEasyLetterBoard(container, sequence) {
  return renderEasyChunk(container, sequence);
}

export function jiggleEasyLetter(board, position) {
  highlightEasyChunkLetter(board, position);
}

export function revealChunkLetter(row, position, label, type = "letter", letterCase = "uppercase") {
  const slots = [...row.querySelectorAll(".chunk-slot")];
  const slot = slots[position];
  if (!slot) return;
  slot.innerHTML = "";
  slot.classList.add("active", "current");
  if (type === "lyric") {
    const text = document.createElement("div");
    text.className = "mixed-lyric-text";
    text.textContent = label;
    slot.appendChild(text);
  } else {
    slot.appendChild(createWoodBlock(displayLetter(label, letterCase)));
  }
  slots.forEach((item, i) => { if (i !== position) item.classList.remove("current"); });
}
