# Acciones manuales pendientes (solo una vez)

Todo lo demás ya funciona solo: entorno, motor, Lía, voz, QA, pie, copia para TikTok, dry-run y tarea programada.

## 0. Publicación automática en Instagram + TikTok con PostEverywhere (≈10 min)
Es la vía por defecto (`publish.provider: "posteverywhere"`). Publica con sus propias apps ya aprobadas por Meta y TikTok, así que evita el error de vídeo de la API de Meta y la revisión de apps de TikTok. Es de pago: el plan Lite cuesta 9 $/mes por 2 cuentas, y la prueba de 7 días pide tarjeta.
1. Crea la cuenta en https://posteverywhere.ai y elige el plan Lite.
2. En *Accounts*, conecta **Instagram** (cuenta profesional) y **TikTok** (@iaenapuros) e inicia sesión en cada una cuando lo pida.
3. En https://app.posteverywhere.ai/developers crea una **API key**.
4. En `.env`, añade la línea `POSTEVERYWHERE_API_KEY=<tu clave>`. Copia el formato de `.env.example`.
5. Comprueba que todo está bien, sin publicar nada:
   ```bash
   npm run publish:check
   ```
   Tiene que responder `"ok": true` con una cuenta de Instagram y otra de TikTok.

Mientras no haya clave, la publicación en modo live sigue usando la vía de Meta (pasos 1-3), solo para Instagram.

## 1. Cuenta profesional de Instagram vinculada a una Página de Facebook (≈5 min)
Es necesario porque solo la vía de Facebook Login permite subir el vídeo desde el PC.
1. En la app de Instagram, entra en Perfil → ☰ → *Configuración y privacidad* → *Tipo de cuenta y herramientas* → *Cambiar a cuenta profesional*. Elige **Creador** (o Empresa) y la categoría "Creador digital".
2. Si no tienes Página de Facebook: en facebook.com → *Páginas* → *Crear nueva página* → nombre "IA en apuros".
3. Vincúlalas: en Instagram, *Editar perfil* → *Página* → elige la Página creada. También puedes hacerlo desde *Meta Business Suite → Configuración → Cuentas de Instagram*.

## 2. App de Meta for Developers (≈10 min)
1. Entra en https://developers.facebook.com/apps → *Crear app*. Caso de uso: **"Administrar todo en tu Página"** u "Otro" → tipo **Empresa**. Nómbrala, por ejemplo, "iaenapuros-publisher".
2. En el panel de la app, añade el producto **Instagram** y elige la opción **"API setup with Facebook login"** (no "Instagram login").
3. En *Configuración de la app → Básica*, copia el **Identificador de la app** y la **Clave secreta**.
4. No hace falta revisión de app: como administradora de la app y de la cuenta, puedes publicar en tu propia cuenta en modo desarrollo.

## 3. Token y configuración (≈3 min)
1. En la carpeta del proyecto, copia `.env.example` como `.env` y rellena `META_APP_ID` y `META_APP_SECRET`.
2. Abre el **Explorador de la API Graph** (https://developers.facebook.com/tools/explorer). Elige tu app, pulsa *Generar token de acceso* y marca estos permisos:
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `pages_show_list`, `pages_read_engagement`, `business_management`.
   Acepta el diálogo y elige tu Página y tu cuenta de Instagram.
3. Pega el token en `.env` como `META_SHORT_TOKEN=...` y guarda.
4. Ejecuta:
   ```bash
   npm run ig:setup
   ```
   Debe responder `OK: Página "…" → Instagram @iaenapuros`. El script cambia el token corto por uno de Página que no caduca y borra el corto. Desde ese momento la renovación y la comprobación del token son automáticas.

## 4. Modelo de la tarea programada (30 s)
En Claude Desktop → barra lateral **Scheduled** → *@iaenapuros · reel diario* → *Edit*. Elige el modelo **Sonnet 5.5** (la herramienta que crea la tarea no permite fijarlo). Comprueba también que la hora sea 19:30 y el modo de permisos **Auto**.

## 5. Mantener el PC despierto
En Claude Desktop → *Settings* → activa **"Keep computer awake"**. Las tareas solo se ejecutan con la app abierta; si estaba cerrada a las 19:30, la tarea se ejecuta al abrirla.

## 6. Activar la publicación real
Cuando hayas visto un par de dry-runs y estés conforme, escribe en Claude Code: **"activar publicación"**. Claude ejecutará `npm run publish:mode -- live`. Para volver atrás: `npm run publish:mode -- dry-run`.

## Cada día (opcional, 1 min)
- **Fijar el comentario:** la API no permite fijarlo. En el reel, mantén pulsado el comentario de @iaenapuros → *Fijar*.
- **TikTok:** con PostEverywhere se publica solo. Sin él, el vídeo y su pie están en `out/tiktok/AAAA-MM-DD_iaenapuros.mp4` y `…_pie.txt`, listos para subirlos a mano.
- **Revisión:** el historial está en `state/log.json` y la hoja de fotogramas de cada día en `out/<fecha>/qa/contact.jpg`.

## Si algo falla
- `npm run daily -- --date AAAA-MM-DD --force` rehace un día.
- Si edge-tts falla (sin red), se usa automáticamente la voz local de Windows (Helena, es-ES).
- Si caduca el acceso a datos de Meta (unos 90 días sin usar la app), repite el paso 3.
