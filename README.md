# WorldConnect Pro — HTML, CSS y JavaScript

Proyecto frontend estático con HTML5, CSS3 y JavaScript ES Modules. Incluye diseño responsive y base PWA. No utiliza Angular, React, Vue, PHP ni backend propio.

## IMPORTANTE: estado de demostración
Al no configurar Firebase, se muestra una demostración con perfiles y mensajes ficticios. No hay usuarios reales, likes persistentes ni chat real. El alta/login real se activa al configurar Firebase. El código de ejemplo conecta Auth y perfil básico; match/chat/administración reales requieren completar backend seguro. No publicar para usuarios reales sin completar los puntos de producción.

## Ejecutar localmente
No abras index.html con file://. Desde esta carpeta ejecuta:
```bash
python -m http.server 8080
```
Abre http://localhost:8080. También puedes usar VS Code Live Server.

## Firebase
1. Crea proyecto en https://console.firebase.google.com/
2. Registra aplicación Web.
3. Activa Authentication > Email/Password.
4. Crea Cloud Firestore.
5. Copia los datos web en `js/firebase-config.js`.
6. Revisa `firestore.rules`, publícalas y prueba con Firebase Emulator Suite.
7. Añade el dominio de Cloudflare Pages a Authorized Domains.

La configuración web de Firebase es pública por diseño; Security Rules son obligatorias. Nunca incluyas Admin SDK, service account ni secretos en el frontend.

## Cloudinary
1. Crea cuenta en https://cloudinary.com/
2. Crea Upload Preset unsigned limitado a imágenes y tamaño.
3. Copia cloudName y uploadPreset en `js/cloudinary-config.js`.
4. Configura moderación, cuotas y límites. Un preset unsigned expuesto puede ser abusado; en producción considera firma de subida desde backend.
5. Nunca pongas API_SECRET en navegador.

## Cloudflare Pages
Sube el proyecto a GitHub. En Cloudflare > Workers & Pages > Create > Pages > Connect to Git:
- Framework preset: None
- Build command: vacío
- Build output directory: `/` (raíz del repo)
Configura HTTPS y añade el dominio a Firebase Auth Authorized Domains.

## Colecciones Firestore previstas
`users/{uid}` perfil público; `privateUsers/{uid}` datos privados; `likes/{id}`; `matches/{id}`; `chats/{id}/messages/{id}`; `blocks/{id}`; `reports/{id}`; `adminAuditLogs/{id}`.

## Antes de producción (imprescindible)
- Backend/Cloud Functions para crear matches tras verificar ambos likes.
- Validar bloqueos antes de crear chats o enviar mensajes.
- Lectura/escritura real de likes, matches y chats con reglas y consultas correctas.
- Custom Claims para admin asignados solo desde Admin SDK, nunca desde navegador; MFA.
- Moderación de imágenes, denuncias, apelaciones, límites anti-spam y registro de acciones.
- Flujo real de borrado de cuenta y datos en Auth, Firestore y Cloudinary.
- Verificación de edad y protección de menores.
- Completar términos, privacidad, cookies, RGPD y transferencias internacionales con asesoría especializada.
- Pruebas negativas: usuario A no puede leer chat de B; usuario no puede elevar rol; like unilateral no abre chat.
- Revisar cuotas/costes de Firebase, Cloudinary y Cloudflare.

## PWA
Incluye manifest y service worker que cachea solo el shell estático; no cachea perfiles ni mensajes privados. Publica en HTTPS para instalar desde Android o iOS.

## Conexión Firebase real (versión actualizada)

Esta versión ya no utiliza perfiles ni mensajes ficticios como modo alternativo. `js/firebase-config.js` contiene la configuración Web del proyecto Firebase `worldconnect-c3e86` que se conectó durante la preparación.

Funciones conectadas a Firebase:
- Registro e inicio de sesión con Firebase Authentication (correo y contraseña).
- Cierre de sesión real.
- Creación y actualización del perfil en Firestore.
- Descubrimiento de perfiles registrados en la colección `users`.
- Presencia aproximada: `online` y `lastSeen` se actualizan cada 45 segundos. Un perfil se muestra en línea si su última señal tiene menos de 2 minutos.
- Envío de likes persistentes. Si existe un like recíproco, se crea el match y el chat.
- Lectura y envío de mensajes persistentes en `chats/{chatId}/messages`.
- Denuncias guardadas en Firestore.

