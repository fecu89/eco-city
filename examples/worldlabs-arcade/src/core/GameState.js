class GameStateImpl {
  constructor() { this.reset(); }
  reset() {
    this.started = false;
    this.gameOver = false;
    this.score = 0;
    this.bestScore = 0;
  }
}

export const gameState = new GameStateImpl();
