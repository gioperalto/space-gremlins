import Phaser from 'phaser'
import { PALETTE, PLAYER_COLORS, BASE_W, BASE_H } from '../config.js'
import { socketClient } from '../network/SocketClient.js'
import { showTextPrompt } from '../ui/TextPrompt.js'
import { uiText } from '../ui/textStyles.js'

const BTN_W = 120, BTN_H = 20

export class Lobby extends Phaser.Scene {
  constructor() { super('Lobby') }

  create() {
    this._state = 'connect'  // connect | waiting | settings
    this._myColor = PLAYER_COLORS[0]
    this._myName = 'Player'
    this._roomCode = ''
    this._isHost = false
    this._players = []
    this._settings = {}
    this._inputActive = null
    this._nameValue = ''
    this._codeValue = ''
    this._settingsPanelContainer = null

    this._setupSocket()
    this._drawConnectScreen()
  }

  _setupSocket() {
    socketClient.connect()

    this._unsubs = [
      socketClient.on('room:player_joined', ({ player }) => {
        if (!this._players.find(p => p.socketId === player.socketId)) {
          this._players.push(player)
        }
        this._refreshWaiting()
      }),
      socketClient.on('room:player_left', ({ socketId }) => {
        this._players = this._players.filter(p => p.socketId !== socketId)
        this._refreshWaiting()
      }),
      socketClient.on('room:host_changed', ({ hostSocketId }) => {
        this._isHost = hostSocketId === socketClient.id
        this._refreshWaiting()
      }),
      socketClient.on('lobby:settings_updated', ({ settings }) => {
        this._settings = settings
        this._refreshWaiting()
      }),
      socketClient.on('game:role_reveal', (data) => {
        this._cleanup()
        // Start Game scene (paused), then overlay RoleReveal on top
        this.scene.start('Game', {
          role: data.role,
          gremlinAllies: data.gremlinAllies,
          settings: data.settings,
          myColor: this._myColor,
          myName: this._myName,
        })
        this.scene.launch('RoleReveal', {
          role: data.role,
          gremlinAllies: data.gremlinAllies,
        })
        // Pause the Game scene while role reveal plays
        this.scene.pause('Game')
      }),
    ]
  }

  _cleanup() {
    this._unsubs?.forEach(fn => fn())
    this.children.removeAll(true)
  }

  // ─── Connect Screen ────────────────────────────────────────────────────────

  _drawConnectScreen() {
    this.children.removeAll(true)
    const cx = BASE_W / 2, cy = BASE_H / 2

    // Background
    const bg = this.add.graphics()
    bg.fillGradientStyle(PALETTE.bgDark, PALETTE.bgDark, PALETTE.bg, PALETTE.bg, 1)
    bg.fillRect(0, 0, BASE_W, BASE_H)

    // Stars
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * BASE_W
      const sy = Math.random() * BASE_H
      const alpha = 0.3 + Math.random() * 0.7
      this.add.rectangle(sx, sy, 1, 1, 0xffffff).setAlpha(alpha)
    }

    // Title
    uiText(this, cx, 28, 'SPACE GREMLINS', 'title', {
      color: PALETTE.primaryStr,
      strokeThickness: 7,
      letterSpacing: 1,
    }).setOrigin(0.5)

    uiText(this, cx, 44, 'social deduction in space', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)

    // Name field
    uiText(this, cx, 62, 'YOUR NAME', 'label', { color: PALETTE.textDimStr }).setOrigin(0.5)

    this._nameField = this._createInputField(cx, 74, 'Player', (val) => {
      this._myName = val || 'Player'
    })

    // Color selector
    uiText(this, cx, 90, 'COLOR', 'label', { color: PALETTE.textDimStr }).setOrigin(0.5)
    this._colorPicker = this._drawColorPicker(cx, 100)

    // Create / Join buttons
    this._btnCreate = this._drawButton(cx - 35, 120, 'CREATE GAME', PALETTE.primary, () => this._createGame())
    this._btnJoin  = this._drawButton(cx + 35, 120, 'JOIN GAME',   PALETTE.task,    () => this._showJoinInput())

