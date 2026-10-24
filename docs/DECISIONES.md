# Decisiones de producción — @iaenapuros

Tomadas el 2026-10-23 tras analizar @claudecode_es y @tarritoai.

## Lo que enseñan los referentes

| | @claudecode_es | @tarritoai |
|---|---|---|
| Seguidores | 53,7 mil | ~2 mil |
| Personaje | Humano voxel (gorra rosa), primer plano, fondo de código | Tarro low-poly naranja, escenas nocturnas cálidas |
| Título | Siempre "Claude, <frase>" | Situación narrada ("Le dije a mi IA que…") |
| Lo que más funciona | Desastres de dev: "borré la base de datos…" (151K ♥), "¿subí la API key a GitHub?" (47K), "eres un ingeniero senior con 40 años…" (27K) | "Comenta TARRO" (4.844 comentarios), "Le dejó una nota al siguiente" (8,3K ♥) |
| Pie | Título + "Guárdalo y sígueme" + lead magnet + 5 hashtags | Gancho + emoji firma 🫙 + pregunta o "Envíaselo a…" + 5 hashtags |
| Frecuencia | ~7 reels/día | ~1/día |

Conclusiones aplicadas:
1. El título-gancho va escrito en grande desde el fotograma 0: es la miniatura y el gancho para quien ve sin sonido.
2. Ganan los dolores reconocibles (romper producción, límites, tokens, alucinaciones) frente a la explicación técnica.
3. Una palabra para comentar dispara los comentarios, pero solo si hay algo detrás. Aquí se usa como juego ("Comenta CONTEXTO si te ha pasado"), sin prometer nada que no exista.
4. El emoji de firma ayuda a reconocer la marca. El nuestro es 🧯 (extintor: apagar fuegos de la IA).
5. Ninguno de los dos hace actualidad con fuente, así que la serie "Apuros del día" es nuestro hueco.

## Decisiones (lo que te pregunté)

