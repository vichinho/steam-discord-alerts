# Fase 0: viabilidad técnica confirmada

Fecha de comprobación inicial: 31 de agosto de 2026. D1 y el Worker están activos en la cuenta Free del propietario. La fuente y la primera entrega real se validaron el 2 de septiembre, según [CLOUDFLARE.md](CLOUDFLARE.md).

## Evidencia técnica local

La ejecución real de `npm run probe:steam` consultó cinco recursos públicos: dos páginas de búsqueda y tres fichas. No utilizó sesión, claves Steam, cookies, evasión de bloqueos ni Discord. La evidencia normalizada está en [phase0-local.json](phase0-local.json).

| Muestra observada | Resultado regional |
| --- | --- |
| Portal 2, app 620 | Juego base; CLP $5.750; fecha exacta 2011-04-18 |
| Red Dead Redemption 2, app 1174180 | Juego base; 75 %; CLP $53.990 → $13.497 |
| Centuria Quest, app 4836840 | Juego base; lanzamiento 2026-08-31; `comingSoon=false`; CLP $5.399 |

Son observaciones puntuales, no precios vigentes garantizados ni validación de recepción de avisos. `amountScale=100`: la muestra de Portal 2 devolvió `575000`, con representación regional CLP $5.750. No se convirtieron divisas.

La prueba recibió 200.834 bytes en cinco solicitudes, aproximadamente 1,49 s de tiempo transcurrido y 156 ms de CPU **del proceso Node local**, incluyendo su inicialización diferida y pila de red. Esta medida no es CPU de Workers, no es un percentil y no acredita el objetivo p95 < 7 ms. No se ha medido D1 remoto ni CPU de una invocación real.

Se comprobó el empaquetado mediante Wrangler `--dry-run` y se aplicó la migración en D1 emulado local. Los tests funcionales usan SQLite real, pero no sustituyen las métricas ni la prueba de concurrencia de la plataforma remota.

## Cobertura concreta del adaptador candidato

- Ofertas: `search/results/`, `specials=1`, `category1=998`, orden por relevancia de la tienda (`sort_by=_ASC`).
- Estrenos: la misma búsqueda con `sort_by=Released_DESC`, `category1=998`. La fecha y disponibilidad se comprueban después en la ficha; la ordenación no basta.
- Región `cc=cl`, idioma de **datos** inglés para interpretar fechas de forma explícita; mensajes en español.
- Se solicitan ventanas de diez resultados con offsets 0, 10, 20, 30 y 40. Como máximo se admiten cincuenta posiciones por recorrido de cada flujo. La tienda puede reordenarse entre páginas: no es una instantánea consistente ni una garantía de cincuenta juegos únicos.
- **Hallazgo real:** Steam devolvió 25 filas pese a pedir `count=10`. El adaptador se corrigió después de la evidencia inicial para admitir solo las primeras diez y guardar únicamente los IDs restantes de esa ventana. El JSON conservado muestra el hallazgo original; un test protege la corrección. El tamaño transferido puede seguir correspondiendo a 25 filas.
- Cada respuesta se limita a 256.000 bytes; como máximo diez comprobaciones de fichas por invocación, compartidas entre reintentos, seguimiento de ofertas y descubrimiento. La implementación hace red secuencial, dentro del máximo permitido de dos solicitudes concurrentes.
- Hasta dos comprobaciones siguen ofertas activas conocidas, en orden de ID con cursor. Si hay muchas, la revisión de un juego tarda varios ciclos. Los juegos fuera de estas páginas, omitidos por Steam o sujetos a acceso/restricciones pueden no detectarse.
- Las fichas se solicitan sin filtros de campos para disponer del tipo, géneros, precio y fecha. Esto recibe campos que no se guardan y requiere medir CPU en la nube.

