import Phaser from 'phaser'
import {
  PALETTE, PLAYER_COLORS, CONSTANTS, ROOMS, CORRIDORS, WALKABLE_AREAS,
  TASK_STATIONS, VENTS, EMERGENCY_BUTTON, WORLD_W, WORLD_H, BASE_W, BASE_H,
} from '../config.js'
import { socketClient } from '../network/SocketClient.js'
import { soundManager } from '../audio/SoundManager.js'
import { TaskUI } from '../tasks/TaskUI.js'

export class Game extends Phaser.Scene {
  constructor() { super('Game') }

  init(data) {
    this._role = data.role || 'crewmate'
    this._gremlinAllies = data.gremlinAllies || []
    this._gameSettings = data.settings || {}
    this._myColor = data.myColor || PLAYER_COLORS[0]
    this._myName = data.myName || 'Player'
  }

  create() {
    // ─── State ───────────────────────────────────────────────────────────────
    this._players = new Map()   // socketId -> { sprite, nameText, data }
    this._bodies = []
    this._taskProgress = { completed: 0, total: 0, percent: 0 }
    this._activeSabotage = null
    this._sabotageSoundInterval = null
    this._phase = 'taskPhase'
    this._myAlive = true
    this._myAssignedTasks = []
    this._myCompletedTasks = new Set()
    this._nearbyTaskId = null
    this._nearbyBodyId = null
    this._nearbyEmergency = false
    this._nearbyVentId = null
    this._screenShake = { frames: 0, intensity: 0 }
    this._popups = []
    this._particles = []
    this._footstepTimer = 0
    this._taskUI = null
    this._inVent = false
    this._moving = false
    this._moveTarget = null
    this._killCooldownRemaining = this._gameSettings.killCooldown || 25

    // ─── Camera ──────────────────────────────────────────────────────────────
    this.cameras.main.setBackgroundColor(PALETTE.bgDark)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H)

    // ─── World ───────────────────────────────────────────────────────────────
    this._buildWorld()
    this._createVents()
    this._createTaskStations()
    this._createEmergencyButton()
    this._createHUD()
    this._createFogOfWar()
    this._createPlayerSprite(socketClient.id, this._myColor, this._myName, true)

    // ─── Input ───────────────────────────────────────────────────────────────
    this.input.on('pointerdown', this._onPointerDown, this)

    // ─── Socket listeners ────────────────────────────────────────────────────
    this._unsubs = [
      socketClient.on('game:state', (s) => this._onGameState(s)),
      socketClient.on('player:moved', (d) => this._onPlayerMoved(d)),
      socketClient.on('player:killed', (d) => this._onPlayerKilled(d)),
      socketClient.on('task:completed', (d) => this._onTaskCompleted(d)),
      socketClient.on('meeting:started', (d) => this._onMeetingStarted(d)),
      socketClient.on('game:over', (d) => this._onGameOver(d)),
      socketClient.on('sabotage:triggered', (d) => this._onSabotageTrigger(d)),
      socketClient.on('sabotage:fixed', (d) => this._onSabotageFixed(d)),
      socketClient.on('vent:teleport', (d) => this._onVentTeleport(d)),
      socketClient.on('game:lobby_reset', () => {
        this._cleanup()
        this.scene.start('Lobby')
      }),
    ]

