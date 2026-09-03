# Extensión: objetos y skins de Rust

Decisión del propietario del 1 de septiembre de 2026: incluir en el alcance futuro tanto promociones relacionadas con Rust como oportunidades del Mercado de la Comunidad de Steam para Rust (`appid 252490`). El 2 de septiembre, después de activar y validar las ofertas generales de Steam, el propietario reabrió esta fase. Son módulos independientes de las ofertas de juegos y de los estrenos.

## Estado y barreras de activación

Ambos módulos están en evaluación y continúan deshabilitados. No crean entregas ni modifican el cron. Cada módulo exige por separado `enabled`, `accessReviewed`, `coverageAccepted` y `cloudValidated` antes de participar en una ejecución; el envío global continúa sujeto a `sendEnabled`.

La [tienda oficial de Rust](https://rust.facepunch.com/store/) publica un catálogo de artículos, pero no se ha identificado un contrato de API que entregue precios regionales. Las [condiciones de Facepunch](https://facepunch.com/legal/tos) prohíben ampliamente bots, scripts y herramientas de extracción que interactúen con sus servicios. No se automatizará esa web sin autorización explícita de Facepunch. Los DLC y packs de Rust vendidos como productos normales de Steam se evaluarán aparte mediante el adaptador regional ya aceptado, porque pueden entregar precio CLP sin consultar la web de Facepunch.

El propietario eligió Skinport como fuente de objetos. Su endpoint documentado no requiere autenticación, admite `app_id=252490`, publica precio sugerido, mínimo y cantidad, pero no ofrece CLP. Se adoptó USD sin conversión y el texto evita presentarlo como descuento oficial de Steam. La [prueba local](evidence/skinport-local-2026-09-02.json) obtuvo 5.376 objetos y 730 candidatos con la regla inicial.

La prueba desde Cloudflare devolvió HTTP 403 con Brotli requerido, negociación automática y lista estándar de codificaciones. Por ello el módulo permanece `enabled=false` dentro del Worker: Cloudflare no puede usar esta fuente. No se añadirá un proxy anónimo. GitHub Actions sí obtuvo HTTP 200 el 3 de septiembre de 2026, por lo que ejecutará este módulo de forma independiente. La alternativa restante es ejecutarlo en el PC cuando esté encendido.

El flujo `Skinport daily digest` consulta a las 13:07 de Santiago bajo UTC-3 y UTC-4, publica como máximo un resumen diario y registra el día y el identificador del mensaje en `data/skinport-state.json`. La segunda ejecución UTC del día se detiene al encontrar ese estado. La programación solo se activa cuando la variable del repositorio `SKINPORT_ENABLED` vale `true`; el webhook se guarda exclusivamente como secreto `DISCORD_WEBHOOK_URL`.

## Productos de Rust publicados en Steam — fuente viable

La ficha regional de Rust devuelve cinco productos relacionados: Warhammer 40,000 Pack, Instruments Pack, Sunburn Pack, Voice Props Pack y Soundtrack. Una [prueba acotada del 2 de septiembre](evidence/rust-steam-products-2026-09-02.json) confirmó identidad, tipo, disponibilidad y precios CLP para los cinco. Ninguno estaba rebajado durante la observación.

Esta categoría reutilizará el adaptador de Steam ya aceptado, con una consulta diaria y un máximo de diez detalles. La primera ejecución guarda línea base sin avisar. Después se publicará únicamente cuando un producto tenga un descuento real o aparezca un identificador nuevo; no se enviará un mensaje diario vacío.

Formato previsto: encabezado `OFERTAS DE RUST · STEAM CHILE`, una tarjeta por producto con portada, porcentaje, precio anterior, precio CLP actual y enlace directo. Los productos nuevos sin descuento se etiquetarán `NUEVO`, separados de una rebaja.

## Reglas comunes

- Solo Rust para PC y enlaces directos al producto oficial o al Mercado de Steam.
- Precio real para Chile en CLP, con importe entero y escala declarada; no convertir USD.
- Solo avisos informativos. No iniciar sesión, leer inventarios, crear órdenes ni comprar automáticamente.
- Menciones de Discord desactivadas y títulos saneados.
- Línea base silenciosa al activar o cambiar filtros, sin anunciar históricos.
- Deduplificación persistente, reintentos acotados y entregas ambiguas sin reenvío automático.
- No recorrer todo el catálogo en una invocación. Conservar cursores y límites explícitos.
- Las fallas de un módulo no se presentan como ausencia de ofertas ni activan otro proveedor silenciosamente.

## Tienda oficial de Rust

Se avisarán promociones verificadas y artículos nuevos que tengan identidad y precio regional estables. Los artículos permanentes no se confunden con objetos revendibles: Facepunch explica que los productos de la tienda permanente no son revendibles actualmente.

Valores iniciales modificables:

| Opción | Valor |
| --- | --- |
| Revisión | Cada 6 horas |
| Descuento mínimo | 10 %, inclusive |
| Precio máximo | Sin límite |
| Nuevos artículos | Incluir |
| Máximo por revisión | 3 |
| Máximo diario | 10 |

Una promoción necesita precio anterior, precio actual, moneda CLP y vigencia coherentes. Un artículo nuevo sin descuento puede incluirse como novedad, etiquetado separadamente y una sola vez.

## Mercado de la Comunidad de Steam

“Más barato” significa inicialmente una caída de al menos 20 % respecto de la mediana verificada de los últimos 7 días. No significa simplemente ordenar miles de artículos por su precio nominal, porque eso favorecería materiales baratos y listados con poca liquidez.

Valores iniciales modificables:

| Opción | Valor |
| --- | --- |
| Revisión | Cada 60 minutos |
| Caída mínima | 20 %, inclusive |
| Ventana comparativa | 7 días |
| Precio máximo | Sin límite |
| Anuncios disponibles mínimos | 10 |
| Lista seguida | Vacía hasta que el propietario elija objetos |
| Candidatos de descubrimiento por ciclo | Hasta 50, solo si la fuente aceptada ofrece descubrimiento acotado |
| Máximo por revisión | 5 |
| Máximo diario | 20 |

La comparación usa el precio comprador final mostrado en CLP, incluidas las tasas que formen parte del precio presentado. Se guardan observaciones agregadas, no cuentas, vendedores ni inventarios. Un cambio de moneda, falta de liquidez, precio desconocido o historial insuficiente impide el aviso.

## Modelo normalizado previsto

Cada observación conserva: `sourceKind`, identificador estable, `marketHashName` cuando corresponda, nombre, categoría, URL, imagen opcional, país, moneda, escala, precio actual, precio anterior o referencia histórica, porcentaje de caída, cantidad disponible, fecha de primera aparición, hora de observación y procedencia.

Las claves lógicas separan `rust_official_promotion`, `rust_official_new` y `rust_market_drop`. Una nueva caída no se anuncia de nuevo mientras el precio no se recupere suficientemente o comience un período distinto documentado por la regla de estado.

## Trabajo pendiente antes de integrar

1. Implementar el proveedor de productos Steam de Rust, su línea base, persistencia y pruebas.
2. Medir ese proveedor desde Cloudflare sin Discord y realizar una prueba controlada.
3. Obtener permiso o una fuente documentada para la tienda web de Facepunch.
4. Guardar el webhook como secreto del repositorio.
5. Ejecutar una prueba controlada y después activar la variable `SKINPORT_ENABLED`.

Hasta completar esos puntos, esta extensión no cambia el comportamiento desplegado.
