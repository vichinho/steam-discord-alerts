const endpoint = 'https://api.skinport.com/v1/items?app_id=252490&currency=USD&tradable=1';
export default {
  async fetch(): Promise<Response> {
    const variants: [string, HeadersInit][] = [
      ['required-br', { Accept: 'application/json', 'Accept-Encoding': 'br' }],
      ['automatic-encoding', { Accept: 'application/json' }],
      ['standard-encoding-list', { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate, br' }]
    ];
    const results = [];
    for (const [name, headers] of variants) {
      try {
        const response = await fetch(endpoint, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
        results.push({ name, status: response.status, encoding: response.headers.get('content-encoding'), length: response.headers.get('content-length') });
        await response.body?.cancel();
      } catch (error) {
        results.push({ name, errorName: error instanceof Error ? error.name : 'unknown', error: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
      }
    }
    return Response.json(results);
  }
};
