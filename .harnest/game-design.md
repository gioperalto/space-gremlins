# Game Design Document

## Title
**Space Gremlins**

## Concept
Space Gremlins is a multiplayer social deduction game inspired by Among Us and Mafia. Players are crewmates aboard a small spaceship, completing tasks to keep the ship running. Hidden among them are Gremlins — imposters who sabotage, kill, and deceive their way to victory. The core loop is: move around the ship, complete tasks (crewmates) or kill/sabotage (gremlins), discover bodies, call meetings, discuss, vote, and repeat until one side wins.

## Genre
2D top-down multiplayer social deduction game

## Tech Stack

### Client
**Choice**: `vite-phaser`
**Reasoning**: The game requires real-time 2D top-down movement, sprite rendering, collision detection, camera following, interactive task stations, and animated UI overlays. Phaser 3 provides all of this out of the box with its tilemap support, physics system, animation manager, and input handling. Retro pixel art fits Phaser's rendering pipeline perfectly.

### Server
**Choice**: Node.js + Express + Socket.IO
**Reasoning**: Among Us-style multiplayer requires authoritative server-side game state to prevent cheating. Socket.IO provides reliable real-time bidirectional communication for player movement, kills, task completion, voting, and chat. Express serves the API for lobby management.

### Deployment
**Target**: Railway (not GitHub Pages — this game has a backend)
**Reasoning**: Railway supports Node.js servers with persistent websocket connections. The client build (`dist/`) is served statically by the Express server.

### Observability
**Choice**: Datadog (dd-trace + browser SDK)
**Reasoning**: User requested Datadog instrumentation for monitoring game server health, player sessions, and debugging production issues.

## Controls
- **Desktop**: Click to move (pathfinding to clicked position), click to interact with task stations and UI elements
- **Mobile**: Tap to move, tap to interact. All UI elements are touch-friendly with generous tap targets (minimum 44x44px)
- **No keyboard required** — the game is fully playable with mouse/touch only
- **Chat**: On-screen keyboard / text input during meetings

## Visual Style
- **Art direction**: Retro pixel art (16-bit era aesthetic)
- **Resolution**: Pixel-perfect rendering at a base resolution of 320x180, scaled up to fill the viewport
- **Color palette**:
  - Background (space/walls): `#1a1a2e` — deep space navy
  - Floor tiles: `#2d2d44` — dark steel gray
  - Primary UI / highlights: `#00e5ff` — cyan glow
  - Player colors (8 distinct): `#ff4444` red, `#44ff44` green, `#4444ff` blue, `#ffff44` yellow, `#ff44ff` pink, `#44ffff` cyan, `#ff8844` orange, `#ffffff` white
  - Danger / kill: `#ff2222` — bright red
  - Task stations: `#ffcc00` — gold/amber
  - Text: `#e0e0e0` — light gray
  - Meeting UI background: `#0d0d1a` — near-black
- **Style**: Chunky pixel sprites with limited color palettes per sprite (8-12 colors). Dithering for shading. CRT scanline overlay optional.
- **Animation feel**: Snappy — quick movement transitions, punchy interactions
- **Visual reference**: Retro Among Us if it were made for SNES/Genesis

## Polish Level
**Level**: polished
**Game Feel Notes**:
- Screen shake: Yes — subtle on kill events, moderate on sabotage alarms
- Particle events: death (pixel blood splatter), task complete (sparkle burst), emergency button press (alarm flash), vote eject (airlock whoosh particles)
- Animation style: Snappy and punchy — quick sprite transitions, no floaty movement
- UI transitions: Slide-in panels for meetings, fade transitions between game phases
- Sound effects: Key SFX for major actions (see Audio section)

## Roles

### Crewmate
- Can move freely around the ship
- Can complete tasks at task stations
- Can report dead bodies
- Can call emergency meetings (button in Cafeteria, limited uses per game)
- Can chat and vote during meetings
- Goal: Complete all tasks OR vote out all Gremlins

