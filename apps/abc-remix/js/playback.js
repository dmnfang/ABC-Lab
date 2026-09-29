/* ABC Remix playback timing */

import { SONGS } from "./songs.js";
import { scheduleSongAudio, stopAllAudio } from "./audio.js";

const COUNT_IN_BEATS = 9;
const GAP_MS = 4000;

export class PlaybackEngine {
  constructor({ onSlot, onCountIn, onTimeline, onState, onFinish } = {}) {
    this.onSlot = onSlot;
    this.onCountIn = onCountIn;
    this.onTimeline = onTimeline;
    this.onState = onState;
    this.onFinish = onFinish;

    this.alphabetSequence = [];
    this.songKey = "standard";
    this.speed = 1;
    this.loops = 1;
    this.midiData = null;

    this.playing = false;
    this.paused = false;
    this.inGap = false;
    this.gapRemainingMs = 0;
    this.gapStartedAt = 0;

    this.loopNumber = 0;
    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.countKey = "";
    this.phaseStartedAt = 0;
    this.loopTimer = null;
    this.rafId = null;

    // Every new load/stop gets a new session. Async audio setup from an
    // older session is then unable to restart playback in the new session.
    this.sessionId = 0;

    this.tick = this.tick.bind(this);
  }

  load({ alphabetSequence, songKey, speed, loops, midiData }) {
    this.stop();
    this.sessionId += 1;
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

  setSpeed(speed) {
    this.speed = speed;
  }

  currentEvent() {
    return SONGS[this.songKey].events[this.index];
  }

  beatMs() {
    return 60000 / SONGS[this.songKey].tempo / this.speed;
  }

  async play() {
    if (!this.alphabetSequence.length || this.playing) return;

    const session = this.sessionId;

    if (this.inGap) {
      this.playing = true;
      this.paused = false;
      this.onState?.("playing");

      const remaining = Math.max(0, this.gapRemainingMs);
      this.gapStartedAt = performance.now();
      clearTimeout(this.loopTimer);

      this.loopTimer = setTimeout(() => {
        if (!this.playing || this.sessionId !== session) return;
        this.inGap = false;
        this.gapRemainingMs = 0;
        this.loopNumber += 1;
        this.startLoop(session);
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

      if (!this.playing || this.sessionId !== session) return;

      this.phaseStartedAt = audio?.performanceStart ?? performance.now();
      this.renderTimelineState();
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    this.playing = true;
    if (this.loopNumber === 0) this.loopNumber = 1;
    this.onState?.("playing");
    await this.startLoop(session);
  }

  async startLoop(session = this.sessionId) {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.loopTimer);
    this.loopTimer = null;
    stopAllAudio();

    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.inGap = false;
    this.gapRemainingMs = 0;

    const audio = this.midiData
      ? await scheduleSongAudio(this.midiData, this.speed)
      : null;

    // The user may have returned to settings or launched a new session while
    // the audio context was being prepared. Never let the old run continue.
    if (!this.playing || this.sessionId !== session) return;

    this.phaseStartedAt = audio?.performanceStart ?? performance.now();
    this.countKey = "";
    this.onState?.("loop-start");
    this.renderTimelineState();
    this.rafId = requestAnimationFrame(this.tick);
  }

  tick(now) {
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
  }

  renderTimelineState() {
    this.onTimeline?.(this.positionBeat, SONGS[this.songKey]);

    let key = "clear";
    let payload = { type: "clear", values: [] };

    if (this.positionBeat < COUNT_IN_BEATS) {
      if (this.positionBeat >= 8) key = "seq-4";
      else if (this.positionBeat >= 7) key = "seq-3";
      else if (this.positionBeat >= 6) key = "seq-2";
      else if (this.positionBeat >= 5) key = "seq-1";
      else if (this.positionBeat >= 2) key = "single-2";
      else key = "single-1";

      const valuesByKey = {
        "single-1": ["1"],
        "single-2": ["2"],
        "seq-1": ["1"],
        "seq-2": ["1", "2"],
        "seq-3": ["1", "2", "3"],
        "seq-4": ["1", "2", "3", "4"]
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

    while (
      this.eventCursor < song.events.length &&
      song.events[this.eventCursor].startBeat <= beat
    ) {
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
    this.countKey = "";
    this.onCountIn?.({ type: "clear", values: [] });
    this.onState?.("ready");
  }

  stop() {
    this.sessionId += 1;
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
    this.countKey = "";
    this.onCountIn?.({ type: "clear", values: [] });
  }

  finishLoop() {
    stopAllAudio();
    cancelAnimationFrame(this.rafId);
    this.rafId = null;

    if (this.loopNumber >= this.loops) {
      this.playing = false;
      this.paused = false;
      this.inGap = false;
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

    const session = this.sessionId;
    this.loopTimer = setTimeout(() => {
      if (!this.playing || this.sessionId !== session) return;
      this.loopNumber += 1;
      this.inGap = false;
      this.gapRemainingMs = 0;
      this.startLoop(session);
    }, GAP_MS);
  }

  currentDisplay() {
    const event = this.currentEvent();
    if (!event) return "";
    return event.type === "letter"
      ? (this.alphabetSequence[event.letterIndex] ?? "")
      : event.display;
  }

  emitCurrentSlot() {
    const event = this.currentEvent();
    const song = SONGS[this.songKey];
    const display = this.currentDisplay();
    this.onSlot?.({
      index: this.index,
      event,
      display,
      song,
      loop: this.loopNumber
    });
  }
}
