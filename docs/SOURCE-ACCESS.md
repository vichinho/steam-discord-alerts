# Revisión de acceso a la fuente

Actualizado el 2 de septiembre de 2026. Resultado: el propietario aceptó utilizar el adaptador público acotado de Steam conociendo la ausencia de una autorización específica y de garantía de estabilidad. Esta es una decisión operativa para uso personal, no una conclusión jurídica. Discord permanece deshabilitado durante la validación.

## Fuente Steam del prototipo

La sección 4.C del [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/#4) contiene una restricción amplia sobre automatización. No se encontró una autorización específica para utilizar periódicamente `search/results/` y `api/appdetails` con este servicio. Su aplicación concreta a estas lecturas públicas necesita aclaración; no se concluye que todos los usos de APIs de Steam estén prohibidos.

Las [condiciones de la Web API](https://steamcommunity.com/dev/apiterms) no se consideran automáticamente una licencia para esas rutas de tienda. La documentación de [IStoreService.GetAppList](https://partner.steamgames.com/doc/webapi/IStoreService?l=english) describe descubrimiento, con clave; no resuelve por sí sola precios regionales ni fecha efectiva de lanzamiento.

La evidencia técnica local anterior se conserva como tal. No se hizo una nueva consulta automatizada a las rutas del prototipo durante esta revisión, ni se probó ese adaptador desde Cloudflare. `source.accessReviewed` sigue en `false`. También se impide ejecutar de nuevo el script local de sondeo mientras falte la revisión favorable.

## Alternativas contrastadas

| Alternativa | Evidencia | Decisión |
| --- | --- | --- |
| Autorización o ruta documentada de Valve | Preserva el acceso directo ya probado técnicamente, pero falta permiso aplicable | Posible vía; no se presume aprobación |
| IsThereAnyDeal | El proveedor confirmó por correo que permite el uso privado, pero no ofrece precios reales de Steam para Chile en CLP y exige usar los enlaces proporcionados por la API | Descartado para el SDD v1.1 actual; no registrar app ni clave |
| CheapShark | Su [documentación oficial](https://www.postman.com/cheapshark/cheapshark-s-public-workspace/documentation/7h22uhl/cheapshark-api) especifica precios en USD | No cumple CLP real; no convertir USD ni cambiar región sin autorización |

La documentación de IsThereAnyDeal incluye parámetros de país, datos de producto y fechas, pero el proveedor respondió que no entrega la cobertura Chile/CLP requerida. Sus condiciones también prohíben modificar los datos y retirar etiquetas de los enlaces proporcionados. No se ha creado una cuenta, registrado una app ni consultado su API con credenciales.

## Resultado de la consulta

Se envió [un correo de consulta a IsThereAnyDeal](CONTACT-ITAD.md) el 31 de agosto de 2026 a las 17:26 (America/Santiago), dirigido al contacto de API publicado en su [documentación](https://docs.isthereanydeal.com/). La respuesta llegó el 1 de septiembre de 2026 y está resumida en [la evidencia](evidence/itad-response-2026-09-01.md).

El permiso privado quedó confirmado, pero la falta de precios reales `CL`/`CLP` y la obligación de usar enlaces de la API impiden integrarlo fielmente. No se registrará la app ni se guardará una clave.

El propietario descartó la alternativa de lista de deseados y Gmail y seleccionó el [proceso propio de Steam](STEAM-SOLUTION.md). La [prueba remota del 2 de septiembre](evidence/cloud-source-2026-09-02.json) consultó 25 resultados, verificó 10 fichas, obtuvo 5 ofertas elegibles en CLP y no envió mensajes.

La fuente quedó validada técnicamente desde Cloudflare con cobertura parcial aceptada. El cron y los avisos de Discord están activos desde el 2 de septiembre de 2026; la primera entrega real quedó confirmada por la API de Discord.

## Extensión de objetos de Rust

La decisión posterior de incluir la tienda oficial de Rust y el Mercado de la Comunidad no cambia el resultado anterior. Son fuentes separadas y no quedan cubiertas por la consulta a IsThereAnyDeal. Las condiciones de Facepunch contienen restricciones amplias sobre automatización y la interfaz oficial del Mercado de Steam requiere permisos de editor; por ello ambos módulos permanecen sin acceso aprobado. Véase [RUST-ITEMS.md](RUST-ITEMS.md).
