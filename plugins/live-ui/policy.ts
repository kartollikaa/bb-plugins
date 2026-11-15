export class Consent {
  clients = new Map<string, number>();
  expiresAt = 0;
  constructor(readonly now: () => number = Date.now) {}
  resume(client: string, duration: number, lease: number) {
    if (!this.live()) this.expiresAt = this.now() + duration;
    this.clients.set(client, this.now() + lease);
  }
  heartbeat(client: string, lease: number) {
    if (this.live() && this.clients.has(client))
      this.clients.set(client, this.now() + lease);
  }
  pause(client: string) {
    this.clients.delete(client);
  }
  live() {
    for (const [c, t] of this.clients)
      if (t <= this.now()) this.clients.delete(c);
    return this.expiresAt > this.now() && this.clients.size > 0;
  }
  revoke() {
    this.clients.clear();
    this.expiresAt = 0;
  }
}
