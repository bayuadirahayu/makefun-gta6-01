// All sound is synthesized with WebAudio — no audio files, no network. An engine hum
// that follows the car's speed, a two-tone siren that follows the nearest police car, a
// noise-burst gunshot, pickup blips, and a slow synthwave loop (a minor-key bass line
// under a soft pad) scheduled a bar ahead. Nothing starts until the first user gesture,
// and M mutes everything.

const MUSIC_BPM = 96;
const BEAT = 60 / MUSIC_BPM;
// A minor-key synthwave loop: Am – F – C – G, one bar each.
const BASS_LINE = [55, 55, 55, 65.41, 43.65, 43.65, 43.65, 49];
const CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [130.81, 164.81, 196],
  [146.83, 196, 246.94],
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let stepIndex = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass, pitch and loudness follow speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 27.5;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: a sine that alternates between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Music bus.
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      nextNoteTime = ctx.currentTime + 0.1;
      musicTimer = window.setInterval(scheduleMusic, 120);
      return true;
    } catch {
      return false;
    }
  }

  function scheduleMusic() {
    if (!ctx || muted) return;
    while (nextNoteTime < ctx.currentTime + 0.35) {
      const bar = Math.floor(stepIndex / 8) % 4;
      const beatInBar = stepIndex % 8;
      playBassNote(BASS_LINE[stepIndex % 8], nextNoteTime, BEAT * 0.9);
      if (beatInBar === 0) playChord(CHORDS[bar], nextNoteTime, BEAT * 8);
      if (beatInBar % 2 === 0) playHat(nextNoteTime);
      nextNoteTime += BEAT;
      stepIndex += 1;
    }
  }

  function playBassNote(freq, when, length) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, when);
    gain.gain.exponentialRampToValueAtTime(0.01, when + length);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(when);
    osc.stop(when + length + 0.05);
  }

  function playChord(freqs, when, length) {
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.07, when + 0.4);
      gain.gain.setValueAtTime(0.07, when + length - 0.4);
      gain.gain.linearRampToValueAtTime(0.0001, when + length);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(musicGain);
      osc.start(when);
      osc.stop(when + length + 0.05);
    }
  }

  function playHat(when) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    src.start(when);
  }

  function noiseBurst(when, duration, filterFreq, volume) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(when);
  }

  function blip(freq, when, duration, volume = 0.25) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.01, when + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  return {
    /** Call from any user gesture; creates the context on first use. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows speed (0..1) and whether the player is driving. */
    setEngine(speedNorm, driving) {
      if (!ctx) return;
      const target = driving ? 0.05 + speedNorm * 0.1 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(27.5 + speedNorm * 65, ctx.currentTime, 0.1);
      engineFilter.frequency.setTargetAtTime(420 + speedNorm * 1400, ctx.currentTime, 0.1);
    },
    /** The siren wails while police are close; `distance` is in world units. */
    setSiren(distance) {
      if (!ctx) return;
      const near = Math.max(0, 1 - distance / 90);
      sirenGain.gain.setTargetAtTime(near * 0.05, ctx.currentTime, 0.2);
      sirenOsc.frequency.setTargetAtTime(Math.floor(ctx.currentTime * 1.6) % 2 === 0 ? 720 : 960, ctx.currentTime, 0.05);
    },
    gunshot() {
      if (!ctx || muted) return;
      noiseBurst(ctx.currentTime, 0.14, 3200, 0.5);
      blip(90, ctx.currentTime, 0.1, 0.4);
    },
    punch() {
      if (!ctx || muted) return;
      noiseBurst(ctx.currentTime, 0.08, 900, 0.35);
    },
    pickup() {
      if (!ctx || muted) return;
      blip(880, ctx.currentTime, 0.09);
      blip(1320, ctx.currentTime + 0.09, 0.12);
    },
    missionDone() {
      if (!ctx || muted) return;
      blip(523.25, ctx.currentTime, 0.12);
      blip(659.25, ctx.currentTime + 0.12, 0.12);
      blip(783.99, ctx.currentTime + 0.24, 0.2);
    },
    crash() {
      if (!ctx || muted) return;
      noiseBurst(ctx.currentTime, 0.25, 500, 0.5);
    },
  };
}
