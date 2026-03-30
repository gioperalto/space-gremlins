// Procedural 8-bit SFX using Web Audio API

class SoundManager {
  constructor() {
    this._ctx = null
    this._enabled = true
    this._masterGain = null
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)()
      this._masterGain = this._ctx.createGain()
      this._masterGain.gain.value = 0.4
      this._masterGain.connect(this._ctx.destination)
    }
    return this._ctx
  }

  enable() { this._enabled = true }
  disable() { this._enabled = false }
  toggle() { this._enabled = !this._enabled; return this._enabled }

  _tone({ freq = 440, type = 'square', duration = 0.1, vol = 0.3,
          freqEnd = null, attack = 0.01, decay = 0.02 } = {}) {
    if (!this._enabled) return
    try {
      const ctx = this._getCtx()
      if (ctx.state === 'suspended') ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(this._masterGain)
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), ctx.currentTime + duration)
      }
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + attack)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay + duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + attack + decay + duration + 0.05)
    } catch (e) { /* ignore audio errors */ }
  }

  _noise(duration = 0.1, vol = 0.2) {
    if (!this._enabled) return
    try {
      const ctx = this._getCtx()
      if (ctx.state === 'suspended') ctx.resume()
      const bufSize = ctx.sampleRate * duration
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(vol, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      src.connect(gain)
      gain.connect(this._masterGain)
      src.start()
    } catch (e) { /* ignore */ }
  }

  // ─── SFX library ───────────────────────────────────────────────────────────

  footstep() {
    this._tone({ freq: 180 + Math.random() * 40, type: 'square', duration: 0.04, vol: 0.08, decay: 0.04 })
  }

  taskComplete() {
    this._tone({ freq: 523, type: 'square', duration: 0.08, vol: 0.25 })
    setTimeout(() => this._tone({ freq: 659, type: 'square', duration: 0.08, vol: 0.25 }), 80)
    setTimeout(() => this._tone({ freq: 784, type: 'square', duration: 0.15, vol: 0.3 }), 160)
  }

  kill() {
    this._noise(0.15, 0.5)
    this._tone({ freq: 200, freqEnd: 60, type: 'sawtooth', duration: 0.15, vol: 0.4, attack: 0.005 })
  }

  bodyReport() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._tone({ freq: 800, type: 'square', duration: 0.08, vol: 0.35 })
        setTimeout(() => this._tone({ freq: 600, type: 'square', duration: 0.08, vol: 0.35 }), 100)
      }, i * 220)
    }
  }

  emergencyButton() {
    this._tone({ freq: 300, type: 'sawtooth', duration: 0.3, vol: 0.5 })
    setTimeout(() => this._tone({ freq: 250, type: 'sawtooth', duration: 0.3, vol: 0.5 }), 300)
  }

  voteCast() {
    this._tone({ freq: 440, type: 'square', duration: 0.05, vol: 0.2, decay: 0.03 })
  }

  ejection() {
    this._noise(0.4, 0.3)
    this._tone({ freq: 100, freqEnd: 20, type: 'sawtooth', duration: 0.5, vol: 0.5 })
  }

  sabotageAlarm() {
    const play = () => {
      this._tone({ freq: 440, type: 'sawtooth', duration: 0.1, vol: 0.4 })
      setTimeout(() => this._tone({ freq: 330, type: 'sawtooth', duration: 0.1, vol: 0.4 }), 150)
    }
    play()
    return setInterval(play, 600)  // returns interval ID — caller should clear it
  }

  meetingBell() {
    this._tone({ freq: 660, type: 'sine', duration: 0.3, vol: 0.4, attack: 0.01, decay: 0.3 })
    setTimeout(() => this._tone({ freq: 880, type: 'sine', duration: 0.4, vol: 0.35, attack: 0.01, decay: 0.4 }), 200)
  }

  victoryJingle() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone({ freq, type: 'square', duration: 0.15, vol: 0.3 }), i * 150)
    })
    setTimeout(() => this._tone({ freq: 1047, type: 'square', duration: 0.5, vol: 0.35 }), 600)
  }

  defeatSting() {
    const notes = [400, 350, 280, 200]
    notes.forEach((freq, i) => {
      setTimeout(() => this._tone({ freq, type: 'sawtooth', duration: 0.15, vol: 0.25 }), i * 150)
    })
  }

  ventEnter() {
    this._tone({ freq: 200, freqEnd: 80, type: 'square', duration: 0.12, vol: 0.2 })
  }

  ventExit() {
    this._tone({ freq: 80, freqEnd: 200, type: 'square', duration: 0.12, vol: 0.2 })
  }

  roleReveal(isGremlin) {
    if (isGremlin) {
      this._tone({ freq: 120, type: 'sawtooth', duration: 0.4, vol: 0.4 })
      setTimeout(() => this._tone({ freq: 80, type: 'sawtooth', duration: 0.6, vol: 0.5 }), 300)
    } else {
      this._tone({ freq: 523, type: 'square', duration: 0.15, vol: 0.3 })
      setTimeout(() => this._tone({ freq: 659, type: 'square', duration: 0.2, vol: 0.35 }), 150)
    }
  }
}

export const soundManager = new SoundManager()
