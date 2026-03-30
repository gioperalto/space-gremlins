import { io } from 'socket.io-client'

class SocketClient {
  constructor() {
    this.socket = null
    this._listeners = {}
  }

  connect() {
    if (this.socket?.connected) return

    const url = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin
    this.socket = io(url, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket.id)
      this._emit('connect', { id: this.socket.id })
    })

    this.socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason)
      this._emit('disconnect', { reason })
    })

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
      this._emit('connect_error', { error: err.message })
    })

    // Proxy all game events through the event system
    const EVENTS = [
      'room:player_joined', 'room:player_left', 'room:player_disconnected',
      'room:host_changed', 'lobby:settings_updated',
      'game:role_reveal', 'game:phase_changed', 'game:state', 'game:over', 'game:lobby_reset',
      'player:moved', 'player:killed',
      'task:completed',
      'body:reported',
      'meeting:started', 'meeting:voting_started', 'meeting:chat', 'meeting:ghost_chat',
      'meeting:vote_cast', 'meeting:results',
      'sabotage:triggered', 'sabotage:fixed', 'sabotage:fix_progress',
      'vent:teleport',
      'emergency:called',
    ]
    for (const event of EVENTS) {
      this.socket.on(event, (data) => this._emit(event, data))
    }
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
  }

  // ─── Emit helpers ──────────────────────────────────────────────────────────

  createRoom(name, color) {
    return this._ack('lobby:create', { name, color })
  }

  joinRoom(code, name, color) {
    return this._ack('lobby:join', { code, name, color })
  }

  updateSettings(settings) {
    return this._ack('lobby:update_settings', settings)
  }

  startGame() {
    return this._ack('lobby:start', {})
  }

  sendMove(x, y) {
    this.socket?.emit('player:move', { x, y })
  }

  sendKill(targetId) {
    return this._ack('player:kill', { targetId })
  }

  reportBody(bodyPlayerId) {
    return this._ack('body:report', { bodyPlayerId })
  }

  callEmergency() {
    return this._ack('emergency:call', {})
  }

  interactTask(taskId, action, data) {
    return this._ack('task:interact', { taskId, action, data })
  }

  vote(targetId) {
    return this._ack('meeting:vote', { targetId })
  }

  sendChat(message) {
    this.socket?.emit('meeting:chat', { message })
  }

  triggerSabotage(type) {
    return this._ack('sabotage:trigger', { type })
  }

  fixSabotage(type) {
    return this._ack('sabotage:fix', { type })
  }

  releaseReactor() {
    this.socket?.emit('sabotage:reactor_release')
  }

  useVent(ventId, action) {
    return this._ack('vent:use', { ventId, action })
  }

  // ─── Event system ──────────────────────────────────────────────────────────

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = []
    this._listeners[event].push(handler)
    return () => this.off(event, handler)
  }

  off(event, handler) {
    if (!this._listeners[event]) return
    this._listeners[event] = this._listeners[event].filter(h => h !== handler)
  }

  _emit(event, data) {
    this._listeners[event]?.forEach(h => h(data))
  }

  _ack(event, data) {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false, reason: 'not_connected' })
      this.socket.emit(event, data, resolve)
    })
  }

  get id() { return this.socket?.id }
  get connected() { return this.socket?.connected ?? false }
}

// Singleton
export const socketClient = new SocketClient()
