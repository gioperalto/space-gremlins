'use strict'

const ROLES = { CREWMATE: 'crewmate', GREMLIN: 'gremlin' }

class Player {
  constructor({ socketId, name, color, roomCode }) {
    this.socketId = socketId
    this.name = name
    this.color = color
    this.roomCode = roomCode

    // Position — set at game start
    this.x = 320
    this.y = 180

    this.role = null          // assigned at game start
    this.alive = true
    this.isGhost = false

    // Tasks assigned to this player (array of task IDs)
    this.assignedTasks = []
    this.completedTasks = new Set()

    // Kill cooldown (gremlins)
    this.killCooldownMs = 0
    this.lastKillTime = 0

    // Session reconnect
    this.disconnectedAt = null
    this.reconnectToken = null

    // Per-game stats
    this.kills = 0
    this.tasksCompleted = 0
  }

  assignRole(role) {
    this.role = role
  }

  isGremlin() {
    return this.role === ROLES.GREMLIN
  }

  canKill(targetPlayer, killCooldownMs) {
    if (!this.isGremlin()) return false
    if (!this.alive) return false
    if (!targetPlayer.alive) return false
    if (targetPlayer.isGremlin()) return false
    const now = Date.now()
    if (now - this.lastKillTime < killCooldownMs) return false
    return true
  }

  kill() {
    this.alive = false
    this.isGhost = true
  }

  die(byPlayer) {
    this.alive = false
    this.isGhost = true
    this.bodyPosition = { x: this.x, y: this.y }
    this.killedBy = byPlayer ? byPlayer.socketId : null
  }

  toPublicState(forSocketId) {
    // What other players can see about this player
    const isOwn = this.socketId === forSocketId
    return {
      socketId: this.socketId,
      name: this.name,
      color: this.color,
      x: this.x,
      y: this.y,
      alive: this.alive,
      isGhost: this.isGhost,
      // Role only revealed to self or after game ends
      role: isOwn ? this.role : undefined,
      taskProgress: isOwn ? {
        assigned: this.assignedTasks,
        completed: Array.from(this.completedTasks),
      } : {
        completed: this.completedTasks.size,
        total: this.assignedTasks.length,
      },
    }
  }

  toAdminState() {
    return {
      socketId: this.socketId,
      name: this.name,
      color: this.color,
      x: this.x,
      y: this.y,
      alive: this.alive,
      role: this.role,
      assignedTasks: this.assignedTasks,
      completedTasks: Array.from(this.completedTasks),
      kills: this.kills,
    }
  }
}

module.exports = { Player, ROLES }