1. **Hora: publicación ~20:00 de Madrid; la tarea arranca a las 19:30.** En España el pico de reels es por la tarde-noche, entre la salida del trabajo y la cena. Los 30 min de margen cubren búsqueda, render, control de calidad y hasta 2 reintentos.
2. **El PC se considera encendido a esa hora.** Si falla, no se publica doble al día siguiente: hay un episodio por fecha y la publicación es idempotente. Tienes que activar "Keep computer awake".
3. **Reparto de series:** si hay una noticia de IA de las últimas 48 h con fuente fiable y que dé juego, va "Apuros del día"; si no, evergreen. Nunca más de 3 días seguidos de la misma serie. Así cuando hay noticia gana la actualidad y el canal nunca se queda sin publicar.
4. **Instagram: API oficial vía Facebook Login for Business (graph.facebook.com) con la cuenta profesional vinculada a una Página de Facebook.** Según la documentación vigente de Meta, es la única vía que permite subir el vídeo desde archivo local (resumable upload a rupload.facebook.com). La vía "Instagram Login" exige una URL pública del vídeo, es decir, montar un hosting.
5. **Token:** se usa un token de Página obtenido de un token de usuario de larga duración; ese token de Página no caduca. Aun así, el script lo comprueba cada día (`debug_token`), renueva el token de usuario antes de que caduque y, si algo falla, no publica y lo registra.
6. **Comentario fijado:** la API permite publicar comentarios pero no fijarlos. El pipeline publica el comentario desde la cuenta; fijarlo es opcional y a mano (10 s desde el móvil).
7. **Personaje: "Claude", en parodia no oficial (cambio del 2026-10-24; antes era "Lía").** El robot es el mismo diseño propio: bloques turquesa, una pantalla como cara (ojos y boca animados) y una antena-LED que hace de "barra de contexto" (verde → ámbar → rojo). Es distinto del humano voxel de @claudecode_es y del tarro de @tarritoai. Conserva la voz femenina.
8. **Claude protagoniza el humor, sin la identidad de Anthropic.** El usuario le llama "Claude" en títulos y diálogos. Nunca se usan el logo, el asterisco ni el naranja de Anthropic, y la bio dice siempre "parodia no oficial · sin relación con Anthropic", para no parecer una cuenta oficial.
9. **Paleta propia:** noche #12142B, turquesa #2EC4B6 (Claude), amarillo #FFD23F (palabra activa y acentos), coral #FF5A5F (alarma). Tipografía Archivo Black para títulos e Inter para subtítulos, ambas incluidas en HyperFrames. Marca de agua discreta @iaenapuros.
10. **Voces:** Claude con `es-ES-ElviraNeural` (+8 %) y el narrador con `es-ES-XimenaNeural`. «Tú» se genera en local con **Chatterbox**, el fine-tune de español de España (`ResembleAI/Chatterbox-Multilingual-es-es`, licencia MIT, GPU), clonando una voz CC0 de Mozilla Common Voice (hombre de 40-50 años, Madrid/Castilla-La Mancha; ver `brand/REFERENCIA-VOZ.md`). Edge no tiene ninguna voz masculina castellana que suene humana. Whisper (local) marca cuándo suena cada palabra para los subtítulos. Si falla, se usa `es-ES-AlvaroNeural`.
11. **Sonido:** sin música con derechos. Hay efectos sintetizados por código (golpe, alarma, ding, glitch, whoosh) y una cama tonal muy baja que se atenúa bajo la voz. Así hay copyright cero y la voz queda clara; además, la API no permite audios en tendencia.
12. **Tono:** se pueden nombrar empresas, siempre con fuente. A personas reales solo si protagonizan la noticia, y nunca se ataca lo personal. Sin tacos. La burla es a la tecnología y a la situación, nunca al usuario.
13. **Repositorio:** git local, sin remoto (no lo pediste).
14. **Publicación real:** solo cuando escribas "activar publicación" (`state/config.json → publish.mode`). Hasta entonces todo va en `--dry-run`.
15. **Etiqueta IA (`is_ai_generated=true`)** en cada reel: la voz es sintética y la transparencia encaja con la marca.
16. **Formato:** 1080×1920, 30 fps, 30–45 s. Gancho en 0–2 s, golpes cada 2–4 s y remate en la última línea. El texto va solo en la franja 168–1330 px (zonas seguras de Instagram y TikTok).
17. **Reparto del trabajo diario:** no hay CLI de Claude en el PATH ni API de pago, así que la parte creativa (buscar el tema y escribir el `episode.json`) la hace la propia tarea programada con Sonnet. `npm run daily` hace todo lo determinista (voz, render, QA, pie, copia para TikTok y publicación) y se detiene si falta el episodio o la QA falla.
18. **Orden del pie:** título + 🧯, cuerpo, fuente (solo en actualidad), CTA (pregunta o "Comenta PALABRA") y el bloque de 5 hashtags al final. El texto termina con la CTA; los hashtags van aparte, como en los referentes.
19. **Revisión visual:** `npm run daily` deja el reel "listo para revisión". La tarea programada mira la hoja de fotogramas y solo entonces ejecuta `npm run publish`. Así la QA visual la hace un modelo antes de cada publicación.
20. **Jurado de 5 agentes (23/10):** antes de publicar, 5 perfiles simulados (Lucía 19, Javi 34 dev, Marta 45, Dani 27 fan de la IA, Carla 30 creadora) juzgan el reel a partir de un fotograma por segundo y el guion. Se publica si al menos 3/5 lo ven entero y el gancho medio es 6 o más; si no, se reescribe, con un máximo de 3 rondas, y se publica la mejor. Los fallos que se repiten 3 días o más pasan a ser reglas en `docs/APRENDIZAJE.md`, que `npm run context` muestra antes de escribir cada guion. Primera prueba: la ronda 1 dio 51 % de retención y nota 5,2; la ronda 2 reescrita, 87 % y 7,7.
21. **Publicación con PostEverywhere (25/10):** la API de Meta rechaza las subidas de vídeo de esta cuenta (error 2207076), y la API de TikTok exige una auditoría de la app para publicar en público. Por eso se publica en Instagram (Reels) y TikTok a la vez con la API de PostEverywhere, la misma que usa su servidor MCP oficial (github.com/posteverywhere/mcp, MIT). Es la única pieza de pago del proyecto (9 $/mes, plan Lite) y la eligió el propietario. Flujo: subida directa del MP4 → post con las dos cuentas → espera a los resultados de cada red. Es idempotente: un reintento no publica dos veces. Sin clave, Instagram sigue por Meta. El comentario fijado sigue siendo manual, porque PostEverywhere no publica primer comentario en Instagram.
