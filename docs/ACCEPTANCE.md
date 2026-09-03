# Registro de aceptación

Implementación iniciada el 31 de agosto de 2026; alcance actualizado al SDD v1.2 el 2 de septiembre de 2026.

| Criterio | Evidencia / estado |
| --- | --- |
| Fronteras 49/50 %, máximo inclusive | Tests de dominio |
| Moneda USD frente a CLP; precio ausente/cero/incoherente | Tests de dominio y adaptador |
| Juegos base, tipo desconocido, géneros desconocidos | Tests de filtros |
| Estrenos sin descuento/reseñas; futuros/fecha imprecisa | Tests de dominio |
| Repetición de lotes y redeploy conservando D1 | Tests con nuevas instancias de Repository y la misma base SQLite |
| Lease, propietario y adquisición simultánea | Test de adquisición atómica local; concurrencia remota pendiente |
| Ofertas ausentes y período nuevo | Lógica sin terminación por ausencia; test de fin explícito y reapertura |
| Bajada adicional después de 24 horas | Test de ejecución completa |
| D1 falla tras POST exitoso | Test inyectando fallo de confirmación; siguiente revisión marca `uncertain` |
| D1 falla antes de reservar | Test sin publicaciones |
| 429, reservas y cuotas, cambio de día | Tests de entrega y recuperación |
| Ofertas pendientes revalidadas o caducadas | Tests de cambio de precio y vencimiento |
| Primera línea base y cambios de filtros/región | Tests de ejecución y configuración |
| Horario de Santiago y cambios de hora | Tests con fechas de marzo/abril y septiembre, usando IANA del runtime |
| Fuente rota no se interpreta como cero novedades | Tests de esquema, fallos y pausa tras tres errores |
| Límites, hosts, redirecciones, menciones, canal | Tests de red simulada y destino |
| Migración D1 local | `npm run db:local`: 22 comandos aplicados correctamente |
| Tipado y paquete Worker | `npm run check`, `npm run build` (`--dry-run`) |
| Fuente real local, CLP, oferta y estreno | `docs/phase0-local.json`; no acredita permisos ni cobertura global |
| Acceso y cobertura de la fuente | Riesgo revisado y cobertura parcial aceptada por el propietario para uso personal; no existe autorización específica de Valve. Validación técnica local y desde Cloudflare completada; véase `SOURCE-ACCESS.md` |
| D1 remoto en cuenta Free | Base creada; Free confirmado; migraciones `0001` y `0002` aplicadas. Flujo real de lectura desde Worker verificado |
| Código desplegado y cuenta inicializada | Inicialización completada; segundo despliegue correcto, sin cron ni rutas públicas; error 10063 resuelto |
| Precio y disponibilidad contrastados con tienda regional | Muestras API registradas; comprobación visual final pendiente |
| Destino Discord | Secreto e IDs configurados para `⋮💲⋮ofertas`; prueba sintética confirmada por el propietario el 31 de agosto y resumen real aceptado por Discord el 2 de septiembre de 2026, ID `1544848905395769415` |
| CPU p95, cuotas D1 diarias, almacenamiento | Pendiente de plataforma; no extrapolar CPU de Node |
| 48 h, PC apagado y pausa de cron desplegado | En observación; cron y envíos activos desde el 2 de septiembre |

La batería local contiene 42 pruebas automatizadas. Los fixtures no cuentan como validación real. La emulación local tampoco acredita los límites gratuitos de CPU.

## Decisiones conservadoras

- Un 5xx o timeout después de empezar un POST queda ambiguo; no se reintenta ciegamente. Esto puede omitir un aviso que en realidad no llegó.
- Un envío ambiguo bloquea nuevas bajadas del mismo juego/período hasta revisión. Su clave no caduca automáticamente.
- Durante el modo sin envíos se absorben cambios en la línea base, evitando un histórico al activar.
- Los resúmenes usan observaciones verificadas guardadas por el descubrimiento de estrenos. Se reevalúan fecha, región y filtros al enviarlos; no se promete precio instantáneo. Si caducó la ventana de un elemento pendiente, se descarta el resumen reservado y se deja elegibilidad para uno posterior.
- Las señales de cuota o presión de almacenamiento se supervisan en el panel; no se borra historial de deduplicación ni se aumenta presupuesto automáticamente.
- No hay alerta operativa opcional por Discord tras tres errores. El adaptador se pausa y lo deja en D1 y registros; la alerta adicional era opcional en el SDD.

## Entrega actual

Fases 1 y 2 construidas y probadas; D1 remoto, lectura real desde Cloudflare y activación controlada del resumen verificadas. Fase 3 mantiene pendientes la medición prolongada y la observación durante 48 horas. Esto no constituye todavía la aceptación final del servicio completo.

La extensión v1.1 de objetos de Rust tiene especificación, configuración bloqueada, contratos normalizados, filtros y pruebas unitarias. No tiene adaptadores aceptados, migración ni ejecución; no forma parte todavía de las fases operativas aprobadas.
