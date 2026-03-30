'use strict'

const { Player, ROLES } = require('./Player')
const { TaskManager } = require('./TaskManager')
const { VoteManager } = require('./VoteManager')
const { SabotageManager, SABOTAGE_TYPES } = require('./SabotageManager')
const { log, metrics } = require('../observability/datadog')

const PHASES = {
  LOBBY:       'lobby',
  ROLE_REVEAL: 'roleReveal',
  TASK:        'taskPhase',
  MEETING:     'meetingPhase',
  EJECTION:    'ejection',
  GAME_OVER:   'gameOver',
}

// Spawn positions per room (world coordinates 640x360)
const SPAWN_POSITIONS = [
  { x: 200, y: 260 }, { x: 220, y: 260 }, { x: 240, y: 260 }, { x: 200, y: 280 },
  { x: 220, y: 280 }, { x: 240, y: 280 }, { x: 200, y: 300 }, { x: 220, y: 300 },
]

// Max speed pixels per tick (server tick ~50ms)
const MAX_SPEED_PER_TICK = 160

// Kill range (px)
const KILL_RANGE = 40

class GameRoom {
  constructor({ code, hostSocketId, io, settings = {} }) {
    this.code = code
    this.hostSocketId = hostSocketId
    this.io = io

    this.settings = {
      killCooldown: settings.killCooldown || 25,   // seconds
      tasksPerPlayer: settings.tasksPerPlayer || 4,
      discussionTime: settings.discussionTime || 45,
      votingTime: settings.votingTime || 30,
      confirmEjects: settings.confirmEjects !== false,
      sabotageCooldown: settings.sabotageCooldown || 30,
      maxPlayers: 8,
      minPlayers: 4,
    }

    this.phase = PHASES.LOBBY
    this.players = new Map()   // socketId -> Player
    this.bodies = []           // { playerId, x, y, reported, reportedBy }
    this.emergencyButtonUses = 3

    this.taskManager = null
    this.voteManager = null
    this.sabotageManager = null

    this.phaseTimer = null
    this.stateInterval = null

    this.startTime = null
    this.roundNumber = 0
  }

  // ─── Player management ────────────────────────────────────────────────────

  addPlayer(socketId, { name, color }) {
    if (this.players.size >= this.settings.maxPlayers) return { ok: false, reason: 'room_full' }
    if (this.phase !== PHASES.LOBBY) return { ok: false, reason: 'game_in_progress' }
    if ([...this.players.values()].find(p => p.color === color)) {
      return { ok: false, reason: 'color_taken' }
    }
    const player = new Player({ socketId, name, color, roomCode: this.code })
    this.players.set(socketId, player)
    this._broadcast('room:player_joined', { player: this._playerPublic(socketId, socketId) })
    log('info', 'player_joined', { room: this.code, socketId, name })
    return { ok: true, player }
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId)
    if (!player) return

