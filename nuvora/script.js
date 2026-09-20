const STATES = Object.freeze({
  WAITING: "WAITING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
});

const DURATION_MS = Object.freeze({
  60: 60_000,
  180: 180_000,
});

const shellEl = document.getElementById("timer-shell");
const stateLabelEl = document.getElementById("state-label");
const timeDisplayEl = document.getElementById("time-display");
const timeButtons = Array.from(document.querySelectorAll(".time-btn"));
const startStopBtn = document.getElementById("start-stop-btn");
const resetBtn = document.getElementById("reset-btn");

let state = STATES.WAITING;
let selectedSeconds = 60;
let endAtMs = null;
let pausedRemainingMs = null;
let frameId = null;
let hiddenAtMs = null;
let wakeLock = null;
let audioCtx = null;

function formatMs(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getDurationMs() {
  return DURATION_MS[selectedSeconds];
}

function getRemainingMs(now = Date.now()) {
  switch (state) {
    case STATES.WAITING:
      return getDurationMs();
    case STATES.RUNNING:
      return Math.max(0, endAtMs - now);
    case STATES.PAUSED:
      return pausedRemainingMs;
    case STATES.COMPLETED:
      return 0;
    default:
      return getDurationMs();
  }
}

function getFillRatio(remainingMs) {
  const duration = getDurationMs();
  const elapsed = duration - remainingMs;
  return Math.min(1, Math.max(0, elapsed / duration));
}

function render() {
  const remainingMs = getRemainingMs();
  const fillRatio = getFillRatio(remainingMs);

  shellEl.style.setProperty("--fill", String(fillRatio));
  shellEl.dataset.state = state;
  stateLabelEl.textContent = state;
  timeDisplayEl.textContent = formatMs(remainingMs);

  const canSelectDuration = state === STATES.WAITING;
  timeButtons.forEach((btn) => {
    const sec = Number(btn.dataset.duration);
    const active = sec === selectedSeconds;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.disabled = !canSelectDuration;
  });

  if (state === STATES.RUNNING) {
    startStopBtn.textContent = "STOP";
    startStopBtn.disabled = false;
  } else if (state === STATES.COMPLETED) {
    startStopBtn.textContent = "START";
    startStopBtn.disabled = true;
  } else {
    startStopBtn.textContent = "START";
    startStopBtn.disabled = false;
  }
}

function stopLoop() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
}

function finishCountdown(playSound) {
  stopLoop();
  state = STATES.COMPLETED;
  endAtMs = null;
  pausedRemainingMs = 0;
  if (playSound) {
    playBell();
  }
  render();
}

function loop() {
  if (state !== STATES.RUNNING) {
    stopLoop();
    return;
  }

  const now = Date.now();
  if (now >= endAtMs) {
    const completedInBackground = hiddenAtMs !== null && hiddenAtMs < endAtMs;
    finishCountdown(!completedInBackground && !document.hidden);
    hiddenAtMs = null;
    return;
  }

  render();
  frameId = requestAnimationFrame(loop);
}

function startLoop() {
  if (frameId === null) {
    frameId = requestAnimationFrame(loop);
  }
}

function setWaiting() {
  stopLoop();
  state = STATES.WAITING;
  endAtMs = null;
  pausedRemainingMs = null;
  hiddenAtMs = null;
  render();
}

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function playBell() {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  master.gain.setValueAtTime(0.0001, now);

  const pattern = [
    { offset: 0.0, frequency: 1760, gain: 0.16 },
    { offset: 0.13, frequency: 1480, gain: 0.14 },
  ];

  pattern.forEach(({ offset, frequency, gain }) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, now + offset);
    g.gain.setValueAtTime(gain, now + offset);
    g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.2);
    osc.connect(g);
    g.connect(master);
    osc.start(now + offset);
    osc.stop(now + offset + 1.25);
  });

  master.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);

  setTimeout(() => {
    master.disconnect();
  }, 1600);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    if (wakeLock == null) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    }
  } catch (_) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

timeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (state !== STATES.WAITING) return;
    ensureAudio();
    selectedSeconds = Number(btn.dataset.duration);
    render();
  });
});

startStopBtn.addEventListener("click", () => {
  ensureAudio();
  requestWakeLock();

  if (state === STATES.WAITING) {
    state = STATES.RUNNING;
    endAtMs = Date.now() + getDurationMs();
    pausedRemainingMs = null;
    hiddenAtMs = null;
    render();
    startLoop();
    return;
  }

  if (state === STATES.RUNNING) {
    state = STATES.PAUSED;
    pausedRemainingMs = Math.max(0, endAtMs - Date.now());
    endAtMs = null;
    stopLoop();
    render();
    return;
  }

  if (state === STATES.PAUSED) {
    state = STATES.RUNNING;
    endAtMs = Date.now() + pausedRemainingMs;
    pausedRemainingMs = null;
    render();
    startLoop();
  }
});

resetBtn.addEventListener("click", () => {
  ensureAudio();
  setWaiting();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAtMs = Date.now();
    return;
  }

  requestWakeLock();
  if (state === STATES.RUNNING) {
    render();
    startLoop();
  } else {
    render();
  }
});

window.addEventListener("pageshow", () => {
  requestWakeLock();
  render();
  if (state === STATES.RUNNING) {
    startLoop();
  }
});

window.addEventListener("beforeunload", () => {
  releaseWakeLock();
  stopLoop();
});

requestWakeLock();
render();
