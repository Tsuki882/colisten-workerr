export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,64})$/);
    if (!match) return new Response('CoListen Worker is running. Use /room/<code>.', { status: 200 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426, headers: { 'Upgrade': 'websocket' } });
    }
    const id = env.ROOMS.idFromName(match[1].toUpperCase());
    return env.ROOMS.get(id).fetch(request);
  }
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const name = (url.searchParams.get('name') || 'Guest').slice(0, 40);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name });
    server.send(JSON.stringify({ type: 'members', members: this.members() }));
    this.broadcast({ type: 'joined', user: name }, server);
    this.broadcast({ type: 'members', members: this.members() });
    return new Response(null, { status: 101, webSocket: client });
  }

  members() {
    return this.ctx.getWebSockets().map(ws => ws.deserializeAttachment()?.name || 'Guest');
  }

  broadcast(message, exclude = null) {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try { ws.send(payload); } catch (_) {}
    }
  }

  websocketMessage(ws, message) {
    try {
      const parsed = JSON.parse(message);
      this.broadcast(parsed, ws);
    } catch (_) {}
  }

  websocketClose(ws) {
    const name = ws.deserializeAttachment()?.name || 'Guest';
    this.broadcast({ type: 'left', user: name }, ws);
    this.broadcast({ type: 'members', members: this.members().filter(n => n !== name) });
  }

  websocketError(ws) {
    this.websocketClose(ws);
  }
}
