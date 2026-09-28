/* ABC Remix playback timing */

let playbackTimer = null;
let playbackAnimationFrame = null;

let playbackStartedAt = 0;
let playbackDuration = 0;

let playbackRunning = false;
let playbackPaused = false;

let playbackAudioStart = 0;
let playbackPerformanceStart = 0;

function cancelPlaybackTimers() {
  if (playbackTimer !== null) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }

<<<<<<< HEAD
  if (playbackAnimationFrame !== null) {
    cancelAnimationFrame(playbackAnimationFrame);
    playbackAnimationFrame = null;
=======
  load({ alphabetSequence, songKey, speed, loops, midiData }) {
    this.stop();
    this.alphabetSequence = [...alphabetSequence];
    this.songKey = songKey;
    this.speed = speed;
    this.loops = loops;
    this.midiData = midiData ?? null;
    this.countKey = "";
    this.loopNumber = 0;
    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.onState?.("ready");
  }

  setSpeed(speed) { this.speed = speed; }
  currentEvent() { return SONGS[this.songKey].events[this.index]; }
  beatMs() { return 60000 / SONGS[this.songKey].tempo / this.speed; }

  async play() {
    if (!this.alphabetSequence.length || this.playing) return;
    if (this.inGap) {
      this.playing = true;
      this.paused = false;
      this.onState?.("playing");
      const remaining = this.gapRemainingMs;
      this.gapStartedAt = performance.now();
      clearTimeout(this.loopTimer);
      this.loopTimer = setTimeout(() => {
        if (!this.playing) return;
        this.inGap = false;
        this.gapRemainingMs = 0;
        this.loopNumber += 1;
        this.startLoop();
      }, remaining);
      return;
    }

    if (this.paused) {
      this.paused = false;
      this.playing = true;
      this.onState?.("playing");
      const audio = this.midiData
        ? await scheduleSongAudio(this.midiData, this.speed, null, this.positionBeat)
        : null;
      this.phaseStartedAt = audio?.performanceStart ?? performance.now();
      this.renderTimelineState();
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.playing = true;
    if (this.loopNumber === 0) this.loopNumber = 1;
    this.onState?.("playing");
    await this.startLoop();
  }

  async startLoop() {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.loopTimer);
    stopAllAudio();
    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.inGap = false;
    this.gapRemainingMs = 0;

    const audio = this.midiData
      ? await scheduleSongAudio(this.midiData, this.speed)
      : null;

    if (!this.playing) return;

    this.phaseStartedAt = audio?.performanceStart ?? performance.now();
    this.countKey = "single-1";
    this.onState?.("loop-start");
    this.onCountIn?.({ type: "single", values: ["1"], beat: 0, animateFrom: 0 });
    this.onState?.("playing");
    this.rafId = requestAnimationFrame(this.tick);
  }

  tick = (now) => {
    if (!this.playing || this.inGap) return;
    const elapsedMs = now - this.phaseStartedAt;
    this.positionBeat = Math.max(0, elapsedMs / this.beatMs());

    if (this.positionBeat >= SONGS[this.songKey].durationBeats) {
      this.positionBeat = SONGS[this.songKey].durationBeats;
      this.processEventsUpTo(this.positionBeat);
      this.finishLoop();
      return;
    }

    this.renderTimelineState();
    this.processEventsUpTo(this.positionBeat);
    this.rafId = requestAnimationFrame(this.tick);
  };

  renderTimelineState() {
    this.onTimeline?.(this.positionBeat, SONGS[this.songKey]);
    let key = "clear";
    let payload = { type: "clear", values: [] };
    if (this.positionBeat < COUNT_IN_BEATS) {
      if (this.positionBeat >= 7) key = "seq-4";
      else if (this.positionBeat >= 6) key = "seq-3";
      else if (this.positionBeat >= 5) key = "seq-2";
      else if (this.positionBeat >= 4) key = "seq-1";
      else if (this.positionBeat >= 2) key = "single-2";
      else key = "single-1";
      const valuesByKey = {
        "single-1": ["1"], "single-2": ["2"], "seq-1": ["1"],
        "seq-2": ["1", "2"], "seq-3": ["1", "2", "3"], "seq-4": ["1", "2", "3", "4"]
      };
      payload = {
        type: key.startsWith("seq") ? "sequence" : "single",
        values: valuesByKey[key],
        beat: key.startsWith("seq") ? 4 : key === "single-2" ? 2 : 0,
        animateFrom: key.startsWith("seq") ? Number(key.split("-")[1]) - 1 : 0
      };
    }
    if (key !== this.countKey) {
      this.countKey = key;
      this.onCountIn?.(payload);
    }
  }

  processEventsUpTo(beat) {
    const song = SONGS[this.songKey];
    while (this.eventCursor < song.events.length && song.events[this.eventCursor].startBeat <= beat) {
      const event = song.events[this.eventCursor];
      this.index = this.eventCursor;
      this.emitCurrentSlot();
      this.eventCursor += 1;
    }
  }

  pause() {
    if (!this.playing) return;
    if (this.inGap) {
      const elapsed = performance.now() - this.gapStartedAt;
      this.gapRemainingMs = Math.max(0, this.gapRemainingMs - elapsed);
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
      this.playing = false;
      this.paused = true;
      this.onState?.("paused");
      return;
    }
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    stopAllAudio();
    this.playing = false;
    this.paused = true;
    this.onState?.("paused");
  }

  restart() {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.loopTimer);
    stopAllAudio();
    this.rafId = null;
    this.loopTimer = null;
    this.playing = false;
    this.paused = false;
    this.inGap = false;
    this.gapRemainingMs = 0;
    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.loopNumber = 0;
    this.onCountIn?.({ type: "clear", values: [] });
    this.onState?.("ready");
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.loopTimer);
    stopAllAudio();
    this.rafId = null;
    this.loopTimer = null;
    this.playing = false;
    this.paused = false;
    this.inGap = false;
    this.gapRemainingMs = 0;
    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.onCountIn?.({ type: "clear", values: [] });
  }

  finishLoop() {
    stopAllAudio();
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.loopNumber >= this.loops) {
      this.playing = false;
      this.paused = false;
      this.onState?.("finished");
      this.onFinish?.();
      return;
    }
    this.inGap = true;
    this.gapRemainingMs = GAP_MS;
    this.gapStartedAt = performance.now();
    this.playing = true;
    this.onCountIn?.({ type: "gap" });
    this.onState?.("gap");
    this.loopTimer = setTimeout(() => {
      if (!this.playing) return;
      this.loopNumber += 1;
      this.inGap = false;
      this.gapRemainingMs = 0;
      this.startLoop();
    }, GAP_MS);
  }

  currentDisplay() {
    const event = this.currentEvent();
    if (!event) return "";
    return event.type === "letter" ? (this.alphabetSequence[event.letterIndex] ?? "") : event.display;
  }

  emitCurrentSlot() {
    const event = this.currentEvent();
    const song = SONGS[this.songKey];
    const display = this.currentDisplay();
    this.onSlot?.({ index: this.index, event, display, song, loop: this.loopNumber });
>>>>>>> 2b05729 (new)
  }
}

