/* ABC Remix audio engine
 * Web Audio playback for the supplied MIDI-derived note data.
 * Designed to be safe on iPad/Safari: the context is created/resumed from
 * the user-triggered Launch action and visual timing uses output timestamps.
 */

let audioContext = null;
let masterGain = null;
const activeSources = new Set();

// The launch countdown is a UI sequence, not part of the music.
// The actual song begins on its own MIDI timeline after the countdown.
export const COUNT_IN_CUES = [];
export const COUNT_IN_BEATS = 0;

function getAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("Web Audio is not supported in this browser.");

    audioContext = new AudioCtx({ latencyHint: "interactive" });
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

async function ensureRunning() {
  const ctx = getAudioContext();
  if (ctx.state !== "running") {
    await ctx.resume();
  }
  return ctx;
}

function midiFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function scheduleTone(ctx, frequency, when, duration, type, volume) {
  if (!masterGain) return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);

  const attack = Math.min(0.012, duration * 0.15);
  const release = Math.min(0.05, duration * 0.25);
  const sustainEnd = Math.max(when + attack, when + duration - release);

  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + attack);
  gain.gain.setValueAtTime(volume, sustainEnd);
  gain.gain.linearRampToValueAtTime(0, when + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);

  activeSources.add(oscillator);
  oscillator.addEventListener?.("ended", () => activeSources.delete(oscillator));
  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

function scheduleNoise(ctx, when, duration, volume, attack = 0.001) {
  if (!masterGain) return;

  const buffer = ctx.createBuffer(
    1,
    Math.max(1, Math.floor(ctx.sampleRate * duration)),
    ctx.sampleRate
  );
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = 1200;

  // A tiny attack followed by a fast decay gives the clap a clear
  // transient instead of a soft, smeared burst.
  const peak = Math.max(0.001, volume);
  const attackEnd = when + Math.min(attack, duration * 0.2);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, attackEnd);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  activeSources.add(source);
  source.addEventListener?.("ended", () => activeSources.delete(source));
  source.start(when);
  source.stop(when + duration + 0.01);
}

function getPerformanceTimeForContextTime(ctx, contextTime) {
  if (typeof ctx.getOutputTimestamp === "function") {
    const timestamp = ctx.getOutputTimestamp();
    if (
      timestamp &&
      Number.isFinite(timestamp.contextTime) &&
      Number.isFinite(timestamp.performanceTime)
    ) {
      return timestamp.performanceTime + (contextTime - timestamp.contextTime) * 1000;
    }
  }

  return performance.now() + (contextTime - ctx.currentTime) * 1000;
}

export async function scheduleSongAudio(midiData, speed, startAt = null, fromBeat = 0) {
  const ctx = await ensureRunning();

  // Audio is scheduled against AudioContext.currentTime. The visual clock is
  // mapped to that same audio timeline below, so replaying never creates a
  // second independent clock.
  // Give the first-run scheduler enough look-ahead to finish creating every
  // oscillator/noise node before beat zero reaches the audio output.
  // This matters especially on a freshly-created Safari/iPad context.
  const leadSeconds = 0.6;
  const nowContext = ctx.currentTime;
  const origin = startAt ?? (nowContext + leadSeconds);
  const beatSeconds = 60 / midiData.tempo / speed;
  const tracks = midiData.tracks || [];

  const scheduleTrackNote = (note, start, duration, velocity, voice) => {
    if (start < 8) return;

    // The supplied MIDI begins the alphabet on beat 8, exactly after the
    // two-measure count-in. Do not add a transition offset here.
    const end = start + duration;
    if (end <= fromBeat) return;

    const effectiveStart = Math.max(start, fromBeat);
    const effectiveDuration = Math.max(0.035, end - effectiveStart);
    const when = origin + (effectiveStart - fromBeat) * beatSeconds;
    const seconds = effectiveDuration * beatSeconds;
    const volume = Math.max(0.02, Math.min(0.22, (velocity ?? 100) / 127 * 0.14));

    if (voice === "melody") {
      scheduleTone(ctx, midiFreq(note), when, seconds, "triangle", volume);
    } else if (voice === "bass") {
      scheduleTone(ctx, midiFreq(note), when, seconds, "sine", volume * 0.72);
    } else if (note === 36) {
      // Stronger low kick for the count-in. The source timing is unchanged.
      const kickGain = start < 8 ? 1.85 : 1.35;
      scheduleTone(ctx, 75, when, Math.min(seconds, 0.16), "sine", volume * kickGain);
    } else if (note === 40) {
      // The MIDI clap is intentionally made shorter and brighter so it reads
      // as a crisp count-in clap on small speakers such as an iPad.
      const clapDuration = start < 8 ? Math.min(seconds, 0.075) : Math.min(seconds, 0.12);
      const clapGain = start < 8 ? 1.55 : 0.8;
      scheduleNoise(ctx, when, clapDuration, volume * clapGain, 0.001);
    } else if (note === 54) {
      scheduleNoise(ctx, when, Math.min(seconds, 0.055), volume * 0.55, 0.001);
    }
  };

  const [melody, bass, drums] = tracks;

  melody?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "melody"));
  bass?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "bass"));
  // The MIDI drum track is useful for the song itself, but its original
  // count-in pattern does not match the visual count-in:
  // 1 (tick), pause, 2 (tick), pause, 1, 2, 3, 4!
  //
  // Keep the song's MIDI timing untouched and build the count-in explicitly.
  // This makes the audio land on the same 8-beat structure as the UI.
  // The countdown is handled entirely by the UI. Schedule only the actual
  // song MIDI, beginning at the supplied MIDI song start (beat 8).
  drums?.notes?.forEach(n => {
    if (n.start >= 8) {
      scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "drums");
    }
  });

  // Take the performance timestamp AFTER all nodes have been created and
  // scheduled. On first launch, scheduling itself can take long enough to make
  // a timestamp captured at the top of this function stale.
  //
  // Both clocks now point at the same future AudioContext origin.
  const performanceStart = performance.now() + (origin - ctx.currentTime) * 1000;

  return {
    contextStart: origin,
    performanceStart
  };
}

export async function playMidiNote() {
  await ensureRunning();
}

export function stopAllAudio() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // The source may already have ended.
    }
    try {
      source.disconnect();
    } catch {
      // Ignore already-disconnected sources.
    }
  }
  activeSources.clear();

  // Keep the AudioContext alive. Reusing one audio clock prevents replay
  // timing from changing between launches/loops.
}
