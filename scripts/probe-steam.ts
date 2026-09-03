import { mkdir, writeFile } from 'node:fs/promises';
import { readConfig } from '../src/config.ts';
import { Budget } from '../src/budget.ts';
import { SteamProvider } from '../src/providers/steam.ts';
import { SourceError } from '../src/providers/http.ts';
const c = readConfig();
if (!c.source.accessReviewed) {
  console.error('STEAM_ACCESS_REVIEW_REQUIRED: falta validar el permiso aplicable; consultar docs/SOURCE-ACCESS.md. No se realizaron solicitudes.');
  process.exit(1);
}
const budget = new Budget(); const provider = new SteamProvider(c, budget);
const started = performance.now(); const cpu = process.cpuUsage();
const evidence: Record<string, unknown> = { observedAt: new Date().toISOString(), environment: 'local-windows-node', country: c.country, permissionStatus: 'NOT_CONFIRMED', cloudValidation: 'PENDING', coverage: c.source.coverage };
try {
  // Dos páginas como máximo; un detalle por listado y Portal 2 como control monetario.
  evidence.control = await provider.detail(620);
  for (const kind of ['deal', 'release'] as const) {
    const page = await provider.discover(kind, { offset: 0, pending: [], end: false }, 1);
    evidence[kind] = { discovery: page, sample: page.ids[0] ? await provider.detail(page.ids[0]) : null };
  }
  evidence.technicalStatus = 'LOCAL_SAMPLE_OK_NOT_FULL_VALIDATION';
} catch (error) {
  evidence.technicalStatus = 'FAILED'; evidence.error = error instanceof SourceError ? error.code : 'LOCAL_PROBE_FAILURE'; process.exitCode = 1;
}
const used = process.cpuUsage(cpu);
evidence.metrics = { requests: budget.requests, details: budget.details, responseBytes: budget.responseBytes, wallMs: Math.round(performance.now() - started), localProcessCpuMs: (used.user + used.system) / 1000, note: 'CPU de Node local: no mide ni certifica CPU de Workers.' };
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await writeFile(new URL('../docs/phase0-local.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
