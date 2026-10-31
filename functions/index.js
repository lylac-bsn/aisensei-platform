const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const {
  COST_PROJECT_ID,
  AUDIO_KEY_PROJECT_ID,
  billingQuery,
  costPeriod,
  callerIsOwner,
  summarizeCosts,
  validateCostEntry,
} = require("./cost-summary");

const COST_ENTRIES = "adminCostEntries";

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

    const caller = callerDoc.exists ? callerDoc.data() : null;
    if (!caller || (caller.role !== "admin" && !callerIsOwner(caller, request.auth.token?.email))) {
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
    const targetRole = targetDoc.exists ? targetDoc.data().role : "";
    if (targetRole === "admin" || targetRole === "owner") {
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

async function requireOwner(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const callerDoc = await getFirestore().collection("users").doc(request.auth.uid).get();
  const caller = callerDoc.exists ? callerDoc.data() : null;
  if (!callerIsOwner(caller, request.auth.token?.email)) {
    throw new HttpsError("permission-denied", "この画面はオーナーだけが開けます。");
  }
}

async function listCostEntries() {
  const snap = await getFirestore().collection(COST_ENTRIES).orderBy("startDate", "desc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      label: data.label,
      amount: data.amount,
      kind: data.kind,
      startDate: data.startDate,
      endDate: data.endDate || "",
      note: data.note || "",
    };
  });
}

/**
 * getCostSummary
 *
 * Owner-only. Google Cloud costs for ai-sensei-8849b and the audio-generation
 * Gemini API key's project, from the BigQuery billing export (net of credits),
 * plus manual cost entries, bucketed by day or month.
 *
 * @param {number} data.days - Range length in days (7–400, default 30)
 */
exports.getCostSummary = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    await requireOwner(request);
    let range;
    try {
      range = costPeriod(request.data);
    } catch (err) {
      throw new HttpsError("invalid-argument", err.message);
    }
    const { BigQuery } = require("@google-cloud/bigquery");
    const bigquery = new BigQuery({ projectId: COST_PROJECT_ID });
    let rows;
    try {
      [rows] = await bigquery.query({
        query: billingQuery(),
        params: {
          projectId: COST_PROJECT_ID,
          audioKeyProjectId: AUDIO_KEY_PROJECT_ID,
          startDate: bigquery.date(range.startDate),
          endDate: bigquery.date(range.endDate),
        },
        location: "US",
      });
    } catch (err) {
      console.error("billing query failed", err);
      throw new HttpsError("internal", "課金データの取得に失敗しました。");
    }
    const entries = await listCostEntries();
    return { ...summarizeCosts(rows, entries, range), days: range.days, entries };
  }
);

/**
 * saveCostEntry
 *
 * Owner-only. Creates or updates a manual cost entry (non-Google-Cloud costs
 * such as subscriptions or domains).
 */
exports.saveCostEntry = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    await requireOwner(request);
    const { entry, error } = validateCostEntry(request.data);
    if (error) throw new HttpsError("invalid-argument", error);
    const col = getFirestore().collection(COST_ENTRIES);
    const id = request.data?.id;
    if (id !== undefined && id !== null && id !== "") {
      if (typeof id !== "string" || !/^[a-zA-Z0-9]{1,128}$/.test(id)) {
        throw new HttpsError("invalid-argument", "無効なIDです。");
      }
      const ref = col.doc(id);
      if (!(await ref.get()).exists) {
        throw new HttpsError("not-found", "項目が見つかりません。");
      }
      await ref.update({ ...entry, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid });
      return { id };
    }
    const ref = await col.add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });
    return { id: ref.id };
  }
);

/**
 * deleteCostEntry
 *
 * Owner-only. Deletes a manual cost entry.
 */
exports.deleteCostEntry = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    await requireOwner(request);
    const id = request.data?.id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9]{1,128}$/.test(id)) {
      throw new HttpsError("invalid-argument", "無効なIDです。");
    }
    await getFirestore().collection(COST_ENTRIES).doc(id).delete();
    return { success: true };
  }
);

{
  const booking = require("./booking");
  exports.publishClass = booking.publishClass;
  exports.bookClass = booking.bookClass;
  exports.cancelBooking = booking.cancelBooking;
  exports.setTicketPolicy = booking.setTicketPolicy;
  exports.grantMonthlyTicketsNow = booking.grantMonthlyTicketsNow;
  exports.grantMonthlyTickets = booking.grantMonthlyTickets;
  exports.adjustStudentTickets = booking.adjustStudentTickets;
  exports.adjustAllTickets = booking.adjustAllTickets;
}

{
  const school = require("./school");
  exports.ensureLinkCode = school.ensureLinkCode;
  exports.linkChild = school.linkChild;
  exports.setAttendance = school.setAttendance;
  exports.publishReport = school.publishReport;
  exports.publishHomework = school.publishHomework;
  exports.saveHomeworkPack = school.saveHomeworkPack;
  exports.listHomeworkLibrary = school.listHomeworkLibrary;
  exports.listSentHomework = school.listSentHomework;
  exports.listOwnerTeacherHomework = school.listOwnerTeacherHomework;
  exports.getSentHomeworkDetail = school.getSentHomeworkDetail;
  exports.assignHomeworkFromTemplate = school.assignHomeworkFromTemplate;
  exports.duplicateHomeworkPack = school.duplicateHomeworkPack;
  exports.deleteHomeworkPack = school.deleteHomeworkPack;
  exports.setHomeworkPublished = school.setHomeworkPublished;
  exports.updateHomeworkPackMeta = school.updateHomeworkPackMeta;
  exports.getHomeworkEditor = school.getHomeworkEditor;
  exports.submitHomework = school.submitHomework;
  exports.finishHomework = school.finishHomework;
  exports.createQuiz = school.createQuiz;
  exports.saveQuizTemplate = school.saveQuizTemplate;
  exports.deleteQuizTemplate = school.deleteQuizTemplate;
  exports.joinQuiz = school.joinQuiz;
  exports.lookupCollabRoom = school.lookupCollabRoom;
  exports.advanceQuiz = school.advanceQuiz;
  exports.syncQuizRoom = school.syncQuizRoom;
  exports.submitQuizAnswer = school.submitQuizAnswer;
  exports.markInboxRead = school.markInboxRead;
}

{
  const push = require("./push");
  exports.registerPushToken = push.registerPushToken;
}

{
  const collab = require("./collab");
  exports.createCollabTemplate = collab.createCollabTemplate;
  exports.saveCollabTemplate = collab.saveCollabTemplate;
  exports.publishCollabTemplate = collab.publishCollabTemplate;
  exports.unpublishCollabTemplate = collab.unpublishCollabTemplate;
  exports.duplicateCollabTemplate = collab.duplicateCollabTemplate;
  exports.deleteCollabTemplate = collab.deleteCollabTemplate;
  exports.setCollabOfficial = collab.setCollabOfficial;
  exports.toggleCollabFavorite = collab.toggleCollabFavorite;
  exports.startCollabRoom = collab.startCollabRoom;
  exports.saveCollabSession = collab.saveCollabSession;
  exports.seedOfficialCollabTemplates = collab.seedOfficialCollabTemplates;
}
