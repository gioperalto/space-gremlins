'use strict'

const SABOTAGE_TYPES = {
  LIGHTS_OUT:       'lights_out',
  REACTOR_MELTDOWN: 'reactor_meltdown',
  COMMS_DISRUPTION: 'comms_disruption',
}

const SABOTAGE_DURATIONS = {
  lights_out:       30000,
  reactor_meltdown: 45000,
  comms_disruption: 30000,
}

const CRITICAL_SABOTAGES = new Set([SABOTAGE_TYPES.REACTOR_MELTDOWN])

class SabotageManager {
  constructor(settings) {
    this.cooldownMs = (settings.sabotageCooldown || 30) * 1000
    this.lastSabotageTime = 0
    this.active = null       // current active sabotage state
    this.meltdownTimer = null
    this.onMeltdownExpire = null
    // Reactor fix requires 2 simultaneous holders
    this.reactorHolders = new Set()
  }

  canSabotage(gremlins) {
    if (this.active) return false  // one sabotage at a time
    return Date.now() - this.lastSabotageTime >= this.cooldownMs
  }

  trigger(type, onExpire) {
    if (!SABOTAGE_TYPES[type.toUpperCase()] && !Object.values(SABOTAGE_TYPES).includes(type)) {
      return { ok: false, reason: 'unknown_type' }
    }
    if (this.active) return { ok: false, reason: 'already_active' }

    this.active = {
      type,
      startedAt: Date.now(),
      duration: SABOTAGE_DURATIONS[type],
      fixed: false,
      fixProgress: {},  // for multi-player fixes
    }
    this.lastSabotageTime = Date.now()
    this.reactorHolders.clear()

    if (type === SABOTAGE_TYPES.REACTOR_MELTDOWN) {
      this.meltdownTimer = setTimeout(() => {
        if (this.active && this.active.type === SABOTAGE_TYPES.REACTOR_MELTDOWN && !this.active.fixed) {
          this.onMeltdownExpire = null
          onExpire()
        }
      }, SABOTAGE_DURATIONS.reactor_meltdown)
      this.onMeltdownExpire = onExpire
    } else if (type === SABOTAGE_TYPES.LIGHTS_OUT || type === SABOTAGE_TYPES.COMMS_DISRUPTION) {
      // Auto-expire after duration if not fixed
      this.meltdownTimer = setTimeout(() => {
        if (this.active && this.active.type === type && !this.active.fixed) {
          this.fix(type, null)
        }
      }, SABOTAGE_DURATIONS[type])
    }

    return { ok: true, sabotage: this.active }
  }

  fix(type, socketId) {
    if (!this.active || this.active.type !== type) return { ok: false, reason: 'not_active' }

    if (type === SABOTAGE_TYPES.REACTOR_MELTDOWN) {
      // Needs 2 players holding simultaneously
      if (socketId) {
        this.reactorHolders.add(socketId)
        if (this.reactorHolders.size >= 2) {
          return this._completeFix()
        }
        return { ok: false, partial: true, holders: this.reactorHolders.size }
      }
      return { ok: false, reason: 'needs_two_players' }
    }

    return this._completeFix()
  }

  reactorRelease(socketId) {
    this.reactorHolders.delete(socketId)
    return { holders: this.reactorHolders.size }
  }

  _completeFix() {
    const sabotage = this.active
    this.active = null
    if (this.meltdownTimer) { clearTimeout(this.meltdownTimer); this.meltdownTimer = null }
    this.reactorHolders.clear()
    return { ok: true, fixed: sabotage.type }
  }

  isCritical() {
    return this.active && CRITICAL_SABOTAGES.has(this.active.type)
  }

  getState() {
    if (!this.active) return null
    return {
      ...this.active,
      remaining: this.active
        ? Math.max(0, this.active.duration - (Date.now() - this.active.startedAt))
        : 0,
      reactorHolders: Array.from(this.reactorHolders),
    }
  }

  stop() {
    if (this.meltdownTimer) { clearTimeout(this.meltdownTimer); this.meltdownTimer = null }
    this.active = null
  }
}

module.exports = { SabotageManager, SABOTAGE_TYPES }
