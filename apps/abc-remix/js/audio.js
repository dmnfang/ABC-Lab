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

<<<<<<< HEAD
  return audioContext;
}

async function ensureAudioReady() {
  const ctx = getAudioContext();
=======
function getContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ latencyHint: "interactive" });
  }
  return audioContext;
}

async function ensureRunning() {
  const ctx = getContext();
  if (ctx.state !== "running") await ctx.resume();
  return ctx;
}

function trackNode(node) {
  activeNodes.add(node);
  node.addEventListener?.("ended", () => activeNodes.delete(node));
  return node;
}
>>>>>>> 2b05729 (new)

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

<<<<<<< HEAD
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
=======
export async function playMidiNote({ songKey, beat, speed }) {
  await ensureRunning();
}

export async function scheduleSongAudio(midiData, speed, startAt = null, fromBeat = 0) {
  const ctx = await ensureRunning();
  const origin = startAt ?? (ctx.currentTime + 0.12);
  const beatSeconds = 60 / midiData.tempo / speed;
  const [melody, bass, drums] = midiData.tracks;

  const scheduleNote = (note, start, duration, velocity, voice) => {
    if (start + duration < fromBeat) return;
    const effectiveStart = Math.max(start, fromBeat);
    const when = origin + (effectiveStart - fromBeat) * beatSeconds;
    const dur = Math.max(0.04, (start < fromBeat ? (start + duration - fromBeat) : duration) * beatSeconds);
    if (voice === "melody") tone({ frequency: midiFreq(note), duration: dur, when, velocity: velocity / 127, type: "triangle" });
    else if (voice === "bass") tone({ frequency: midiFreq(note), duration: dur, when, velocity: velocity / 127, type: "sine" });
    else if (note === 36) tone({ frequency: 75, duration: 0.13, when, velocity: velocity / 127, type: "sine" });
    else if (note === 40) noise(0.11, when, velocity / 127);
    else if (note === 54) noise(0.055, when, velocity / 127);
  };

  melody.notes.forEach(n => scheduleNote(n.note, n.start, n.duration, n.velocity, "melody"));
  bass.notes.forEach(n => scheduleNote(n.note, n.start, n.duration, n.velocity, "bass"));
  drums.notes.forEach(n => scheduleNote(n.note, n.start, n.duration, n.velocity, "drums"));

  let performanceStart = performance.now() + (origin - ctx.currentTime) * 1000;
  if (typeof ctx.getOutputTimestamp === "function") {
    const ts = ctx.getOutputTimestamp();
    if (Number.isFinite(ts?.contextTime) && Number.isFinite(ts?.performanceTime)) {
      performanceStart = ts.performanceTime + (origin - ts.contextTime) * 1000;
    }
  }

  return { contextStart: origin, performanceStart };
>>>>>>> 2b05729 (new)
}
