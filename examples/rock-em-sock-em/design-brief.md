# Rock 'Em Sock 'Em Robots — Design Brief

## Concept

A 3D boxing game inspired by the classic Mattel toy. Two robots face each other in a boxing ring. The player controls the Blue Bomber; the Red Rocker is AI-controlled. Each robot can throw left and right punches, and block. Each hit to the opponent's head raises their head mechanism slightly. After enough hits, the opponent's head pops up and the round is won.

## Core Mechanics

### Punching
- Two punch types: left (A key / left tap) and right (D key / right tap)
- Punches have a short wind-up animation (0.25s) with hit detection at the midpoint
- Cooldown between punches (0.4s) prevents button mashing
- Cannot punch while blocking

### Blocking
- Hold W / Up Arrow, or tap the top 30% of screen on mobile
- Reduces incoming damage by 75% (from 12 to 3)
- Cannot punch while blocking (must release block first)

### Head Health
- Each robot has 100 head health points
- Unblocked punch deals 12 damage
- Blocked punch deals 3 damage
- When health reaches 0, the head pops upward (knockout animation)

### Combo System
- Consecutive unblocked hits within 1.5s build a combo
- Combo counter resets on miss or getting hit
- Tracks best combo across rounds
- Spectacle events fire at combo >= 3

## Win/Lose Conditions

### Win (Round)
- Reduce opponent's head health to 0
- Opponent's head pops up = round won
- Score increments by 1
- After 2-second delay, new round starts with full health

### Lose (Game Over)
- Player's head health reaches 0
- Player's head pops up = knocked out
- Game over screen shows rounds won and best score
- Restart button begins fresh game

## Entity Interactions

### Blue Bomber (Player)
- Positioned at +Z in the ring (closer to camera)
- Faces -Z (toward opponent)
- Controlled by keyboard (A/D/W) and touch zones
- Blue body (#2266cc), darker blue accents (#1a4f99), blue gloves (#3388ee)
- Stocky robot built from Box, Cylinder, and Sphere geometries

### Red Rocker (AI Opponent)
- Positioned at -Z in the ring (far side)
- Faces +Z (toward player)
- AI-controlled with timing patterns
- Red body (#cc2222), darker red accents (#991a1a), red gloves (#ee3333)
- Same stocky robot build as Blue Bomber, mirrored
- AI becomes slightly more aggressive as player wins more rounds

### Boxing Ring
- Raised platform (6x6 units) with brown base and light canvas surface
- Four corner posts with colored turnbuckle caps (alternating red/blue)
- Three rows of white ropes on each side
- Dark arena floor surrounding the ring

### Health Bars
- 3D floating bars above each robot's head
- Green for player, orange for opponent
- Turns red below 30% health
- Billboarded to always face the camera

## Visual Identity

### Arena Atmosphere
- Dark background (#1a1a2e) — arena/stadium feel
- Overhead spotlight illuminating the ring
- Colored rim lights: blue glow behind player, red glow behind opponent
- Directional light for shadows

### Robots
- Stocky, toy-like proportions (wide body, big head, round gloves)
- Built entirely from Three.js primitives (no external models needed initially)
- Clear color distinction: all-blue vs all-red
- Eyes with white sclera and dark pupils for personality
- Chest plate accent in lighter shade for visual interest
- Head sits on a "spring" (gap between head and body) for the pop-up mechanic

### Camera
- Fixed third-person view behind the player
- Positioned slightly above and behind (y: 3.5, z: 4.5)
- Looking slightly down at the action (y: 1.8, z: -1.0)
- No orbit controls — static framing for clarity

### Animations
- Idle: subtle body bob
- Punch: glove extends forward on sine curve, slight upward arc
- Block: both arms raise to protect head, move inward
- Head pop: head group translates upward 0.6 units (spring mechanism)

## Controls

### Desktop
| Key | Action |
|-----|--------|
| A / Left Arrow | Left punch |
| D / Right Arrow | Right punch |
| W / Up Arrow | Block (hold) |

### Mobile (Touch)
| Zone | Action |
|------|--------|
| Left half of screen (bottom 70%) | Left punch |
| Right half of screen (bottom 70%) | Right punch |
| Top 30% of screen | Block (hold) |

## Technical Notes

- Engine: Three.js (WebGLRenderer)
- No external model files — robots built from primitives
- EventBus architecture — all systems communicate via events
- GameState singleton tracks all combat state
- Constants.js holds every configuration value
- Restart-safe: full cleanup on reset, new robot groups created each round
- Mobile-first: touch input wired from the start
- Safe zone: HTML overlays respect 75px Play.fun widget at top
