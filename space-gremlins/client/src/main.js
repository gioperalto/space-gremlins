import Phaser from 'phaser'
import { BASE_W, BASE_H } from './config.js'
import { Boot } from './scenes/Boot.js'
import { Lobby } from './scenes/Lobby.js'
import { RoleReveal } from './scenes/RoleReveal.js'
import { Game } from './scenes/Game.js'
import { Meeting } from './scenes/Meeting.js'
import { GameOver } from './scenes/GameOver.js'

const config = {
  type: Phaser.AUTO,
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#0a0a1a',
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [Boot, Lobby, RoleReveal, Game, Meeting, GameOver],
}

new Phaser.Game(config)
