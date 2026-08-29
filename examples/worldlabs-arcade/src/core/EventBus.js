class EventBusImpl {
  constructor() { this._listeners = {}; }
  on(event, fn) { (this._listeners[event] ||= []).push(fn); }
  off(event, fn) { const arr = this._listeners[event]; if (arr) this._listeners[event] = arr.filter(f => f !== fn); }
  emit(event, data) { (this._listeners[event] || []).forEach(fn => fn(data)); }
}

export const eventBus = new EventBusImpl();

export const Events = {
  GAME_RESTART: 'game:restart',
  GAME_OVER: 'game:over',
};
