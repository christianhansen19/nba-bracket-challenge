import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue } from "firebase/database";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PASTE YOUR FIREBASE CONFIG HERE — see README for setup instructions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const firebaseConfig = {
  apiKey: "AIzaSyDuqei7c5MtEMcI-CpgnC36F2G8uk5htUw",
  authDomain: "nba-bracket-c0faf.firebaseapp.com",
  databaseURL: "https://nba-bracket-c0faf-default-rtdb.firebaseio.com",
  projectId: "nba-bracket-c0faf",
  storageBucket: "nba-bracket-c0faf.firebasestorage.app",
  messagingSenderId: "848621709927",
  appId: "1:848621709927:web:9c005fea785ce29fcb82c2",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, onValue };
