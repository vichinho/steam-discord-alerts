export class Budget {
  requests = 0; rowsRead = 0; rowsWritten = 0; responseBytes = 0; details = 0;
  take(count = 1): void { if (this.requests + count > 40) throw new Error('REQUEST_BUDGET'); this.requests += count; }
  detail(): void { if (++this.details > 10) throw new Error('DETAIL_BUDGET'); }
  canSpend(count: number): boolean { return this.requests + count <= 40; }
}
