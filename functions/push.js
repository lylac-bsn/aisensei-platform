const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { createHash } = require("crypto");

const REGION = "asia-northeast1";

function tokenId(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token) {
  return typeof token === "string" && token.length >= 20 && token.length <= 4096 && /^[\w\-:.]+$/.test(token);
}

exports.registerPushToken = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
  const token = String(request.data?.token || "");
  if (!validToken(token)) throw new HttpsError("invalid-argument", "通知トークンが正しくありません。");
  await getFirestore().collection("users").doc(request.auth.uid).collection("pushTokens").doc(tokenId(token)).set({
    token,
    platform: "ios",
    updatedAt: new Date(),
  });
  return { ok: true };
});

exports.pushTo = async function pushTo(userId, title, body) {
  const snap = await getFirestore().collection("users").doc(userId).collection("pushTokens").get();
  const docs = snap.docs.filter((doc) => validToken(doc.get("token")));
  if (!docs.length) return;
  let response;
  try {
    response = await getMessaging().sendEachForMulticast({
      tokens: docs.map((doc) => doc.get("token")),
      notification: {
        title: String(title || "ラーニー").slice(0, 120),
        body: String(body || "").slice(0, 300),
      },
      apns: {
        headers: { "apns-priority": "10", "apns-push-type": "alert" },
        payload: { aps: { sound: "default" } },
      },
    });
  } catch (error) {
    console.error("push failed", error?.code || error?.message || "unknown");
    return;
  }
  await Promise.all(response.responses.map((item, index) => {
    const code = item.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
      return docs[index].ref.delete();
    }
    if (item.error) console.error("push token error", code);
    return null;
  }));
};
