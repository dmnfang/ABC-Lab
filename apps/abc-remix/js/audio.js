/* ABC Remix audio engine */

let audioContext = null;
let masterGain = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx({
      latencyHint: "interactive"
    });

    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(audioContext.destination);
  }

  return audioContext;
}

async function ensureAudioReady() {
  const ctx = getAudioContext();

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  return ctx;
}

function getOutputClockTime() {
  const ctx = getAudioContext();

  if (
    typeof ctx.getOutputTimestamp === "function"
  ) {
    const timestamp = ctx.getOutputTimestamp();

    if (
      timestamp &&
      Number.isFinite(timestamp.contextTime) &&
      Number.isFinite(timestamp.performanceTime)
    ) {
      return {
        contextTime: timestamp.contextTime,
        performanceTime: timestamp.performanceTime
      };
    }
  }

  return {
    contextTime: ctx.currentTime,
    performanceTime: performance.now()
  };
}

function scheduleTone(
  frequency,
  startTime,
  duration,
  type = "sine",
  volume = 0.12
) {
  const ctx = getAudioContext();

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(
    volume,
    startTime + 0.008
  );
  gain.gain.setValueAtTime(
    volume,
    Math.max(startTime + 0.008, startTime + duration - 0.02)
  );
  gain.gain.linearRampToValueAtTime(
    0,
    startTime + duration
  );

  oscillator.connect(gain);
  gain.connect(masterGain);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.01);

  return oscillator;
}

async function scheduleSongNotes(notes, startDelay = 0) {
  const ctx = await ensureAudioReady();

  const clock = getOutputClockTime();

  const nowPerformance = performance.now();
  const nowContext = ctx.currentTime;

  const outputPerformance = clock.performanceTime;
  const outputContext = clock.contextTime;

  const performanceOffset =
    outputPerformance - nowPerformance;

  const contextOffset =
    outputContext - nowContext;

  const synchronizedNow =
    ctx.currentTime + contextOffset;

  const startTime =
    synchronizedNow + startDelay;

  for (const note of notes) {
    scheduleTone(
      note.frequency,
      startTime + note.start,
      note.duration,
      note.type || "sine",
      note.volume ?? 0.12
    );
  }

  return {
    startTime,
    performanceStart:
      performance.now() +
      performanceOffset +
      startDelay * 1000
  };
}

function stopAllAudio() {
  if (!audioContext) return;

  try {
    audioContext.close();
  } catch (error) {
    console.warn("Unable to close audio context:", error);
  }

  audioContext = null;
  masterGain = null;
}
