import Phaser from 'phaser'
import { PALETTE, PLAYER_COLORS, CONSTANTS, BASE_W, BASE_H } from '../config.js'
import { socketClient } from '../network/SocketClient.js'
import { soundManager } from '../audio/SoundManager.js'

export class Meeting extends Phaser.Scene {
  constructor() { super('Meeting') }

  init(data) {
    this._meetingData = data.meetingData
    this._gameScene = data.gameScene
    this._myVote = null
    this._votingOpen = false
    this._chatMessages = []
    this._players = []
    this._phase = 'discussion'
  }

  create() {
    this._players = this._meetingData.players || []
    this._phase = 'discussion'

    this._drawMeetingUI()
    this._setupListeners()
    this._startDiscussionTimer()
  }

  _setupListeners() {
    this._unsubs = [
      socketClient.on('meeting:voting_started', () => {
        this._phase = 'voting'
        this._votingOpen = true
        this._showVotingPhase()
      }),
      socketClient.on('meeting:chat', (msg) => {
        this._addChatMessage(msg, false)
      }),
      socketClient.on('meeting:ghost_chat', (msg) => {
        this._addChatMessage(msg, true)
      }),
      socketClient.on('meeting:vote_cast', ({ voterSocketId }) => {
        this._markVoteCast(voterSocketId)
        soundManager.voteCast()
      }),
      socketClient.on('meeting:results', (result) => {
        this._showResults(result)
      }),
    ]
  }

