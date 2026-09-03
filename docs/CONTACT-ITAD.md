# Consulta de viabilidad a IsThereAnyDeal

**Estado:** enviado el 2026-08-31 a las 17:26 (America/Santiago); respuesta recibida el 2026-09-01. Evaluado y descartado para el SDD v1.1. No se registró ninguna cuenta ni aplicación.

**Destinatario:** api@isthereanydeal.com, contacto publicado en la [documentación de la API](https://docs.isthereanydeal.com/).

**Asunto:** Permission and Chile/CLP coverage for a private, non-commercial Discord notifier

## Resultado

El proveedor confirmó que el uso privado descrito está permitido y que la atribución sería bienvenida, aunque no obligatoria. También confirmó que no ofrece los precios reales de Steam para Chile en CLP y que sus condiciones exigen usar los enlaces entregados por la API. Remitió a la documentación para las preguntas de cobertura y endpoints.

Esto no cumple dos requisitos del SDD: precio regional real `CL`/`CLP` y enlaces directos a Steam. IsThereAnyDeal no se integrará ni se registrará una aplicación. La evidencia resumida está en [evidence/itad-response-2026-09-01.md](evidence/itad-response-2026-09-01.md).

---

Hello,

I am building a small, non-commercial notifier for one private Discord server I own. Before registering an API application, I would like to clarify permission and data coverage for private use.

The service would run on Cloudflare Workers Free. It would announce selected Steam discounts and a daily summary of recently released base games. It would not make purchases, access users' libraries, or monetize notifications.

Could you please confirm:

1. Whether this private use is permitted without a paid agreement, and any required approval or attribution.
2. Whether your API provides actual Steam prices for Chile (country CL) in CLP, rather than converted US prices.
3. Whether it supports bounded discovery of discounted games and already released games from the last seven days, including games without discounts.
4. Which endpoints confirm Steam app ID, base-game versus DLC type, regional availability, precise release date, coming-soon status, genres and Early Access.
5. Applicable limits and linking requirements. Our brief calls for direct Steam links without monetization; please flag any incompatible requirements.

Our current design checks offers every 30 minutes, discovers releases every six hours, and caps individual game checks at ten per run, shared across both workflows. We would cache results, use batching where supported, honor rate limits, and avoid catalog-wide scans.

If Chile/CLP or any other required field is not supported, please let me know before I proceed.

Thank you.