    // ─── Kill cooldown tick ───────────────────────────────────────────────────
    if (this._role === 'gremlin') {
      this._killCooldownTimer = this.time.addEvent({
        delay: 1000, loop: true,
        callback: () => {
          if (this._killCooldownRemaining > 0) {
            this._killCooldownRemaining--
            this._updateKillCooldownHUD()
          }
        }
      })
    }
  }

  // ─── World building ──────────────────────────────────────────────────────────

  _buildWorld() {
    const gfx = this.add.graphics().setDepth(CONSTANTS.DEPTH_FLOOR)

    // Deep space background
    gfx.fillStyle(PALETTE.bgDark, 1)
    gfx.fillRect(0, 0, WORLD_W, WORLD_H)

    // Star field
    for (let i = 0; i < 120; i++) {
      const alpha = 0.1 + Math.random() * 0.4
      const size = Math.random() < 0.1 ? 2 : 1
      gfx.fillStyle(0xffffff, alpha)
      gfx.fillRect(Math.random() * WORLD_W, Math.random() * WORLD_H, size, size)
    }

    // Draw walkable areas (corridors first, then rooms on top)
    for (const area of CORRIDORS) {
      // Corridor floor
      gfx.fillStyle(PALETTE.floor, 1)
      gfx.fillRect(area.x, area.y, area.w, area.h)
      // Subtle grid lines
      gfx.lineStyle(1, PALETTE.wall, 0.15)
      for (let x = area.x; x < area.x + area.w; x += 8) {
        gfx.lineBetween(x, area.y, x, area.y + area.h)
      }
    }

    // Draw rooms
    for (const [, room] of Object.entries(ROOMS)) {
      // Room floor with slight gradient (lighter than corridor)
      gfx.fillStyle(PALETTE.floorLight, 1)
      gfx.fillRect(room.x, room.y, room.w, room.h)

      // Grid pattern
      gfx.lineStyle(1, PALETTE.wall, 0.12)
      for (let x = room.x; x < room.x + room.w; x += 8) {
        gfx.lineBetween(x, room.y, x, room.y + room.h)
      }
      for (let y = room.y; y < room.y + room.h; y += 8) {
        gfx.lineBetween(room.x, y, room.x + room.w, y)
      }

      // Room border
      gfx.lineStyle(2, PALETTE.wallLight, 1)
      gfx.strokeRect(room.x, room.y, room.w, room.h)

      // Room label
      this.add.text(room.x + room.w / 2, room.y + 8, room.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '5px', color: PALETTE.textDimStr,
      }).setOrigin(0.5, 0).setDepth(CONSTANTS.DEPTH_FLOOR + 1)
    }

    // Wall edges
    gfx.lineStyle(3, PALETTE.wall, 1)
    gfx.strokeRect(1, 1, WORLD_W - 2, WORLD_H - 2)
  }

  _createVents() {
    this._ventObjects = {}
    for (const vent of VENTS) {
      const g = this.add.graphics().setDepth(CONSTANTS.DEPTH_VENTS)
      g.fillStyle(0x445566, 1)
      g.fillRect(vent.x - 7, vent.y - 5, 14, 10)
      g.lineStyle(1, 0x667799, 1)
      for (let i = 1; i < 4; i++) {
        g.lineBetween(vent.x - 7 + i * 3, vent.y - 4, vent.x - 7 + i * 3, vent.y + 4)
      }
      g.strokeRect(vent.x - 7, vent.y - 5, 14, 10)

      // Invisible hitbox
      const hitbox = this.add.rectangle(vent.x, vent.y, 20, 16, 0x000000, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(CONSTANTS.DEPTH_VENTS)
        .setData('ventId', vent.id)
      this._ventObjects[vent.id] = { vent, hitbox, gfx: g }
    }
  }

  _createTaskStations() {
    this._taskStationObjects = {}
    for (const station of TASK_STATIONS) {
      const g = this.add.graphics().setDepth(CONSTANTS.DEPTH_TASK_STATIONS)
      g.fillStyle(PALETTE.task, 1)
      g.fillRect(station.x - 8, station.y - 8, 16, 16)
      g.fillStyle(0x000000, 1)
      g.fillRect(station.x - 5, station.y - 5, 10, 10)
      g.fillStyle(PALETTE.task, 0.6)
      g.fillRect(station.x - 3, station.y - 3, 6, 6)
      // Glow
      g.lineStyle(1, PALETTE.task, 0.5)
      g.strokeRect(station.x - 9, station.y - 9, 18, 18)

      const label = this.add.text(station.x, station.y + 12, station.label, {
        fontFamily: 'monospace', fontSize: '5px', color: PALETTE.taskStr,
      }).setOrigin(0.5).setDepth(CONSTANTS.DEPTH_TASK_STATIONS)

      this._taskStationObjects[station.id] = { station, gfx: g, label }
    }
  }

  _createEmergencyButton() {
    const eb = EMERGENCY_BUTTON
    const g = this.add.graphics().setDepth(CONSTANTS.DEPTH_TASK_STATIONS)
    g.fillStyle(0x880000, 1)
    g.fillRect(eb.x - 12, eb.y - 12, 24, 24)
    g.fillStyle(PALETTE.danger, 1)
    g.fillCircle(eb.x, eb.y, 9)
    g.fillStyle(0xffffff, 0.25)
    g.fillEllipse(eb.x - 3, eb.y - 3, 7, 4)

    this.add.text(eb.x, eb.y + 16, '!! EMERGENCY !!', {
      fontFamily: 'monospace', fontSize: '5px', color: PALETTE.dangerStr,
    }).setOrigin(0.5).setDepth(CONSTANTS.DEPTH_TASK_STATIONS)

    this._emergencyHitbox = this.add.rectangle(eb.x, eb.y, 30, 30, 0, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(CONSTANTS.DEPTH_TASK_STATIONS)
  }

  _createFogOfWar() {
    // Fog layer: dark overlay with a radial hole around the player
    this._fogRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H)
      .setDepth(CONSTANTS.DEPTH_FOG)
    this._fogGfx = this.make.graphics({ x: 0, y: 0, add: false })
  }

  _updateFogOfWar(px, py) {
    const isLightsOut = this._activeSabotage?.type === 'lights_out'
    const baseRadius = this._role === 'gremlin'
      ? CONSTANTS.VISION_RADIUS_GREMLIN
      : CONSTANTS.VISION_RADIUS_CREW
    const radius = isLightsOut ? CONSTANTS.VISION_RADIUS_LIGHTS_OUT : baseRadius

    this._fogGfx.clear()
    this._fogGfx.fillStyle(0x000000, 0.82)
    this._fogGfx.fillRect(0, 0, WORLD_W, WORLD_H)

    // Cut circular hole
    this._fogGfx.fillStyle(0x000000, 1)
    // We erase a circle using blend mode trick with renderTexture
    this._fogRT.clear()
    this._fogRT.draw(this._fogGfx, 0, 0)

    // Erase circle region via erasing fill
    const eraseGfx = this.make.graphics({ x: 0, y: 0, add: false })
    eraseGfx.fillStyle(0x000000, 1)
    eraseGfx.fillCircle(px, py, radius)

    this._fogRT.erase(eraseGfx, 0, 0)
    eraseGfx.destroy()
  }

  // ─── Player sprites ───────────────────────────────────────────────────────────

  _createPlayerSprite(socketId, colorObj, name, isLocal = false) {
    const colorKey = `player_${colorObj.name.toLowerCase()}`
    const sprite = this.add.image(320, 180, colorKey)
      .setDepth(isLocal ? CONSTANTS.DEPTH_LOCAL_PLAYER : CONSTANTS.DEPTH_PLAYERS)
      .setScale(1.2)

    const nameText = this.add.text(0, 0, name, {
      fontFamily: 'monospace', fontSize: '5px', color: Phaser.Display.Color.ValueToColor(colorObj.hex).rgba,
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(CONSTANTS.DEPTH_LOCAL_PLAYER)

    this._players.set(socketId, { sprite, nameText, data: { socketId, x: 320, y: 180, alive: true } })

    if (isLocal) {
      this._mySprite = sprite
      this.cameras.main.startFollow(sprite, true, 0.12, 0.12)
    }
    return sprite
  }

  _updatePlayerSprite(socketId, data) {
    let entry = this._players.get(socketId)
    if (!entry) {
      const colorName = (data.color || 'red').toLowerCase()
      const col = PLAYER_COLORS.find(c => c.name.toLowerCase() === colorName) || PLAYER_COLORS[0]
      this._createPlayerSprite(socketId, col, data.name || '?', false)
      entry = this._players.get(socketId)
    }
    Object.assign(entry.data, data)
  }

  _movePlayerSpriteTowards(socketId, targetX, targetY) {
    const entry = this._players.get(socketId)
    if (!entry) return
    entry.data.x = targetX
    entry.data.y = targetY
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────────

  _createHUD() {
    // Fixed camera overlay
    const cam = this.cameras.main
    const hudDepth = CONSTANTS.DEPTH_HUD

    // Task progress bar (top)
    this._taskBarBg = this.add.rectangle(BASE_W / 2, 4, BASE_W - 20, CONSTANTS.TASKBAR_H, 0x333344)
      .setScrollFactor(0).setDepth(hudDepth).setOrigin(0.5, 0)
    this._taskBarFill = this.add.rectangle(10, 4, 0, CONSTANTS.TASKBAR_H, PALETTE.primary)
      .setScrollFactor(0).setDepth(hudDepth).setOrigin(0, 0)
    this._taskBarLabel = this.add.text(BASE_W - 12, 7, 'TASKS 0%', {
      fontFamily: 'monospace', fontSize: '5px', color: PALETTE.primaryStr,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(hudDepth)

    // Role indicator
    const roleColor = this._role === 'gremlin' ? PALETTE.dangerStr : PALETTE.primaryStr
    this._roleText = this.add.text(12, 7, this._role.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '6px', color: roleColor,
      stroke: '#000000', strokeThickness: 1,
    }).setScrollFactor(0).setDepth(hudDepth).setOrigin(0, 0.5)

    // Kill/sabotage buttons (gremlin only)
    if (this._role === 'gremlin') {
      this._killBtn = this._createHUDButton(BASE_W - 28, BASE_H - 28, 'KILL', PALETTE.danger, () => this._tryKill())
      this._sabotageBtn = this._createHUDButton(BASE_W - 28, BASE_H - 10, 'SABO', 0xff8800, () => this._showSabotageMenu())
      this._killCooldownText = this.add.text(BASE_W - 50, BASE_H - 28, `${this._killCooldownRemaining}s`, {
        fontFamily: 'monospace', fontSize: '6px', color: PALETTE.dangerStr,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(hudDepth)
    }

    // Task list (bottom left)
    this._taskListText = this.add.text(4, BASE_H - 4, '', {
      fontFamily: 'monospace', fontSize: '5px', color: PALETTE.textDimStr,
      lineSpacing: 2,
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(hudDepth)

    // Interaction prompt
    this._interactPrompt = this.add.text(BASE_W / 2, BASE_H - 14, '', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.taskStr,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hudDepth)

    // Sabotage warning
    this._sabotageWarning = this.add.text(BASE_W / 2, 20, '', {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.dangerStr,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hudDepth)
  }

  _createHUDButton(x, y, text, color, callback) {
    const bg = this.add.rectangle(x, y, 44, 12, 0x000000)
      .setStrokeStyle(1, color)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0).setDepth(CONSTANTS.DEPTH_HUD)
      .on('pointerover', () => bg.setFillStyle(color, 0.2))
      .on('pointerout', () => bg.setFillStyle(0x000000))
      .on('pointerdown', callback)

    this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '6px', color: Phaser.Display.Color.ValueToColor(color).rgba,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_HUD)

    return bg
  }

  _updateTaskBar() {
    const pct = this._taskProgress.percent || 0
    const w = (BASE_W - 20) * pct
    this._taskBarFill.setSize(Math.max(0, w), CONSTANTS.TASKBAR_H)
    this._taskBarLabel.setText(`TASKS ${Math.round(pct * 100)}%`)
  }

  _updateTaskList() {
    if (!this._myAssignedTasks.length) return
    const lines = this._myAssignedTasks.map(id => {
      const done = this._myCompletedTasks.has(id)
      return `${done ? '✓' : '○'} ${id.replace(/_/g, ' ')}`
    })
    this._taskListText.setText(lines.join('\n'))
  }

  _updateKillCooldownHUD() {
    if (this._killCooldownText) {
      this._killCooldownText.setText(
        this._killCooldownRemaining > 0 ? `${this._killCooldownRemaining}s` : 'READY'
      )
    }
  }

  _updateInteractPrompt() {
    let hint = ''
    if (this._nearbyTaskId && !this._myCompletedTasks.has(this._nearbyTaskId)) {
      hint = '[TAP] Do Task'
    } else if (this._nearbyBodyId) {
      hint = '[TAP] Report Body'
    } else if (this._nearbyEmergency) {
      hint = '[TAP] Emergency!'
    } else if (this._nearbyVentId && this._role === 'gremlin') {
      hint = '[TAP] Enter Vent'
    }
    this._interactPrompt.setText(hint)
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  _onPointerDown(pointer) {
    if (this._taskUI?.active) return
    if (!this._myAlive) return
    if (this._phase !== 'taskPhase') return

    const wx = pointer.worldX, wy = pointer.worldY

    // Check vent interaction
    if (this._nearbyVentId && this._role === 'gremlin') {
      const d = this._distanceTo(wx, wy, this._getVentPos(this._nearbyVentId))
      if (d < 30) { this._useVent(); return }
    }

    // Check task interaction
    if (this._nearbyTaskId) {
      const station = TASK_STATIONS.find(s => s.id === this._nearbyTaskId)
      if (station) {
        const d = Math.hypot(wx - station.x, wy - station.y)
        if (d < 30) { this._openTask(this._nearbyTaskId); return }
      }
    }

    // Check body report
    if (this._nearbyBodyId) {
      const body = this._bodies.find(b => b.playerId === this._nearbyBodyId)
      if (body) {
        const d = Math.hypot(wx - body.x, wy - body.y)
        if (d < 30) { this._reportBody(this._nearbyBodyId); return }
      }
    }

    // Check emergency
    if (this._nearbyEmergency) {
      const eb = EMERGENCY_BUTTON
      const d = Math.hypot(wx - eb.x, wy - eb.y)
      if (d < 25) { this._callEmergency(); return }
    }

    // Move
    this._setMoveTarget(wx, wy)
  }

  _setMoveTarget(x, y) {
    // Clamp to world bounds
    x = Phaser.Math.Clamp(x, 0, WORLD_W)
    y = Phaser.Math.Clamp(y, 0, WORLD_H)
    this._moveTarget = { x, y }
    this._moving = true
  }

  // ─── Interactions ──────────────────────────────────────────────────────────

  async _openTask(taskId) {
    if (this._myCompletedTasks.has(taskId)) return
    this._moving = false

    if (!this._taskUI) {
      this._taskUI = new TaskUI(this)
    }
    const completed = await this._taskUI.open(taskId, this._role)
    if (completed) {
      const result = await socketClient.interactTask(taskId, 'complete', {})
      if (result?.ok) {
        this._myCompletedTasks.add(taskId)
        soundManager.taskComplete()
        this._spawnTaskParticles()
        this._updateTaskList()
      }
    }
  }

  async _reportBody(bodyPlayerId) {
    const result = await socketClient.reportBody(bodyPlayerId)
    if (!result?.ok) this._showHint(result?.reason || 'Cannot report', PALETTE.dangerStr)
    else soundManager.bodyReport()
  }

  async _callEmergency() {
    soundManager.emergencyButton()
    const result = await socketClient.callEmergency()
    if (!result?.ok) this._showHint(result?.reason || 'Cannot call emergency', PALETTE.dangerStr)
  }

  async _tryKill() {
    if (this._killCooldownRemaining > 0) return
    // Find nearest alive crewmate
    let nearest = null, nearestDist = CONSTANTS.KILL_RANGE
    const myEntry = this._players.get(socketClient.id)
    if (!myEntry) return
    const mx = myEntry.data.x, my = myEntry.data.y

    for (const [id, entry] of this._players) {
      if (id === socketClient.id) continue
      if (!entry.data.alive) continue
      const dist = Math.hypot(entry.data.x - mx, entry.data.y - my)
      if (dist < nearestDist) { nearestDist = dist; nearest = id }
    }

    if (!nearest) { this._showHint('No target in range', PALETTE.dangerStr); return }

    const result = await socketClient.sendKill(nearest)
    if (result?.ok) {
      this._killCooldownRemaining = this._gameSettings.killCooldown || 25
      soundManager.kill()
      this.cameras.main.shake(120, 0.006)
    } else {
      this._showHint(result?.reason || 'Kill failed', PALETTE.dangerStr)
    }
  }

  async _useVent() {
    if (!this._nearbyVentId) return
    if (!this._inVent) {
      const result = await socketClient.useVent(this._nearbyVentId, 'enter')
      if (result?.ok) {
        soundManager.ventEnter()
        this._inVent = true
        this._inVentId = this._nearbyVentId
        this._showVentMenu()
      }
    }
  }

  _showVentMenu() {
    const vent = VENTS.find(v => v.id === this._inVentId)
    if (!vent) return

    // Simple vent navigation: teleport to linked vent
    const cx = BASE_W / 2, cy = BASE_H / 2
    const panel = this.add.container(0, 0).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_MODAL)

    const bg = this.add.rectangle(cx, cy, 120, 50, 0x000000, 0.9)
      .setStrokeStyle(1, 0x445566)
    panel.add(bg)
    panel.add(this.add.text(cx, cy - 18, 'VENT', {
      fontFamily: 'monospace', fontSize: '9px', color: '#445566',
    }).setOrigin(0.5))

    vent.links.forEach((linkId, i) => {
      const target = VENTS.find(v => v.id === linkId)
      if (!target) return
      const btn = this.add.rectangle(cx, cy - 4 + i * 16, 80, 12, 0x001122)
        .setStrokeStyle(1, 0x445566).setInteractive({ useHandCursor: true })
        .on('pointerdown', async () => {
          panel.destroy()
          const myEntry = this._players.get(socketClient.id)
          if (myEntry) { myEntry.data.x = target.x; myEntry.data.y = target.y }
          socketClient.sendMove(target.x, target.y)
          soundManager.ventExit()
          this._inVent = false
        })
      panel.add(btn)
      panel.add(this.add.text(cx, cy - 4 + i * 16, `Go to ${target.room}`, {
        fontFamily: 'monospace', fontSize: '6px', color: '#667799',
      }).setOrigin(0.5))
    })

    const exitBtn = this.add.rectangle(cx, cy + 18, 60, 10, 0x000000)
      .setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => { panel.destroy(); this._inVent = false })
    panel.add(exitBtn)
    panel.add(this.add.text(cx, cy + 18, 'EXIT VENT', {
      fontFamily: 'monospace', fontSize: '5px', color: '#666666',
    }).setOrigin(0.5))
  }

  _showSabotageMenu() {
    if (this._activeSabotage) { this._showHint('Sabotage already active', PALETTE.dangerStr); return }
    const cx = BASE_W / 2, cy = BASE_H / 2
    const panel = this.add.container(0, 0).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_MODAL)

    const bg = this.add.rectangle(cx, cy, 130, 70, 0x000000, 0.9)
      .setStrokeStyle(1, PALETTE.danger)
    panel.add(bg)
    panel.add(this.add.text(cx, cy - 28, 'SABOTAGE', {
      fontFamily: 'monospace', fontSize: '9px', color: PALETTE.dangerStr,
    }).setOrigin(0.5))

    const options = [
      { type: 'lights_out', label: 'Lights Out' },
      { type: 'reactor_meltdown', label: 'Reactor Meltdown' },
      { type: 'comms_disruption', label: 'Comms Disruption' },
    ]
    options.forEach((opt, i) => {
      const y = cy - 12 + i * 16
      const btn = this.add.rectangle(cx, y, 110, 12, 0x110000)
        .setStrokeStyle(1, PALETTE.danger).setInteractive({ useHandCursor: true })
        .on('pointerdown', async () => {
          panel.destroy()
          const result = await socketClient.triggerSabotage(opt.type)
          if (!result?.ok) this._showHint(result?.reason || 'Failed', PALETTE.dangerStr)
        })
      panel.add(btn)
      panel.add(this.add.text(cx, y, opt.label, {
        fontFamily: 'monospace', fontSize: '6px', color: PALETTE.dangerStr,
      }).setOrigin(0.5))
    })

    const cancel = this.add.rectangle(cx, cy + 28, 60, 10, 0x000000)
      .setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => panel.destroy())
    panel.add(cancel)
    panel.add(this.add.text(cx, cy + 28, 'CANCEL', {
      fontFamily: 'monospace', fontSize: '5px', color: '#666666',
    }).setOrigin(0.5))
  }

  // ─── Socket event handlers ────────────────────────────────────────────────────

  _onGameState(state) {
    if (state.phase) this._phase = state.phase
    if (state.taskProgress) {
      this._taskProgress = state.taskProgress
      this._updateTaskBar()
    }
    if (state.sabotage !== undefined) {
      this._activeSabotage = state.sabotage
      this._updateSabotageHUD()
    }

    for (const playerData of (state.players || [])) {
      this._updatePlayerSprite(playerData.socketId, playerData)
      if (playerData.socketId === socketClient.id) {
        this._myAlive = playerData.alive
        if (playerData.taskProgress?.assigned) {
          this._myAssignedTasks = playerData.taskProgress.assigned
          this._myCompletedTasks = new Set(playerData.taskProgress.completed || [])
          this._updateTaskList()
        }
      }
    }

    this._bodies = state.bodies || []
    this._syncBodySprites()
  }

  _onPlayerMoved({ socketId, x, y }) {
    const entry = this._players.get(socketId)
    if (entry) {
      entry.data.x = x
      entry.data.y = y
    }
  }

  _onPlayerKilled({ killerSocketId, targetSocketId, x, y }) {
    const entry = this._players.get(targetSocketId)
    if (entry) {
      entry.data.alive = false
    }
    this._spawnBloodParticles(x, y)
    if (targetSocketId === socketClient.id) {
      this._myAlive = false
      this._showDeathOverlay()
    } else {
      this.cameras.main.shake(80, 0.005)
    }
    soundManager.kill()
  }

  _onTaskCompleted({ socketId, taskId, progress }) {
    if (progress) {
      this._taskProgress = progress
      this._updateTaskBar()
    }
    if (socketId === socketClient.id) {
      this._myCompletedTasks.add(taskId)
      this._updateTaskList()
    }
    // Show sparkle at station
    const station = TASK_STATIONS.find(s => s.id === taskId)
    if (station) this._spawnTaskParticles(station.x, station.y)
  }

  _onMeetingStarted(data) {
    this._moving = false
    soundManager.meetingBell()
    this.cameras.main.flash(300, 255, 255, 255, false, null, null)
    // Transition to Meeting scene as overlay
    this.scene.launch('Meeting', { meetingData: data, gameScene: this })
    this.scene.pause()
  }

  _onGameOver(data) {
    this._cleanup()
    this.scene.start('GameOver', data)
  }

  _onSabotageTrigger({ type, sabotage }) {
    this._activeSabotage = sabotage
    this._updateSabotageHUD()
    if (!this._sabotageSoundInterval) {
      this._sabotageSoundInterval = soundManager.sabotageAlarm()
    }
    this.cameras.main.shake(200, 0.01)
  }

  _onSabotageFixed({ type }) {
    this._activeSabotage = null
    if (this._sabotageSoundInterval) {
      clearInterval(this._sabotageSoundInterval)
      this._sabotageSoundInterval = null
    }
    this._updateSabotageHUD()
  }

  _onVentTeleport({ ventId, action }) {
    // Handled in _showVentMenu callback
  }

  _updateSabotageHUD() {
    if (!this._activeSabotage) {
      this._sabotageWarning.setText('')
      return
    }
    const messages = {
      lights_out: '⚠ LIGHTS OUT — Fix at Storage!',
      reactor_meltdown: '⚠⚠ REACTOR MELTDOWN — 2 players fix Reactor!',
      comms_disruption: '⚠ COMMS DOWN — Fix at Bridge!',
    }
    this._sabotageWarning.setText(messages[this._activeSabotage.type] || '⚠ SABOTAGE!')
  }

  // ─── Body sprites ─────────────────────────────────────────────────────────────

  _syncBodySprites() {
    // Remove old body sprites
    for (const key of [...this._bodySprites?.keys() || []]) {
      if (!this._bodies.find(b => b.playerId === key)) {
        this._bodySprites.get(key)?.destroy()
        this._bodySprites.delete(key)
      }
    }
    if (!this._bodySprites) this._bodySprites = new Map()

    for (const body of this._bodies) {
      if (!this._bodySprites.has(body.playerId)) {
        const bodyData = this._players.get(body.playerId)?.data
        const colorName = (bodyData?.color || 'red').toLowerCase()
        const sprite = this.add.image(body.x, body.y, `body_${colorName}`)
          .setDepth(CONSTANTS.DEPTH_BODIES)
          .setInteractive({ useHandCursor: true })

        this._bodySprites.set(body.playerId, sprite)
      }
    }
  }

  // ─── Proximity detection ──────────────────────────────────────────────────────

  _checkProximity(mx, my) {
    // Tasks
    this._nearbyTaskId = null
    for (const station of TASK_STATIONS) {
      if (!this._myAssignedTasks.includes(station.id)) continue
      if (this._myCompletedTasks.has(station.id)) continue
      if (Math.hypot(mx - station.x, my - station.y) <= CONSTANTS.TASK_INTERACT_RANGE) {
        this._nearbyTaskId = station.id
        break
      }
    }

    // Bodies
    this._nearbyBodyId = null
    for (const body of this._bodies) {
      if (body.reported) continue
      if (Math.hypot(mx - body.x, my - body.y) <= CONSTANTS.BODY_INTERACT_RANGE) {
        this._nearbyBodyId = body.playerId
        break
      }
    }

    // Emergency button
    const eb = EMERGENCY_BUTTON
    this._nearbyEmergency = Math.hypot(mx - eb.x, my - eb.y) <= 30

    // Vents (gremlin only)
    this._nearbyVentId = null
    if (this._role === 'gremlin') {
      for (const vent of VENTS) {
        if (Math.hypot(mx - vent.x, my - vent.y) <= CONSTANTS.VENT_INTERACT_RANGE) {
          this._nearbyVentId = vent.id
          break
        }
      }
    }
  }

  _getVentPos(ventId) {
    const vent = VENTS.find(v => v.id === ventId)
    return vent ? { x: vent.x, y: vent.y } : { x: 0, y: 0 }
  }

  _distanceTo(ax, ay, b) {
    return Math.hypot(ax - b.x, ay - b.y)
  }

  // ─── Juice / polish ───────────────────────────────────────────────────────────

  _spawnBloodParticles(x, y) {
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.5
      const speed = 30 + Math.random() * 80
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, color: PALETTE.danger,
        obj: this.add.rectangle(x, y, 2, 2, PALETTE.danger).setDepth(CONSTANTS.DEPTH_PLAYERS + 1),
      })
    }
  }

  _spawnTaskParticles(x, y) {
    const sx = x || this._mySprite?.x || BASE_W / 2
    const sy = y || this._mySprite?.y || BASE_H / 2
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12
      const speed = 20 + Math.random() * 40
      this._particles.push({
        x: sx, y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 1, color: PALETTE.task,
        obj: this.add.rectangle(sx, sy, 2, 2, PALETTE.task).setDepth(CONSTANTS.DEPTH_PLAYERS + 1),
      })
    }
  }

  _showDeathOverlay() {
    const cx = BASE_W / 2, cy = BASE_H / 2
    this.cameras.main.flash(500, 255, 0, 0)
    const g = this.add.graphics().setScrollFactor(0).setDepth(CONSTANTS.DEPTH_OVERLAY)
    g.fillStyle(PALETTE.danger, 0.25)
    g.fillRect(0, 0, BASE_W, BASE_H)
    this.add.text(cx, cy, 'YOU DIED', {
      fontFamily: 'monospace', fontSize: '18px', color: PALETTE.dangerStr,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_OVERLAY)
    this.add.text(cx, cy + 16, 'Complete tasks as a ghost...', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_OVERLAY)
  }

  _showHint(msg, color = PALETTE.task) {
    const cx = BASE_W / 2
    const txt = this.add.text(cx, BASE_H - 24, msg, {
      fontFamily: 'monospace', fontSize: '7px', color: Phaser.Display.Color.ValueToColor(color).rgba,
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_HUD)
    this.tweens.add({ targets: txt, alpha: 0, y: txt.y - 10, duration: 2000, onComplete: () => txt.destroy() })
  }

  _spawnPopup(x, y, text, color = 0xffff00) {
    const popup = {
      text: this.add.text(x, y, text, {
        fontFamily: 'monospace', fontSize: '6px',
        color: Phaser.Display.Color.ValueToColor(color).rgba,
        stroke: '#000000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(CONSTANTS.DEPTH_PLAYERS + 2),
      life: 1.2,
      vy: -25,
    }
    this._popups.push(popup)
  }

  // ─── Update loop ──────────────────────────────────────────────────────────────

  update(time, delta) {
    const dt = delta / 1000
    if (this._phase !== 'taskPhase' && this._phase !== 'ejection') return
    if (!this._myAlive && this._phase !== 'taskPhase') return

    const myEntry = this._players.get(socketClient.id)
    if (!myEntry) return

    // ─── Player movement ────────────────────────────────────────────────────
    if (this._moving && this._moveTarget) {
      const { x: tx, y: ty } = this._moveTarget
      const mx = myEntry.data.x, my = myEntry.data.y
      const dx = tx - mx, dy = ty - my
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 2) {
        this._moving = false
        this._moveTarget = null
      } else {
        const speed = CONSTANTS.PLAYER_SPEED * dt
        const ratio = Math.min(1, speed / dist)
        const nx = mx + dx * ratio
        const ny = my + dy * ratio

        myEntry.data.x = nx
        myEntry.data.y = ny
        socketClient.sendMove(nx, ny)

        // Footstep sound
        this._footstepTimer += dt
        if (this._footstepTimer > 0.25) {
          soundManager.footstep()
          this._footstepTimer = 0
        }

        // Idle bob animation
        const bob = Math.sin(time * 0.006) * 1.5
        myEntry.sprite.setY(ny + bob)
      }
    } else {
      // Still — slight idle bob
      if (myEntry.sprite) {
        const bob = Math.sin(time * 0.003) * 0.8
        myEntry.sprite.setY(myEntry.data.y + bob)
      }
    }

    // ─── Update all player sprites ─────────────────────────────────────────
    for (const [id, entry] of this._players) {
      if (!entry.sprite) continue
      if (id !== socketClient.id) {
        // Smooth interpolation for remote players
        const sx = entry.sprite.x, sy = entry.sprite.y
        entry.sprite.setX(Phaser.Math.Linear(sx, entry.data.x, 0.18))
        entry.sprite.setY(Phaser.Math.Linear(sy, entry.data.y, 0.18))
      } else {
        if (!this._moving) {
          // Already set above with bob
        } else {
          entry.sprite.setX(entry.data.x)
        }
      }
      // Name text follows sprite
      if (entry.nameText) {
        entry.nameText.setX(entry.sprite.x)
        entry.nameText.setY(entry.sprite.y - 12)
      }
      // Ghost: semi-transparent
      if (!entry.data.alive && entry.data.isGhost) {
        entry.sprite.setAlpha(0.4)
        if (entry.nameText) entry.nameText.setAlpha(0.4)
      }
    }

    // ─── Proximity checks ──────────────────────────────────────────────────
    this._checkProximity(myEntry.data.x, myEntry.data.y)
    this._updateInteractPrompt()

    // ─── Fog of war ────────────────────────────────────────────────────────
    const px = myEntry.sprite?.x || myEntry.data.x
    const py = myEntry.sprite?.y || myEntry.data.y
    this._updateFogOfWar(px, py)

    // ─── Particles ─────────────────────────────────────────────────────────
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 120 * dt  // gravity
      p.life -= dt * 2
      if (p.life <= 0) {
        p.obj.destroy()
        this._particles.splice(i, 1)
      } else {
        p.obj.setPosition(p.x, p.y).setAlpha(p.life)
      }
    }

    // ─── Popups ────────────────────────────────────────────────────────────
    for (let i = this._popups.length - 1; i >= 0; i--) {
      const p = this._popups[i]
      p.life -= dt
      p.text.y += p.vy * dt
      p.text.setAlpha(Math.min(1, p.life * 2))
      if (p.life <= 0) { p.text.destroy(); this._popups.splice(i, 1) }
    }

    // ─── Task station highlights (nearby assigned stations) ────────────────
    this._updateTaskStationHighlights()

    // ─── Sabotage timer ────────────────────────────────────────────────────
    if (this._activeSabotage) {
      const remaining = Math.max(0, this._activeSabotage.remaining - delta)
      this._activeSabotage.remaining = remaining
    }
  }

  _updateTaskStationHighlights() {
    for (const [id, obj] of Object.entries(this._taskStationObjects)) {
      const isAssigned = this._myAssignedTasks.includes(id)
      const isDone = this._myCompletedTasks.has(id)
      const alpha = isDone ? 0.3 : (isAssigned ? 1.0 : 0.4)
      obj.gfx.setAlpha(alpha)
      obj.label.setAlpha(alpha)
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  _cleanup() {
    this._unsubs?.forEach(fn => fn())
    if (this._sabotageSoundInterval) clearInterval(this._sabotageSoundInterval)
    if (this._killCooldownTimer) this._killCooldownTimer.remove()
  }

  shutdown() { this._cleanup() }
}
