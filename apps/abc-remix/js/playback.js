/* ABC Remix playback timing */

import { SONGS } from "./songs.js";
import { scheduleSongAudio, stopAllAudio } from "./audio.js";

const GAP_MS = 4000;
const COUNTDOWN_STEPS = ["3", "2", "1", "GO!"];

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
    this.countdownTimer = null;
    this.countdownToken = 0;
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

      this.phaseStartedAt = (audio?.performanceStart ?? performance.now()) - (8 * this.beatMs());
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
    clearTimeout(this.countdownTimer);
    this.loopTimer = null;
    this.countdownTimer = null;
    stopAllAudio();

    this.positionBeat = 0;
    this.eventCursor = 0;
    this.index = 0;
    this.inGap = false;
    this.gapRemainingMs = 0;

    const countdownToken = ++this.countdownToken;
    this.runCountdown(session, countdownToken);
  }

  runCountdown(session, countdownToken) {
    let index = 0;
    const startedAt = performance.now();

    this.onCountIn?.({
      type: "countdown",
      value: COUNTDOWN_STEPS[0],
      index: 0
    });

    const advance = async () => {
      if (
        !this.playing ||
        this.sessionId !== session ||
        this.countdownToken !== countdownToken
      ) return;

      index += 1;

      if (index >= COUNTDOWN_STEPS.length) {
        // Only create/schedule the music after GO has finished. This keeps the
        // countdown completely independent from the song clock.
        this.onCountIn?.({ type: "clear", values: [] });

        const audio = this.midiData
          ? await scheduleSongAudio(this.midiData, this.speed)
          : null;

        if (
          !this.playing ||
          this.sessionId !== session ||
          this.countdownToken !== countdownToken
        ) return;

        const beatMs = this.beatMs();
        this.phaseStartedAt = (audio?.performanceStart ?? performance.now()) - (8 * beatMs);
        this.onState?.("loop-start");
        this.renderTimelineState();
        this.rafId = requestAnimationFrame(this.tick);
        return;
      }

      this.onCountIn?.({
        type: "countdown",
        value: COUNTDOWN_STEPS[index],
        index
      });

      const elapsed = performance.now() - startedAt;
      const nextAt = (index + 1) * 1000;
      this.countdownTimer = setTimeout(advance, Math.max(0, nextAt - elapsed));
    };

    this.countdownTimer = setTimeout(advance, 1000);
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
    clearTimeout(this.countdownTimer);
    this.countdownToken += 1;
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
    clearTimeout(this.countdownTimer);
    this.countdownToken += 1;
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
      // A completed song is a terminal state, not a paused position. Reset the
      // playback cursor so the next Play/Launch can only begin at beat zero.
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
