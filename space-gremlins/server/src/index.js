'use strict'

// Initialize Datadog APM FIRST before any other requires
const dd = require('./observability/datadog')
dd.init()

const path = require('path')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const { LobbyManager } = require('./lobby/LobbyManager')
const { log, metrics } = require('./observability/datadog')

const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'
const DIST_DIR = path.join(__dirname, '..', 'dist')

// ─── Express setup ──────────────────────────────────────────────────────────

const app = express()
const httpServer = http.createServer(app)

app.use(cors({ origin: '*' }))
app.use(express.json())

// Serve built client
app.use(express.static(DIST_DIR))

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: lobby.getActiveRoomCount(),
    players: lobby.getConnectedPlayerCount(),
    uptime: process.uptime(),
  })
})

// Serve SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
    if (err) res.status(404).send('Not found')
  })
})

// ─── Socket.IO setup ─────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 30000,
  pingInterval: 10000,
})

const lobby = new LobbyManager(io)

// ─── Socket.IO event handlers ─────────────────────────────────────────────────

io.on('connection', (socket) => {
  log('info', 'socket_connected', { socketId: socket.id })
  metrics.gauge('space_gremlins.players.connected', lobby.getConnectedPlayerCount() + 1)

  // ─── Lobby events ─────────────────────────────────────────────────────────

  socket.on('lobby:create', ({ name, color }, ack) => {
    const result = lobby.createRoom(socket.id, { name, color })
    if (result.ok) {
      socket.join(result.code)
      ack({ ok: true, code: result.code, state: result.room.getLobbyState() })
    } else {
      ack({ ok: false, reason: result.reason })
    }
  })

  socket.on('lobby:join', ({ code, name, color }, ack) => {
    const result = lobby.joinRoom(socket.id, { code, name, color })
    if (result.ok) {
      socket.join(code.toUpperCase())
      ack({ ok: true, state: result.room.getLobbyState() })
    } else {
      ack({ ok: false, reason: result.reason })
    }
  })

  socket.on('lobby:update_settings', (settings, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    ack?.(room.updateSettings(socket.id, settings))
  })

  socket.on('lobby:start', (_, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    const result = room.startGame(socket.id)
    ack?.(result)
  })

  // ─── Game events ───────────────────────────────────────────────────────────

  socket.on('player:move', ({ x, y }) => {
    const room = lobby.getRoom(socket.id)
    room?.handleMove(socket.id, { x, y })
  })

  socket.on('player:kill', ({ targetId }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    ack?.(room.handleKill(socket.id, targetId))
  })

  socket.on('body:report', ({ bodyPlayerId }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    ack?.(room.handleBodyReport(socket.id, bodyPlayerId))
  })

  socket.on('emergency:call', (_, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    ack?.(room.handleEmergency(socket.id))
  })

  socket.on('task:interact', ({ taskId, action, data }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false, reason: 'not_in_room' })
    ack?.(room.handleTaskInteract(socket.id, { taskId, action, data }))
  })

  // ─── Meeting events ────────────────────────────────────────────────────────

  socket.on('meeting:vote', ({ targetId }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false })
    ack?.(room.handleVote(socket.id, targetId))
  })

  socket.on('meeting:chat', ({ message }) => {
    const room = lobby.getRoom(socket.id)
    room?.handleMeetingChat(socket.id, message)
  })

  // ─── Sabotage events ───────────────────────────────────────────────────────

  socket.on('sabotage:trigger', ({ type }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false })
    ack?.(room.handleSabotage(socket.id, { type }))
  })

  socket.on('sabotage:fix', ({ type }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false })
    ack?.(room.handleSabotageFix(socket.id, { type }))
  })

  socket.on('sabotage:reactor_release', () => {
    const room = lobby.getRoom(socket.id)
    room?.handleReactorRelease(socket.id)
  })

  // ─── Vent events ───────────────────────────────────────────────────────────

  socket.on('vent:use', ({ ventId, action }, ack) => {
    const room = lobby.getRoom(socket.id)
    if (!room) return ack?.({ ok: false })
    ack?.(room.handleVentUse(socket.id, { ventId, action }))
  })

  // ─── Disconnect ────────────────────────────────────────────────────────────

  socket.on('disconnect', (reason) => {
    log('info', 'socket_disconnected', { socketId: socket.id, reason })
    lobby.leaveRoom(socket.id)
    metrics.gauge('space_gremlins.players.connected', lobby.getConnectedPlayerCount())
  })

  socket.on('error', (err) => {
    log('error', 'socket_error', { socketId: socket.id, error: err.message })
  })
})

// ─── Start server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  log('info', 'server_started', { port: PORT, env: NODE_ENV })
  console.log(`[Space Gremlins] Server running on port ${PORT} (${NODE_ENV})`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'server_shutdown', { reason: 'SIGTERM' })
  httpServer.close(() => process.exit(0))
})

process.on('uncaughtException', (err) => {
  log('error', 'uncaught_exception', { error: err.message, stack: err.stack })
  process.exit(1)
})
