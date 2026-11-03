let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function clack(strength = 1): void {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const src = a.createBufferSource();
  src.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2400 + Math.random() * 400;
  band.Q.value = 3;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0.32 * Math.max(0.15, Math.min(1, strength)), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  src.connect(band).connect(gain).connect(a.destination);
  src.start(now);
}

export function unlockAudio(): void {
  audio();
}
