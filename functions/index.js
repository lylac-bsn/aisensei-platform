const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK
initializeApp();

/**
 * deleteUserAccount
 *
 * Callable Cloud Function that deletes a user's Firebase Auth account
 * AND their Firestore document. Only admins can call this.
 *
 * @param {string} data.uid - The UID of the user to delete
 */
exports.deleteUserAccount = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    // 1. Must be authenticated
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }

    const callerUid = request.auth.uid;
    const targetUid = request.data.uid;

    if (!targetUid || typeof targetUid !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "削除対象のユーザーIDが必要です。"
      );
    }

    // Validate UID format: alphanumeric only, 1-128 chars (prevents path traversal)
    if (!/^[a-zA-Z0-9]{1,128}$/.test(targetUid)) {
      throw new HttpsError(
        "invalid-argument",
        "無効なユーザーIDです。"
      );
    }

    // 2. Verify caller is admin
    const db = getFirestore();
    const callerDoc = await db.collection("users").doc(callerUid).get();

    if (!callerDoc.exists || callerDoc.data().role !== "admin") {
      throw new HttpsError("permission-denied", "管理者権限がありません。");
    }

    // 3. Prevent self-deletion
    if (callerUid === targetUid) {
      throw new HttpsError(
        "failed-precondition",
        "自分自身のアカウントは削除できません。"
      );
    }

    // 4. Prevent deleting other admins
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (targetDoc.exists && targetDoc.data().role === "admin") {
      throw new HttpsError(
        "failed-precondition",
        "管理者アカウントは削除できません。"
      );
    }

    // 5. Delete Firebase Auth account
    try {
      await getAuth().deleteUser(targetUid);
    } catch (err) {
      // If Auth user doesn't exist, that's fine — continue to delete Firestore doc
      if (err.code !== "auth/user-not-found") {
        throw new HttpsError(
          "internal",
          "認証アカウントの削除に失敗しました。"
        );
      }
    }

    // 6. Delete Firestore document
    try {
      await db.collection("users").doc(targetUid).delete();
    } catch (err) {
      throw new HttpsError(
        "internal",
        "ユーザーデータの削除に失敗しました。"
      );
    }

    return {
      success: true,
      message: "アカウントを完全に削除しました。",
    };
  }
);
