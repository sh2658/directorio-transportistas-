# Design QA

- Source visual: `Captura de pantalla 2026-09-13 072339.png`
- Implementation: Rutas CR carrier card, release v27
- Target viewports: desktop and mobile
- Source characteristics: compact white card, circular 1:1 avatar, company hierarchy, schedule badge, compact contact actions, nearby warehouse navigation icons, destination chips and local filter.
- Implemented characteristics: circular 1:1 images with initials fallback; charcoal typography; dynamic schedule badge; phone plus icon-only WhatsApp; Waze and Google Maps SVG buttons; destination chips and per-card filter; nearby-service badge.
- Functional checks: La Gamba corridor resolution, homonym disambiguation, exact destination matching, restored search controls, and AppSheet-derived carrier updates.
- Automated evidence: 58/58 tests passed; production build passed with 59 carriers and 74 GPS warehouses.
- Full-view evidence: pending public release because the isolated browser blocks `terminal.local` with `ERR_BLOCKED_BY_CLIENT`.
- Focused comparison: pending final public screenshot after deployment.
- Iteration history: corrected overly broad destination matching, removed Palmar Norte from the La Gamba example corridor, added explicit nearby-coverage messaging, reduced WhatsApp to its recognizable icon, and restored the search control state.

final result: blocked

Blocking reason: the cloud browser cannot access the isolated local preview. This document must be updated to `passed` only after visual inspection of the deployed release.
