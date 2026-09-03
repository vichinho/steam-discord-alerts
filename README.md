# Avisos de Steam para Discord

Implementación del [SDD v1.2](SDD.md), con resumen diario de ofertas de Steam y alcance futuro aplazado para objetos de Rust. Servicio TypeScript con Cloudflare Workers, D1 y webhook de Discord. No usa Gateway, comandos, cuentas Steam ni lectura de mensajes.

**Estado: fuente y cron activos en Cloudflare; publicaciones automáticas todavía deshabilitadas.** El propietario confirmó Workers Free. D1, la migración del resumen diario, el secreto y los IDs del canal `⋮💲⋮ofertas` están configurados. Una prueba remota obtuvo cinco ofertas válidas en CLP sin enviar mensajes. No hay rutas públicas. Véanse [estado de Cloudflare](docs/CLOUDFLARE.md) y [viabilidad](docs/VIABILITY.md).

## Probar en Windows

Node.js 24 LTS; verificado con 24.14.1 y npm 11.11.0. No requiere Docker, navegador, base de datos como servicio ni instalaciones globales.

```powershell
npm ci
npm run check
npm test
npm run simulate
npm run build
```

- `simulate`: usa fixtures ficticios y SQLite en memoria. Muestra una vista previa, línea base silenciosa, rebaja posterior, resumen y ejecución repetida. **No carga secretos ni realiza solicitudes de red.** Termina al finalizar.
- `build`: ejecuta `wrangler deploy --dry-run`. Genera `dist/`; no despliega.
- `db:local`: aplica migraciones a D1 emulado, dentro de `.wrangler/`. No toca Cloudflare remoto.
- `probe:steam`: exige primero una revisión favorable de acceso (`source.accessReviewed=true` con evidencia). Mientras falte, termina sin red ni sobrescribir la evidencia anterior. Una vez autorizado, consulta dos páginas y hasta tres fichas, sin Discord, y guarda `docs/phase0-local.json`. No habilita el servicio ni acredita por sí solo permiso de uso.
- `recovery:sql`: prepara una sentencia revisable de recuperación; no la ejecuta ni reenvía mensajes.

Las dependencias son de desarrollo y están fijadas en `package-lock.json`. El Worker no tiene dependencias externas de ejecución. Wrangler/npm también pueden utilizar cachés y registros del usuario; no se promete que todos sus archivos queden dentro del proyecto. SQLite de Node muestra una advertencia de API experimental en pruebas; producción utiliza D1.

## Configuración

Editar `config/bot.json`, validar y volver a compilar. Configuración y huella de filtros se conservan en D1; los secretos nunca van en ese JSON.

| Ajuste | Valor inicial / significado |
| --- | --- |
| `enabled` | `true`: permite ejecutar observaciones y tareas programadas |
| `sendEnabled` | `true`: permite publicar únicamente en el destino configurado y dentro de los cupos |
| `destinationId`, `webhookId` | IDs configurados para el canal autorizado `⋮💲⋮ofertas` |
| `country`, `currency`, `amountScale` | `CL`, `CLP`, `100`; importes enteros en la escala del adaptador |
| `deals.minDiscountPercent` | 50, inclusive |
| `deals.maxAmount` | `null`; para CLP $10.000 usar `1000000`, no `10000` |
| `deals.genres`, `releases.genres` | IDs de género Steam como cadenas; `[]` admite todos; coincide cualquiera |
| `includeEarlyAccess` | `true` en ambos flujos; con `false` también se omite el dato desconocido |
| `deals.perRun`, `deals.perDay` | 5 y 20; se pueden reducir, no aumentar sobre el SDD |
| `releases.discoveryHours` | 6 horas transcurridas entre lotes de descubrimiento |
| `releases.digestAt`, `timezone` | `20:00`, `America/Santiago`; con cambios de hora |
| `releases.windowDays`, `maxItems` | 7 días de calendario, incluyendo hoy; máximo 10 en un mensaje |
| `source.enabled` | `true`: consulta diaria acotada de ofertas y descubrimiento periódico de estrenos |
| `source.accessReviewed`, `coverageAccepted` | `true`: riesgo revisado y cobertura parcial aceptada por el propietario |
| `source.cloudValidated` | `true`: la fuente respondió correctamente desde Cloudflare |

