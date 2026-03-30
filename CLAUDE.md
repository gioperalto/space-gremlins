<!-- harnest:begin -->
# Harnest — Web Game Chick (webgame)

This chick creates responsive, deployable web games from a rough concept. The team is led by a game designer who interviews the user and writes a game design document, supported by a builder who implements the complete game, validated by a playtester who reviews for bugs, GDD conformance, and deployment correctness.

## Configuration

All team settings live in `harnest.yaml` at the project root. Read it at the start of every session — it is the source of truth for agent roles, models, workflow rules, and supplementary tool availability.

## Team Structure

| Role          | Model  | Count | Purpose                                                           |
|---------------|--------|-------|-------------------------------------------------------------------|
| Game Designer | opus   | 1     | Interviews user, selects tech stack, writes game design document  |
| Builder       | sonnet | 1     | Implements complete playable game + GitHub Actions deployment     |
| Playtester    | sonnet | 1     | Reviews code, validates GDD conformance, signs off on deployment  |

## Workflow: How to Bootstrap a Team

### Step 1 — Read Configuration
```
Read harnest.yaml
```
Parse team settings, agent definitions, tool availability, and workflow config.

### Step 2 — Create Team
```
TeamCreate(team_name: "webgame", description: "Web game creation team")
```

### Step 3 — Spawn Game Designer First

Spawn the game designer. The game designer:
1. Interviews the user via `AskUserQuestion` to capture the full game vision
2. Selects the optimal tech stack based on game complexity:
   - `vanilla` — pure HTML/CSS/JS for simple games (Pong, Snake, etc.)
   - `vite-vanilla` — Vite + Vanilla JS for medium-complexity games
   - `vite-phaser` — Vite + Phaser 3 for physics, audio, sprites, tilemaps
   - `vite-three` — Vite + Three.js for explicit 3D requests
3. Writes a complete game design document to `.harnest/game-design.md`
4. Signals the builder to begin

**The builder must wait for the game designer to complete before starting.**

### Step 4 — Spawn Builder

After the game designer produces the GDD, spawn the builder. The builder:
1. Reads `.harnest/game-design.md`
2. Scaffolds the chosen tech stack in a new game directory (`<game-slug>/`)
3. Implements the full, playable game — not a stub
4. Generates `.github/workflows/deploy.yml` for GitHub Pages deployment
5. Writes a `README.md` inside the game directory with dev and deployment instructions
6. Signals the playtester when complete

### Step 5 — Spawn Playtester

After the builder signals completion, spawn the playtester. The playtester:
1. Reads `.harnest/game-design.md` as the source of truth
2. Reviews the game code against the GDD checklist (mechanics, controls, states, score)
3. Checks for common game bugs (RAF loop, collision bounds, event listener cleanup)
4. Validates responsive design and touch event support (if required)
5. Verifies `.github/workflows/deploy.yml` and `vite.config.js` are correct for GitHub Pages
6. **Opens the game in a real browser via Playwright** — takes screenshots at menu, gameplay, and game over states; verifies visual quality matches the GDD's stated polish level
7. Checks for `PALETTE` constant, gradient backgrounds, screen shake, and particle effects appropriate to the polish level
8. If issues found: sends specific `file:line` feedback to the builder and waits for fixes
9. Signs off by writing `.harnest/playtest-report.md` with APPROVED verdict

Builder fixes issues and signals the playtester for re-review. Maximum `max_review_cycles` rounds (see `harnest.yaml`).

### Step 6 — Cleanup

When the playtester approves:
1. Send `shutdown_request` to all teammates
2. Wait for confirmations
3. Call `TeamDelete` to clean up

The new game is now available in `<game-slug>/` and can be deployed by enabling GitHub Pages from the `gh-pages` branch in the repository settings.

## Tech Stack Decision Guide

| Game Type | Recommended Stack |
|---|---|
| Classic arcade (Pong, Snake, Breakout) | `vanilla` |
| Puzzle, clicker, card game | `vite-vanilla` |
| Platformer, shooter, top-down RPG | `vite-phaser` |
| Any game with physics or audio | `vite-phaser` |
| Sprite-heavy shooter, particle-intensive, WebGL needed, no physics | `vite-pixijs` |
| Explicit 3D browser game | `vite-three` |

## Important Notes

- **No backend**: All games are purely client-side. No servers, databases, or authentication.
- **GitHub Pages deployment**: The builder generates a `.github/workflows/deploy.yml`. The user must enable GitHub Pages from the `gh-pages` branch in their repository settings after first push.
- **frontend-design plugin**: Recommended for the builder for UI/visual guidance. Enable it in Claude Code settings.
- **No worktrees**: All agents work in the same project directory (`use_worktrees: false`).
- **Teams feature**: Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (set in `.claude/settings.json`).
- **Playwright MCP** (required for visual review): Copy `claude/settings.local.json.example` to `claude/settings.local.json` — Playwright is enabled by default. The playtester uses it to open the game, take screenshots, and verify visual quality. If Playwright is unavailable, the playtester falls back to static code review and notes it in the playtest report.

<!-- harnest:end -->