### Importante: publicar las reglas nuevas

Antes de probar likes, matches y chats, copia el contenido de `firestore.rules` en Firebase Console → Firestore Database → Reglas y pulsa Publicar. Estas reglas sustituyen a las reglas de prueba anteriores y permiten crear un match únicamente cuando existen likes recíprocos.

### Límites y preparación antes de producción

- La presencia es aproximada mediante señales periódicas; no es un sistema de presencia garantizada en tiempo real. Si el navegador se cierra abruptamente, el estado puede tardar hasta 2 minutos en pasar a desconectado.
- La creación de match desde el cliente está protegida por reglas que exigen dos likes recíprocos. Para producción conviene migrarla a Cloud Functions.
- La interfaz de administración no se concede por el nombre o correo. Un administrador debe recibir el custom claim `admin` desde un entorno confiable con Firebase Admin SDK.
- Para producción deben añadirse controles de abuso, validación de edad, políticas RGPD, verificación de correo obligatoria, borrado integral de cuenta, moderación y pruebas de seguridad.
- La visibilidad de perfiles requiere que los usuarios mantengan sus datos públicos limitados a información que acepten compartir. No guardes contraseñas ni datos sensibles en Firestore.


## Social community update (v2)

New sections:
- **Amigos y seguidores**: friends list, incoming friend requests, followers and following.
- **Follow / Unfollow** actions on profile cards.
- **Friend requests**: send, accept or decline. Accepted requests create a friendship.
- **Publicaciones**: a signed-in community feed for short text posts (up to 1,200 characters).
- Existing private messaging remains available separately.

### Firebase deployment
Publish the complete `firestore.rules` file in Firebase Console → Firestore Database → Rules. New collections used:
`follows`, `friendRequests`, `friendships`, and `posts`.

This is a first social-network release, not a full clone of Instagram, TikTok, Facebook, BuzzArab or WhatsApp. It currently includes text posts, friends/followers and the existing private chat. Stories, video reels/live streaming, calls, advanced post reactions/comments and push notifications on closed browsers are not included in this release.


## Community feed v2
- Friend requests now use generated Firestore document IDs to avoid a protected read of a non-existent request document.
- Post composer supports text, images and videos through Cloudinary (50 MB client-side cap; provider plan limits also apply).
- Posts support Like, Love, Dislike and comments.
- Removed the redundant Connections item from the main navigation; private messages and friends remain.
- Publish the updated `firestore.rules` in Firebase Console before testing these features.


## Post and comment moderation (v4)
- Authors can edit or delete their own posts.
- Authors can disable or re-enable comments on their posts.
- Comment authors can edit/delete their own comments.
- Post authors can delete comments under their posts.
- Firestore rules enforce ownership; clients cannot edit another person's post or comment.
- Post deletion removes currently loaded reaction and comment documents before deleting the post.
- Publish the updated `firestore.rules` in Firebase Console before testing.


## Comment emoji picker (v5)
- Added an emoji picker to each comment composer, including celebration, trophy, victory, heart, like/dislike and expressive emojis.
- Clicking an emoji inserts only that selected emoji at the cursor position; it does not send all emojis.
- Service worker cache version bumped to refresh the updated assets.


## Comment emoji toggle (v6)
- Emoji picker is hidden by default.
- A smiley button appears beside the comment input; clicking it opens/closes the emoji panel for that comment only.
- Selecting an emoji inserts only that emoji at the current cursor position.


## Fix comment permission error (v7)
The comment-create rule now reads `commentsDisabled` with a default of `false`. This allows comments on older posts that do not yet have a `commentsDisabled` field, while still blocking comments when the post owner explicitly disables them.
IMPORTANT: publish this updated `firestore.rules` in Firebase Console > Firestore Database > Rules before testing. The app bundle alone cannot change Firebase security rules.