    // Version
    uiText(this, BASE_W - 6, BASE_H - 5, 'v1.0', 'tiny', {
      color: PALETTE.textDimStr,
    }).setOrigin(1, 1)
  }

  _drawColorPicker(cx, y) {
    const container = this.add.container(cx, y)
    const totalW = PLAYER_COLORS.length * 14
    PLAYER_COLORS.forEach((col, i) => {
      const px = -totalW / 2 + i * 14 + 7
      const circle = this.add.circle(px, 0, 5, col.hex)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this._myColor = col
          this._refreshColorPicker(container)
        })
      container.add(circle)
    })
    this._refreshColorPicker(container)
    return container
  }

  _refreshColorPicker(container) {
    container.each((child, i) => {
      if (child.type === 'Arc') {
        const col = PLAYER_COLORS[i]
        child.setStrokeStyle(col === this._myColor ? 2 : 0, 0xffffff)
      }
    })
  }

  _showJoinInput() {
    const cx = BASE_W / 2
    // Overlay panel
    const panel = this.add.graphics()
    panel.fillStyle(0x000000, 0.8)
    panel.fillRoundedRect(cx - 70, 108, 140, 50, 4)
    panel.setDepth(20)

    uiText(this, cx, 116, 'ROOM CODE', 'label', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5).setDepth(21)

    const codeField = this._createInputField(cx, 128, '', (val) => {
      this._codeValue = val.toUpperCase()
    }, 6)
    codeField.setDepth(21)

    const btnOk = this._drawButton(cx - 20, 148, 'JOIN', PALETTE.primary, () => {
      if (this._codeValue.length === 6) this._joinGame(this._codeValue)
    })
    btnOk.setDepth(21)

    const btnCancel = this._drawButton(cx + 30, 148, 'BACK', PALETTE.textDim, () => {
      this._drawConnectScreen()
    })
    btnCancel.setDepth(21)
  }

  async _createGame() {
    if (!this._myName.trim()) this._myName = 'Player'
    const result = await socketClient.createRoom(this._myName.trim(), this._myColor.name.toLowerCase())
    if (result.ok) {
      this._roomCode = result.code
      this._isHost = true
      this._players = result.state.players
      this._settings = result.state.settings
      this._drawWaitingRoom()
    } else {
      this._showError(result.reason || 'Failed to create room')
    }
  }

  async _joinGame(code) {
    if (!this._myName.trim()) this._myName = 'Player'
    const result = await socketClient.joinRoom(code, this._myName.trim(), this._myColor.name.toLowerCase())
    if (result.ok) {
      this._roomCode = code.toUpperCase()
      this._isHost = result.state.host === socketClient.id
      this._players = result.state.players
      this._settings = result.state.settings
      this._drawWaitingRoom()
    } else {
      this._showError(result.reason || 'Failed to join room')
    }
  }

  // ─── Waiting Room ──────────────────────────────────────────────────────────

  _drawWaitingRoom() {
    this.children.removeAll(true)
    this._state = 'waiting'
    const cx = BASE_W / 2

    const bg = this.add.graphics()
    bg.fillGradientStyle(PALETTE.bgDark, PALETTE.bgDark, PALETTE.bg, PALETTE.bg, 1)
    bg.fillRect(0, 0, BASE_W, BASE_H)

    // Stars
    for (let i = 0; i < 40; i++) {
      this.add.rectangle(Math.random() * BASE_W, Math.random() * BASE_H, 1, 1, 0xffffff)
        .setAlpha(0.3 + Math.random() * 0.7)
    }

    uiText(this, cx, 12, 'WAITING ROOM', 'heading', {
      color: PALETTE.primaryStr,
      letterSpacing: 1,
    }).setOrigin(0.5)

    uiText(this, cx, 24, `Room: ${this._roomCode}`, 'body', {
      color: PALETTE.taskStr,
      strokeThickness: 5,
    }).setOrigin(0.5)

    // Players list
    this._playerListContainer = this.add.container(0, 0)
    this._renderPlayerList()

    // Settings button (host only)
    if (this._isHost) {
      this._drawButton(cx - 40, 142, 'SETTINGS', PALETTE.textDim, () => this._showSettingsPanel())
      this._startBtn = this._drawButton(cx + 30, 158, 'START GAME', PALETTE.primary, () => this._startGame())
    } else {
      uiText(this, cx, 158, 'Waiting for host...', 'label', {
        color: PALETTE.textDimStr,
      }).setOrigin(0.5)
    }
  }

  _showSettingsPanel() {
    const cx = BASE_W / 2, cy = BASE_H / 2
    // Remove old panel if any
    this._settingsPanelContainer?.destroy()

    const panel = this.add.container(0, 0).setDepth(30)
    this._settingsPanelContainer = panel

    const bg = this.add.graphics()
    bg.fillStyle(PALETTE.bgDark, 0.97)
    bg.fillRoundedRect(cx - 90, cy - 75, 180, 150, 4)
    bg.lineStyle(1, PALETTE.primary, 0.8)
    bg.strokeRoundedRect(cx - 90, cy - 75, 180, 150, 4)
    panel.add(bg)

    panel.add(uiText(this, cx, cy - 64, 'GAME SETTINGS', 'heading', {
      color: PALETTE.primaryStr,
      letterSpacing: 1,
    }).setOrigin(0.5))

    const settings = [
      { key: 'killCooldown',     label: 'Kill Cooldown (s)', min: 10, max: 60, step: 5  },
      { key: 'tasksPerPlayer',   label: 'Tasks / Player',    min: 2,  max: 8,  step: 1  },
      { key: 'discussionTime',   label: 'Discussion (s)',     min: 15, max: 120, step: 15 },
      { key: 'votingTime',       label: 'Voting (s)',         min: 15, max: 90,  step: 15 },
    ]

    const currentSettings = { ...this._settings }

    settings.forEach((s, i) => {
      const y = cy - 45 + i * 22
      panel.add(uiText(this, cx - 82, y, `${s.label}:`, 'tiny', {
        color: PALETTE.textDimStr,
      }).setOrigin(0, 0.5))

      const val = currentSettings[s.key] || s.min
      const valText = uiText(this, cx + 50, y, `${val}`, 'label', {
        color: PALETTE.textStr,
      }).setOrigin(0.5)
      panel.add(valText)

      // Minus button
      const minusBtn = this.add.rectangle(cx + 30, y, 14, 12, 0x000000)
        .setStrokeStyle(1, PALETTE.textDim).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const cur = currentSettings[s.key] || s.min
          currentSettings[s.key] = Math.max(s.min, cur - s.step)
          valText.setText(`${currentSettings[s.key]}`)
        })
      panel.add(minusBtn)
      panel.add(uiText(this, cx + 30, y, '-', 'body', { color: PALETTE.textDimStr }).setOrigin(0.5))

      // Plus button
      const plusBtn = this.add.rectangle(cx + 70, y, 14, 12, 0x000000)
        .setStrokeStyle(1, PALETTE.textDim).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          const cur = currentSettings[s.key] || s.min
          currentSettings[s.key] = Math.min(s.max, cur + s.step)
          valText.setText(`${currentSettings[s.key]}`)
        })
      panel.add(plusBtn)
      panel.add(uiText(this, cx + 70, y, '+', 'body', { color: PALETTE.textDimStr }).setOrigin(0.5))
    })

    // Confirm ejects toggle
    const ejY = cy + 44
    let confirmEjects = currentSettings.confirmEjects !== false
    const ejLabel = uiText(this, cx - 82, ejY, 'Confirm Ejects:', 'tiny', {
      color: PALETTE.textDimStr,
    }).setOrigin(0, 0.5)
    const ejToggle = this.add.rectangle(cx + 50, ejY, 30, 12, 0x000000)
      .setStrokeStyle(1, confirmEjects ? PALETTE.primary : PALETTE.textDim)
      .setInteractive({ useHandCursor: true })
    const ejToggleTxt = uiText(this, cx + 50, ejY, confirmEjects ? 'ON' : 'OFF', 'tiny', {
      color: confirmEjects ? PALETTE.primaryStr : PALETTE.textDimStr,
    }).setOrigin(0.5)
    ejToggle.on('pointerdown', () => {
      confirmEjects = !confirmEjects
      currentSettings.confirmEjects = confirmEjects
      ejToggle.setStrokeStyle(1, confirmEjects ? PALETTE.primary : PALETTE.textDim)
      ejToggleTxt.setText(confirmEjects ? 'ON' : 'OFF')
        .setColor(confirmEjects ? PALETTE.primaryStr : PALETTE.textDimStr)
    })
    panel.add([ejLabel, ejToggle, ejToggleTxt])

    // Save + Close buttons
    const saveBtn = this.add.rectangle(cx - 22, cy + 62, 60, 13, 0x000000)
      .setStrokeStyle(1, PALETTE.primary).setInteractive({ useHandCursor: true })
      .on('pointerdown', async () => {
        await socketClient.updateSettings(currentSettings)
        panel.destroy()
        this._settingsPanelContainer = null
      })
    panel.add(saveBtn)
    panel.add(uiText(this, cx - 22, cy + 62, 'SAVE', 'small', { color: PALETTE.primaryStr }).setOrigin(0.5))

    const closeBtn = this.add.rectangle(cx + 50, cy + 62, 50, 13, 0x000000)
      .setStrokeStyle(1, PALETTE.textDim).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        panel.destroy()
        this._settingsPanelContainer = null
      })
    panel.add(closeBtn)
    panel.add(uiText(this, cx + 50, cy + 62, 'CANCEL', 'tiny', { color: PALETTE.textDimStr }).setOrigin(0.5))
  }

  _renderPlayerList() {
    this._playerListContainer.removeAll(true)
    const cx = BASE_W / 2
    const startY = 40

    this._players.forEach((p, i) => {
      const y = startY + i * 16
      const colorHex = PLAYER_COLORS.find(c => c.name.toLowerCase() === p.color)?.hex || 0xffffff
      this._playerListContainer.add(this.add.circle(cx - 50, y, 5, colorHex))
      this._playerListContainer.add(uiText(this, cx - 40, y, p.name, 'body', {
        color: PALETTE.textStr,
      }).setOrigin(0, 0.5))
      if (p.socketId === socketClient.id) {
        this._playerListContainer.add(uiText(this, cx + 40, y, '(you)', 'small', {
          color: PALETTE.textDimStr,
        }).setOrigin(0, 0.5))
      }
    })

    const needed = this._settings.minPlayers || 4
    this._playerListContainer.add(uiText(this, cx, BASE_H - 26, `${this._players.length}/8 players (need ${needed})`, 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))
  }

  _refreshWaiting() {
    if (this._state !== 'waiting') return
    this._renderPlayerList()
  }

  async _startGame() {
    const result = await socketClient.startGame()
    if (!result.ok) {
      this._showError(result.reason || 'Cannot start game')
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _createInputField(cx, y, placeholder, onChange, maxLength = 16) {
    const w = 120, h = 18
    const bg = this.add.rectangle(cx, y, w, h, 0x152236).setStrokeStyle(2, PALETTE.primary)
    let value = placeholder

    const label = uiText(this, cx, y, value, 'body', {
      color: PALETTE.textStr,
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true }).on('pointerdown', async () => {
      const input = await showTextPrompt({
        title: 'Edit Value',
        label: 'Type your value below.',
        initialValue: value,
        placeholder,
        maxLength,
      })
      if (input == null) return
      value = input.slice(0, maxLength)
      label.setText(value)
      onChange(value)
    })

    return this.add.container(0, 0, [bg, label])
  }

  _drawButton(cx, cy, text, color, callback) {
    const w = text.length * 6 + 16, h = 16
    const bg = this.add.rectangle(cx, cy, w, h, 0x000000)
      .setStrokeStyle(1, color)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(color, 0.2))
      .on('pointerout', () => bg.setFillStyle(0x000000))
      .on('pointerdown', callback)

    const label = uiText(this, cx, cy, text, 'small', {
      color: Phaser.Display.Color.ValueToColor(color).rgba,
      letterSpacing: 0.5,
    }).setOrigin(0.5)

    return this.add.container(0, 0, [bg, label])
  }

  _showError(msg) {
    const cx = BASE_W / 2
    const txt = uiText(this, cx, BASE_H - 12, msg, 'label', {
      color: PALETTE.dangerStr,
    }).setOrigin(0.5)
    this.time.delayedCall(3000, () => txt.destroy())
  }
}