    if (this.phase === PHASES.LOBBY) {
      this.players.delete(socketId)
      this._broadcast('room:player_left', { socketId })
      if (socketId === this.hostSocketId && this.players.size > 0) {
        this.hostSocketId = this.players.keys().next().value
        this._broadcast('room:host_changed', { hostSocketId: this.hostSocketId })
      }
    } else {
      // Mid-game: mark as disconnected, allow rejoin for 30s
      player.disconnectedAt = Date.now()
      this._broadcast('room:player_disconnected', { socketId, name: player.name })
    }
    log('info', 'player_left', { room: this.code, socketId })
  }

  getPlayerCount() { return this.players.size }

  // ─── Lobby / Settings ────────────────────────────────────────────────────

  updateSettings(socketId, settings) {
    if (socketId !== this.hostSocketId) return { ok: false, reason: 'not_host' }
    if (this.phase !== PHASES.LOBBY) return { ok: false, reason: 'game_started' }
    Object.assign(this.settings, settings)
    this._broadcast('lobby:settings_updated', { settings: this.settings })
    return { ok: true }
  }

  // ─── Game start ──────────────────────────────────────────────────────────

  startGame(socketId) {
    if (socketId !== this.hostSocketId) return { ok: false, reason: 'not_host' }
    if (this.phase !== PHASES.LOBBY) return { ok: false, reason: 'already_started' }
    if (this.players.size < this.settings.minPlayers) {
      return { ok: false, reason: 'not_enough_players', need: this.settings.minPlayers }
    }

    this.roundNumber++
    this.startTime = Date.now()
    this.bodies = []
    this.emergencyButtonUses = 3

    // Assign roles
    this._assignRoles()

    // Assign spawn positions
    let spawnIdx = 0
    for (const player of this.players.values()) {
      const pos = SPAWN_POSITIONS[spawnIdx++ % SPAWN_POSITIONS.length]
      player.x = pos.x
      player.y = pos.y
      player.alive = true
      player.isGhost = false
      player.completedTasks = new Set()
    }

    // Init managers
    this.taskManager = new TaskManager(this.settings)
    this.taskManager.assignTasks([...this.players.values()])
    this.sabotageManager = new SabotageManager(this.settings)
    this.voteManager = null

    // Phase: Role Reveal
    this._setPhase(PHASES.ROLE_REVEAL)

    // Broadcast role reveal to each player individually
    for (const player of this.players.values()) {
      const gremlinAllies = player.isGremlin()
        ? [...this.players.values()].filter(p => p.isGremlin() && p.socketId !== player.socketId).map(p => p.socketId)
        : []
      this.io.to(player.socketId).emit('game:role_reveal', {
        role: player.role,
        gremlinAllies,
        settings: this.settings,
      })
    }

    // Transition to task phase after 5 seconds
    this.phaseTimer = setTimeout(() => this._startTaskPhase(), 5000)

    metrics.gauge('space_gremlins.games.active', this._countActiveRooms?.() || 1)
    log('info', 'game_started', { room: this.code, players: this.players.size })

    return { ok: true }
  }

  _assignRoles() {
    const playerList = [...this.players.values()]
    const count = playerList.length
    const gremlinCount = count >= 7 ? 2 : 1

    // Shuffle
    for (let i = playerList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerList[i], playerList[j]] = [playerList[j], playerList[i]]
    }

    playerList.forEach((p, i) => {
      p.assignRole(i < gremlinCount ? ROLES.GREMLIN : ROLES.CREWMATE)
    })
  }

  // ─── Task Phase ──────────────────────────────────────────────────────────

  _startTaskPhase() {
    this._setPhase(PHASES.TASK)
    this._broadcast('game:phase_changed', {
      phase: PHASES.TASK,
      taskProgress: this.taskManager.getProgress(),
    })

    // Periodic state sync every 2s
    if (this.stateInterval) clearInterval(this.stateInterval)
    this.stateInterval = setInterval(() => this._broadcastGameState(), 2000)
  }

  handleMove(socketId, { x, y }) {
    const player = this.players.get(socketId)
    if (!player || !player.alive) return
    if (this.phase !== PHASES.TASK) return

    // Speed validation
    const dx = x - player.x, dy = y - player.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > MAX_SPEED_PER_TICK) {
      // Clamp movement
      const ratio = MAX_SPEED_PER_TICK / dist
      x = player.x + dx * ratio
      y = player.y + dy * ratio
    }

    player.x = Math.round(x)
    player.y = Math.round(y)

    // Broadcast to room
    this._broadcast('player:moved', { socketId, x: player.x, y: player.y })
  }

  handleTaskInteract(socketId, { taskId, action, data }) {
    const player = this.players.get(socketId)
    if (!player) return { ok: false }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }

    if (action === 'complete') {
      const result = this.taskManager.completeTask(player, taskId)
      if (result.ok && !result.fake) {
        metrics.increment('space_gremlins.tasks.completed', [`room:${this.code}`])
        this._broadcast('task:completed', { socketId, taskId, progress: result.progress })
        if (this.taskManager.isTaskWin()) {
          this._endGame('crewmate', 'task_win')
        }
      }
      return result
    }

    return { ok: true }
  }

  handleKill(killerSocketId, targetSocketId) {
    const killer = this.players.get(killerSocketId)
    const target = this.players.get(targetSocketId)
    if (!killer || !target) return { ok: false, reason: 'player_not_found' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }

    const killCooldownMs = this.settings.killCooldown * 1000
    if (!killer.canKill(target, killCooldownMs)) return { ok: false, reason: 'cannot_kill' }

    // Distance check
    const dx = killer.x - target.x, dy = killer.y - target.y
    if (Math.sqrt(dx * dx + dy * dy) > KILL_RANGE) return { ok: false, reason: 'too_far' }

    target.die(killer)
    killer.lastKillTime = Date.now()
    killer.kills++

    const body = { playerId: target.socketId, x: target.x, y: target.y, reported: false }
    this.bodies.push(body)

    metrics.increment('space_gremlins.kills', [`room:${this.code}`])
    this._broadcast('player:killed', { killerSocketId, targetSocketId, x: target.x, y: target.y })

    log('info', 'player_killed', { room: this.code, killer: killerSocketId, target: targetSocketId })

    this._checkGremlinWin()
    return { ok: true }
  }

  handleBodyReport(reporterSocketId, bodyPlayerId) {
    const reporter = this.players.get(reporterSocketId)
    if (!reporter || !reporter.alive) return { ok: false, reason: 'invalid_reporter' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }

    const body = this.bodies.find(b => b.playerId === bodyPlayerId && !b.reported)
    if (!body) return { ok: false, reason: 'body_not_found' }
    body.reported = true
    body.reportedBy = reporterSocketId

    metrics.increment('space_gremlins.meetings.called', ['type:report', `room:${this.code}`])
    this._startMeeting({ type: 'report', calledBy: reporterSocketId, bodyOf: bodyPlayerId })
    return { ok: true }
  }

  handleEmergency(callerSocketId) {
    const caller = this.players.get(callerSocketId)
    if (!caller || !caller.alive) return { ok: false, reason: 'invalid_caller' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }
    if (this.sabotageManager.isCritical()) return { ok: false, reason: 'critical_sabotage_active' }
    if (this.emergencyButtonUses <= 0) return { ok: false, reason: 'no_uses_left' }

    this.emergencyButtonUses--
    metrics.increment('space_gremlins.meetings.called', ['type:emergency', `room:${this.code}`])
    this._startMeeting({ type: 'emergency', calledBy: callerSocketId, bodyOf: null })
    return { ok: true }
  }

  // ─── Meeting Phase ────────────────────────────────────────────────────────

  _startMeeting({ type, calledBy, bodyOf }) {
    if (this.stateInterval) { clearInterval(this.stateInterval); this.stateInterval = null }
    this._setPhase(PHASES.MEETING)

    const players = [...this.players.values()]
    const callerName = this.players.get(calledBy)?.name || 'Unknown'

    this.voteManager = new VoteManager(this.settings)
    this.voteManager.start({
      calledBy, bodyOf, type,
      players,
      onDiscussionEnd: () => {
        this._broadcast('meeting:voting_started', {
          votingTime: this.settings.votingTime,
        })
      },
      onVotingEnd: (result) => this._onVotingEnd(result),
    })

    this._broadcast('meeting:started', {
      type, calledBy, callerName, bodyOf,
      discussionTime: this.settings.discussionTime,
      votingTime: this.settings.votingTime,
      players: players.map(p => ({
        socketId: p.socketId,
        name: p.name,
        color: p.color,
        alive: p.alive,
      })),
    })
  }

  handleVote(voterSocketId, targetSocketId) {
    const voter = this.players.get(voterSocketId)
    if (!voter) return { ok: false, reason: 'invalid_voter' }
    if (!voter.alive) return { ok: false, reason: 'ghost_cannot_vote' }
    if (this.phase !== PHASES.MEETING) return { ok: false, reason: 'not_meeting' }
    if (!this.voteManager) return { ok: false }

    const result = this.voteManager.castVote(voterSocketId, targetSocketId)
    if (result.ok) {
      this._broadcast('meeting:vote_cast', { voterSocketId, targetSocketId })
    }
    return result
  }

  handleMeetingChat(socketId, message) {
    const player = this.players.get(socketId)
    if (!player) return
    if (this.phase !== PHASES.MEETING) return
    if (!this.voteManager) return

    const entry = this.voteManager.addChat(socketId, player.name, message, !player.alive)

    if (!player.alive) {
      // Ghost chat — only ghosts see this
      for (const p of this.players.values()) {
        if (!p.alive) {
          this.io.to(p.socketId).emit('meeting:ghost_chat', entry)
        }
      }
    } else {
      this._broadcast('meeting:chat', entry)
    }
  }

  _onVotingEnd(result) {
    this._broadcast('meeting:results', result)

    const ejectedPlayer = result.ejected ? this.players.get(result.ejected) : null

    if (ejectedPlayer) {
      ejectedPlayer.alive = false
      ejectedPlayer.isGhost = true
    }

    // Brief ejection animation delay
    this._setPhase(PHASES.EJECTION)
    this.phaseTimer = setTimeout(() => {
      if (ejectedPlayer) {
        this._checkWinCondition()
      } else {
        this._startTaskPhase()
      }
    }, 4000)
  }

  // ─── Sabotage ─────────────────────────────────────────────────────────────

  handleSabotage(socketId, { type }) {
    const player = this.players.get(socketId)
    if (!player || !player.isGremlin() || !player.alive) return { ok: false, reason: 'not_gremlin' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }
    if (!this.sabotageManager.canSabotage()) return { ok: false, reason: 'on_cooldown' }

    const result = this.sabotageManager.trigger(type, () => {
      // Reactor meltdown expired — gremlins win
      this._endGame('gremlin', 'sabotage_win')
    })

    if (result.ok) {
      this._broadcast('sabotage:triggered', { type, sabotage: this.sabotageManager.getState() })
      log('info', 'sabotage_triggered', { room: this.code, type, by: socketId })
    }
    return result
  }

  handleSabotageFix(socketId, { type }) {
    const player = this.players.get(socketId)
    if (!player || !player.alive) return { ok: false, reason: 'invalid_player' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }

    const result = this.sabotageManager.fix(type, socketId)
    if (result.ok) {
      this._broadcast('sabotage:fixed', { type, fixedBy: socketId })
    } else if (result.partial) {
      this._broadcast('sabotage:fix_progress', { type, holders: result.holders })
    }
    return result
  }

  handleReactorRelease(socketId) {
    return this.sabotageManager.reactorRelease(socketId)
  }

  handleVentUse(socketId, { ventId, action }) {
    const player = this.players.get(socketId)
    if (!player || !player.isGremlin() || !player.alive) return { ok: false, reason: 'not_gremlin' }
    if (this.phase !== PHASES.TASK) return { ok: false, reason: 'wrong_phase' }

    // Server just acknowledges; position update comes from client
    this.io.to(socketId).emit('vent:teleport', { ventId, action })
    return { ok: true }
  }

  // ─── Win conditions ───────────────────────────────────────────────────────

  _checkGremlinWin() {
    const alivePlayers = [...this.players.values()].filter(p => p.alive)
    const aliveGremlins = alivePlayers.filter(p => p.isGremlin())
    const aliveCrewmates = alivePlayers.filter(p => !p.isGremlin())

    if (aliveGremlins.length >= aliveCrewmates.length) {
      this._endGame('gremlin', 'kill_win')
    }
  }

  _checkWinCondition() {
    const alivePlayers = [...this.players.values()].filter(p => p.alive)
    const aliveGremlins = alivePlayers.filter(p => p.isGremlin())
    const aliveCrewmates = alivePlayers.filter(p => !p.isGremlin())

    if (aliveGremlins.length === 0) {
      this._endGame('crewmate', 'vote_win')
    } else if (aliveGremlins.length >= aliveCrewmates.length) {
      this._endGame('gremlin', 'kill_win')
    } else {
      this._startTaskPhase()
    }
  }

  _endGame(winner, reason) {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null }
    if (this.stateInterval) { clearInterval(this.stateInterval); this.stateInterval = null }
    if (this.voteManager) { this.voteManager.stop(); this.voteManager = null }
    if (this.sabotageManager) { this.sabotageManager.stop() }

    this._setPhase(PHASES.GAME_OVER)

    // Reveal all roles on game over
    const allRoles = {}
    for (const [id, p] of this.players) allRoles[id] = p.role

    this._broadcast('game:over', { winner, reason, roles: allRoles })

    metrics.increment('space_gremlins.games.completed', [`winner:${winner}`, `reason:${reason}`])
    log('info', 'game_over', { room: this.code, winner, reason })

    // Return to lobby after 10 seconds
    this.phaseTimer = setTimeout(() => {
      this._resetToLobby()
    }, 10000)
  }

  _resetToLobby() {
    this._setPhase(PHASES.LOBBY)
    this.bodies = []
    this.emergencyButtonUses = 3
    for (const p of this.players.values()) {
      p.alive = true
      p.isGhost = false
      p.role = null
      p.assignedTasks = []
      p.completedTasks = new Set()
    }
    this._broadcast('game:lobby_reset', { settings: this.settings })
  }

  // ─── State sync ───────────────────────────────────────────────────────────

  _broadcastGameState() {
    for (const [socketId] of this.players) {
      this.io.to(socketId).emit('game:state', this._getStateFor(socketId))
    }
  }

  _getStateFor(socketId) {
    const viewer = this.players.get(socketId)
    return {
      phase: this.phase,
      players: [...this.players.values()].map(p => p.toPublicState(socketId)),
      bodies: this.bodies,
      taskProgress: this.taskManager?.getProgress(),
      sabotage: this.sabotageManager?.getState(),
      emergencyButtonUses: this.emergencyButtonUses,
    }
  }

  getLobbyState() {
    return {
      code: this.code,
      host: this.hostSocketId,
      settings: this.settings,
      players: [...this.players.values()].map(p => ({
        socketId: p.socketId,
        name: p.name,
        color: p.color,
      })),
      phase: this.phase,
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _setPhase(phase) {
    this.phase = phase
    log('info', 'phase_changed', { room: this.code, phase })
  }

  _broadcast(event, data) {
    this.io.to(this.code).emit(event, data)
  }

  _playerPublic(socketId, viewerSocketId) {
    return this.players.get(socketId)?.toPublicState(viewerSocketId)
  }

  destroy() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer)
    if (this.stateInterval) clearInterval(this.stateInterval)
    if (this.voteManager) this.voteManager.stop()
    if (this.sabotageManager) this.sabotageManager.stop()
  }
}

module.exports = { GameRoom, PHASES }
