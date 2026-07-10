class NetworkClient {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.handlers = {};
    this._connect();
  }

  _connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const handler = this.handlers[msg.type];
      if (handler) handler(msg.payload);
    };

    this.ws.onclose = () => {
      setTimeout(() => this._connect(), 2000);
    };
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  joinRoom(roomId, name) {
    this.send('join_room', { roomId: roomId || undefined, name });
  }

  selectHero(heroType) {
    this.send('select_hero', { heroType });
  }

  setReady(ready) {
    this.send('set_ready', { ready });
  }

  sendInput(input) {
    this.send('input', input);
  }
}

window.NetworkClient = NetworkClient;
