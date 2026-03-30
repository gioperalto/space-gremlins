import Phaser from 'phaser'
import { PALETTE, PLAYER_COLORS, BASE_W, BASE_H } from '../config.js'
import { socketClient } from '../network/SocketClient.js'

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
        this.scene.start('Game', {
          role: data.role,
          gremlinAllies: data.gremlinAllies,
          settings: data.settings,
          myColor: this._myColor,
          myName: this._myName,
        })
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
    this.add.text(cx, 28, 'SPACE GREMLINS', {
      fontFamily: 'monospace', fontSize: '18px', color: PALETTE.primaryStr,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5)

    this.add.text(cx, 42, 'social deduction in space', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
    }).setOrigin(0.5)

    // Name field
    this.add.text(cx, 62, 'YOUR NAME:', {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textDimStr,
    }).setOrigin(0.5)

    this._nameField = this._createInputField(cx, 74, 'Player', (val) => {
      this._myName = val || 'Player'
    })

    // Color selector
    this.add.text(cx, 90, 'COLOR:', {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textDimStr,
    }).setOrigin(0.5)
    this._colorPicker = this._drawColorPicker(cx, 100)

    // Create / Join buttons
    this._btnCreate = this._drawButton(cx - 35, 120, 'CREATE GAME', PALETTE.primary, () => this._createGame())
    this._btnJoin  = this._drawButton(cx + 35, 120, 'JOIN GAME',   PALETTE.task,    () => this._showJoinInput())

    // Version
    this.add.text(BASE_W - 4, BASE_H - 4, 'v1.0', {
      fontFamily: 'monospace', fontSize: '6px', color: PALETTE.textDimStr,
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

    this.add.text(cx, 116, 'ROOM CODE:', {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textDimStr,
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

    this.add.text(cx, 12, 'WAITING ROOM', {
      fontFamily: 'monospace', fontSize: '12px', color: PALETTE.primaryStr,
    }).setOrigin(0.5)

    this.add.text(cx, 24, `Room: ${this._roomCode}`, {
      fontFamily: 'monospace', fontSize: '10px', color: PALETTE.taskStr,
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5)

    // Players list
    this._playerListContainer = this.add.container(0, 0)
    this._renderPlayerList()

    // Start button (host only)
    if (this._isHost) {
      this._startBtn = this._drawButton(cx, 158, 'START GAME', PALETTE.primary, () => this._startGame())
    } else {
      this.add.text(cx, 158, 'Waiting for host...', {
        fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textDimStr,
      }).setOrigin(0.5)
    }
  }

  _renderPlayerList() {
    this._playerListContainer.removeAll(true)
    const cx = BASE_W / 2
    const startY = 40

    this._players.forEach((p, i) => {
      const y = startY + i * 16
      const colorHex = PLAYER_COLORS.find(c => c.name.toLowerCase() === p.color)?.hex || 0xffffff
      this._playerListContainer.add(this.add.circle(cx - 50, y, 5, colorHex))
      this._playerListContainer.add(this.add.text(cx - 40, y, p.name, {
        fontFamily: 'monospace', fontSize: '9px', color: PALETTE.textStr,
      }).setOrigin(0, 0.5))
      if (p.socketId === socketClient.id) {
        this._playerListContainer.add(this.add.text(cx + 40, y, '(you)', {
          fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
        }).setOrigin(0, 0.5))
      }
    })

    const needed = this._settings.minPlayers || 4
    this._playerListContainer.add(this.add.text(cx, BASE_H - 26, `${this._players.length}/8 players (need ${needed})`, {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
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
    const w = 100, h = 14
    const bg = this.add.rectangle(cx, y, w, h, 0x222233).setStrokeStyle(1, PALETTE.primary)
    let value = placeholder

    const label = this.add.text(cx, y, value, {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textStr,
    }).setOrigin(0.5)

    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const input = window.prompt('Enter value:', value) ?? value
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

    const label = this.add.text(cx, cy, text, {
      fontFamily: 'monospace', fontSize: '7px', color: Phaser.Display.Color.ValueToColor(color).rgba,
    }).setOrigin(0.5)

    return this.add.container(0, 0, [bg, label])
  }

  _showError(msg) {
    const cx = BASE_W / 2
    const txt = this.add.text(cx, BASE_H - 12, msg, {
      fontFamily: 'monospace', fontSize: '8px', color: PALETTE.dangerStr,
    }).setOrigin(0.5)
    this.time.delayedCall(3000, () => txt.destroy())
  }
}
