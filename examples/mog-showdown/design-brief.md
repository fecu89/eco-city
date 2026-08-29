# Mog Showdown -- Design Brief

## Concept

"Mog Showdown" is a side-scrolling arena game where you play as Clavicular (Braden Peters, a 20-year-old looksmaxxing streamer known for rating facial structures with emphasis on clavicle width) in a showdown against Androgenic (a 24-year-old Australian looksmaxxing streamer, 6'5", infamous for getting his wig snatched revealing his receding hairline).

## Core Loop

1. **Dodge** -- Androgenic stands at the top of the arena throwing attacks (wigs, hats) downward
2. **Collect** -- Looksmaxxing power-ups (protein shakes, dumbbells) fall from the top; catch them for points
3. **Build Mog Level** -- Every 5 power-ups collected fills the Mog Meter, triggering a "FRAME MOG" burst
4. **Frame Mog** -- Clears all attacks on screen, knocks off Androgenic's hat (exposing the wig), and grants bonus points
5. **Survive** -- 3 lives; get hit by 3 attacks and it's game over

## Characters

### Clavicular (Player)
- **Identity**: 20yo American, lean build, pseudo-scientific attractiveness ratings
- **Visual**: Gold/amber tones (#D4A017 body), prominent angular collarbones, sharp jawline, dark styled-up hair, tank top
- **Movement**: Left/right at bottom of screen (~82% height)
- **Distinguishing features**: Wide angular shoulders, prominent clavicle bones (drawn with highlighted lines), V-taper torso
- **Expression states**:
  - **Idle**: Confident stance, clavicles prominent
  - **Moving**: Leaning into movement direction (sprite flips)
  - **Hit**: Flash red, brief invulnerability
  - **Frame Mog**: Golden burst effect radiates outward
  - **Death**: Slow-mo camera shake

### Androgenic (Opponent NPC)
- **Identity**: 24yo Australian, 6'5", wears cap/hat hiding a wig over receding hairline
- **Visual**: Dark blue tones (#1A3A5C body), tall broad frame, baseball cap (#333), menacing eyebrows/smirk
- **Behavior**: Stands at top of screen, sways side-to-side, throws attacks at random intervals
- **Distinguishing features**: Taller/broader than Clavicular, cap with brim, thick neck
- **Expression states**:
  - **Normal**: Cap on, menacing smirk, gentle sway
  - **Throwing**: Brief arm animation (via throw event)
  - **Wig Exposed**: Cap flies off, bald head with sparse hair strands visible, shakes in surprise
  - **Recovery**: Cap returns after Frame Mog duration ends

## Entity Interactions

```
Androgenic (top) --[throws]--> Attacks (fall down)
                                   |
                              Clavicular (bottom)
                                   |
                  [collide: attack] --> Lose life, break combo
                  [collide: powerup] --> Score +1, combo +1, mog progress +1
                  [mog meter full] --> FRAME MOG --> clear attacks, expose wig, bonus points
```

## Projectile Types

### Attacks (hurt player)
- **Wig**: Brown (#5C3317), wavy shape with bumps, spins as it falls
- **Hat**: Dark (#333), baseball cap with brim, spins as it falls

### Power-ups (score points)
- **Protein Shake**: Bright green (#22CC55), bottle shape with cap and label
- **Dumbbell**: Pink (#FF69B4), two weights connected by a bar

## Scoring System

- +1 point per power-up collected
- Combo counter: consecutive catches without getting hit
- +5 bonus points per Frame Mog trigger
- Mog Level tracks total Frame Mogs triggered

## Difficulty Ramp

- Attack spawn interval starts at 1800ms, decreases by 3% every 10 seconds (minimum 600ms)
- Power-up spawn interval starts at 2200ms, decreases by 2% every 10 seconds (minimum 1000ms)
- Attack fall speed ranges from 150-280 PX/s with slight horizontal drift

## Arena Layout

```
+----------------------------------+
| [Safe Zone - Play.fun widget]    |
|                                  |
|    [Hearts] [Score] [Mog Bar]    |
|                                  |
|         [Androgenic]             |  <-- Sways left/right, throws down
|              |                   |
|         attacks/powerups fall    |
|              |                   |
|              v                   |
|                                  |
|         [Clavicular]             |  <-- Moves left/right
|                                  |
| ================================ |  <-- Arena floor (neon grid)
+----------------------------------+
```

## Visual Identity

- **Arena**: Dark purple/blue gradient (#0D0221 to #150B3A) with neon grid floor
- **Neon accents**: Gold (#FFD700), Blue (#00BFFF), Purple (#8A2BE2), Pink (#FF1493)
- **Floor**: Dark purple (#2A1B54) with purple neon line (#6C63FF)
- **HUD**: Hearts for lives, centered score, right-side mog bar with gold fill

## Spectacle Events

- `SPECTACLE_ENTRANCE`: Clavicular bounces in from below, Androgenic slides from top
- `SPECTACLE_ACTION`: Every left/right movement
- `SPECTACLE_HIT`: Every power-up collected
- `SPECTACLE_COMBO`: Consecutive catches (passes combo count)
- `SPECTACLE_STREAK`: At milestones 5, 10, 25 power-ups
- `SPECTACLE_NEAR_MISS`: Attack passes within 20% of player hitbox but misses

## Game Over

- If score > 20: "YOU MOGGED HIM!" (gold text)
- If score <= 20: "YOU GOT MOGGED!" (pink text)
- Shows final score, best score, mog level reached, best combo
- "PLAY AGAIN" button with fade transition
