# @iaenapuros: reglas del proyecto

Canal de humor sobre IA (Instagram y TikTok). Cada día se publica 1 reel 9:16 de 30-45 s con **Lía**, una IA de bloques que siempre está en apuros. Las decisiones de marca están en `docs/DECISIONES.md`.

## Reglas duras
- Solo herramientas locales o gratuitas. Ninguna API de pago ni claves de modelos.
- Se trabaja solo dentro de esta carpeta.
- **Credenciales:** `.env` no se lee, no se imprime y no se sube a git (los scripts lo usan internamente). No se pegan tokens en el chat ni en los logs.
- **No se inventan noticias.** Cada tema de actualidad guarda su fuente (url y fecha) en `episode.json`, y por tanto en `state/log.json`.
- La publicación real solo ocurre con `state/config.json → publish.mode = "live"`. Ese modo se activa únicamente cuando el propietario escribe "activar publicación" (`npm run publish:mode -- live`).
- Si la QA falla tras 2 reintentos, no se publica y queda registrado.

## Flujo diario (lo ejecuta la tarea programada)
1. `npm run context` → fecha, serie sugerida, temas ya usados y **lecciones del jurado** (obligatorio aplicarlas).
2. Elegir el tema. Actualidad: WebSearch de noticias de IA de <48 h, verificando el artículo. Si no hay nada bueno, idea evergreen.
3. Escribir `episodes/<fecha>/episode.json` según `docs/EPISODE.md`. Solo se lee ese archivo; el motor no se toca.
4. `npm run daily` → voz, render, QA, pie y copia para TikTok. Revisar `out/<fecha>/qa/contact.jpg`; si la QA falla, corregir y repetir.
5. **Jurado** (`docs/PANEL.md`): `npm run panel:prep`, 5 subagentes (uno por perfil) y sus JSON en `out/<fecha>/panel/ronda-N/votos/<perfil>.json`; después `npm run panel:score`.
   - `reescribir`: corregir los fallos comunes en episode.json (mismo tema) y volver al paso 4. Máximo 3 rondas.
   - `publicar` o `publicar_mejor`: `npm run panel:finalize` (se queda con la mejor ronda y actualiza `docs/APRENDIZAJE.md`).
6. `npm run publish -- --review "ok: <nota corta>"`.

## Mapa
- `engine/src/`: motor Three.js (rig de Lía, poses, fondos y capas). Se toca una sola vez, no a diario.
- `engine/template/index.html`: composición HyperFrames.
- `scripts/`: pipeline (`daily`, `produce`, `voice`, `build`, `qa`, `caption`, `publish`, `snap`).
- `state/`: `config.json` (modo y voces), `log.json` (historial de temas, fuentes y estado) y `aprendizaje.json` (veredictos del jurado).
- `out/<fecha>/`: reel.mp4, caption.txt, comment.txt, qa/; `out/tiktok/`: copia para TikTok (no se publica).

## Estilo de trabajo
- Respuestas cortas en español. Para ahorrar tokens, no se leen `node_modules`, `build`, `out` (salvo contact.jpg y las hojas del jurado) ni `.hyperframes`.