La cobertura no se cambió a destacados. `featuredcategories` no se utiliza. `IStoreService.GetAppList` tampoco se conecta: requiere clave y su `last_modified` no demuestra un lanzamiento. Véase la [documentación oficial](https://partner.steamgames.com/doc/webapi/IStoreService?l=english).

## Acceso y condiciones: sin confirmación favorable

La revisión adicional de condiciones y alternativas está en [SOURCE-ACCESS.md](SOURCE-ACCESS.md). La sección de automatización del acuerdo de Steam no permite asumir una autorización para el adaptador candidato. Se conserva la evidencia local anterior, pero se suspenden nuevos sondeos hasta aclarar el acceso. IsThereAnyDeal respondió el 1 de septiembre de 2026: permite el uso privado, pero no ofrece precios reales de Steam para Chile/CLP y exige usar los enlaces de su API. Fue descartado para el SDD actual.

La lectura pública técnicamente exitosa no demuestra autorización ni estabilidad de estas rutas de tienda. El [robots.txt observado](https://store.steampowered.com/robots.txt) no las prohibía de forma explícita, pero robots.txt tampoco es una licencia. Las [condiciones de Steam Web API](https://steamcommunity.com/dev/apiterms) se refieren a esa Web API; no se presume que concedan automáticamente permiso para las rutas candidatas de la tienda.

El propietario aceptó el 2 de septiembre continuar con el adaptador acotado después de revisar esta limitación. `source.accessReviewed=true` registra esa revisión y `coverageAccepted=true` la aceptación de cobertura; no afirma que Valve haya concedido una autorización específica. No se contactó a Valve. IsThereAnyDeal no se integró.

La disponibilidad regional del adaptador es una interpretación experimental de la ficha: se acepta evidencia de precio con moneda explícita, o `is_free=true` en una ficha válida. Una ficha sin estas señales y `success=false` dejan disponibilidad desconocida; no se inventa un bloqueo regional ni un precio. Para el despliegue hay que contrastar esta interpretación con la página de compra regional, incluyendo casos gratuitos/restringidos y de acceso anticipado.

## Criterios todavía abiertos

1. Documentar condiciones de acceso aplicables al uso personal automatizado.
2. Aceptar expresamente la cobertura parcial y los tiempos de recorrido anteriores.
3. Validar desde una cuenta Cloudflare Free del propietario: accesibilidad de las mismas fuentes, esquema, bytes y p95 de CPU inferior a 7 ms, sin superaciones observadas del límite del plan.
4. Medir filas D1 e índices por día y tamaño de datos; revisar la cuenta completa, compartida con otros proyectos.
5. Contrastar una oferta y un estreno en la tienda regional y recibirlos en el canal de prueba autorizado.
6. Observar al menos 48 horas después de activar el canal, comprobar continuidad sin PC y probar pausa.

Los [límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) consultados mantienen 10 ms de CPU y 50 subsolicitudes externas por invocación para Free. El contador interno se limita a 40 llamadas, sumando red y accesos D1; no sigue redirecciones. Cada `DB.batch` cuenta como una llamada al binding, mientras filas leídas/escritas se suman desde cada resultado. La correspondencia exacta con métricas de plataforma se debe contrastar en la prueba remota.

Los [límites gratuitos de D1](https://developers.cloudflare.com/d1/platform/pricing/) publicados son 5 millones de filas leídas/día, 100.000 escritas/día y 5 GB totales. Son techos de la cuenta; los objetivos internos del SDD son menores. Los [precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/) no sustituyen comprobar que la cuenta específica siga en Free.

**Decisión actual:** mantener activos la fuente, el cron y los envíos. El 2 de septiembre una validación remota sin publicaciones descubrió 25 resultados, comprobó 10 fichas y aceptó 5 ofertas CLP. La activación controlada posterior repitió esos resultados y Discord aceptó un resumen real con ID `1544848905395769415`. La viabilidad técnica del flujo quedó confirmada; faltan las métricas prolongadas y completar 48 horas de observación.
