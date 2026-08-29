# Design Brief
## Concept
3D arena battle: Trump vs Biden throwing projectiles at each other.

## Core Mechanics
- **Dodge**: Move left/right to avoid Biden's projectiles. State: player.position.x. Magnitude: full arena width traversal in ~2.5s.
- **Throw**: Launch projectile at Biden. State: score (on hit). Cooldown: 0.5s. Magnitude: ~2 hits/second max.
- **Health**: Player takes damage when hit. State: gameState.health. Starts at 5, decreases by 1 per hit.

## Win/Lose Conditions
- Win: Accumulate highest score (endless)
- Lose: Health reaches 0 (all 5 lives lost)

## Entity Interactions
- **Trump (player)**: Red/orange placeholder box. 12% screen width. Moves left/right, throws red projectiles.
  - Distinguishing: Orange hair, red tie (to be added in asset step)
  - Gestures: point (throw), clap (hit), dance (combo), twist (dodge)
- **Biden (opponent)**: Blue placeholder box. 12% screen width. AI-controlled, moves sinusoidally, throws blue projectiles.
  - Distinguishing: White hair, aviator sunglasses, blue suit (to be added in asset step)
  - Gestures: idle only
- **Red projectile**: Glowing red sphere, 0.3 units. Travels from Trump toward Biden.
- **Blue projectile**: Glowing blue sphere, 0.3 units. Travels from Biden toward Trump.
- **Arena**: Dark platform 20x12 units with glowing edges.

## Expression Map
### Player: Trump
| Game Event | Animation | Why |
|---|---|---|
| Idle/default | idle (TrumpStillLook) | Resting state |
| Throw projectile | point (TrumpPoint) | Aiming gesture |
| Hit Biden | clap (TrumpClap1) | Celebration |
| Combo 3+ | dance (Trumpdance1) | Victory dance |
| Take damage | twist (TrumpTwist) | Recoil |
| Talking/taunting | talk (TrumpTalk1) | Between throws |

### Opponent: Biden
| Game Event | Animation | Why |
|---|---|---|
| All states | idle (mixamo.com) | Only animation available |