### Gremlin
- Can move freely around the ship (appears as a normal crewmate to others)
- Can kill crewmates (cooldown between kills)
- Can sabotage ship systems (lights, reactor, comms)
- Can use vents to teleport between rooms
- Can fake tasks (stand at a station but no progress registered server-side)
- Can chat and vote during meetings (deception is key)
- Goal: Kill crewmates until Gremlins equal or outnumber them

## Win / Lose Conditions
- **Crewmate Victory (Task Win)**: All crewmates collectively complete every task on the task bar
- **Crewmate Victory (Vote Win)**: All Gremlins are voted out and ejected
- **Gremlin Victory (Kill Win)**: Gremlins equal or outnumber remaining crewmates
- **Gremlin Victory (Sabotage Win)**: A critical sabotage (reactor meltdown) is not resolved in time
- **Score**: No persistent score — each game is a standalone round. Win/loss stats tracked per session in memory.

## Game Flow

### 1. Lobby Phase
- Host creates a game room, receives a 6-character room code
- Other players join by entering the room code
- Host can see all connected players and adjust settings (kill cooldown, number of tasks, discussion time, voting time)
- Host starts the game when 4-8 players have joined
- Roles are secretly assigned (1 Gremlin for 4-6 players, 2 Gremlins for 7-8 players)

### 2. Role Reveal Phase (3 seconds)
- Each player sees their role: "You are a **Crewmate**" or "You are a **Gremlin**"
- Gremlins also see who the other Gremlin is (if 2 Gremlins)
- Brief dramatic reveal animation

### 3. Task Phase (main gameplay loop)
- Players move freely around the ship
- Crewmates complete tasks at stations
- Gremlins can kill (with cooldown), sabotage, and use vents
- A global task progress bar shows overall completion
- Dead players become ghosts: can still complete tasks but cannot speak or interact with living players
- Phase continues until a body is reported or emergency meeting is called

### 4. Meeting Phase
- Triggered by: body report (reporter sees "Report" button near a body) or emergency button (in Cafeteria)
- All players are teleported to the meeting table
- **Discussion timer** (configurable, default 45 seconds): text chat is open
- **Voting timer** (configurable, default 30 seconds): each player votes for who to eject or skips
- **Results**: Player with most votes is ejected (tie = no ejection, skip majority = no ejection)
- Ejected player's role is optionally revealed (configurable: confirm ejects on/off)
- Dead players can chat with other dead players only (ghost chat)

### 5. Ejection Animation
- Brief cutscene: ejected player is shown being launched out the airlock
- Game checks win conditions after ejection

### 6. Return to Task Phase or Game Over
- If win condition met: show victory/defeat screen, then return to lobby
- Otherwise: return to Task Phase, repeat

## Map Design

### Ship Layout: Small (6 rooms)
The ship is a compact tilemap with corridors connecting rooms.

```
         [Bridge]
            |
    [Medbay]---[Reactor]
        |         |
  [Cafeteria]---[Storage]
            |
       [Engine Room]
```

#### Rooms
1. **Cafeteria** (center-ish) — Emergency button is here. Meeting table. Spawn point.
2. **Bridge** (top) — Navigation tasks, security cameras
3. **Medbay** (left) — Medical scan task, body inspection
4. **Reactor** (right) — Power alignment task, critical sabotage target
5. **Storage** (bottom-right) — Cargo sorting task, fuel task
6. **Engine Room** (bottom) — Engine tuning task, fuel delivery

#### Vent Network (Gremlins only)
- Vent A: Cafeteria <-> Medbay
- Vent B: Reactor <-> Engine Room
- Vent C: Bridge <-> Storage

#### Corridors
- Short hallways connecting adjacent rooms
- Line of sight is blocked by walls — you can't see into rooms you're not in
- Fog of war / limited vision radius around the player

### Vision
- Each player has a circular vision radius (crewmates: smaller, gremlins: larger)
- Areas outside vision are dimmed/fogged
- Lights-out sabotage reduces vision radius dramatically

## Tasks

