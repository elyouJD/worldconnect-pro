# WorldConnect Pro — Direct Messaging update

## Incluido
- Firebase Authentication (registro e inicio de sesión).
- Perfiles públicos consultados con `visibility == "public"`.
- Presencia aproximada `online` / `lastSeen`.
- Likes y matches conservados como funciones separadas.
- Conversaciones directas sin Match, con lista en tiempo real.
- Mensajes de texto, imágenes, vídeo y notas de voz grabadas desde el navegador.
- Emoji, bloqueo y denuncias en la interfaz.

## Configuración
1. Revisa `js/firebase-config.js` y confirma que corresponde a tu proyecto Firebase.
2. Activa Email/Password en Firebase Authentication.
3. Publica `firestore.rules` desde Firebase Console → Firestore Database → Rules.
4. `js/cloudinary-config.js` usa el cloud name y unsigned preset que confirmaste. Comprueba que el preset `worldconnect_profiles` permite imágenes, vídeo y audio (o crea un preset dedicado para chat). Nunca pongas `API_SECRET` en el frontend.
5. Sirve la carpeta por HTTP local, por ejemplo `python -m http.server 8000`, y abre `http://127.0.0.1:8000`.

## Importante sobre llamadas
Los botones de llamada del proyecto base siguen siendo marcadores visuales; no hay todavía una implementación WebRTC de llamadas en vivo. Los vídeos adjuntos y las notas de voz grabadas sí son tipos de mensaje distintos y no equivalen a videollamadas/llamadas en directo.

## Prueba recomendada
- Registra dos cuentas de prueba distintas.
- En la primera cuenta, abre un perfil y pulsa `Enviar mensaje` sin dar Like.
- En la segunda cuenta, comprueba que aparece el chat y responde.
- Prueba imagen, vídeo y nota de voz.
- Comprueba que una tercera cuenta no puede leer ese chat.

## Seguridad y producción
Estas reglas permiten que cualquier usuario autenticado inicie un chat directo con otro perfil público, tal como se solicitó. Antes de producción añade límites anti-spam, bloqueo efectivo en el flujo de envío, moderación de archivos, límites de cuota y pruebas con Firebase Emulator. La presencia basada en heartbeat es aproximada.
