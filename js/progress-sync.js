import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { buildProgressSnapshot } from "./quest-engine.js";

let syncTimer = null;

export async function syncProgressToFirestore(db, userId) {
  if (!db || !userId) return;

  try {
    const snapshot = buildProgressSnapshot();
    await updateDoc(doc(db, "users", userId), {
      beginnerProgress: snapshot,
      progressUpdatedAt: serverTimestamp(),
    });
  } catch {
    // ignore network / permission errors
  }
}

export function initProgressSync(db, userId) {
  syncProgressToFirestore(db, userId);
}

export function scheduleProgressSync(db, userId) {
  if (!db || !userId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncProgressToFirestore(db, userId);
  }, 1500);
}
