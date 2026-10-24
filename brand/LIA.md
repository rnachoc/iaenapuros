# Claude, en apuros (parodia no oficial; antes "Lía")

- **Qué es:** un robot de bloques turquesa (#2EC4B6) con manos y orejas amarillas (#FFD23F). Su cara es una pantalla LED con ojos y boca animados.
- **Antena:** es su "barra de contexto". El LED pasa de verde a ámbar y a rojo según el estrés, y parpadea cuando está al límite.
- **Personalidad:** muy dispuesta y muy segura de sí misma… hasta que se lía. Nunca es cruel; se ríe de sí misma.
- **Voz:** es-ES-ElviraNeural (+8 %). «Tú» es una voz clonada en local (Chatterbox es-ES con una referencia CC0 de Common Voice; ver `brand/REFERENCIA-VOZ.md`) y el narrador de noticias es-ES-XimenaNeural.
- **Poses (rig en `engine/src/poses.js`):** normal, agobiada, sudando, pánico, resignada, pensando, chulita, alucinando, avergonzada, error.
- **Ojos:** normal, wide, happy, half, worried, spiral, x, closed. **Bocas:** smile, grin, flat, wavy, grimace, scream, small, frown, más la boca que habla, sincronizada palabra a palabra.
- **Fondos:** oficina (noche, ciudad, póster "Keep calm y pulsa Ctrl+Z"), servidor (pasillo de racks con LEDs que se ponen en rojo con `alarma`) y plato (informativo "Apuros del día" con rótulo animado).
- **Hoja de identidad:** `brand/identidad-poses.jpg` (se regenera con `npm run poses`).
