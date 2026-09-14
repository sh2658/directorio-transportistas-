# Design QA

- Source visual: `Captura de pantalla 2026-09-13 072339.png`
- Implementation: Rutas CR carrier card, release v27
- Target viewports: desktop and mobile
- Source characteristics: compact white card, circular 1:1 avatar, company hierarchy, schedule badge, compact contact actions, nearby warehouse navigation icons, destination chips and local filter.
- Implemented characteristics: circular 1:1 images with initials fallback; charcoal typography; dynamic schedule badge; phone plus icon-only WhatsApp; Waze and Google Maps SVG buttons; destination chips and per-card filter; nearby-service badge.
- Functional checks: La Gamba corridor resolution, homonym disambiguation, exact destination matching, restored search controls, and AppSheet-derived carrier updates.
- Automated evidence: 58/58 tests passed; production build passed with 59 carriers and 74 GPS warehouses.
- Full-view evidence: release `99f5d4ff` inspected in the cloud browser at 1348 px width. The complete search header, territorial notice and carrier-card hierarchy render without overlap or clipping.
- Focused comparison: the published La Gamba result was visually compared with the supplied card reference. It preserves the circular image, company/status hierarchy, compact contact row, navigation icons, open destination chips and restrained card styling. The implementation intentionally retains the existing Rutas CR navy/amber identity.
- Iteration history: corrected overly broad destination matching, removed Palmar Norte from the La Gamba example corridor, added explicit nearby-coverage messaging, reduced WhatsApp to its recognizable icon, and restored the search control state.

final result: passed

Public checks also confirmed the Miravalles phone `7110-2236`, removal of its Fortuna and Guayabo assignments, icon-only WhatsApp links with accessible names, the five-center La Gamba corridor, and four-way Playa Hermosa disambiguation.
