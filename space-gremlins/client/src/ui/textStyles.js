import { PALETTE } from '../config.js'

export const UI_FONT_FAMILY = '"Trebuchet MS", Verdana, sans-serif'
const UI_STROKE = '#020814'

const variants = {
  title:   { fontSize: '18px', color: PALETTE.textStr, strokeThickness: 6, shadowY: 2 },
  heading: { fontSize: '12px', color: PALETTE.textStr, strokeThickness: 5, shadowY: 2 },
  body:    { fontSize: '9px',  color: PALETTE.textStr, strokeThickness: 4, shadowY: 1 },
  label:   { fontSize: '8px',  color: PALETTE.textStr, strokeThickness: 4, shadowY: 1 },
  small:   { fontSize: '7px',  color: PALETTE.textStr, strokeThickness: 3, shadowY: 1 },
  tiny:    { fontSize: '6px',  color: PALETTE.textStr, strokeThickness: 3, shadowY: 1 },
}

export function uiText(scene, x, y, text, variant = 'body', overrides = {}) {
  const base = variants[variant] || variants.body
  const style = {
    fontFamily: UI_FONT_FAMILY,
    fontStyle: '700',
    stroke: UI_STROKE,
    shadow: {
      offsetX: 0,
      offsetY: overrides.shadowY ?? base.shadowY,
      color: '#000000',
      blur: 0,
      stroke: false,
      fill: true,
    },
    padding: { x: 1, y: 1 },
    ...base,
    ...overrides,
  }

  const txt = scene.add.text(x, y, text, style)
  txt.setResolution(2)
  return txt
}
