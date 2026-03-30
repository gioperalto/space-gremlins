import Phaser from 'phaser'
import { PALETTE, CONSTANTS, BASE_W, BASE_H } from '../config.js'
import { uiText } from '../ui/textStyles.js'

// Task UI manager — opens mini-game overlays for each task type
export class TaskUI {
  constructor(scene) {
    this.scene = scene
    this.active = false
    this._container = null
    this._resolveTask = null
  }

  open(taskId, role) {
    if (this.active) return Promise.resolve(false)
    this.active = true

    return new Promise((resolve) => {
      this._resolveTask = resolve
      this._container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(CONSTANTS.DEPTH_MODAL)
      this._drawTaskPanel(taskId, role)
    })
  }

  _drawTaskPanel(taskId, role) {
    const cx = BASE_W / 2, cy = BASE_H / 2
    const W = 160, H = 120

    // Panel
    const bg = this.scene.add.rectangle(cx, cy, W, H, PALETTE.bgDark, 0.97)
      .setStrokeStyle(2, PALETTE.task)
    this._container.add(bg)

    const title = uiText(this.scene, cx, cy - H / 2 + 10, this._getTaskName(taskId), 'heading', {
      color: PALETTE.taskStr,
    }).setOrigin(0.5)
    this._container.add(title)

    // Close button
    const closeBtn = this.scene.add.rectangle(cx + W / 2 - 8, cy - H / 2 + 8, 14, 10, 0x222222)
      .setStrokeStyle(1, 0x666666).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._close(false))
    const closeTxt = uiText(this.scene, cx + W / 2 - 8, cy - H / 2 + 8, 'X', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)
    this._container.add([closeBtn, closeTxt])

