import Phaser from 'phaser'
import { PALETTE, PLAYER_COLORS, CONSTANTS, BASE_W, BASE_H } from '../config.js'

export class Boot extends Phaser.Scene {
  constructor() { super('Boot') }

  preload() {
    // Generate all textures programmatically — no external assets needed
    this._generateTextures()
    document.getElementById('loading')?.remove()
  }

  _generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    // ─── Player body textures (one per color) ─────────────────────────────
    for (const col of PLAYER_COLORS) {
      g.clear()
      const shadow = Phaser.Display.Color.ValueToColor(col.hex).darken(35).color
      const highlight = Phaser.Display.Color.ValueToColor(col.hex).lighten(12).color

      // Head and ears
      g.fillStyle(col.hex, 1)
      g.fillTriangle(3, 7, 6, 0, 8, 7)
      g.fillTriangle(8, 7, 10, 0, 13, 7)
      g.fillEllipse(8, 8, 10, 9)

      // Eyes and grin
      g.fillStyle(0xf6ff8c, 1)
      g.fillEllipse(6, 8, 2, 3)
      g.fillEllipse(10, 8, 2, 3)
      g.fillStyle(0x1b0f0f, 0.95)
      g.fillRect(5, 11, 6, 1)
      g.fillRect(6, 12, 4, 1)

      // Body with hunched shoulders
      g.fillStyle(col.hex, 1)
      g.fillRoundedRect(3, 11, 10, 7, 3)
      g.fillStyle(highlight, 0.55)
      g.fillEllipse(7, 13, 5, 3)

      // Arms and claws
      g.fillStyle(shadow, 1)
      g.fillRect(1, 12, 2, 5)
      g.fillRect(13, 12, 2, 5)
      g.fillTriangle(0, 17, 2, 15, 2, 18)
      g.fillTriangle(16, 17, 14, 15, 14, 18)

      // Legs
      g.fillStyle(shadow, 1)
      g.fillRect(4, 17, 3, 3)
      g.fillRect(9, 17, 3, 3)
      g.fillTriangle(3, 20, 5, 18, 7, 20)
      g.fillTriangle(8, 20, 10, 18, 12, 20)

      g.generateTexture(`player_${col.name.toLowerCase()}`, 16, 20)
    }

    // ─── Body (dead player) ───────────────────────────────────────────────
    for (const col of PLAYER_COLORS) {
      g.clear()
      const shadow = Phaser.Display.Color.ValueToColor(col.hex).darken(35).color

      g.fillStyle(shadow, 0.95)
      g.fillEllipse(9, 10, 14, 8)
      g.fillStyle(col.hex, 0.9)
      g.fillEllipse(7, 10, 13, 8)
      g.fillTriangle(2, 8, 5, 4, 6, 9)
      g.fillTriangle(10, 8, 12, 4, 14, 9)
      g.fillStyle(0xf6ff8c, 0.85)
      g.fillEllipse(6, 10, 2, 2)
      g.fillEllipse(9, 11, 2, 2)
      g.fillStyle(0x1b0f0f, 0.8)
      g.fillRect(11, 8, 4, 2)
      g.generateTexture(`body_${col.name.toLowerCase()}`, 20, 16)
    }

    // ─── Task station ──────────────────────────────────────────────────────
    g.clear()
    g.fillStyle(PALETTE.task, 1)
    g.fillRect(1, 1, 14, 14)
    g.fillStyle(0x000000, 1)
    g.fillRect(3, 3, 10, 10)
    g.fillStyle(PALETTE.task, 1)
    g.fillRect(5, 5, 6, 6)
    g.generateTexture('task_station', 16, 16)

    // ─── Vent ──────────────────────────────────────────────────────────────
    g.clear()
    g.fillStyle(0x444466, 1)
    g.fillRect(0, 0, 14, 10)
    g.fillStyle(0x222233, 1)
    for (let x = 1; x < 14; x += 3) {
      g.fillRect(x, 1, 1, 8)
    }
    g.lineStyle(1, 0x666699, 1)
    g.strokeRect(0, 0, 14, 10)
    g.generateTexture('vent', 14, 10)

    // ─── Emergency button ──────────────────────────────────────────────────
    g.clear()
    g.fillStyle(0x880000, 1)
    g.fillRect(0, 0, 20, 20)
    g.fillStyle(PALETTE.danger, 1)
    g.fillCircle(10, 10, 8)
    g.fillStyle(0xffffff, 0.3)
    g.fillEllipse(7, 7, 5, 3)
    g.generateTexture('emergency_button', 20, 20)

    // ─── Particle (pixel) ──────────────────────────────────────────────────
    g.clear()
    g.fillStyle(0xffffff, 1)
    g.fillRect(0, 0, 3, 3)
    g.generateTexture('pixel', 3, 3)

    // ─── Pixel (1x1) ──────────────────────────────────────────────────────
    g.clear()
    g.fillStyle(0xffffff, 1)
    g.fillRect(0, 0, 1, 1)
    g.generateTexture('dot', 1, 1)

    // ─── Floor tile ───────────────────────────────────────────────────────
    g.clear()
    g.fillStyle(PALETTE.floor, 1)
    g.fillRect(0, 0, 8, 8)
    g.lineStyle(1, PALETTE.wall, 0.3)
    g.strokeRect(0, 0, 8, 8)
    g.generateTexture('floor_tile', 8, 8)

    g.destroy()
  }

  create() {
    this.scene.start('Lobby')
  }
}