### Simple Tasks (click/tap to complete, progress bar)
1. **Swipe Card** (Cafeteria) — Tap and swipe at the right speed
2. **Download Data** (Bridge) — Tap to start, wait for progress bar (8 seconds)
3. **Scan** (Medbay) — Stand on scanner, wait 10 seconds (visible to others as proof)

### Mini-Game Tasks
4. **Wire Connecting** (Storage) — Drag colored wires to matching outlets (4 wires)
5. **Reactor Alignment** (Reactor) — Align a slider to match a target value
6. **Engine Tuning** (Engine Room) — Tap nodes in the correct sequence (Simon Says style)
7. **Fuel Transfer** (Storage -> Engine Room) — Two-part task: fill canister in Storage, deliver to Engine Room
8. **Navigation Chart** (Bridge) — Tap waypoints on a star map in order

Each player is assigned 4-6 tasks randomly from the pool. Task locations are shown on the player's personal map.

## Sabotage (Gremlin abilities)

Gremlins can trigger sabotages from anywhere on the map via a sabotage menu:

1. **Lights Out** — Reduces all crewmates' vision to a tiny radius for 30 seconds (or until fixed at the electrical panel in Storage)
2. **Reactor Meltdown** — Two players must simultaneously hold buttons at the Reactor within 45 seconds or Gremlins win instantly
3. **Comms Disruption** — Disables the task list and player map for 30 seconds (or until fixed at the Bridge)

- Sabotage cooldown: 30 seconds between sabotages
- Sabotages cannot be called during meetings
- During a critical sabotage (Reactor Meltdown), emergency meetings cannot be called

## Multiplayer Architecture

### Client-Server Model
- **Authoritative server**: All game state lives on the server. The client sends inputs (move commands, task interactions, votes) and receives state updates.
- **Anti-cheat**: Clients never know who the Gremlins are (server only sends role info to the relevant player). Kill eligibility, task completion, and vote tallying are all server-side.

### Networking
- **Protocol**: Socket.IO over WebSockets (with HTTP long-polling fallback)
- **Events**:
  - `player:move` — client sends target position, server validates and broadcasts
  - `player:kill` — gremlin requests kill, server checks cooldown + proximity, broadcasts death
  - `task:interact` — player starts/completes a task
  - `meeting:call` — body report or emergency button
  - `meeting:chat` — chat message during meeting
  - `meeting:vote` — vote cast
  - `sabotage:trigger` — gremlin triggers sabotage
  - `sabotage:fix` — crewmate fixes sabotage
  - `game:state` — periodic full state sync (backup for missed events)

### Lobby System
- Room codes: 6-character alphanumeric (server-generated)
- Host has a settings panel before starting
- Players see a waiting room with connected player list and their chosen colors
- Reconnection support: if a player disconnects, they have 30 seconds to rejoin with the same session

## Audio Requirements
- **Sound effects** (all short, retro-styled 8-bit SFX):
  - Footsteps (soft, looping while moving)
  - Task complete (cheerful ding)
  - Kill (sharp slash / splat)
  - Body report (alarm klaxon)
  - Emergency button (buzzer)
  - Vote cast (click/stamp)
  - Ejection (airlock whoosh)
  - Sabotage alarm (warning siren, loops until fixed)
  - Meeting start (bell/chime)
  - Victory jingle (short, 3-second fanfare)
  - Defeat sting (short, 2-second somber tone)
- **Music**: No background music (keeps the tension from silence + footsteps)
- **Implementation**: Use Phaser's audio system. SFX can be generated procedurally (jsfxr/sfxr-style) or loaded as small audio files.

