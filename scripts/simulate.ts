import { harness, game } from '../tests/helpers.ts';
import { DAY } from '../src/domain/time.ts';
import { dealMessage } from '../src/notifications/discord.ts';
// Este programa no carga secretos ni importa el publicador real. SQLite es efímero.
const h = harness();
try {
  console.log('SIMULACIÓN LOCAL · fixtures ficticios · sin red, sin webhook, sin estado persistente');
  console.log('Vista previa de la oferta actual:', JSON.stringify(dealMessage(game(), h.c), null, 2));
  console.log('1. Línea base:', (await h.run()).stats);
  h.now += DAY;
  h.games = [game({ currentAmount: 800000, discountPercent: 60 }), game({ appId: 10002, title: 'Estreno ficticio sin descuento', releaseDate: '2026-09-01', discountPercent: 0, currentAmount: 2000000 })];
  console.log('2. Cambio posterior:', (await h.run()).stats);
  h.now = Date.parse('2026-09-02T00:00:00Z');
  console.log('3. Resumen a las 20:00 de Santiago:', (await h.run()).stats);
  for (const d of h.sent) console.log('ENVÍO SIMULADO:', JSON.stringify(d.payload, null, 2));
  console.log('4. Repetición (esperado: cero envíos):', (await h.run()).stats.sent);
} finally { h.close(); }