  _drawMeetingUI() {
    const cx = BASE_W / 2, cy = BASE_H / 2

    // Dark overlay
    this.add.rectangle(0, 0, BASE_W, BASE_H, PALETTE.meetingBg, 0.95)
      .setOrigin(0, 0).setDepth(0)

    // Header
    const isReport = this._meetingData.type === 'report'
    const headerColor = isReport ? PALETTE.dangerStr : PALETTE.primaryStr
    const headerText = isReport
      ? `${this._meetingData.callerName} REPORTED A BODY`
      : `${this._meetingData.callerName} CALLED EMERGENCY`

    this.add.text(cx, 10, 'EMERGENCY MEETING', {
      fontFamily: 'monospace', fontSize: '10px', color: headerColor,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(1)

    this.add.text(cx, 22, headerText, {
      fontFamily: 'monospace', fontSize: '6px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setDepth(1)

    // Player portraits
    this._portaitContainer = this.add.container(0, 35).setDepth(1)
    this._renderPortraits()

    // Chat panel
    this._chatBox = this.add.text(4, 90, '', {
      fontFamily: 'monospace', fontSize: '6px', color: PALETTE.textStr,
      wordWrap: { width: BASE_W - 60, useAdvancedWrap: true },
      lineSpacing: 2,
    }).setDepth(1)

    // Chat input area
    this.add.rectangle(0, BASE_H - 18, BASE_W - 50, 14, 0x111122)
      .setStrokeStyle(1, PALETTE.primary).setOrigin(0, 0.5).setDepth(1)
      .setX(4)

    const chatInputBg = this.add.rectangle(4, BASE_H - 18, BASE_W - 50, 14, 0x111122)
      .setStrokeStyle(1, PALETTE.primary).setOrigin(0, 0.5).setDepth(1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        const msg = window.prompt('Message:')
        if (msg?.trim()) socketClient.sendChat(msg.trim())
      })

    this.add.text(8, BASE_H - 18, 'Tap to chat...', {
      fontFamily: 'monospace', fontSize: '6px', color: PALETTE.textDimStr,
    }).setOrigin(0, 0.5).setDepth(1)

    // Timer text
    this._timerText = this.add.text(cx, 31, '', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.taskStr,
    }).setOrigin(0.5).setDepth(1)

    // Discussion label
    this._phaseLabel = this.add.text(BASE_W - 4, 10, 'DISCUSS', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.primaryStr,
    }).setOrigin(1, 0).setDepth(1)
  }

  _renderPortraits() {
    this._portaitContainer.removeAll(true)
    const cols = 8, spacing = (BASE_W - 8) / cols
    this._players.forEach((player, i) => {
      const col = PLAYER_COLORS.find(c => c.name.toLowerCase() === player.color) || PLAYER_COLORS[0]
      const px = 4 + spacing * i + spacing / 2
      const py = 16

      // Player circle
      const circle = this.add.circle(px, py, 10, col.hex)
        .setAlpha(player.alive ? 1 : 0.3)

      // X overlay if dead
      if (!player.alive) {
        const xLine = this.add.text(px, py, 'X', {
          fontFamily: 'monospace', fontSize: '12px', color: '#ff0000',
        }).setOrigin(0.5)
        this._portaitContainer.add(xLine)
      }

      // Vote marker (hidden initially)
      const voteMarker = this.add.text(px, py + 14, '', {
        fontFamily: 'monospace', fontSize: '5px', color: PALETTE.taskStr,
      }).setOrigin(0.5)
      circle.setData('voteMarker', voteMarker)
      circle.setData('socketId', player.socketId)

      // Name
      const nameText = this.add.text(px, py + 22, player.name.slice(0, 5), {
        fontFamily: 'monospace', fontSize: '5px', color: PALETTE.textDimStr,
      }).setOrigin(0.5)

      this._portaitContainer.add([circle, voteMarker, nameText])

      // Make clickable for voting
      if (player.alive && player.socketId !== socketClient.id) {
        circle.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this._castVote(player.socketId)
        })
      }
    })
  }

  _startDiscussionTimer() {
    const total = this._meetingData.discussionTime || 45
    let remaining = total
    this._discussionTimer = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        remaining--
        this._timerText.setText(`${remaining}s`)
        if (remaining <= 5) this._timerText.setColor(PALETTE.dangerStr)
      }
    })
  }

  _showVotingPhase() {
    this._phaseLabel.setText('VOTE').setColor(PALETTE.dangerStr)
    if (this._discussionTimer) { this._discussionTimer.remove(); this._discussionTimer = null }

    const total = this._meetingData.votingTime || 30
    let remaining = total
    this._votingTimer = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        remaining--
        this._timerText.setText(`${remaining}s`)
        if (remaining <= 5) this._timerText.setColor(PALETTE.dangerStr)
      }
    })

    // Add skip vote option
    const cx = BASE_W / 2
    this.add.text(cx, 80, 'Vote or SKIP:', {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setDepth(1)

    const skipBtn = this.add.rectangle(BASE_W - 30, BASE_H - 18, 44, 12, 0x000000)
      .setStrokeStyle(1, PALETTE.textDim).setInteractive({ useHandCursor: true }).setDepth(1)
      .on('pointerdown', () => this._castVote('skip'))
    this.add.text(BASE_W - 30, BASE_H - 18, 'SKIP', {
      fontFamily: 'monospace', fontSize: '6px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setDepth(1)

    this._addChatMessage({ name: 'System', message: '--- Voting phase started ---', system: true }, false)
  }

  async _castVote(targetId) {
    if (!this._votingOpen) return
    if (this._myVote) return
    this._myVote = targetId
    soundManager.voteCast()
    const result = await socketClient.vote(targetId)
    if (!result?.ok) {
      this._myVote = null
    }
  }

  _markVoteCast(voterSocketId) {
    // Find the portrait and add a vote check mark
    this._portaitContainer.each((child) => {
      if (child.getData?.('socketId') === voterSocketId) {
        const marker = child.getData('voteMarker')
        if (marker) marker.setText('✓')
      }
    })
  }

  _addChatMessage(msg, isGhost) {
    const color = isGhost ? '#888899' : (msg.system ? PALETTE.textDimStr : PALETTE.textStr)
    const prefix = isGhost ? '[ghost] ' : ''
    this._chatMessages.push(`${prefix}${msg.name}: ${msg.message}`)
    if (this._chatMessages.length > 12) this._chatMessages.shift()
    this._chatBox.setText(this._chatMessages.join('\n'))
  }

  _showResults(result) {
    if (this._discussionTimer) { this._discussionTimer.remove(); this._discussionTimer = null }
    if (this._votingTimer) { this._votingTimer.remove(); this._votingTimer = null }

    // Clear and show results overlay
    this.add.rectangle(BASE_W / 2, BASE_H / 2, BASE_W, BASE_H, 0x000000, 0.8)
      .setOrigin(0.5).setDepth(5)

    const cx = BASE_W / 2, cy = BASE_H / 2

    if (result.ejected) {
      soundManager.ejection()
      this.cameras.main.shake(300, 0.012)

      this.add.text(cx, cy - 25, 'EJECTED!', {
        fontFamily: 'monospace', fontSize: '16px', color: PALETTE.dangerStr,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(6)

      this.add.text(cx, cy, result.ejectedName || '???', {
        fontFamily: 'monospace', fontSize: '12px', color: PALETTE.textStr,
      }).setOrigin(0.5).setDepth(6)

      if (result.ejectedRole) {
        const roleColor = result.ejectedRole === 'gremlin' ? PALETTE.dangerStr : PALETTE.primaryStr
        this.add.text(cx, cy + 16, `was a ${result.ejectedRole.toUpperCase()}`, {
          fontFamily: 'monospace', fontSize: '9px', color: roleColor,
        }).setOrigin(0.5).setDepth(6)
      }
    } else {
      this.add.text(cx, cy, 'NO EJECTION', {
        fontFamily: 'monospace', fontSize: '14px', color: PALETTE.textDimStr,
      }).setOrigin(0.5).setDepth(6)
      this.add.text(cx, cy + 14, 'Tie or skip majority', {
        fontFamily: 'monospace', fontSize: '8px', color: PALETTE.textDimStr,
      }).setOrigin(0.5).setDepth(6)
    }

    // Return to game after 4 seconds
    this.time.delayedCall(4000, () => {
      this._cleanup()
      this.scene.stop()
      this.scene.resume('Game')
    })
  }

  _cleanup() {
    this._unsubs?.forEach(fn => fn())
    if (this._discussionTimer) this._discussionTimer.remove()
    if (this._votingTimer) this._votingTimer.remove()
  }

  shutdown() { this._cleanup() }
}
