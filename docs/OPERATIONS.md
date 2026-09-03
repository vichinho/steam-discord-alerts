# Operación y puesta en marcha

La infraestructura remota usa la cuenta elegida por el propietario. La fuente, el cron y los avisos están activos con `sendEnabled=true`. No se requiere dominio propio, servidor, token de bot ni permisos de lectura de mensajes.

Estado al 2 de septiembre de 2026: OAuth de Wrangler autorizado, cuenta Free confirmada y D1 remoto con las migraciones aplicadas. El Worker está desplegado con `enabled=true`, fuente validada, cron cada treinta minutos, `sendEnabled=true` y sin rutas públicas. El primer resumen real quedó registrado como entregado. Véase [CLOUDFLARE.md](CLOUDFLARE.md).

Los permisos OAuth se limitaron a lectura de usuario/cuenta, scripts Workers, registros de Workers y D1; no incluyen facturación ni productos ajenos al proyecto. La advertencia de Wrangler sobre otros permisos predeterminados no autoriza ampliarlos automáticamente. La condición Free fue comprobada por el propietario en el panel, no mediante una API de facturación.

El almacén de credenciales de Windows requería un componente adicional; se utilizó el almacenamiento normal de Wrangler, autorizado por el propietario, fuera del repositorio. No copiar su archivo de credenciales ni incluirlo en respaldos del proyecto.

## Preparación de la cuenta gratuita

1. El propietario inicia sesión en Cloudflare y comprueba **Workers Free**, cuotas D1 disponibles y ausencia de componentes facturables habilitados para este servicio. No activar Workers Paid ni introducir una tarjeta para upgrades.
2. Documentar acceso permitido a la fuente y aceptar la cobertura de `VIABILITY.md`. La casilla `accessReviewed` no reemplaza esa evidencia.
3. Autenticar Wrangler en la cuenta seleccionada (`npx wrangler login`), sin pegar credenciales en este repositorio o conversación.
4. Crear D1 únicamente después de verificar el plan gratuito: `npx wrangler d1 create steam-discord-alerts`. Copiar el ID devuelto en `wrangler.jsonc`; mantener el binding `DB`.
5. Aplicar el esquema: `npx wrangler d1 migrations apply DB --remote`. Conservar la base y su ID entre despliegues.

La autenticación, creación de D1, migraciones, revisión de acceso, aceptación de cobertura y validación remota ya se ejecutaron. No repetir la creación ni cambiar el ID de base al continuar.

## Prueba en nube sin publicaciones

La prueba remota se completó el 2 de septiembre de 2026 con `sendEnabled=false`: 25 resultados descubiertos, 10 fichas comprobadas, 5 ofertas elegibles en CLP y ningún fallo o envío. `source.cloudValidated=true` registra esta comprobación técnica. El cron `*/30 * * * *` está activo; la lógica limita la consulta y el resumen de ofertas a una vez por día local.

La activación posterior con `sendEnabled=true` repitió la muestra y publicó un solo resumen. Discord devolvió el ID `1544848905395769415`; el outbox quedó `sent` y `dealDigestDay=2026-09-02`, por lo que las siguientes ejecuciones del día no lo duplican.

Ejecutar `npm run check`, `npm test`, `npm run build` y, solo para el despliegue autorizado, `npx wrangler deploy`. No añadir rutas, `workers_dev` ni preview URLs. Producción exporta únicamente `scheduled`.

Comprobar registros del Worker y tablas `runs`/`job_state`. Verificar que ambas líneas base finalicen, que los cursores avancen y que la fuente sea accesible desde Cloudflare. Con el máximo de páginas y lotes divididos, la línea base de estrenos puede tardar varios días; no habilitar envíos antes de revisarla.

Registrar CPU en el panel de Workers: p95 < 7 ms y ninguna superación observada del límite de Free. `durationMs` del programa es tiempo transcurrido, **no CPU**. Revisar las métricas D1 de la cuenta: objetivos < 20.000 filas leídas/día y < 5.000 escritas/día. Revisar tamaño de tablas e índices y el margen restante de la cuenta. Un contador de llamadas o un paquete pequeño no acredita CPU suficiente.

Si no cabe: pausar, reducir páginas/candidatos/cobertura explícitamente, conservar cursores y repetir la medición. No cambiar a un plan pagado. Una falta de cuota puede impedir incluso guardar el error; consultar el panel. Ante presión de almacenamiento, pausar y revisar retención, sin borrar claves para liberar espacio a ciegas.

## Canal de prueba y activación

El propietario elige el canal exacto y crea un webhook entrante en él. Usar nombre propio, por ejemplo “Avisos Steam”, y un avatar elegido por el propietario; los mensajes heredan la identidad del webhook. No hace falta crear un bot del Developer Portal.

Guardar el secreto con:

```powershell
npx wrangler secret put DISCORD_WEBHOOK_URL
```

Pegar el webhook únicamente en ese prompt de secreto. No ponerlo en argumentos de línea de comandos, documentación, fixtures ni logs. Para pruebas locales controladas, copiar `.dev.vars.example` a `.dev.vars`, ignorado por Git; la simulación de fixtures no lee ese archivo.

Configurar `destinationId` con el ID de canal y `webhookId` con el ID del webhook, sin token. Verificar la cuenta y el canal, y confirmar que la URL corresponde a ese ID. El Worker hace además un GET de metadatos antes de su primer POST por ejecución y exige el canal exacto.