## Platform / Responsive
- **Primary target**: Both desktop and mobile (responsive)
- **Canvas sizing**: Responsive — fills the viewport while maintaining pixel-perfect scaling (integer scale factors of the 320x180 base resolution)
- **Touch events**: Required — all interactions must work with tap/touch
- **Mobile considerations**:
  - No hover states (touch devices don't have hover)
  - Chat input uses native mobile keyboard
  - Tap targets minimum 44x44px
  - Landscape orientation preferred, but playable in portrait with adjusted UI

## Deployment

### Railway
- **Dockerfile** or **nixpacks** config for Railway deployment
- Single service: Node.js server serving both the API and static client files
- Environment variables:
  - `PORT` — Railway assigns this automatically
  - `DD_API_KEY` — Datadog API key (set in Railway dashboard)
  - `DD_ENV` — Environment tag (e.g., `production`)
  - `NODE_ENV` — `production`

### Build Process
1. `npm install` — install all dependencies
2. `npm run build` — Vite builds the client to `dist/`
3. `npm start` — Express server starts, serves `dist/` as static files and handles Socket.IO connections

### GitHub Actions (optional)
- `.github/workflows/deploy.yml` — auto-deploys to Railway on push to `main` (using Railway's GitHub integration or `railway up` CLI)

## Datadog Observability

### Server-Side (dd-trace)
- APM tracing for Express routes and Socket.IO event handlers
- Custom metrics:
  - `space_gremlins.games.active` — gauge of active game rooms
  - `space_gremlins.players.connected` — gauge of connected players
  - `space_gremlins.games.completed` — counter of completed games (tagged by winner: crewmate/gremlin)
  - `space_gremlins.meetings.called` — counter of meetings (tagged by type: report/emergency)
  - `space_gremlins.tasks.completed` — counter of task completions
  - `space_gremlins.kills` — counter of kills
- Error tracking: unhandled exceptions and Socket.IO errors reported to Datadog
- Logs: structured JSON logs shipped to Datadog (game events, connections, disconnections)

### Client-Side (browser SDK) — Optional
- RUM (Real User Monitoring) for client performance
- Session replay for debugging player-reported issues
- Error tracking for client-side crashes

## References
- **Among Us** — Primary inspiration for gameplay loop, roles, meeting/voting system
- **Town of Salem** — Text-based discussion phase reference
- **Super Mario World / Chrono Trigger** — Pixel art style reference (16-bit era)
- **Spelunky Classic** — Retro pixel art with modern game feel reference

## Technical Notes

### Project Structure
```
space-gremlins/
  client/               # Vite + Phaser client
    src/
      scenes/           # Phaser scenes (Boot, Lobby, Game, Meeting, GameOver)
      sprites/          # Sprite classes (Player, TaskStation, Vent, Body)
      ui/               # UI components (chat, voting panel, task bar, minimap)
      tasks/            # Task mini-game implementations
      assets/           # Pixel art sprites, tilemaps, SFX
      network/          # Socket.IO client wrapper
      config.js         # Game constants, palette, settings
    index.html
    vite.config.js
  server/               # Node.js + Express + Socket.IO server
    src/
      index.js          # Entry point, Express + Socket.IO setup
      game/             # Game state management
        GameRoom.js     # Single game room state machine
        Player.js       # Player state (position, role, alive, tasks)
        TaskManager.js  # Task assignment and completion tracking
        VoteManager.js  # Meeting voting logic
        SabotageManager.js  # Sabotage state and timers
      lobby/            # Room creation, joining, settings
      observability/    # Datadog setup (dd-trace, custom metrics)
    package.json
  package.json          # Root package.json (workspaces)
  Dockerfile            # Multi-stage build for Railway
  railway.json          # Railway config
  README.md
```

### Key Implementation Notes
- Server is the source of truth for ALL game state — clients are dumb renderers
- Player positions are validated server-side (speed checks to prevent teleport hacks)
- Role assignment uses cryptographically random selection
- Socket.IO rooms map 1:1 to game rooms for efficient broadcasting
- Phaser scenes: Boot -> Lobby -> Game (with Meeting as overlay) -> GameOver -> Lobby
- Tilemap created in Tiled format (.json), loaded by Phaser
- Fog of war implemented via Phaser's lighting system or a dark overlay with a circular cutout
- Kill animation: brief screen flash + body drops sprite at death location
