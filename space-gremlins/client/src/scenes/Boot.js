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
      // Body (spacesuit shape)
      g.fillStyle(col.hex, 1)
      g.fillRoundedRect(3, 6, 10, 11, 2)   // torso
      g.fillStyle(col.hex, 0.8)
      g.fillCircle(8, 5, 5)                  // helmet

      // Visor
      g.fillStyle(0x88ccff, 0.9)
      g.fillEllipse(8, 5, 6, 4)

      // Backpack
      g.fillStyle(Phaser.Display.Color.ValueToColor(col.hex).darken(30).color, 1)
      g.fillRect(11, 7, 4, 6)

      // Legs
      g.fillStyle(col.hex, 1)
      g.fillRect(4, 16, 3, 3)
      g.fillRect(9, 16, 3, 3)

      g.generateTexture(`player_${col.name.toLowerCase()}`, 16, 20)
    }

    // ─── Body (dead player) ───────────────────────────────────────────────
    for (const col of PLAYER_COLORS) {
      g.clear()
      g.fillStyle(col.hex, 0.8)
      g.fillEllipse(8, 10, 14, 7)  // flat body
      g.fillStyle(col.hex, 0.6)
      g.fillCircle(12, 8, 5)         // helmet sideways
      g.fillStyle(0x88ccff, 0.5)
      g.fillEllipse(13, 8, 5, 3)
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
