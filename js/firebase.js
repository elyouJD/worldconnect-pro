import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// La página determina el entorno: staging nunca comparte la configuración de producción.
const isStaging = window.location.pathname.endsWith("/index.staging.html");
const { firebaseConfig } = await import(
  isStaging ? "./firebase-config.staging.js" : "./firebase-config.js"
);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
