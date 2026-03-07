import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

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

/**
 * Create or update the user profile inside English/{discordUserId}.
 * Uses setDoc with merge to do it in a SINGLE Firestore call (no read needed).
 * Called on every Discord login so the profile stays current.
 */
export async function upsertUserProfile(user) {
  try {
    const ref = doc(db, "English", user.id);
    await setDoc(
      ref,
      {
        discordId: user.id,
        username: user.username,
        avatar: user.avatar,
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("upsertUserProfile:", err);
  }
}

/**
 * Ensure default stats fields exist for a brand-new user.
 * Only writes when the document does not yet exist so existing
 * stats / quiz history are never overwritten.
 */
export async function ensureUserDefaults(discordUserId) {
  try {
    const ref = doc(db, "English", discordUserId);
    const snap = await getDoc(ref);
    if (snap.exists()) return;

    await setDoc(ref, {
      totalAttempts: 0,
      bestScore: 0,
      bestStreak: 0,
      quizHistory: [],
      seenQuizzes: [],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("ensureUserDefaults:", err);
  }
}

/**
 * Mark a quiz as "seen" by the user so the NEW badge no longer shows.
 * Uses arrayUnion so duplicates are ignored automatically.
 */
export async function markQuizSeen(discordUserId, quizId) {
  try {
    const ref = doc(db, "English", discordUserId);
    await setDoc(
      ref,
      { seenQuizzes: arrayUnion(quizId) },
      { merge: true }
    );
  } catch (err) {
    console.error("markQuizSeen:", err);
  }
}

/**
 * Save a completed quiz attempt to the user's document.
 * Appends to quizHistory[] and updates aggregate stats.
 */
export async function saveQuizResult(discordUserId, result) {
  try {
    const ref = doc(db, "English", discordUserId);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};

    const attempt = {
      quizId: result.quizId,
      score: result.score,
      total: result.total,
      percentage: result.percentage,
      level: result.level,
      bestStreak: result.bestStreak,
      userAnswers: result.userAnswers ?? [],
      completedAt: new Date().toISOString(),
    };

    await setDoc(
      ref,
      {
        totalAttempts: (prev.totalAttempts ?? 0) + 1,
        bestScore: Math.max(prev.bestScore ?? 0, result.score),
        bestStreak: Math.max(prev.bestStreak ?? 0, result.bestStreak),
        lastPlayed: serverTimestamp(),
        quizHistory: arrayUnion(attempt),
        seenQuizzes: arrayUnion(result.quizId),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("saveQuizResult:", err);
  }
}

export { db };
