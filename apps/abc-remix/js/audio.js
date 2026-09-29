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
  // Opening count: 1 + single tick, 2 + single tick.
  { beat: 0, kind: "number", value: "1" },
  { beat: 0.5, kind: "tick", owner: "1" },

  { beat: 2, kind: "number", value: "2" },
  { beat: 2.5, kind: "tick", owner: "2" },

  // Main count: each number gets a double tick.
  { beat: 4, kind: "number", value: "1" },
  { beat: 4.25, kind: "tick", owner: "1" },
  { beat: 4.5, kind: "tick", owner: "1" },

  { beat: 5, kind: "number", value: "2" },
  { beat: 5.25, kind: "tick", owner: "2" },
  { beat: 5.5, kind: "tick", owner: "2" },

  { beat: 6, kind: "number", value: "3" },
  { beat: 6.25, kind: "tick", owner: "3" },
  { beat: 6.5, kind: "tick", owner: "3" },

  { beat: 7, kind: "number", value: "4" },
  { beat: 7.25, kind: "tick", owner: "4" },
  { beat: 7.5, kind: "tick", owner: "4" }
]

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
        scheduleNoise(
          ctx,
          when,
          Math.min(beatSeconds * (isFirstCountTick ? 0.055 : 0.045), isFirstCountTick ? 0.028 : 0.022),
          volume * (isFirstCountTick ? 1.15 : 0.8),
          0.0005
        );
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
    ? nowPerformance + leadSeconds * 1000
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
