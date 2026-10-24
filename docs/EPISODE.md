# episode.json: especificación y reglas de guion

Ruta: `episodes/YYYY-MM-DD/episode.json` (fecha de Madrid). Hay uno por día. Es lo único que se escribe a diario.

## Esquema

```jsonc
{
  "date": "2026-10-23",
  "series": "actualidad" | "dia-a-dia",
  "title": "Claude, ¿…?",                 // 8-90 caracteres. Va escrito en pantalla desde el fotograma 0 (es la miniatura)
  "background": "oficina" | "servidor" | "plato",   // si no se indica: plato (actualidad) / oficina (día a día)
  "topic": {
    "key": "slug-unico-del-tema",          // obligatorio, no repetir nunca (npm run context)
    "summary": "una frase",
    "sources": [{ "name": "Medio", "url": "https://…", "date": "YYYY-MM-DD" }],  // obligatorio en actualidad
    "ticker": "TEXTO DEL RÓTULO DEL PLATO" // opcional
  },
  "lines": [                               // 4-14 líneas, 70-110 palabras en total (30-45 s)
    {
      "speaker": "user" | "lia" | "narrador",
      "text": "Lo que se lee en subtítulos (≤160 caracteres)",
      "say": "Opcional: lo que se pronuncia si difiere (números en letra, siglas)",
      "pose": "normal|agobiada|sudando|panico|resignada|pensando|chulita|alucinando|avergonzada|error",
      "react": { "pose": "panico", "at": 0.8 },   // cambio de pose a mitad de línea (s desde su inicio)
      "cam": "general" | "medio" | "cara",
      "bg": "servidor",                         // cambio de fondo desde esta línea
      "fx": ["shake","zoom","alarma","flash","glitch","humo","confeti","sudor"],
      "sfx": ["boing","pop","ding","alarma","error","glitch","whoosh","tecla","fail","tic"],  // o {"name":"ding","at":0.5}
      "hud": { "label": "CONTEXTO", "value": 0.95 },   // barra que se arrastra entre líneas; null la vacía
      "popup": { "title": "Error", "text": "≤60 caracteres" },
      "sticker": "¡ZAS!",                       // onomatopeya ≤12 caracteres
      "pause": 0.3                              // silencio extra antes de la línea (s)
    }
  ],
  "caption": {
    "body": "1-2 frases con gracia que no repiten el título",
    "cta": "¿Pregunta final?  |  Comenta PALABRA si…"
  },
  "comment": "Comentario que se publica y se fija a mano",
  "tiktok": { "caption": "opcional, más corto" }
}
```

Los campos que no se indican heredan el valor anterior: pose, cámara, fondo y HUD se mantienen hasta que una línea los cambia. Algunos efectos traen su sonido automático: alarma → alarma, glitch → glitch, zoom → whoosh, confeti → ding, flash → pop, shake → boing; un sticker → pop y un popup → error.

## Reglas de guion (la voz del canal)

Antes de escribir, aplica las lecciones de `docs/APRENDIZAJE.md`: son los fallos que el jurado ha repetido en días anteriores.


1. **Premisa:** Claude es la IA (parodia no oficial) y está en apuros (contexto lleno, alucinación, límites, encargos imposibles, errores en público). Nos reímos de la situación y de la tecnología, nunca del usuario.
2. **Estructura:** gancho (el título dicho por el usuario o el narrador) → 3-6 golpes que escalan el apuro (un golpe cada 2-4 s) → **remate en la última línea**, corto y sorprendente. Ninguna línea de explicación después del remate.
3. **Título:** frase dicha a la IA ("Claude, ¿…?", "IA, …") o una situación ("Cuando le pides…"). Casi siempre usa "Claude,". En el diálogo el usuario puede llamarle "Claude".
4. **Actualidad (Apuros del día):** solo noticias de IA de las últimas 48 h verificadas en la fuente (WebSearch + WebFetch del artículo). El primer golpe lo dice `narrador` con el dato real y luego entra la ficción. Nunca se inventan cifras, citas ni hechos; si algo no está en la fuente, no aparece. `background: "plato"` y `topic.sources` obligatorio.
5. **Día a día:** situaciones universales con IA (pedir imposibles, prompts eternos, «hazlo más profesional», «no inventes», límites de uso, capturas borrosas…).
6. **Lenguaje:** español de España, coloquial, sin tacos. Frases cortas. Números y siglas difíciles en `say`.
7. **Visual:** 3-6 cambios de pose, al menos un efecto (fx) en el clímax, `cam: "cara"` en 1-2 momentos de reacción, HUD solo si cuenta algo (contexto, tokens, paciencia, batería…).
8. **Pie:** `body` + `cta`, que acaba en pregunta o "Comenta PALABRA". El pipeline añade 🧯, la fuente y los hashtags (#iaenapuros #ia #inteligenciaartificial #claude #humor).
9. **Originalidad:** Claude es una parodia con diseño propio: nunca aparecen el logo, el asterisco ni el naranja de Anthropic. Otros personajes, marcas y logos de terceros no aparecen. Tampoco se copian guiones ni ideas literales de otras cuentas.
