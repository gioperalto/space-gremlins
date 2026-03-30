// ─── Display ─────────────────────────────────────────────────────────────────
export const BASE_W = 320
export const BASE_H = 180

// ─── Color Palette ────────────────────────────────────────────────────────────
export const PALETTE = {
  bg:         0x1a1a2e,
  bgDark:     0x0d0d1a,
  floor:      0x2d2d44,
  floorLight: 0x363655,
  wall:       0x111128,
  wallLight:  0x1e1e3a,
  primary:    0x00e5ff,
  primaryStr: '#00e5ff',
  accent:     0xff4444,
  accentStr:  '#ff4444',
  task:       0xffcc00,
  taskStr:    '#ffcc00',
  text:       0xe0e0e0,
  textStr:    '#e0e0e0',
  textDim:    0x888888,
  textDimStr: '#888888',
  danger:     0xff2222,
  dangerStr:  '#ff2222',
  meetingBg:  0x0d0d1a,
  glow:       0x00e5ff,
  gremlin:    0xff2222,
}

// Player colors (8 distinct)
export const PLAYER_COLORS = [
  { name: 'Red',    hex: 0xff4444, str: '#ff4444' },
  { name: 'Green',  hex: 0x44ff44, str: '#44ff44' },
  { name: 'Blue',   hex: 0x4488ff, str: '#4488ff' },
  { name: 'Yellow', hex: 0xffff44, str: '#ffff44' },
  { name: 'Pink',   hex: 0xff44ff, str: '#ff44ff' },
  { name: 'Cyan',   hex: 0x44ffff, str: '#44ffff' },
  { name: 'Orange', hex: 0xff8844, str: '#ff8844' },
  { name: 'White',  hex: 0xffffff, str: '#ffffff' },
]

// ─── Map Layout (world coordinates 640x360) ───────────────────────────────────
// Rooms defined as { id, name, x, y, w, h } — top-left origin
export const ROOMS = {
  cafeteria:  { id: 'cafeteria',  name: 'Cafeteria',    x: 160, y: 200, w: 160, h: 100 },
  bridge:     { id: 'bridge',     name: 'Bridge',       x: 240, y: 20,  w: 140, h: 90  },
  medbay:     { id: 'medbay',     name: 'Medbay',       x: 30,  y: 120, w: 130, h: 100 },
  reactor:    { id: 'reactor',    name: 'Reactor',      x: 480, y: 120, w: 130, h: 100 },
  storage:    { id: 'storage',    name: 'Storage',      x: 420, y: 220, w: 130, h: 100 },
  engineroom: { id: 'engineroom', name: 'Engine Room',  x: 200, y: 300, w: 160, h: 70  },
}

// Corridors (walkable connecting strips)
export const CORRIDORS = [
  // Bridge to center junction
  { x: 290, y: 110, w: 40, h: 90 },
  // Medbay to cafeteria
  { x: 80,  y: 220, w: 80, h: 30 },
  // Medbay to bridge (horizontal top connector)
  { x: 120, y: 130, w: 130, h: 30 },
  // Reactor to storage
  { x: 515, y: 220, w: 30, h: 50 },
  // Cafeteria to storage (horizontal)
  { x: 320, y: 240, w: 100, h: 30 },
  // Cafeteria to engine room
  { x: 240, y: 290, w: 50, h: 30 },
  // Bridge to reactor (horizontal upper)
  { x: 370, y: 130, w: 120, h: 30 },
]

// All walkable areas = rooms + corridors
export const WALKABLE_AREAS = [
  ...Object.values(ROOMS),
  ...CORRIDORS,
]

// World bounds
export const WORLD_W = 640
export const WORLD_H = 370

// ─── Task Stations ────────────────────────────────────────────────────────────
export const TASK_STATIONS = [
  { id: 'swipe_card',    room: 'cafeteria',  x: 200, y: 230, label: 'Swipe Card' },
  { id: 'download_data', room: 'bridge',     x: 290, y: 60,  label: 'Download' },
  { id: 'medbay_scan',   room: 'medbay',     x: 80,  y: 170, label: 'Scan' },
  { id: 'wire_connect',  room: 'storage',    x: 460, y: 265, label: 'Wires' },
  { id: 'reactor_align', room: 'reactor',    x: 535, y: 175, label: 'Reactor' },
  { id: 'engine_tune',   room: 'engineroom', x: 250, y: 340, label: 'Engine' },
  { id: 'fuel_transfer_a', room: 'storage',  x: 500, y: 265, label: 'Fuel (A)' },
  { id: 'fuel_transfer_b', room: 'engineroom', x: 300, y: 340, label: 'Fuel (B)' },
  { id: 'nav_chart',     room: 'bridge',     x: 340, y: 60,  label: 'Nav' },
]

// ─── Vents ─────────────────────────────────────────────────────────────────────
export const VENTS = [
  { id: 'vent_a1', room: 'cafeteria',  x: 280, y: 270, links: ['vent_a2'] },
  { id: 'vent_a2', room: 'medbay',     x: 90,  y: 200, links: ['vent_a1'] },
  { id: 'vent_b1', room: 'reactor',    x: 520, y: 195, links: ['vent_b2'] },
  { id: 'vent_b2', room: 'engineroom', x: 220, y: 340, links: ['vent_b1'] },
  { id: 'vent_c1', room: 'bridge',     x: 370, y: 80,  links: ['vent_c2'] },
  { id: 'vent_c2', room: 'storage',    x: 430, y: 240, links: ['vent_c1'] },
]

// Emergency button
export const EMERGENCY_BUTTON = { x: 240, y: 250, room: 'cafeteria' }

// ─── Game Constants ───────────────────────────────────────────────────────────
export const CONSTANTS = {
  PLAYER_SPEED: 80,         // px per second
  PLAYER_RADIUS: 7,
  PLAYER_BODY_H: 10,
  KILL_RANGE: 40,
  VISION_RADIUS_CREW: 70,
  VISION_RADIUS_GREMLIN: 90,
  VISION_RADIUS_LIGHTS_OUT: 25,
  TASK_INTERACT_RANGE: 20,
  VENT_INTERACT_RANGE: 16,
  BODY_INTERACT_RANGE: 24,

  // UI
  TASKBAR_H: 8,
  CHAT_MAX_MESSAGES: 50,
  CHAT_MAX_LENGTH: 200,

  // Depths (z-order)
  DEPTH_FLOOR: 0,
  DEPTH_BODIES: 5,
  DEPTH_TASK_STATIONS: 8,
  DEPTH_VENTS: 9,
  DEPTH_PLAYERS: 10,
  DEPTH_LOCAL_PLAYER: 12,
  DEPTH_FOG: 20,
  DEPTH_HUD: 30,
  DEPTH_OVERLAY: 40,
  DEPTH_MODAL: 50,
}
