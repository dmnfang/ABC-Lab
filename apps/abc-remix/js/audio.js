let audioContext = null;
const activeNodes = new Set();

function getContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function trackNode(node) {
  activeNodes.add(node);
  node.addEventListener?.("ended", () => activeNodes.delete(node));
  return node;
}

export function stopAllAudio() {
  for (const node of activeNodes) {
    try { node.stop(); } catch {}
  }
  activeNodes.clear();
}

function tone({ frequency, duration, when, velocity = 0.5, type = "triangle" }) {
  const ctx = getContext();
  const osc = trackNode(ctx.createOscillator());
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity * 0.12), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.05, duration * 0.9));
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration);
}

function noise(duration, when, velocity = 0.4) {
  const ctx = getContext();
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = trackNode(ctx.createBufferSource());
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "highpass";
  filter.frequency.value = 3500;
  gain.gain.setValueAtTime(velocity * 0.07, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(when);
  source.stop(when + duration);
}

function midiFreq(note) { return 440 * Math.pow(2, (note - 69) / 12); }

// Renders the supplied MIDI's three musical tracks using Web Audio:
// melody, bass, and the existing kick/snare/hat MIDI pattern.
// The MIDI itself remains the source of timing; these are just browser-safe voices.
export async function playMidiNote({ songKey, beat, speed }) {
  // Audio is scheduled by app startup in scheduleSongAudio. This function is
  // intentionally retained as the visual event hook for future per-event cues.
  getContext();
}

export function scheduleSongAudio(midiData, speed, startAt = null, fromBeat = 0) {
  const ctx = getContext();
  const origin = startAt ?? (ctx.currentTime + 0.03);
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
}
