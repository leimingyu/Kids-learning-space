(function () {
  const STORAGE_KEY = 'kls.audio.muted.v1';

  // Default behavior: muted until the user explicitly enables sound.
  let muted = readMuted();
  let ctx = null;
  const listeners = new Set();

  function readMuted() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;          // never set → default muted
      return v !== '0';                     // '0' means "unmuted"
    } catch {
      return true;
    }
  }

  function writeMuted() {
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch {}
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  function envelope(g, t, attack, peak, sustain, release) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.linearRampToValueAtTime(sustain, t + attack + 0.04);
    g.gain.linearRampToValueAtTime(0, t + attack + 0.04 + release);
  }

  function tone(freq, when, dur, type, peak) {
    if (!ctx) return;
    peak = peak == null ? 0.18 : peak;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, when);
    o.connect(g);
    g.connect(ctx.destination);
    envelope(g, when, 0.008, peak, peak * 0.6, Math.max(0.04, dur - 0.05));
    o.start(when);
    o.stop(when + dur + 0.08);
  }

  function play(name) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') {
      try { c.resume(); } catch {}
    }
    const t = c.currentTime;
    switch (name) {
      case 'click':
        tone(880, t, 0.06, 'triangle', 0.16);
        break;
      case 'success':
        tone(523.25, t + 0.00, 0.10, 'sine', 0.20); // C5
        tone(659.25, t + 0.08, 0.10, 'sine', 0.20); // E5
        tone(783.99, t + 0.16, 0.18, 'sine', 0.22); // G5
        break;
      case 'fail':
        tone(330.00, t + 0.00, 0.10, 'triangle', 0.18); // E4
        tone(261.63, t + 0.10, 0.20, 'triangle', 0.18); // C4
        break;
      case 'level-complete': {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
        notes.forEach((f, i) => tone(f, t + i * 0.10, 0.12, 'sine', 0.18));
        tone(1046.50, t + 0.55, 0.45, 'sine', 0.16); // sustain C6
        tone(1318.51, t + 0.55, 0.45, 'sine', 0.10); // sustain E6
        break;
      }
      default:
        // unknown sfx name — silently ignore
    }
  }

  function setMuted(v) {
    const next = !!v;
    if (next === muted) return;
    muted = next;
    writeMuted();
    listeners.forEach((fn) => { try { fn(muted); } catch (e) { console.error(e); } });
  }

  const api = {
    play,
    isMuted: () => muted,
    setMuted,
    toggle()  { setMuted(!muted); return muted; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  window.KLS = window.KLS || {};
  window.KLS.audio = api;
})();
