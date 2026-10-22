import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

async function callFunction(name, data) {
  const user = getAuth().currentUser;
  const token = await user.getIdToken();
  const response = await fetch(`https://asia-northeast1-ai-sensei-8849b.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "うまくいきませんでした。");
  return body.result || body;
}

function pairsFrom(text) {
  const rows = text.split("\n").map((row) => row.trim()).filter(Boolean);
  const phrases = [];
  for (let i = 0; i + 1 < rows.length; i += 2) phrases.push({ en: rows[i], ja: rows[i + 1] });
  return phrases;
}

export async function renderSchoolPanel(root, action) {
  root.hidden = false;
  const db = getFirestore();
  const uid = getAuth().currentUser.uid;
  if (action === "family") {
    const result = await callFunction("ensureLinkCode", {});
    root.innerHTML = `<h2>かぞくコード</h2><p class="hub-preparing">${result.code}</p><p>保護者にこのコードを伝えてください。</p>`;
    return;
  }
  if (action === "children") {
    root.innerHTML = `<h2>子どもとつなぐ</h2><input id="link-code" placeholder="コード"><button type="button" id="link-go">つなぐ</button><p id="link-status"></p><div id="child-list"></div>`;
    const me = await getDoc(doc(db, "users", uid));
    const kids = me.data()?.linkedChildren || [];
    root.querySelector("#child-list").innerHTML = kids.map((kid) => `<p>${kid.name}</p>`).join("") || "<p>まだいません。</p>";
    root.querySelector("#link-go").onclick = async () => {
      try {
        await callFunction("linkChild", { code: root.querySelector("#link-code").value });
        root.querySelector("#link-status").textContent = "つながりました。";
      } catch (error) {
        root.querySelector("#link-status").textContent = error.message;
      }
    };
    return;
  }
  if (action === "inbox") {
    const snap = await getDocs(collection(db, "inbox", uid, "items"));
    root.innerHTML = `<h2>受信箱</h2>${snap.empty ? "<p>まだありません。</p>" : ""}`;
    snap.forEach((item) => {
      const data = item.data();
      root.insertAdjacentHTML("beforeend", `<article><h3>${data.title || ""}</h3><p>${data.body || ""}</p></article>`);
    });
    return;
  }
  if (action === "attendance" || action === "assign-homework") {
    const classes = await getDocs(query(collection(db, "classes"), where("teacherId", "==", uid)));
    const options = [...classes.docs].map((item) => `<option value="${item.id}">${item.data().title}</option>`).join("");
    root.innerHTML = `<h2>${action === "attendance" ? "出席" : "宿題とレポート"}</h2>
      <select id="class-id">${options}</select>
      <textarea id="present-ids" placeholder="出席した生徒ID。1行に1人"></textarea>
      <textarea id="summary" placeholder="クラスのまとめ"></textarea>
      <textarea id="phrases">apple\nりんご\nbook\nほん\ncat\nねこ</textarea>
      <button type="button" id="save-attendance">出席を保存</button>
      <button type="button" id="send-report">レポートを送る</button>
      <button type="button" id="send-homework">宿題にする</button>
      <p id="school-status"></p>`;
    const status = root.querySelector("#school-status");
    const classId = () => root.querySelector("#class-id").value;
    root.querySelector("#save-attendance").onclick = async () => {
      try {
        const presentIds = root.querySelector("#present-ids").value.split("\n").map((row) => row.trim()).filter(Boolean);
        await callFunction("setAttendance", { classId: classId(), presentIds });
        status.textContent = "保存しました。";
      } catch (error) { status.textContent = error.message; }
    };
    root.querySelector("#send-report").onclick = async () => {
      try {
        await callFunction("publishReport", { classId: classId(), summary: root.querySelector("#summary").value, phrases: pairsFrom(root.querySelector("#phrases").value) });
        status.textContent = "送りました。";
      } catch (error) { status.textContent = error.message; }
    };
    root.querySelector("#send-homework").onclick = async () => {
      try {
        await callFunction("publishHomework", { classId: classId(), title: "きょうのしゅくだい", phrases: pairsFrom(root.querySelector("#phrases").value) });
        status.textContent = "宿題を出しました。";
      } catch (error) { status.textContent = error.message; }
    };
    return;
  }
  if (action === "my-homework") {
    const snap = await getDocs(collection(db, "studentHomework", uid, "items"));
    root.innerHTML = `<h2>先生の宿題</h2><div id="hw-list"></div><div id="hw-play"></div><p><a href="page1.html">アクアリウムの宿題をはじめる</a></p>`;
    const list = root.querySelector("#hw-list");
    if (snap.empty) list.textContent = "まだありません。アクアリウムの宿題は上のボタンです。";
    snap.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.data().title || "宿題";
      button.onclick = () => playHomework(root.querySelector("#hw-play"), item.id);
      list.appendChild(button);
    });
    return;
  }
  root.innerHTML = `<h2>クイズ</h2>
    <input id="quiz-code" placeholder="参加コード">
    <button type="button" id="quiz-join">参加</button>
    <input id="quiz-prompt" placeholder="問題" value="cat は？">
    <input id="quiz-choices" placeholder="選択肢" value="ねこ, いぬ, さかな">
    <input id="quiz-answer" placeholder="正解" value="ねこ">
    <button type="button" id="quiz-host">ルームをひらく</button>
    <button type="button" id="quiz-next">つぎへ</button>
    <p id="quiz-status"></p><div id="quiz-board"></div>`;
  let roomId = "";
  const status = root.querySelector("#quiz-status");
  const board = root.querySelector("#quiz-board");
  const watch = (id) => onSnapshot(doc(db, "quizRooms", id), (snap) => {
    const data = snap.data() || {};
    const index = data.questionIndex ?? -1;
    const question = (data.questions || [])[index];
    board.innerHTML = "";
    if (!question) {
      board.textContent = data.status === "done" ? "おわり" : data.code ? `コード ${data.code}` : "";
      return;
    }
    board.insertAdjacentHTML("afterbegin", `<h3>${question.prompt}</h3>`);
    (question.choices || []).forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice;
      button.onclick = async () => {
        const result = await callFunction("submitQuizAnswer", { roomId: id, choice });
        status.textContent = result.correct ? "せいかい" : "ざんねん";
      };
      board.appendChild(button);
    });
  });
  root.querySelector("#quiz-host").onclick = async () => {
    try {
      const result = await callFunction("createQuiz", {
        title: "クラスクイズ",
        questions: [{
          prompt: root.querySelector("#quiz-prompt").value,
          choices: root.querySelector("#quiz-choices").value.split(",").map((row) => row.trim()),
          answer: root.querySelector("#quiz-answer").value,
        }],
      });
      roomId = result.id;
      status.textContent = `コード ${result.code}`;
      watch(roomId);
    } catch (error) { status.textContent = error.message; }
  };
  root.querySelector("#quiz-join").onclick = async () => {
    try {
      const result = await callFunction("joinQuiz", { code: root.querySelector("#quiz-code").value });
      roomId = result.id;
      watch(roomId);
    } catch (error) { status.textContent = error.message; }
  };
  root.querySelector("#quiz-next").onclick = async () => {
    try { await callFunction("advanceQuiz", { roomId }); }
    catch (error) { status.textContent = error.message; }
  };
}

async function playHomework(root, assignmentId) {
  const db = getFirestore();
  const snap = await getDoc(doc(db, "homeworkAssignments", assignmentId));
  const activities = snap.data()?.activities || [];
  const progress = await getDoc(doc(db, "homeworkProgress", `${assignmentId}_${getAuth().currentUser.uid}`));
  const done = new Set(progress.data()?.doneIds || []);
  const activity = activities.find((row) => !done.has(row.id));
  root.innerHTML = "";
  if (!activity) {
    root.textContent = "おわったよ";
    return;
  }
  root.insertAdjacentHTML("beforeend", `<h3>${activity.promptJa || ""}</h3>`);
  if (activity.speak && window.speechSynthesis) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "きく";
    button.onclick = () => {
      const utterance = new SpeechSynthesisUtterance(activity.speak);
      utterance.lang = "en-US";
      speechSynthesis.speak(utterance);
    };
    root.appendChild(button);
  }
  const choices = activity.choices || (activity.pairs || []).map((pair) => `${pair.en} = ${pair.ja}`);
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = typeof choice === "string" ? choice : choice;
    button.onclick = async () => {
      const answer = activity.pairs ? activity.pairs : (activity.tokens ? activity.tokens : choice);
      const result = await callFunction("submitHomework", { assignmentId, activityId: activity.id, answer });
      root.insertAdjacentHTML("beforeend", `<p>${result.correct ? "せいかい" : "もういちど"}</p>`);
      if (result.correct) playHomework(root, assignmentId);
    };
    root.appendChild(button);
  });
}
