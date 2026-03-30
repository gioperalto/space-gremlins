import Phaser from 'phaser'
import { PALETTE, BASE_W, BASE_H } from '../config.js'
import { soundManager } from '../audio/SoundManager.js'

export class RoleReveal extends Phaser.Scene {
  constructor() { super('RoleReveal') }

  init(data) {
    this._role = data.role
    this._gremlinAllies = data.gremlinAllies || []
    this._gameData = data
  }

  create() {
    const cx = BASE_W / 2, cy = BASE_H / 2
    const isGremlin = this._role === 'gremlin'
    const bgColor = isGremlin ? 0x1a0000 : 0x001a0a
    const roleColor = isGremlin ? PALETTE.dangerStr : PALETTE.primaryStr
    const roleHex  = isGremlin ? PALETTE.danger : PALETTE.primary

    this.cameras.main.setBackgroundColor(bgColor)

    // Dramatic flash
    this.cameras.main.flash(400, 255, 255, 255)

    // Stars
    for (let i = 0; i < 60; i++) {
      this.add.rectangle(Math.random() * BASE_W, Math.random() * BASE_H, 1, 1, 0xffffff)
        .setAlpha(0.2 + Math.random() * 0.5)
    }

    const revealTitle = this.add.text(cx, cy - 35, 'YOU ARE...', {
      fontFamily: 'monospace', fontSize: '10px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setAlpha(0)

    const roleName = this.add.text(cx, cy - 10, this._role.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '28px', color: roleColor,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setScale(0.5)

    const desc = isGremlin
      ? 'Kill and sabotage to win!'
      : 'Complete tasks and vote out Gremlins!'

    const descText = this.add.text(cx, cy + 18, desc, {
      fontFamily: 'monospace', fontSize: '7px', color: PALETTE.textDimStr,
    }).setOrigin(0.5).setAlpha(0)

    // Gremlin ally reveal
    if (isGremlin && this._gremlinAllies.length > 0) {
      this.add.text(cx, cy + 32, `Ally: ${this._gremlinAllies.join(', ')}`, {
        fontFamily: 'monospace', fontSize: '7px', color: PALETTE.dangerStr,
      }).setOrigin(0.5).setAlpha(0).setData('fadeIn', true)
    }

    // Animate in sequence
    this.tweens.add({ targets: revealTitle, alpha: 1, duration: 400, delay: 200 })
    this.tweens.add({
      targets: roleName, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, delay: 600, ease: 'Back.Out',
      onStart: () => soundManager.roleReveal(isGremlin),
    })
    this.tweens.add({ targets: descText, alpha: 1, duration: 400, delay: 1000 })

    // Particle burst
    this.time.delayedCall(600, () => {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 40 + Math.random() * 80
        const p = this.add.rectangle(cx, cy, 2, 2, roleHex)
        this.tweens.add({
          targets: p,
          x: cx + Math.cos(angle) * speed * 2,
          y: cy + Math.sin(angle) * speed * 2,
          alpha: { from: 1, to: 0 },
          duration: 800 + Math.random() * 400,
          ease: 'Quad.Out',
        })
      }
    })

    // Auto-transition to game after 4 seconds
    this.time.delayedCall(4000, () => {
      this.scene.stop()
      this.scene.resume('Game')
    })
  }
}
