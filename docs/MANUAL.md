# Acciones manuales pendientes (solo una vez)

Todo lo demás ya funciona solo: entorno, motor, Lía, voz, QA, pie, copia para TikTok, dry-run y tarea programada.

## 0. TikTok: subida automática a borradores (gratis, ≈15 min una vez)
Cada día el reel llega solo a tu bandeja de TikTok como borrador y tú lo publicas con un toque. TikTok no permite publicar en público de forma automática y gratuita desde herramientas personales: sin auditoría, solo publica vídeos privados, y la auditoría rechaza este tipo de herramienta.
1. Entra en https://developers.tiktok.com con tu cuenta de TikTok → *Manage apps* → *Connect an app*. Nombre: «iaenapuros-uploader», plataforma **Desktop**.
2. Añade los productos **Login Kit** y **Content Posting API**. En Content Posting API, usa solo la opción de subida (*Upload*), no *Direct Post*. Permisos: `user.info.basic` y `video.upload`.
3. En Login Kit → *Redirect URI* (Desktop), añade exactamente `http://127.0.0.1:3455/callback/`.
4. Pasa a **Sandbox** (arriba), crea un sandbox y en *Target users* añade tu cuenta @iaenapuros.
5. Copia el *Client key* y el *Client secret* del sandbox a `.env` con este formato:
   ```
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   ```
6. Ejecuta lo siguiente, inicia sesión con @iaenapuros y acepta los permisos:
   ```bash
   npm run tiktok:setup
   ```
   Tiene que responder `OK: TikTok conectado`. A partir de ahí la renovación es automática durante 365 días.
7. **Cada día:** te llega la notificación del borrador a TikTok. Ábrela, pega el pie de `out/tiktok/AAAA-MM-DD_iaenapuros_pie.txt` o de `para-publicar/` y pulsa *Publicar*.

Si el sandbox no deja subir borradores (lo sabremos en la primera subida), la alternativa es seguir subiéndolo a mano con el paquete de `out/tiktok/`.

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
   `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management`.
   (`instagram_manage_insights` es para las analíticas de `npm run insights`; sin él, solo se leen seguidores, me gusta y comentarios.)
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
- **TikTok:** el borrador llega solo (paso 0); publícalo desde la app pegando el pie de `out/tiktok/AAAA-MM-DD_iaenapuros_pie.txt`.
- **Revisión:** el historial está en `state/log.json` y la hoja de fotogramas de cada día en `out/<fecha>/qa/contact.jpg`.

## Si algo falla
- `npm run daily -- --date AAAA-MM-DD --force` rehace un día.
- Si edge-tts falla (sin red), se usa automáticamente la voz local de Windows (Helena, es-ES).
- Si caduca el acceso a datos de Meta (unos 90 días sin usar la app), repite el paso 3.
- `npm run publish:check` comprueba token, permisos y cuota de Instagram sin publicar. `npm run ig:test` prueba la subida completa sin publicar (el contenedor caduca solo en 24 h). La subida necesita `META_USER_TOKEN` en `.env` (lo escribe `ig:setup`).
