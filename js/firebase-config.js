// Configuración pública de la aplicación web Firebase. Nunca incluyas claves privadas aquí.
export const firebaseConfig = {
  apiKey: "AIzaSyDCOooHf3mGbqq5BDf32fRoBenkFKAwhXQ",
  authDomain: "worldconnect-c3e86.firebaseapp.com",
  projectId: "worldconnect-c3e86",
  storageBucket: "worldconnect-c3e86.firebasestorage.app",
  messagingSenderId: "1096344298557",
  appId: "1:1096344298557:web:19219950bd4e131cafb654",
  measurementId: "G-RSKG62MSRW"
};
export const configured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
