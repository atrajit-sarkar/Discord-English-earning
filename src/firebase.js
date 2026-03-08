import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCni6Q3gZZeJom5h1n0Ywt731W9nlhmjEc",
  authDomain: "discord-en-jp-practice.firebaseapp.com",
  projectId: "discord-en-jp-practice",
  storageBucket: "discord-en-jp-practice.firebasestorage.app",
  messagingSenderId: "407200673446",
  appId: "1:407200673446:web:e8de21406d6d842d1d8e67",
  measurementId: "G-0Y7FPH360X",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ─── Firestore helpers for the "English" collection ─── */

/**
 * Fetch user document from English/{discordUserId}.
 * Returns null if the document doesn't exist yet.
 */
export async function getUserProgress(discordUserId) {
  try {
    const snap = await getDoc(doc(db, "English", discordUserId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("getUserProgress:", err);
    return null;
  }
}
