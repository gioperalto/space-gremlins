# Space Gremlins

A real-time multiplayer social deduction game set aboard a spaceship. Complete tasks as a crewmate, or sabotage and eliminate as a Gremlin. Inspired by Among Us.

## Controls

- **Move**: Click / tap anywhere on the map
- **Interact**: Tap a task station, body, emergency button, or vent when nearby (prompt appears)
- **Kill** (Gremlin): Tap the KILL button when a crewmate is in range
- **Sabotage** (Gremlin): Tap the SABO button to open the sabotage menu
- **Fix sabotage**: Move to the fix location shown in the warning, then tap / hold
- **Vote**: Tap a player portrait during the voting phase
- **Chat**: Tap the chat input area during a meeting

## Getting Started (Local Development)

You need two terminals.

### Server

```bash
cd space-gremlins/server
npm install
npm run dev
```

### Client

```bash
cd space-gremlins/client
npm install
npm run dev
```

Open http://localhost:5173 in multiple browser tabs to test multiplayer locally.

## Build for Production

```bash
cd space-gremlins/client
npm run build
# Built files go to space-gremlins/server/dist/
```

Then start the server:

```bash
cd space-gremlins/server
npm start
```

The server serves the client at http://localhost:3000.

## Deployment (Railway)

1. Create a Railway project at https://railway.app
2. Connect your GitHub repository
3. Set the following environment variables in Railway:
   - `PORT` — set automatically by Railway
   - `NODE_ENV=production`
   - `DD_API_KEY` — your Datadog API key (optional)
   - `DD_ENV=production` (optional)
4. Railway will build and deploy using the `Dockerfile` in `space-gremlins/`
5. For GitHub Actions deployment: add `RAILWAY_TOKEN` as a GitHub Actions secret

### First Deployment (Manual)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Deploy
cd space-gremlins
railway up
```

## Tech Stack

- **Client**: Vite + Phaser 3 (pixel art rendering, animations, scene management)
- **Server**: Node.js + Express + Socket.IO (authoritative game state, real-time events)
- **Observability**: Datadog APM (dd-trace) + custom game metrics
- **Deployment**: Railway (single-service, Node.js serving built client assets)

Phaser 3 was chosen over a plain canvas approach because the game requires multiple scenes (Lobby, RoleReveal, Game, Meeting, GameOver), animation tweening, camera follow with bounds, render textures for fog of war, and a clean scene lifecycle management system. Socket.IO with an authoritative server prevents role-spoofing and kill-range cheating.

## Gameplay

### Crewmates
- Complete assigned tasks across 6 rooms (Cafeteria, Bridge, Medbay, Reactor, Storage, Engine Room)
- Report dead bodies to call meetings
- Discuss and vote to eject suspects
- Win by completing all tasks OR ejecting all Gremlins

### Gremlins
- Kill crewmates (kill cooldown applies)
- Trigger sabotages: Lights Out, Reactor Meltdown, Comms Disruption
- Use vents to move between rooms secretly
- Win by equaling/outnumbering crewmates OR by letting Reactor Meltdown expire

### Rooms and Vent Network

```
         [Bridge]
            |
    [Medbay]---[Reactor]
        |         |
  [Cafeteria]---[Storage]
            |
       [Engine Room]
```

Vent network:
- Cafeteria <-> Medbay (Vent A)
- Reactor <-> Engine Room (Vent B)
- Bridge <-> Storage (Vent C)
