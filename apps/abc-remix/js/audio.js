/* ABC Remix audio engine
 * Web Audio playback for the supplied MIDI-derived note data.
 * Designed to be safe on iPad/Safari: the context is created/resumed from
 * the user-triggered Launch action and visual timing uses output timestamps.
 */

let audioContext = null;
let masterGain = null;

// One authoritative count-in timeline. Both audio scheduling and the visual
// count-in use these exact beat positions.
export const COUNT_IN_CUES = [
  { beat: 0, kind: "number", value: "1" },
  { beat: 0.25, kind: "tick", owner: "1" },
  { beat: 0.5, kind: "tick", owner: "1" },

  { beat: 2, kind: "number", value: "2" },
  { beat: 2.25, kind: "tick", owner: "2" },
  { beat: 2.5, kind: "tick", owner: "2" },

  { beat: 4, kind: "number", value: "1" },
  { beat: 5, kind: "number", value: "2" },
  { beat: 6, kind: "number", value: "3" },

  { beat: 7, kind: "number", value: "4" },
  { beat: 7, kind: "tick", owner: "4" },
  { beat: 7.25, kind: "tick", owner: "4" }
]

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

  // Keep the visual clock on performance.now(). Using getOutputTimestamp()
  // here can produce a stale/offset clock on Safari/iPad after the audio
  // context has been recreated or resumed. We schedule audio from the same
  // moment we establish the visual start time.
  const leadSeconds = 0.12;
  const nowPerformance = performance.now();
  const nowContext = ctx.currentTime;
  const beatSeconds = 60 / midiData.tempo / speed;

  // Fresh AudioContexts can take a moment to wake the output device on the
  // first launch. Give the audio system one completely silent beat before the
  // actual count-in begins. The visual clock uses the same offset below.
  const prerollSeconds = beatSeconds;
  const origin = startAt ?? (nowContext + leadSeconds + prerollSeconds);
  const tracks = midiData.tracks || [];

  const scheduleTrackNote = (note, start, duration, velocity, voice) => {
    if (start < 8) return;

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
  // 1 + tick-tick, 2 + tick-tick, 1, 2, 3, 4 + tick-tick.
  //
  // Keep the song's MIDI timing untouched and build the count-in explicitly.
  // This makes the audio land on the same 8-beat structure as the UI.
  if (fromBeat < 8) {
    drums?.notes?.forEach(n => {
      if (n.start >= 8) {
        scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "drums");
      }
    });

    const countInHits = COUNT_IN_CUES;

    const hitVelocity = 112;
    countInHits.forEach(({ beat, kind }) => {
      const when = origin + (beat - fromBeat) * beatSeconds;
      const volume = Math.max(
        0.02,
        Math.min(0.22, (hitVelocity / 127) * 0.14)
      );

      if (kind === "tick") {
        // The first tick gets a stronger, slightly fuller transient so it is
        // reliably audible when Safari is starting the audio context fresh.
        const isFirstCountTick = beat === 0.25;
        scheduleTone(
          ctx,
          1800,
          when,
          Math.min(beatSeconds * (isFirstCountTick ? 0.14 : 0.08), isFirstCountTick ? 0.07 : 0.04),
          "square",
          volume * (isFirstCountTick ? 1.05 : 0.62)
        );
        if (isFirstCountTick) {
          scheduleNoise(ctx, when, Math.min(beatSeconds * 0.07, 0.035), volume * 0.32, 0.001);
        }
      } else if (kind === "number") {
        scheduleTone(ctx, 75, when, Math.min(beatSeconds * 0.14, 0.12), "sine", volume * 1.8);
      } else {
        scheduleNoise(ctx, when, Math.min(beatSeconds * 0.11, 0.075), volume * 1.55, 0.001);
      }
    });
  } else {
    drums?.notes?.forEach(n => scheduleTrackNote(n.note, n.start, n.duration, n.velocity, "drums"));
  }

  const performanceStart = startAt == null
    ? nowPerformance + (leadSeconds + prerollSeconds) * 1000
    : performance.now();

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
