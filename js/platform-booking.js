import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const REGION = "https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net";

async function callFunction(name, data) {
  const user = getAuth().currentUser;
  if (!user) throw new Error("ログインが必要です。");
  const token = await user.getIdToken();
  const response = await fetch(`${REGION}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || "うまくいきませんでした。");
  }
  return body.result || body;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function renderPlatformPanel(root, action, role) {
  root.hidden = false;
  root.innerHTML = "<p>よみこみ中…</p>";
  const db = getFirestore();
  try {
    if (action === "tickets") {
      const uid = getAuth().currentUser.uid;
      const snap = await getDoc(doc(db, "ticketBalances", uid));
      const available = snap.exists() ? snap.data().available || 0 : 0;
      root.innerHTML = `<h2>チケット</h2><p class="hub-preparing">いま ${available} まい</p><p>毎月1日（日本時間）にふえます。使わなかった分は次の月までです。</p>`;
      return;
    }
    if (action === "ticket-settings" && role === "owner") {
      root.innerHTML = `
        <h2>チケット設定</h2>
        <label>毎月の枚数 <input id="ticket-count" type="number" min="0" max="12" value="2"></label>
        <label>くりこし（月） <input id="ticket-rollover" type="number" min="0" max="6" value="1"></label>
        <button type="button" id="ticket-save">保存する</button>
        <button type="button" id="ticket-grant">いま付与する</button>
        <p id="ticket-status"></p>`;
      root.querySelector("#ticket-save").onclick = async () => {
        const status = root.querySelector("#ticket-status");
        try {
          await callFunction("setTicketPolicy", {
            ticketsPerMonth: Number(root.querySelector("#ticket-count").value),
            rolloverMonths: Number(root.querySelector("#ticket-rollover").value),
          });
          status.textContent = "保存しました。";
        } catch (error) {
          status.textContent = error.message;
        }
      };
      root.querySelector("#ticket-grant").onclick = async () => {
        const status = root.querySelector("#ticket-status");
        try {
          await callFunction("grantMonthlyTicketsNow", {});
          status.textContent = "今月分を付与しました。";
        } catch (error) {
          status.textContent = error.message;
        }
      };
      return;
    }
    if (action === "publish-class") {
      root.innerHTML = `
        <h2>クラスを公開</h2>
        <input id="class-title" placeholder="タイトル" maxlength="80">
        <select id="class-game"><option value="minecraft">Minecraft</option><option value="roblox">Roblox</option></select>
        <select id="class-level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
        <label>開始 <input id="class-start" type="datetime-local"></label>
        <label>終了 <input id="class-end" type="datetime-local"></label>
        <label>毎週の回数 <input id="class-weeks" type="number" min="1" max="12" value="1"></label>
        <button type="button" id="class-publish">公開する</button>
        <p id="class-status"></p>
        <div id="class-list"></div>`;
      root.querySelector("#class-publish").onclick = async () => {
        const status = root.querySelector("#class-status");
        try {
          await callFunction("publishClass", {
            title: root.querySelector("#class-title").value,
            game: root.querySelector("#class-game").value,
            difficulty: root.querySelector("#class-level").value,
            startsAt: new Date(root.querySelector("#class-start").value).getTime(),
            endsAt: new Date(root.querySelector("#class-end").value).getTime(),
            capacity: 6,
            weeks: Number(root.querySelector("#class-weeks").value || 1),
          });
          status.textContent = "公開しました。";
          await paintClasses(root.querySelector("#class-list"), false);
        } catch (error) {
          status.textContent = error.message;
        }
      };
      await paintClasses(root.querySelector("#class-list"), false);
      return;
    }
    let childPicker = "";
    if (role === "parent") {
      const me = await getDoc(doc(db, "users", getAuth().currentUser.uid));
      const kids = me.data()?.linkedChildren || [];
      childPicker = `<label>子ども <select id="book-child">${kids.map((kid) => `<option value="${escapeHtml(kid.id)}">${escapeHtml(kid.name)}</option>`).join("")}</select></label>`;
    }
    root.innerHTML = `<h2>講座を予約</h2>${childPicker}<div id="class-list"></div>`;
    await paintClasses(root.querySelector("#class-list"), role !== "admin" && role !== "owner");
  } catch (error) {
    root.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function paintClasses(list, canBook) {
  const db = getFirestore();
  const snap = await getDocs(query(collection(db, "classes"), where("status", "==", "open")));
  if (snap.empty) {
    list.innerHTML = "<p>公開中のクラスはまだありません。</p>";
    return;
  }
  list.innerHTML = "";
  snap.forEach((item) => {
    const data = item.data();
    const seats = Math.max(0, Number(data.capacity || 6) - Number(data.bookedCount || 0));
    const when = data.startsAt?.toDate?.()?.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) || "";
    const row = document.createElement("article");
    row.innerHTML = `<h3>${escapeHtml(data.title)}</h3><p>${escapeHtml(data.game)} · ${escapeHtml(data.difficulty)} · ${escapeHtml(data.teacherName)}</p><p>${escapeHtml(when)} · 残り ${seats} 席</p>`;
    if (canBook) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "予約する";
      button.disabled = seats <= 0;
      button.onclick = async () => {
        try {
          const studentId = document.getElementById("book-child")?.value;
          await callFunction("bookClass", studentId ? { classId: item.id, studentId } : { classId: item.id });
          button.textContent = "予約しました";
          button.disabled = true;
        } catch (error) {
          button.textContent = error.message;
        }
      };
      row.appendChild(button);
    }
    list.appendChild(row);
  });
}
