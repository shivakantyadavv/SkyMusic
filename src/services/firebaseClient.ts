import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBV8CyY_XCmwEunVnvp7_XDiyBxhM1fAwY",
  authDomain: "skymusic-player-sync.firebaseapp.com",
  projectId: "skymusic-player-sync",
  storageBucket: "skymusic-player-sync.firebasestorage.app",
  messagingSenderId: "422699558615",
  appId: "1:422699558615:web:7756b91cb9460d99a17292",
};

const firebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

const firebaseAuth = getAuth(firebaseApp);
const firestoreDb = getFirestore(firebaseApp);

export { firebaseApp, firebaseAuth, firestoreDb };
