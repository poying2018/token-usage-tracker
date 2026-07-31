// @ts-nocheck
export class SyncHub {
  private sessions: Map<string, any>;
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.text();
      this.broadcast(body);
      return new Response('ok');
    }
    if (url.pathname === '/connect' && request.method === 'GET') {
      return this.connect();
    }
    return new Response('not found', { status: 404 });
  }

  private connect(): Response {
    const sessionId = crypto.randomUUID();
    let controller: ReadableStreamDefaultController;
    const stream = new ReadableStream({
      start(c) { controller = c; },
    });
    const encoder = new TextEncoder();
    const send = (event: string, data: unknown) => {
      try {
        controller.enqueue(encoder.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
      } catch {}
    };
    this.sessions.set(sessionId, { controller });
    send('connected', { sessionId, time: Date.now() });
    const heartbeat = setInterval(() => {
      try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
      catch { clearInterval(heartbeat); this.sessions.delete(sessionId); }
    }, 15000);
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  private broadcast(data: string) {
    const encoder = new TextEncoder();
    for (const [id, session] of this.sessions) {
      try {
        session.controller.enqueue(encoder.encode('event: update\ndata: ' + data + '\n\n'));
      } catch {
        this.sessions.delete(id);
      }
    }
  }
}
