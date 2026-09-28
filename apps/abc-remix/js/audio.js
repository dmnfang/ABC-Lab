/* ABC Remix audio engine
 * Web Audio playback for the supplied MIDI-derived note data.
 * Designed to be safe on iPad/Safari: the context is created/resumed from
 * the user-triggered Launch action and visual timing uses output timestamps.
 */

let audioContext = null;
let masterGain = null;

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

  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

function scheduleNoise(ctx, when, duration, volume) {
  if (!masterGain) return;

  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
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

  gain.gain.setValueAtTime(Math.max(0.001, volume), when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);

  source.start(when);
  source.stop(when + duration + 0.01);
}

function getOutputTimestamp() {
  const ctx = getAudioContext();

  if (typeof ctx.getOutputTimestamp === "function") {
    const timestamp = ctx.getOutputTimestamp();
    if (
      timestamp &&
      Number.isFinite(timestamp.contextTime) &&
      Number.isFinite(timestamp.performanceTime)
    ) {
      return timestamp;
    }
  }

  return {
    contextTime: ctx.currentTime,
    performanceTime: performance.now()
  };
}

export async function scheduleSongAudio(midiData, speed, startAt = null, fromBeat = 0) {
  const ctx = await ensureRunning();
  const origin = startAt ?? (ctx.currentTime + 0.12);
  const beatSeconds = 60 / midiData.tempo / speed;
  const tracks = midiData.tracks || [];

  const scheduleTrackNote = (note, start, duration, velocity, voice) => {
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
      scheduleTone(ctx, 75, when, Math.min(seconds, 0.16), "sine", volume * 1.35);
    } else if (note === 40) {
      scheduleNoise(ctx, when, Math.min(seconds, 0.12), volume * 0.8);
    } else if (note === 54) {
      scheduleNoise(ctx, when, Math.min(seconds, 0.055), volume * 0.55);
    }
  };

  const [melody, bass, drums] = tracks;

  melody?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "melody"));
  bass?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "bass"));
  drums?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "drums"));

  const timestamp = getOutputTimestamp();
  const performanceStart =
    timestamp.performanceTime +
    (origin - timestamp.contextTime) * 1000;

  return {
    contextStart: origin,
    performanceStart
  };
}

export async function playMidiNote() {
  await ensureRunning();
}

export function stopAllAudio() {
  if (!audioContext) return;

  try {
    audioContext.close();
  } catch (error) {
    console.warn("Unable to close audio context:", error);
  }

  audioContext = null;
  masterGain = null;
}
