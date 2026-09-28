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

  if (playbackAnimationFrame !== null) {
    cancelAnimationFrame(playbackAnimationFrame);
    playbackAnimationFrame = null;
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