    // Task content
    switch (taskId) {
      case 'swipe_card':    this._drawSwipeCard(cx, cy); break
      case 'download_data': this._drawDownloadData(cx, cy); break
      case 'medbay_scan':   this._drawMedbayScan(cx, cy); break
      case 'wire_connect':  this._drawWireConnect(cx, cy, role); break
      case 'reactor_align': this._drawReactorAlign(cx, cy, role); break
      case 'engine_tune':   this._drawEngineTune(cx, cy, role); break
      case 'fuel_transfer_a':
      case 'fuel_transfer_b': this._drawFuelTransfer(cx, cy, taskId); break
      case 'nav_chart':     this._drawNavChart(cx, cy); break
      default:              this._drawGenericTask(cx, cy, taskId); break
    }
  }

  _getTaskName(id) {
    const names = {
      swipe_card: 'SWIPE CARD', download_data: 'DOWNLOAD DATA', medbay_scan: 'MEDBAY SCAN',
      wire_connect: 'CONNECT WIRES', reactor_align: 'REACTOR ALIGN', engine_tune: 'ENGINE TUNE',
      fuel_transfer_a: 'FILL CANISTER', fuel_transfer_b: 'DELIVER FUEL', nav_chart: 'NAV CHART',
    }
    return names[id] || id.replace(/_/g, ' ').toUpperCase()
  }

  // ─── Swipe Card ────────────────────────────────────────────────────────────
  _drawSwipeCard(cx, cy) {
    const instr = uiText(this.scene, cx, cy - 28, 'Click at the right time!', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)
    this._container.add(instr)

    // Track bar
    const trackW = 120, trackH = 8, trackX = cx - trackW / 2, trackY = cy - 10
    const track = this.scene.add.rectangle(cx, trackY, trackW, trackH, 0x222233)
      .setStrokeStyle(1, PALETTE.primary)
    this._container.add(track)

    // Green zone
    const zoneW = 30
    const zoneX = cx - 20
    const zone = this.scene.add.rectangle(zoneX, trackY, zoneW, trackH - 2, 0x00aa44, 0.7)
    this._container.add(zone)

    // Slider
    const slider = this.scene.add.rectangle(trackX, trackY, 8, trackH + 2, PALETTE.primary)
    this._container.add(slider)

    let pos = 0, dir = 1
    const speed = 0.9
    const tick = this.scene.time.addEvent({ delay: 16, loop: true, callback: () => {
      pos += dir * speed
      if (pos >= trackW || pos <= 0) dir *= -1
      slider.setX(trackX + pos)
    }})

    // Click to swipe
    const btn = this.scene.add.rectangle(cx, cy + 28, 80, 14, 0x001133)
      .setStrokeStyle(1, PALETTE.primary).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        tick.remove()
        const sliderCenter = trackX + pos
        const hit = Math.abs(sliderCenter - zoneX) < zoneW / 2
        if (hit) {
          this._container.add(uiText(this.scene, cx, cy + 14, 'PERFECT!', 'body', { color: '#00ff88' }).setOrigin(0.5))
          this.scene.time.delayedCall(800, () => this._close(true))
        } else {
          this._container.add(uiText(this.scene, cx, cy + 14, 'MISS!', 'body', { color: PALETTE.dangerStr }).setOrigin(0.5))
          this.scene.time.delayedCall(600, () => {
            pos = 0; dir = 1
            tick.reset({ delay: 16, loop: true, callback: tick.callback })
          })
        }
      })
    const btnTxt = uiText(this.scene, cx, cy + 28, 'SWIPE!', 'small', { color: PALETTE.primaryStr }).setOrigin(0.5)
    this._container.add([btn, btnTxt])
  }

  // ─── Download Data ─────────────────────────────────────────────────────────
  _drawDownloadData(cx, cy) {
    const total = 8000
    let elapsed = 0

    const instr = uiText(this.scene, cx, cy - 28, 'Downloading...', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)
    this._container.add(instr)

    const barW = 120, barH = 10
    const barBg = this.scene.add.rectangle(cx, cy, barW, barH, 0x222233).setStrokeStyle(1, PALETTE.primary)
    const barFill = this.scene.add.rectangle(cx - barW / 2, cy, 0, barH - 2, PALETTE.primary).setOrigin(0, 0.5)
    const pctText = uiText(this.scene, cx, cy + 14, '0%', 'small', { color: PALETTE.primaryStr }).setOrigin(0.5)
    this._container.add([barBg, barFill, pctText])

    const tick = this.scene.time.addEvent({ delay: 100, loop: true, callback: () => {
      elapsed += 100
      const pct = Math.min(1, elapsed / total)
      barFill.setSize(barW * pct, barH - 2)
      pctText.setText(`${Math.round(pct * 100)}%`)
      if (pct >= 1) {
        tick.remove()
        pctText.setColor('#00ff88')
        this.scene.time.delayedCall(400, () => this._close(true))
      }
    }})
  }

  // ─── Medbay Scan ──────────────────────────────────────────────────────────
  _drawMedbayScan(cx, cy) {
    const total = 10000
    let elapsed = 0

    this._container.add(uiText(this.scene, cx, cy - 32, 'Stand still for scan...', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    // Scan lines
    const scanGfx = this.scene.add.graphics()
    this._container.add(scanGfx)

    let scanY = cy - 20
    const scanTick = this.scene.time.addEvent({ delay: 30, loop: true, callback: () => {
      elapsed += 30
      const pct = Math.min(1, elapsed / total)
      scanGfx.clear()
      scanGfx.lineStyle(1, PALETTE.primary, 0.6)
      scanGfx.lineBetween(cx - 40, scanY, cx + 40, scanY)
      scanY = cy - 20 + 40 * pct
      if (scanY > cy + 20) scanY = cy - 20
      // Progress arc
      scanGfx.lineStyle(2, PALETTE.primary, 1)
      scanGfx.beginPath()
      scanGfx.arc(cx, cy, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
      scanGfx.strokePath()
      if (pct >= 1) {
        scanTick.remove()
        this.scene.time.delayedCall(400, () => this._close(true))
      }
    }})
  }

  // ─── Wire Connect ──────────────────────────────────────────────────────────
  _drawWireConnect(cx, cy, role) {
    const colors = [0xff4444, 0x44ff44, 0x4488ff, 0xffff44]
    const shuffled = [...colors].sort(() => Math.random() - 0.5)
    let connected = 0
    let dragging = null

    this._container.add(uiText(this.scene, cx, cy - 38, 'Connect matching wires!', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    const leftX = cx - 45, rightX = cx + 45
    const startY = cy - 24, spacing = 16

    const leftPorts = [], rightPorts = []
    colors.forEach((col, i) => {
      const y = startY + i * spacing
      const left = this.scene.add.circle(leftX, y, 5, col).setInteractive({ useHandCursor: true })
      const right = this.scene.add.circle(rightX, y, 5, shuffled[i])
      left.setData('colorIdx', i)
      right.setData('colorIdx', colors.indexOf(shuffled[i]))
      leftPorts.push(left)
      rightPorts.push(right)
      this._container.add([left, right])
    })

    // Drag-to-connect: click left port, then click right port
    leftPorts.forEach((left) => {
      left.on('pointerdown', () => { dragging = left.getData('colorIdx') })
    })
    rightPorts.forEach((right) => {
      right.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (dragging !== null) {
          if (dragging === right.getData('colorIdx')) {
            // Correct connection
            const col = colors[dragging]
            const ly = startY + dragging * spacing
            const ry = startY + colors.indexOf(shuffled.find((s, i) => colors.indexOf(s) === dragging)) * spacing
            const line = this.scene.add.graphics()
            line.lineStyle(2, col, 1)
            line.lineBetween(leftX + 5, ly, rightX - 5, ry)
            this._container.add(line)
            connected++
            if (connected >= colors.length) {
              this.scene.time.delayedCall(400, () => this._close(true))
            }
          }
          dragging = null
        }
      })
    })
  }

  // ─── Reactor Alignment ────────────────────────────────────────────────────
  _drawReactorAlign(cx, cy, role) {
    const target = 30 + Math.floor(Math.random() * 50)
    let current = 0

    this._container.add(uiText(this.scene, cx, cy - 38, 'Align power to target!', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    const trackW = 120, trackH = 8
    const trackBg = this.scene.add.rectangle(cx, cy, trackW, trackH, 0x222233).setStrokeStyle(1, PALETTE.primary)

    // Target marker
    const targetX = cx - trackW / 2 + (target / 100) * trackW
    const targetMarker = this.scene.add.rectangle(targetX, cy, 4, trackH + 4, 0x00ff88)

    // Current marker (draggable)
    const marker = this.scene.add.rectangle(cx - trackW / 2, cy, 8, trackH + 2, PALETTE.primary)
      .setInteractive({ useHandCursor: true, draggable: true })

    this._container.add([trackBg, targetMarker, marker])

    this.scene.input.setDraggable(marker)
    const minX = cx - trackW / 2
    const maxX = cx + trackW / 2

    marker.on('drag', (pointer, dragX) => {
      marker.setX(Phaser.Math.Clamp(dragX, minX, maxX))
      current = Math.round(((marker.x - minX) / trackW) * 100)
      valueText.setText(`${current}`)
    })

    const valueText = uiText(this.scene, cx, cy + 18, '0', 'small', { color: PALETTE.primaryStr }).setOrigin(0.5)
    this._container.add(uiText(this.scene, cx, cy + 14, `Target: ${target}`, 'small', {
      color: '#00ff88',
    }).setOrigin(0.5))
    this._container.add(valueText)

    const confirmBtn = this.scene.add.rectangle(cx, cy + 32, 60, 12, 0x001122)
      .setStrokeStyle(1, PALETTE.primary).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (Math.abs(current - target) <= 6) {
          this._close(true)
        } else {
          valueText.setColor(PALETTE.dangerStr)
          this.scene.time.delayedCall(400, () => valueText.setColor(PALETTE.primaryStr))
        }
      })
    this._container.add([confirmBtn, uiText(this.scene, cx, cy + 32, 'CONFIRM', 'small', {
      color: PALETTE.primaryStr,
    }).setOrigin(0.5)])
  }

  // ─── Engine Tune (Simon Says) ──────────────────────────────────────────────
  _drawEngineTune(cx, cy, role) {
    const nodeColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff]
    const sequence = []
    const sequenceLen = 4
    for (let i = 0; i < sequenceLen; i++) sequence.push(Math.floor(Math.random() * nodeColors.length))

    let playerSeq = [], playingSeq = false, step = 0

    this._container.add(uiText(this.scene, cx, cy - 38, 'Repeat the sequence!', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    // Node positions (circle layout)
    const nodes = nodeColors.map((col, i) => {
      const angle = (Math.PI * 2 * i) / nodeColors.length - Math.PI / 2
      const r = 24
      const nx = cx + Math.cos(angle) * r
      const ny = cy + Math.sin(angle) * r
      const node = this.scene.add.circle(nx, ny, 9, col, 0.5).setInteractive({ useHandCursor: true })
      this._container.add(node)
      return node
    })

    const statusText = uiText(this.scene, cx, cy + 38, 'Watch...', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5)
    this._container.add(statusText)

    // Play sequence highlight
    const playSequence = () => {
      playingSeq = true; step = 0
      const playStep = () => {
        if (step >= sequence.length) { playingSeq = false; statusText.setText('Your turn!'); enableInput(); return }
        const nodeIdx = sequence[step]
        nodes[nodeIdx].setAlpha(1)
        this.scene.time.delayedCall(300, () => {
          nodes[nodeIdx].setAlpha(0.5)
          step++
          this.scene.time.delayedCall(150, playStep)
        })
      }
      this.scene.time.delayedCall(600, playStep)
    }

    const enableInput = () => {
      nodes.forEach((node, i) => {
        node.on('pointerdown', () => {
          if (playingSeq) return
          node.setAlpha(1)
          this.scene.time.delayedCall(150, () => node.setAlpha(0.5))
          playerSeq.push(i)
          if (playerSeq[playerSeq.length - 1] !== sequence[playerSeq.length - 1]) {
            statusText.setText('Wrong!').setColor(PALETTE.dangerStr)
            playerSeq = []
            this.scene.time.delayedCall(800, () => { statusText.setText('Watch...').setColor(PALETTE.textDimStr); playSequence() })
          } else if (playerSeq.length === sequence.length) {
            this.scene.time.delayedCall(300, () => this._close(true))
          }
        })
      })
    }

    playSequence()
  }

  // ─── Fuel Transfer ────────────────────────────────────────────────────────
  _drawFuelTransfer(cx, cy, taskId) {
    const isPartA = taskId === 'fuel_transfer_a'
    const label = isPartA ? 'Fill the canister (hold button)' : 'Empty canister into engine'
    this._container.add(uiText(this.scene, cx, cy - 32, label, 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    let filling = false, progress = 0

    const canisterBg = this.scene.add.rectangle(cx, cy, 20, 40, 0x111133).setStrokeStyle(1, PALETTE.primary)
    const canisterFill = this.scene.add.rectangle(cx, cy + 20, 18, 0, isPartA ? PALETTE.primary : 0xff8800).setOrigin(0.5, 1)
    const pctText = uiText(this.scene, cx, cy + 26, '0%', 'tiny', {
      color: PALETTE.textStr,
    }).setOrigin(0.5)
    this._container.add([canisterBg, canisterFill, pctText])

    const btn = this.scene.add.rectangle(cx, cy + 44, 70, 14, 0x001133).setStrokeStyle(1, PALETTE.primary)
      .setInteractive({ useHandCursor: true })
    const btnTxt = uiText(this.scene, cx, cy + 44, 'HOLD TO FILL', 'small', {
      color: PALETTE.primaryStr,
    }).setOrigin(0.5)
    this._container.add([btn, btnTxt])

    btn.on('pointerdown', () => { filling = true; btn.setFillStyle(PALETTE.primary, 0.2) })
    btn.on('pointerup', () => { filling = false; btn.setFillStyle(0x001133) })
    btn.on('pointerout', () => { filling = false; btn.setFillStyle(0x001133) })

    const tick = this.scene.time.addEvent({ delay: 50, loop: true, callback: () => {
      if (filling && progress < 1) {
        progress += 0.02
        const h = progress * 38
        canisterFill.setSize(18, h)
        pctText.setText(`${Math.round(progress * 100)}%`)
        if (progress >= 1) {
          tick.remove()
          this.scene.time.delayedCall(400, () => this._close(true))
        }
      }
    }})
  }

  // ─── Navigation Chart ─────────────────────────────────────────────────────
  _drawNavChart(cx, cy) {
    const numWaypoints = 5
    const waypoints = []
    for (let i = 0; i < numWaypoints; i++) {
      waypoints.push({
        x: cx - 50 + Math.random() * 100,
        y: cy - 20 + Math.random() * 40,
        hit: false,
      })
    }

    this._container.add(uiText(this.scene, cx, cy - 38, 'Tap waypoints in order!', 'small', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    let next = 0
    const circles = waypoints.map((wp, i) => {
      const c = this.scene.add.circle(wp.x, wp.y, 7, i === 0 ? PALETTE.task : 0x333355)
        .setStrokeStyle(1, PALETTE.textDim)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (i !== next) return
          c.setFillStyle(0x00aa44)
          next++
          if (next < waypoints.length) circles[next].setFillStyle(PALETTE.task)
          // Draw connecting line
          if (i > 0) {
            const prev = waypoints[i - 1]
            const line = this.scene.add.graphics()
            line.lineStyle(1, PALETTE.task, 0.5)
            line.lineBetween(prev.x, prev.y, wp.x, wp.y)
            this._container.add(line)
          }
          if (next >= waypoints.length) this.scene.time.delayedCall(400, () => this._close(true))
        })
      this._container.add(c)
      this._container.add(uiText(this.scene, wp.x, wp.y, `${i + 1}`, 'tiny', {
        color: PALETTE.textDimStr,
      }).setOrigin(0.5))
      return c
    })
  }

  // ─── Generic fallback ─────────────────────────────────────────────────────
  _drawGenericTask(cx, cy, taskId) {
    this._container.add(uiText(this.scene, cx, cy, 'Working...', 'body', {
      color: PALETTE.textDimStr,
    }).setOrigin(0.5))

    this.scene.time.delayedCall(2000, () => this._close(true))
  }

  // ─── Close ────────────────────────────────────────────────────────────────
  _close(success) {
    if (!this.active) return
    this.active = false
    this._container?.destroy()
    this._container = null
    this._resolveTask?.(success)
    this._resolveTask = null
  }
}