Para activar publicaciones, establecer `sendEnabled=true`, ejecutar las validaciones y desplegar conservando el historial D1. El primer resumen diario puede incluir ofertas vigentes; no se limita a rebajas iniciadas después del despliegue. Los payloads usan `wait=true`, guardan ID y desactivan menciones. [Webhooks oficiales de Discord](https://docs.discord.com/developers/resources/webhook).

Observar como mínimo 48 horas desde la activación: recepción correcta, ausencia de duplicados, límites, comportamiento con el PC apagado y pausa comprobada. Si faltan ejemplos válidos, dejar esos criterios pendientes. No marcar aceptación final por cumplir solamente el tiempo de observación.

## Inspección

Ejemplos de consultas de lectura, ejecutables con `npx wrangler d1 execute DB --remote --command "SQL"`:

```sql
SELECT at,status,data FROM runs ORDER BY at DESC LIMIT 10;
SELECT value FROM job_state WHERE key='main';
SELECT key,kind,status,attempts,next_attempt_at,error,message_id
FROM outbox WHERE status IN ('retry','uncertain','failed') LIMIT 50;
SELECT status,COUNT(*) AS n FROM outbox GROUP BY status;
PRAGMA page_count;
PRAGMA page_size;
```

Consultar conteos globales o tamaño manualmente con poca frecuencia; la ejecución periódica usa índices y lotes pequeños. Las métricas `rowsRead`/`rowsWritten` se acumulan de las respuestas D1. El registro de cada ejecución en D1 captura el consumo anterior a su propia escritura y liberación; el log final incluye también esas operaciones. El emulador SQLite de los tests no simula filas cobradas, por lo que muestra cero en esos campos.

Revisar diariamente durante la prueba inicial y semanalmente después. `sourceFailures`, `sourcePaused`, `sourceNextAt` y `lastSourceSuccess` permiten distinguir fallo de ausencia de resultados. Una fuente con tres fallos consecutivos se pausa. `deliveryPaused` requiere revisar acceso y destino. No hay monitor externo: una interrupción completa puede no producir alerta.

## Pausa y recuperación

- Pausa completa: `enabled=false` y desplegar, o retirar el cron (`triggers.crons=[]`) y desplegar. Comprobar que dejen de aparecer nuevas ejecuciones; los cambios de cron pueden necesitar propagación. La pausa afecta invocaciones futuras; esperar a que termine una que ya estaba en curso.
- Pausa de mensajes conservando observaciones: `sendEnabled=false`, desplegar. Las observaciones siguientes se absorben en línea base.
- Fuente reparada: con cron pausado, revisar el error y el esquema. Restablecer `sourcePaused=false`, `sourceFailures=0`, `sourceNextAt=0` en el JSON de `job_state` mediante una actualización puntual; no borrar los cursores ni el resto del JSON.
- Webhook corregido: con cron pausado, verificar canal/ID y rotar el secreto. Restablecer `deliveryPaused=false`, `discordNextAt=0` sin borrar historia. No reactivar automáticamente entregas fallidas.
- Fuente 429: esperar hasta `sourceNextAt`; no reiniciar cursores para forzar solicitudes.

Ejemplo de reanudación de fuente **solo después de repararla**, preservando las demás propiedades:

```sql
UPDATE job_state
SET value=json_set(value,'$.sourcePaused',json('false'),'$.sourceFailures',0,'$.sourceNextAt',0)
WHERE key='main';
```

## Entregas ambiguas

1. Pausar el cron y esperar a que expire cualquier lease activo; inspeccionar `leases`.
2. Buscar la clave `uncertain` y comprobar el canal manualmente. No borrar la fila ni cambiarla a `pending`.
3. Si el mensaje existe, copiar su ID y preparar SQL local. Si se confirma que no existe, preparar `--not-sent` (lo marca fallido, sin reenviar).

```powershell
npm run recovery:sql -- --key "CLAVE_DE_OUTBOX" --message-id "ID_DEL_MENSAJE"
# Alternativa, no ejecutar ambas:
npm run recovery:sql -- --key "CLAVE_DE_OUTBOX" --not-sent
```

Revisar `.local/recovery.sql`. Solo entonces ejecutar `npx wrangler d1 execute DB --remote --file .local/recovery.sql`. La sentencia solo afecta `uncertain` y exige ausencia de un lease vivo. Los triggers actualizan precio anunciado o estrenos y fecha del resumen atómicamente. Si no devuelve una fila, no se aplicó: revisar clave, estado y lease. La clave de deduplicación se conserva siempre.

Si no se puede determinar si llegó, dejar `uncertain`. Esto puede omitir avisos futuros de ese período hasta resolverlo, pero evita un reenvío ciego. La biblioteca también ofrece `Repository.resolveUncertain` con lease; no está expuesta por HTTP.

## Actualización, respaldo y retención

Antes de cambios de esquema destructivos, exportar D1 con Wrangler y guardar el respaldo fuera del repositorio. La migración inicial es aditiva. Para actualizar: pruebas, build, revisión de migraciones y despliegue conservando `database_id`. Para volver atrás, usar una versión de código compatible con el esquema; no restaurar una base vieja que elimine avisos ya confirmados.

El mantenimiento de cada revisión borra hasta cien registros por categoría: ejecuciones de más de 30 días, payloads terminales de más de 30 días y metadatos inactivos de más de 90 días. Conserva claves de entrega, precios/períodos y marcas de estrenos. Los ambiguos conservan su evidencia para resolución. Si el volumen excede el mantenimiento acotado, pausar y revisar, no truncar la historia.

No habilitar autoarranque en Windows ni procesos residentes. Tras desplegar y verificar Cloudflare, cerrar Wrangler local no detiene el cron remoto.
