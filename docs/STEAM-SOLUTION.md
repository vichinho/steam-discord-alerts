# Solución propuesta para descuentos de Steam

Fecha: 1 de septiembre de 2026. Objetivo inmediato: obtener avisos útiles de descuentos de Steam, dejando aplazados los módulos de Rust y sin activar rutas de tienda no autorizadas.

## Resultado de la búsqueda

No se encontró una fuente gratuita que cumpla simultáneamente el alcance completo del SDD: descubrimiento amplio, precio real Chile/CLP, enlaces directos a Steam y acceso automatizado documentado.

- IsThereAnyDeal permite el uso privado, pero confirmó que no ofrece precios reales Steam `CL`/`CLP` y exige conservar los enlaces de su API.
- CheapShark entrega precios USD.
- `IStoreService.GetAppList` es una interfaz oficial que permite detectar aplicaciones modificadas y cambios potenciales de precio con una Web API key, pero no entrega el precio regional final. La interfaz oficial que expone precio de una aplicación para un usuario requiere una clave de editor.
- Las rutas públicas de la tienda probadas por el prototipo entregan CLP, pero no tienen una autorización aplicable confirmada para la automatización periódica planteada.

## Decisión del propietario: no usar lista de deseados ni Gmail

El propietario descartó esta alternativa el 1 de septiembre de 2026. El servicio debe descubrir ofertas generales de Steam y publicar una selección diaria sin depender de una cuenta, biblioteca o lista de deseados. No se creará un Apps Script ni se solicitará acceso a Gmail.

## Alternativa evaluada y no seleccionada: IsThereAnyDeal → Discord

IsThereAnyDeal dispone de un endpoint documentado de ofertas actuales (`/deals/v2`). Permite limitar la consulta a Steam (`shop=61`), ordenar por mayor descuento y devolver hasta 200 resultados por página. No requiere una lista de deseados. El proveedor autorizó por correo el uso privado de este bot.

Propuesta operativa:

1. Ejecutar una vez al día en Cloudflare Workers.
2. Consultar únicamente ofertas de Steam y excluir DLC, paquetes y contenido que no sea juego base cuando los datos permitan identificarlo.
3. Ordenar por mayor porcentaje de descuento y aplicar los filtros configurados del bot.
4. Publicar un resumen compacto, por defecto con los diez mejores resultados nuevos o que hayan cambiado materialmente.
5. Mostrar nombre y porcentaje. No presentar USD como CLP ni convertir monedas.
6. Usar el enlace proporcionado por la API, conservando sus etiquetas, y atribuir los datos a IsThereAnyDeal.
7. Guardar estado en D1 para no repetir todos los días una oferta sin cambios.

Esta solución exigiría modificar el SDD porque no conserva dos requisitos actuales: precio real `CLP` y enlace directo construido por el bot hacia Steam. El propietario decidió en su lugar desarrollar el proceso propio acotado con datos regionales de la tienda.

## Alternativa descartada: lista de deseados de Steam → Gmail → Discord

Steam documenta que su lista de deseados puede notificar cuando un juego deseado está rebajado. La propuesta usa ese correo oficial como evento de entrada:

1. El propietario añade a su lista de deseados los juegos que quiera vigilar y mantiene activadas las notificaciones de rebajas de Steam.
2. Un Google Apps Script personal busca únicamente nuevos correos etiquetados para estas alertas.
3. El script valida remitente, estructura y enlaces; solo admite URLs HTTPS de `store.steampowered.com`.
4. Extrae el contenido presente en el correo sin completar precios ni porcentajes ausentes.
5. Publica un mensaje compacto en el webhook autorizado de Discord, con menciones desactivadas.
6. Guarda el ID del correo procesado en propiedades del script para no repetirlo.
7. Un disparador temporal lo ejecuta cada cinco minutos. El PC puede permanecer apagado.

El webhook se guarda en Script Properties, nunca en el código. El script limita mensajes por ejecución y día, registra solo identificadores técnicos y no lee otras categorías del buzón. Google Apps Script admite disparadores temporales y GmailApp permite búsquedas de Gmail bajo autorización del propietario; ambas funciones tienen cuotas gratuitas sujetas a cambio.

## Lo que conservaba y lo que cambiaba la alternativa descartada

| Requisito | Resultado |
| --- | --- |
| Alojamiento gratuito y PC apagado | Se conserva mediante Apps Script |
| Fuente oficial del evento | Se conserva: correo de notificación enviado por Steam |
| Enlace directo a Steam | Se conserva |
| CLP | Se conserva solo cuando el correo recibido lo incluya explícitamente; debe verificarse con una muestra real |
| Compra automática o acceso a Steam | No se añade |
| Discord | Se conserva el mismo canal y webhook |
| Descubrimiento de todo Steam por filtros | Cambia a juegos elegidos mediante la lista de deseados |
| Frecuencia exacta de detección | Depende de cuándo Steam envíe el correo; el puente revisa Gmail cada cinco minutos |
| Cloudflare como único runtime | Cambia: Apps Script realiza el puente; el Worker permanece pausado |

## Otras alternativas no recomendadas

1. **Usar CheapShark:** exige aceptar USD y cobertura distinta.
2. **Seguir consultando rutas públicas de Steam:** conserva el prototipo técnico, pero mantiene sin resolver la autorización.
3. **Usar solo `IStoreService.GetAppList`:** detecta cambios potenciales, no confirma que exista un descuento ni su precio regional.

## Decisión seleccionada: proceso propio Steam → D1 → Discord

El propietario aceptó el 2 de septiembre de 2026 la cobertura parcial y el riesgo de estabilidad ya documentados. El Worker consultará una vez al día hasta diez candidatos de la primera página de ofertas para juegos, ordenada por reseñas; validará cada ficha para Chile, exigirá `CLP`, aplicará los filtros y enviará un solo resumen. Los disparos cada treinta minutos sirven para alcanzar el horario local y procesar reintentos, no para volver a consultar ofertas durante el mismo día.

La API pública propia queda aplazada: el único consumidor actual es Discord y exponer un endpoint añade autenticación y superficie de abuso sin mejorar la fuente. Los datos normalizados permanecen en D1 y el adaptador separado permite añadir una API privada más adelante.

## Criterios antes de habilitar mensajes

- Aplicar la migración del resumen diario. **Completado.**
- Ejecutar en Cloudflare con `sendEnabled=false` y verificar acceso, moneda, esquema y presupuesto. **Completado.**
- Prueba controlada del resumen en Discord. **Completada el 2 de septiembre de 2026.**
- Observar cuotas, duplicados y continuidad durante 48 horas; verificar el procedimiento de pausa.

La validación en nube y la primera entrega concluyeron correctamente. `sendEnabled=true`; D1 limita el resumen de ofertas a uno por fecha local.
