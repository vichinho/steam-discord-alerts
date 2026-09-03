# Estado de infraestructura remota

Actualizado el 3 de septiembre de 2026. Cuenta Free confirmada explícitamente por el propietario en el panel. No se solicitó ningún cambio de plan, tarjeta, dominio contratado ni componente adicional.

## Recursos comprobados

| Recurso | Estado |
| --- | --- |
| Cuenta | Seleccionada en `wrangler.jsonc`; OAuth conectado |
| D1 | `steam-discord-alerts` |
| ID D1 | `53a3b0f4-d7dc-4f3b-a4aa-dbe31fadaae2` |
| Creación D1 | `2026-08-31T20:57:42.628Z` |
| Región de D1 | ENAM; no cambia la región CL de precios Steam |
| Migración | `0001_initial.sql`, 22 comandos aplicados correctamente |
| Esquema consultado | 7 tablas del servicio, tabla de migraciones, 11 índices explícitos y 2 triggers |
| Tamaño observado | 139.264 bytes |
| Historial de activación | Primer resumen real entregado el 2 de septiembre de 2026 |
| Worker | `steam-discord-alerts` |
| Versión actual | `5c56a760-4e6e-47af-8010-7a93b97295f8` |
| Subdominio de cuenta | `vishoxcl.workers.dev`, visible en la captura del propietario |
| Despliegue actual | Finalizado correctamente; cron `*/30 * * * *` |
| Paquete | 69,95 KiB; gzip 18,78 KiB |
| Startup informado en el despliegue actual | 5 ms; NO es CPU por revisión ni p95 de operación |

`enabled=true`, `source.enabled=true`, `accessReviewed=true`, `coverageAccepted=true`, `cloudValidated=true` y `sendEnabled=true`. El secreto `DISCORD_WEBHOOK_URL` y los IDs del canal autorizado `⋮💲⋮ofertas` están configurados. El Worker mantiene `workers_dev=false`, `preview_urls=false`, `routes=[]` y cron `*/30 * * * *`.

La versión actual es `5c56a760-4e6e-47af-8010-7a93b97295f8`. Conserva el formato visual aprobado y evita repetir durante siete días los juegos incluidos en resúmenes confirmados. Antes de verificar precios puede recorrer hasta cinco páginas para buscar alternativas y mantiene el máximo de diez fichas por ejecución. Skinport está desactivado dentro del Worker porque su API respondió 403 desde Cloudflare; su tarea independiente funciona mediante GitHub Actions. El cron de Steam permanece en `*/30 * * * *`.

## Inicialización de cuenta completada

La primera ejecución de `wrangler deploy` subió el código, pero terminó con un error de configuración parcial: al actualizar los schedules, Cloudflare respondió **10063**, porque la cuenta todavía no tenía un subdominio `workers.dev`. Esa primera versión fue `cc68779e-57d2-4394-a202-703ed0872a61`, deployment `81480d5d-77ed-4da5-a14a-5e5bf238dc6d`, creado en `2026-08-31T21:01:52.066972Z`.

El propietario abrió Workers & Pages y proporcionó una captura donde aparecen `vishoxcl.workers.dev`, el Worker `steam-discord-alerts`, “No active routes” y cero solicitudes. El subdominio de cuenta es gratuito y no es un dominio contratado; la ruta pública del Worker del proyecto sigue deshabilitada.

Se repitió entonces `wrangler deploy` con la configuración pausada. Terminó con código 0, confirmó el binding D1 e informó `No targets deployed`. Esa versión histórica no habilitó cron, rutas, previews, fuente ni Discord. La base D1 se conservó para los despliegues posteriores.

La activación controlada de Discord se completó el 2 de septiembre de 2026. Deben observarse ausencia de duplicados, cuotas y continuidad durante 48 horas.

El flujo programado, la disponibilidad de Steam desde Workers y la entrega mediante Discord quedaron comprobados. Siguen pendientes la medición de CPU por revisión, el contraste con métricas de cuota de la plataforma y completar 48 horas de operación. La aplicación del esquema y un tiempo de startup bajo no certifican esos criterios.
