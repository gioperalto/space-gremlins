import Phaser from 'phaser'
import { PALETTE, PLAYER_COLORS, BASE_W, BASE_H } from '../config.js'
import { soundManager } from '../audio/SoundManager.js'
import { uiText } from '../ui/textStyles.js'

export class GameOver extends Phaser.Scene {
  constructor() { super('GameOver') }

  init(data) {
    this._winner = data.winner   // 'crewmate' | 'gremlin'
    this._reason = data.reason
    this._roles  = data.roles || {}
  }

  create() {
    const cx = BASE_W / 2, cy = BASE_H / 2
    const isCrewWin = this._winner === 'crewmate'

    // Background
    const bg = this.add.graphics()
    if (isCrewWin) {
      bg.fillGradientStyle(0x001133, 0x001133, 0x002266, 0x002266, 1)
    } else {
      bg.fillGradientStyle(0x110000, 0x110000, 0x220011, 0x220011, 1)
    }
    bg.fillRect(0, 0, BASE_W, BASE_H)

    // Stars
    for (let i = 0; i < 80; i++) {
      const alpha = 0.2 + Math.random() * 0.6
      this.add.rectangle(Math.random() * BASE_W, Math.random() * BASE_H, 1, 1, 0xffffff)
        .setAlpha(alpha)
    }

    // Winner banner
    const winnerText = isCrewWin ? 'CREWMATES WIN!' : 'GREMLINS WIN!'
    const winColor = isCrewWin ? PALETTE.primaryStr : PALETTE.dangerStr
    const winHex = isCrewWin ? PALETTE.primary : PALETTE.danger

    const banner = uiText(this, cx, cy - 40, winnerText, 'title', {
      fontSize: '20px',
      color: winColor,
      strokeThickness: 7,
      letterSpacing: 1,
    }).setOrigin(0.5).setAlpha(0)

    // Animate banner in
    this.tweens.add({
      targets: banner, alpha: 1, y: banner.y - 8,
      duration: 600, ease: 'Back.Out',
    })

    // Reason
    const reasonLabels = {
      task_win:     'All tasks completed!',
      vote_win:     'All Gremlins ejected!',
      kill_win:     'Gremlins outnumber crewmates!',
      sabotage_win: 'Reactor meltdown!',
    }
    uiText(this, cx, cy - 20, reasonLabels[this._reason] || '', 'body', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)

    // Roles reveal list
    const roleEntries = Object.entries(this._roles)
    if (roleEntries.length > 0) {
      uiText(this, cx, cy - 4, 'ROLES REVEALED', 'small', {
        color: PALETTE.textDimStr,
      }).setOrigin(0.5)

      roleEntries.slice(0, 8).forEach(([socketId, role], i) => {
        const col = role === 'gremlin' ? PALETTE.dangerStr : PALETTE.primaryStr
        const y = cy + 8 + i * 10
        uiText(this, cx, y, `${role.toUpperCase()}`, 'small', {
          color: col,
        }).setOrigin(0.5)
      })
    }

    // Particle burst on reveal
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 20 + Math.random() * 60
      const px = cx + Math.cos(angle) * 20
      const py = cy + Math.sin(angle) * 20
      const p = this.add.rectangle(px, py, 2, 2, winHex).setAlpha(0)
      this.tweens.add({
        targets: p, x: px + Math.cos(angle) * speed * 3, y: py + Math.sin(angle) * speed * 3,
        alpha: { from: 1, to: 0 },
        duration: 1200 + Math.random() * 600, delay: Math.random() * 400,
        ease: 'Quad.Out',
      })
    }

    // Sound
    if (isCrewWin) {
      soundManager.victoryJingle()
    } else {
      soundManager.defeatSting()
    }

    // Camera shake
    this.cameras.main.shake(isCrewWin ? 200 : 400, isCrewWin ? 0.005 : 0.012)

    // Return to lobby button
    const btnY = BASE_H - 20
    const btn = this.add.rectangle(cx, btnY, 100, 14, 0x000000)
      .setStrokeStyle(1, winHex)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setFillStyle(winHex, 0.2))
      .on('pointerout', () => btn.setFillStyle(0x000000))
      .on('pointerdown', () => this._returnToLobby())

    uiText(this, cx, btnY, 'BACK TO LOBBY', 'small', {
      color: Phaser.Display.Color.ValueToColor(winHex).rgba,
    }).setOrigin(0.5)

    // Auto-return after 15 seconds
    this._countdown = 15
    this._countdownText = uiText(this, cx, btnY + 12, `Auto-return in ${this._countdown}s`, 'tiny', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)

    this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        this._countdown--
        this._countdownText.setText(`Auto-return in ${this._countdown}s`)
        if (this._countdown <= 0) this._returnToLobby()
      }
    })
  }

  _returnToLobby() {
    this.scene.start('Lobby')
  }
}
