export const firebaseConfig = {
  apiKey: "AIzaSyBCq__m5hcNO7NjMPJNVmye-W83SIWdIZg",
  authDomain: "worldconnect-staging.firebaseapp.com",
  projectId: "worldconnect-staging",
  storageBucket: "worldconnect-staging.firebasestorage.app",
  messagingSenderId: "330159281891",
  appId: "1:330159281891:web:f8a1e965571a53fb1e17d6",
  measurementId: "G-M3M33YGT1C"
};
export const configured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