function resetPlaybackClock() {
  playbackStartedAt = 0;
  playbackDuration = 0;

  playbackAudioStart = 0;
  playbackPerformanceStart = 0;

  playbackRunning = false;
  playbackPaused = false;
}

async function startPlayback(notes, options = {}) {
  cancelPlaybackTimers();

  resetPlaybackClock();

  const {
    startDelay = 0,
    onStart = null,
    onProgress = null,
    onComplete = null
  } = options;

  const scheduleResult =
    await scheduleSongNotes(notes, startDelay);

  playbackAudioStart =
    scheduleResult.startTime;

  playbackPerformanceStart =
    scheduleResult.performanceStart;

  playbackDuration =
    notes.reduce(
      (max, note) =>
        Math.max(
          max,
          note.start + note.duration
        ),
      0
    ) * 1000;

  playbackStartedAt =
    playbackPerformanceStart;

  playbackRunning = true;
  playbackPaused = false;

  if (typeof onStart === "function") {
    onStart();
  }

  function tick() {
    if (!playbackRunning) return;

    const now = performance.now();

    const elapsed =
      now - playbackPerformanceStart;

    const progress =
      playbackDuration > 0
        ? Math.max(
            0,
            Math.min(
              1,
              elapsed / playbackDuration
            )
          )
        : 1;

    if (typeof onProgress === "function") {
      onProgress(progress, elapsed);
    }

    if (progress >= 1) {
      playbackRunning = false;
      playbackAnimationFrame = null;

      if (typeof onComplete === "function") {
        onComplete();
      }

      return;
    }

    playbackAnimationFrame =
      requestAnimationFrame(tick);
  }

  playbackAnimationFrame =
    requestAnimationFrame(tick);

  return scheduleResult;
}

function pausePlayback() {
  if (!playbackRunning) return;

  playbackRunning = false;
  playbackPaused = true;

  cancelPlaybackTimers();
}

function resumePlayback(notes, options = {}) {
  if (!playbackPaused) {
    return startPlayback(notes, options);
  }

  playbackPaused = false;

  return startPlayback(notes, options);
}

function stopPlayback() {
  cancelPlaybackTimers();
  resetPlaybackClock();
  stopAllAudio();
}

function isPlaybackRunning() {
  return playbackRunning;
}

function isPlaybackPaused() {
  return playbackPaused;
}

function getPlaybackElapsed() {
  if (!playbackRunning && !playbackPaused) {
    return 0;
  }

  return Math.max(
    0,
    performance.now() -
      playbackPerformanceStart
  );
}

function getPlaybackProgress() {
  if (playbackDuration <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      getPlaybackElapsed() /
        playbackDuration
    )
  );
}
