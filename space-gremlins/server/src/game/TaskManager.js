'use strict'

// All task definitions shared between server (for validation/assignment) and client (for rendering)
const TASK_DEFINITIONS = [
  { id: 'swipe_card',     name: 'Swipe Card',        room: 'cafeteria',   type: 'simple',   duration: 3000 },
  { id: 'download_data',  name: 'Download Data',     room: 'bridge',      type: 'simple',   duration: 8000 },
  { id: 'medbay_scan',    name: 'Medbay Scan',       room: 'medbay',      type: 'simple',   duration: 10000 },
  { id: 'wire_connect',   name: 'Connect Wires',     room: 'storage',     type: 'minigame', duration: null },
  { id: 'reactor_align',  name: 'Reactor Alignment', room: 'reactor',     type: 'minigame', duration: null },
  { id: 'engine_tune',    name: 'Engine Tuning',     room: 'engineroom',  type: 'minigame', duration: null },
  { id: 'fuel_transfer_a','name': 'Fill Fuel Canister', room: 'storage',  type: 'minigame', duration: null, partOf: 'fuel_transfer' },
  { id: 'fuel_transfer_b','name': 'Deliver Fuel',    room: 'engineroom',  type: 'minigame', duration: null, partOf: 'fuel_transfer' },
  { id: 'nav_chart',      name: 'Navigation Chart',  room: 'bridge',      type: 'minigame', duration: null },
]

const TASK_IDS = TASK_DEFINITIONS.map(t => t.id)

class TaskManager {
  constructor(settings) {
    this.tasksPerPlayer = settings.tasksPerPlayer || 4
    // Global task completion tracking
    this.taskCompletions = new Map()  // taskId -> Set of socketIds who completed it
    // Total tasks needed for crewmate task win
    this.totalTasksNeeded = 0
    this.totalTasksCompleted = 0
  }

  assignTasks(players) {
    // Each crewmate gets a random selection of tasks
    // Gremlins get the same tasks visually but completion has no effect
    const crewmates = players.filter(p => p.role === 'crewmate')

    TASK_IDS.forEach(id => this.taskCompletions.set(id, new Set()))

    this.totalTasksNeeded = crewmates.length * this.tasksPerPlayer
    this.totalTasksCompleted = 0

    for (const player of players) {
      const shuffled = [...TASK_IDS].sort(() => Math.random() - 0.5)
      player.assignedTasks = shuffled.slice(0, this.tasksPerPlayer)
    }
  }

  completeTask(player, taskId) {
    if (!player.assignedTasks.includes(taskId)) return { ok: false, reason: 'not_assigned' }
    if (player.completedTasks.has(taskId)) return { ok: false, reason: 'already_done' }
    if (player.role !== 'crewmate') {
      // Gremlins can "fake" tasks — register client-side but no server progress
      return { ok: true, fake: true }
    }

    player.completedTasks.add(taskId)
    player.tasksCompleted++
    this.taskCompletions.get(taskId)?.add(player.socketId)
    this.totalTasksCompleted++

    const progress = this.getProgress()
    return { ok: true, fake: false, progress }
  }

  getProgress() {
    return {
      completed: this.totalTasksCompleted,
      total: this.totalTasksNeeded,
      percent: this.totalTasksNeeded > 0
        ? Math.min(1, this.totalTasksCompleted / this.totalTasksNeeded)
        : 0,
    }
  }

  isTaskWin() {
    return this.totalTasksNeeded > 0 && this.totalTasksCompleted >= this.totalTasksNeeded
  }

  getTaskDefinition(taskId) {
    return TASK_DEFINITIONS.find(t => t.id === taskId)
  }

  static getDefinitions() {
    return TASK_DEFINITIONS
  }
}

module.exports = { TaskManager, TASK_DEFINITIONS, TASK_IDS }