El programa comprueba la configuración al arrancar y rechaza combinaciones inseguras. Antes del primer POST de cada ejecución verifica que el webhook pertenece al canal configurado. Una rotación de token no cambia la identidad del destino ni borra historial.

La primera cobertura de estrenos es silenciosa. El resumen diario de ofertas puede incluir ofertas vigentes desde su primera activación y D1 impide repetirlo en la misma fecha local. Cambiar filtros, región, moneda, destino o límites de cobertura reconstruye el estado correspondiente. `sendEnabled` permite pausar publicaciones sin detener las observaciones.

## Comportamiento implementado

- Juego base, identidad validada, región y moneda correctas; nunca convierte USD en CLP.
- Descuentos coherentes con importes enteros; un precio cero no se etiqueta como regalo para conservar.
- Estrenos disponibles y con fecha exacta, con filtros independientes y sin requisito de reseñas o descuento.
- Ofertas ordenadas por descuento, precio e ID; estrenos por fecha e ID.
- Resumen diario de hasta diez ofertas de la primera página por reseñas, ordenadas localmente por descuento. Cada juego usa una tarjeta con portada, descuento, precio anterior, precio CLP actual y enlace directo; la cobertura parcial queda indicada en el mensaje.
- Una bajada adicional solo avisa después de 24 horas desde el último precio anunciado. Una nueva temporada exige observar explícitamente un precio sin descuento.
- Lease atómico de diez minutos, margen antes de enviar y plazo interno de cuatro minutos para iniciar nuevas tareas de red.
- Outbox persistente, claves únicas, cupos con reservas, revalidación de ofertas pendientes de más de 30 minutos y caducidad de 24 horas.
- Hasta tres intentos diferidos para fallos reintentables. Los 429 no duermen dentro del Worker; 401/403/404 pausan entregas. Timeouts, 5xx tras POST o confirmaciones perdidas quedan `uncertain` y no se reenvían automáticamente.
- Menciones desactivadas, texto escapado, enlaces construidos desde IDs y lista cerrada de hosts de imágenes. No se siguen redirecciones de red.
- Retención acotada por lotes, preservando claves de deduplicación, períodos y estrenos anunciados.

No se garantiza entrega exactamente una vez. Una caída entre Discord y D1 exige revisión manual; se prioriza evitar duplicados. Tampoco se garantiza catálogo completo ni detección inmediata.

## Organización

```text
config/bot.json                Valores y barreras de activación
src/worker.ts                  Entrada programada; sin HTTP público
src/engine.ts                  Planificación y ejecución acotada
src/providers/                 Adaptador experimental y red limitada
src/domain/                    Normalización, filtros y estados
src/notifications/discord.ts   Mensajes, verificación de destino, publicación
src/storage/repository.ts      D1, leases, outbox, retención y recuperación
migrations/                   Esquema SQL versionado
tests/                        Casos reproducibles, SQLite y red simulada
scripts/                      Simulación, prueba técnica y recuperación
docs/                         Viabilidad, aceptación y operación
```

Para la puesta en marcha seguir [OPERATIONS.md](docs/OPERATIONS.md). El [registro de aceptación](docs/ACCEPTANCE.md) distingue lo comprobado de lo pendiente. No activar planes pagados, dominios ni otros componentes para superar límites.

**Estado actual:** el adaptador acotado de Steam, la fuente, el cron y los envíos están activos. Las pruebas local y remota confirmaron datos `CLP`; el 2 de septiembre de 2026 Discord aceptó el primer resumen real y devolvió el ID `1544848905395769415`. Continúa la observación operativa de 48 horas. Véanse [revisión de fuentes](docs/SOURCE-ACCESS.md) y [viabilidad](docs/VIABILITY.md).

La extensión de [objetos y skins de Rust](docs/RUST-ITEMS.md) quedó aplazada. Gmail, la lista de deseados e IsThereAnyDeal tampoco forman parte del flujo seleccionado. La [solución de Steam](docs/STEAM-SOLUTION.md) usa un proceso propio y genera un resumen diario compacto.
El proveedor Skinport para objetos de Rust está implementado y validado localmente en USD, pero permanece desactivado: Skinport responde 403 desde la red de Cloudflare. Su ejecución gratuita mediante GitHub Actions requiere crear o conectar un repositorio y validar primero esa red.
