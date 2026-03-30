'use strict'

const { GameRoom } = require('../game/GameRoom')
const { log, metrics } = require('../observability/datadog')

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode() {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

class LobbyManager {
  constructor(io) {
    this.io = io
    this.rooms = new Map()  // code -> GameRoom
    this.socketToRoom = new Map()  // socketId -> roomCode
  }

  createRoom(socketId, { name, color }) {
    let code
    do { code = generateCode() } while (this.rooms.has(code))

    const room = new GameRoom({ code, hostSocketId: socketId, io: this.io })
    this.rooms.set(code, room)

    const joinResult = room.addPlayer(socketId, { name, color })
    if (!joinResult.ok) {
      this.rooms.delete(code)
      return { ok: false, reason: joinResult.reason }
    }

    this.socketToRoom.set(socketId, code)
    metrics.gauge('space_gremlins.games.active', this.rooms.size)
    log('info', 'room_created', { code, host: socketId })
    return { ok: true, code, room }
  }

  joinRoom(socketId, { code, name, color }) {
    const room = this.rooms.get(code.toUpperCase())
    if (!room) return { ok: false, reason: 'room_not_found' }

    const joinResult = room.addPlayer(socketId, { name, color })
    if (!joinResult.ok) return { ok: false, reason: joinResult.reason }

    this.socketToRoom.set(socketId, code.toUpperCase())
    log('info', 'room_joined', { code, socketId })
    return { ok: true, room }
  }

  leaveRoom(socketId) {
    const code = this.socketToRoom.get(socketId)
    if (!code) return

    const room = this.rooms.get(code)
    if (!room) { this.socketToRoom.delete(socketId); return }

    room.removePlayer(socketId)
    this.socketToRoom.delete(socketId)

    if (room.getPlayerCount() === 0) {
      room.destroy()
      this.rooms.delete(code)
      metrics.gauge('space_gremlins.games.active', this.rooms.size)
      log('info', 'room_destroyed', { code })
    }

    metrics.gauge('space_gremlins.players.connected', this.socketToRoom.size)
  }

  getRoom(socketId) {
    const code = this.socketToRoom.get(socketId)
    return code ? this.rooms.get(code) : null
  }

  getRoomByCode(code) {
    return this.rooms.get(code?.toUpperCase())
  }

  getActiveRoomCount() { return this.rooms.size }
  getConnectedPlayerCount() { return this.socketToRoom.size }
}

module.exports = { LobbyManager }
