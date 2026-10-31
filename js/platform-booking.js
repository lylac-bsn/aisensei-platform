import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { confirmAction } from "./ui-confirm.js?v=20261031-hw-voicefix";

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
      await renderTicketDesk(root, db);
      return;
    }
    if (action === "publish-class") {
      let teacherField = "";
      if (role === "owner") {
        const users = await getDocs(collection(db, "users"));
        const teachers = users.docs
          .filter((item) => item.data().role === "admin" || item.data().role === "owner")
          .map((item) => ({ id: item.id, name: item.data().displayName || item.data().email || "先生" }))
          .sort((a, b) => a.name.localeCompare(b.name, "ja"));
        teacherField = `<label class="gc-span-2">担当の先生 <select id="class-teacher"><option value="">自分</option>${teachers.map((teacher) => `<option value="${escapeHtml(teacher.id)}">${escapeHtml(teacher.name)}</option>`).join("")}</select></label>`;
      }
      root.innerHTML = `
        <div class="gc-classes">
        <div class="gc-cal-bar">
          <div id="class-cal-nav-slot" class="gc-cal-nav-slot"></div>
          <div class="gc-cal-actions">
            <div class="gc-cal-search">
              <button type="button" class="gc-cal-icon" id="class-find-toggle" aria-label="クラスを検索" aria-expanded="false" aria-controls="class-find">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15.2 15.2 4.3 4.3"/></svg>
              </button>
              <label class="gc-find">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15.2 15.2 4.3 4.3"/></svg>
                <input id="class-find" placeholder="クラスを検索" autocomplete="off">
                <button type="button" id="class-find-clear" aria-label="検索をクリア" hidden>×</button>
              </label>
              <div id="class-find-results" class="gc-find-results" hidden></div>
            </div>
            <button type="button" class="gc-primary gc-add-class" id="open-class-form">＋ クラスを追加</button>
          </div>
        </div>
        <p id="class-status" class="gc-warn" hidden></p>
        <div id="class-list"></div>
        <dialog id="class-dialog" class="gc-modal">
          <form class="gc-form" id="class-form">
            <h2 class="gc-span-2">クラスを公開</h2>
            ${teacherField}
            <label class="gc-span-2">タイトル <input id="class-title" maxlength="80" required></label>
            <label>ゲーム <select id="class-game"><option value="minecraft">Minecraft</option><option value="roblox">Roblox</option></select></label>
            <label>レベル <select id="class-level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
            <div class="gc-span-2 gc-allday">
              <span id="class-all-day-label">終日</span>
              <button type="button" id="class-all-day" class="gc-switch" role="switch" aria-checked="false" aria-labelledby="class-all-day-label">
                <span class="gc-switch-knob" aria-hidden="true"></span>
                <span class="gc-switch-text">オフ</span>
              </button>
            </div>
            <label>開始日 <input id="class-start-date" type="date" required></label>
            <label>開始時刻 <input id="class-start-time" type="time" required></label>
            <label>終了日 <input id="class-end-date" type="date" required></label>
            <label>終了時刻 <input id="class-end-time" type="time" required></label>
            <label>リピート <select id="class-repeat">
              <option value="none">繰り返さない</option>
              <option value="daily">毎日</option>
              <option value="weekly">毎週</option>
              <option value="fortnightly">2週間ごと</option>
              <option value="monthly">毎月</option>
            </select></label>
            <label id="class-count-label" hidden>回数 <input id="class-count" type="number" min="2" max="12" value="4"></label>
            <div class="gc-span-2 gc-row">
              <button type="submit" class="gc-primary" id="class-publish">公開する</button>
              <button type="button" class="gc-secondary" id="close-class-form">閉じる</button>
            </div>
          </form>
        </dialog>
        </div>`;
      const repeatSelect = root.querySelector("#class-repeat");
      const countLabel = root.querySelector("#class-count-label");
      const syncRepeat = () => { countLabel.hidden = repeatSelect.value === "none"; };
      repeatSelect.onchange = syncRepeat;
      syncRepeat();
      const startDate = root.querySelector("#class-start-date");
      const endDate = root.querySelector("#class-end-date");
      const startTime = root.querySelector("#class-start-time");
      const endTime = root.querySelector("#class-end-time");
      startDate.addEventListener("change", () => {
        if (startDate.value) endDate.value = startDate.value;
      });
      startTime.addEventListener("change", () => {
        if (!startTime.value || endTime.value) return;
        const match = startTime.value.match(/^(\d{2}):(\d{2})/);
        if (!match) return;
        let hour = Number(match[1]) + 1;
        if (hour >= 24 && startDate.value) {
          hour -= 24;
          const [year, month, day] = startDate.value.split("-").map(Number);
          endDate.value = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
        }
        endTime.value = `${String(hour % 24).padStart(2, "0")}:${match[2]}`;
      });
      const syncAllDay = wireAllDayToggle(root);
      root.querySelector("#open-class-form").onclick = () => {
        const selected = root.querySelector("#class-list")?._selected;
        if (selected) {
          startDate.value = selected;
          endDate.value = selected;
        }
        root.querySelector("#class-dialog").showModal();
      };
      root.querySelector("#close-class-form").onclick = () => root.querySelector("#class-dialog").close();
      root.querySelector("#class-form").onsubmit = async (event) => {
        event.preventDefault();
        if (!event.target.reportValidity()) return;
        const status = root.querySelector("#class-status");
        try {
          const teacherId = root.querySelector("#class-teacher")?.value || "";
          const repeat = root.querySelector("#class-repeat").value;
          const { startsAt, endsAt } = publishTimes(root);
          if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
            status.hidden = false;
            status.textContent = "日付と時刻を選んでください。";
            return;
          }
          if (endsAt <= startsAt) {
            status.hidden = false;
            status.textContent = "終了は開始よりあとにしてください。";
            return;
          }
          await callFunction("publishClass", {
            title: root.querySelector("#class-title").value,
            game: root.querySelector("#class-game").value,
            difficulty: root.querySelector("#class-level").value,
            startsAt,
            endsAt,
            capacity: 6,
            repeat,
            count: repeat === "none" ? 1 : Number(root.querySelector("#class-count").value || 4),
            ...(teacherId ? { teacherId } : {}),
          });
          status.hidden = true;
          status.textContent = "";
          event.target.reset();
          root.querySelector("#class-all-day").setAttribute("aria-checked", "false");
          syncAllDay();
          syncRepeat();
          root.querySelector("#class-dialog")?.close();
          await paintClasses(root.querySelector("#class-list"), false);
        } catch (error) {
          status.hidden = false;
          status.textContent = error.message;
        }
      };
      wireClassSearch(root);
      const list = root.querySelector("#class-list");
      list._role = role;
      list._uid = getAuth().currentUser?.uid || "";
      await paintClasses(list, false);
      return;
    }
    let childPicker = "";
    let canBook = role !== "admin" && role !== "owner";
    if (role === "parent") {
      const kids = await linkedChildrenForBooking(db, getAuth().currentUser.uid);
      if (!kids.length) {
        root.innerHTML = `<h2>講座を予約</h2><p class="gc-muted">子どもをリンクすると、代わりに講座を予約できます。</p>`;
        return;
      }
      childPicker = `<label>子ども <select id="book-child">${kids.map((kid) => `<option value="${escapeHtml(kid.id)}">${escapeHtml(kid.name)}</option>`).join("")}</select></label>`;
    }
    root.innerHTML = `<h2>講座を予約</h2>${childPicker}<div id="class-list" class="hub-stack"></div>`;
    const list = root.querySelector("#class-list");
    list._role = role;
    list._uid = getAuth().currentUser?.uid || "";
    await paintClasses(list, canBook);
    const childSelect = root.querySelector("#book-child");
    if (childSelect) childSelect.onchange = () => paintClasses(list, canBook);
  } catch (error) {
    root.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

const ROLE_LABEL = { user: "生徒", student: "生徒", parent: "保護者", admin: "先生", owner: "オーナー" };

function roleLabel(role) {
  return ROLE_LABEL[role] || "生徒";
}

function whenLabel(ms) {
  if (!ms || ms > Date.parse("2090-01-01")) return "期限なし";
  return new Date(ms).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

async function renderTicketDesk(root, db) {
  root.innerHTML = `<p class="gc-muted">読み込んでいます…</p>`;
  const policy = await getDoc(doc(db, "settings", "ticketPolicy"));
  let perMonth = policy.data()?.ticketsPerMonth ?? 2;
  const rollover = policy.data()?.rolloverMonths ?? 1;
  const people = await loadPeople(db);
  let selected = people[0]?.id || "";
  let queryText = "";
  let notice = "";
  let noticeKind = "";
  let globalNote = "";
  let globalKind = "";
  let ticketTab = "students";
  let monthValue = perMonth;
  let rolloverValue = rollover;
  let busy = false;

  const draw = () => {
    const countInput = root.querySelector("#ticket-count");
    const rollInput = root.querySelector("#ticket-rollover");
    if (countInput) monthValue = countInput.value;
    if (rollInput) rolloverValue = rollInput.value;
    const shown = people.filter((person) => {
      const hay = `${person.name} ${person.email} ${roleLabel(person.role)}`.toLowerCase();
      return hay.includes(queryText.trim().toLowerCase());
    });
    const person = people.find((item) => item.id === selected);
    root.innerHTML = `
      <div class="gc-ticket">
      <div class="gc-seg-tabs" role="tablist">
        <button type="button" data-tab="students" class="${ticketTab === "students" ? "is-on" : ""}" role="tab" aria-selected="${ticketTab === "students"}">生徒の残数</button>
        <button type="button" data-tab="global" class="${ticketTab === "global" ? "is-on" : ""}" role="tab" aria-selected="${ticketTab === "global"}">全体の設定</button>
      </div>
      <div ${ticketTab === "global" ? "" : "hidden"}>
        <section class="gc-panel gc-ticket-global">
          <h2>全体の設定</h2>
          <p>毎月1日に、生徒へ自動で渡す枚数です。個人の毎月設定がある生徒は、その枚数が優先されます。</p>
          <div class="gc-ticket-fields">
            <label>毎月の枚数 <input id="ticket-count" type="number" min="0" max="99" value="${escapeHtml(monthValue)}"></label>
            <label>くりこし（月） <input id="ticket-rollover" type="number" min="0" max="36" value="${escapeHtml(rolloverValue)}"></label>
          </div>
          <div class="gc-row">
            <button type="button" class="gc-primary" id="ticket-save">設定を保存</button>
            <button type="button" class="gc-secondary" id="ticket-grant">今月分を全員に渡す</button>
          </div>
          <section class="gc-ticket-bulk">
            <h3>全員の残数</h3>
            <p>生徒全員の、いま使える枚数をまとめて変更するか、消します。毎月の自動付与とは別です。変更した枚数の期限は、くりこしの月数に従います。</p>
            <div class="gc-row">
              <label>枚数 <input id="ticket-bulk-count" type="number" min="0" max="500" value="0"></label>
              <button type="button" class="gc-secondary" id="ticket-bulk-set">全員の残数を変更</button>
              <button type="button" class="gc-danger" id="ticket-bulk-clear">全員のチケットを消す</button>
            </div>
          </section>
          <p id="ticket-status" class="gc-save-note${globalKind ? ` is-${globalKind}` : ""}">${escapeHtml(globalNote)}</p>
        </section>
      </div>
      <div class="gc-ticket-desk" ${ticketTab === "students" ? "" : "hidden"}>
        <section class="gc-panel gc-ticket-list">
          <input id="ticket-find" class="gc-search" type="search" placeholder="名前かメールで探す" value="${escapeHtml(queryText)}" autocomplete="off">
          <div class="ticket-people">${shown.map((item) => `
            <button type="button" class="gc-person${item.id === selected ? " is-on" : ""}" data-person="${escapeHtml(item.id)}">
              <span class="gc-avatar">${escapeHtml((item.name || "?").slice(0, 1))}</span>
              <span><strong>${escapeHtml(item.name || "名前なし")}</strong><small>${escapeHtml(roleLabel(item.role))}</small></span>
              <span class="gc-balance">${item.available}</span>
            </button>`).join("") || "<p class=\"gc-muted\">該当するアカウントはありません。</p>"}</div>
        </section>
        ${person ? personEditor(person, notice, noticeKind, perMonth) : "<section class=\"gc-panel\"><p>生徒を選んでください。</p></section>"}
      </div>
      </div>`;
    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.onclick = () => {
        ticketTab = button.dataset.tab;
        draw();
      };
    });
    root.querySelector("#ticket-find")?.addEventListener("input", (event) => {
      queryText = event.target.value;
      draw();
      root.querySelector("#ticket-find").focus();
    });
    root.querySelectorAll("[data-person]").forEach((button) => {
      button.onclick = () => {
        if (selected === button.dataset.person) return;
        selected = button.dataset.person;
        notice = "";
        noticeKind = "";
        draw();
      };
    });
    const savePolicy = root.querySelector("#ticket-save");
    if (savePolicy) savePolicy.onclick = async () => {
      if (busy) return;
      busy = true;
      savePolicy.disabled = true;
      const status = root.querySelector("#ticket-status");
      status.className = "gc-save-note";
      status.textContent = "保存しています…";
      try {
        const saved = await callFunction("setTicketPolicy", {
          ticketsPerMonth: Number(root.querySelector("#ticket-count").value),
          rolloverMonths: Number(root.querySelector("#ticket-rollover").value),
        });
        monthValue = saved.ticketsPerMonth;
        rolloverValue = saved.rolloverMonths;
        perMonth = saved.ticketsPerMonth;
        globalNote = "全体の設定を保存しました。";
        globalKind = "ok";
        draw();
      } catch (error) {
        status.className = "gc-save-note is-error";
        status.textContent = error.message;
        savePolicy.disabled = false;
      } finally {
        busy = false;
      }
    };
    const grantAll = root.querySelector("#ticket-grant");
    if (grantAll) grantAll.onclick = async () => {
      if (busy) return;
      const count = root.querySelector("#ticket-count").value;
      const ok = await confirmAction({
        title: "今月分を渡しますか？",
        message: `生徒全員に今月分を渡します。基本は1人 ${count} まいで、個人の毎月設定がある生徒はその枚数です。\n今月すでに渡した生徒には重複しません。自動では取り消せません。`,
        confirmLabel: "渡す",
        cancelLabel: "やめる",
      });
      if (!ok) return;
      busy = true;
      grantAll.disabled = true;
      const status = root.querySelector("#ticket-status");
      status.className = "gc-save-note";
      status.textContent = "渡しています…";
      try {
        const result = await callFunction("grantMonthlyTicketsNow", {});
        globalNote = `${result.granted || 0} 人に今月分を渡しました。`;
        globalKind = "ok";
        const fresh = await loadPeople(db);
        people.splice(0, people.length, ...fresh);
        draw();
      } catch (error) {
        status.className = "gc-save-note is-error";
        status.textContent = error.message;
        grantAll.disabled = false;
      } finally {
        busy = false;
      }
    };
    const refreshPeople = async () => {
      const fresh = await loadPeople(db);
      people.splice(0, people.length, ...fresh);
    };
    const runBulk = (action) => async () => {
      if (busy) return;
      const count = Math.max(0, Math.round(Number(root.querySelector("#ticket-bulk-count")?.value) || 0));
      const message = action === "clear" || count === 0
        ? "生徒全員のチケットを消します。元に戻すには、もう一度枚数を追加してください。"
        : `生徒全員の残数を ${count} 枚に変更します。いま持っているチケットは、この枚数に置き換わります。`;
      if (!await confirmAction({
        title: "チケットを更新しますか？",
        message,
        confirmLabel: "更新する",
        cancelLabel: "やめる",
        danger: true,
      })) return;
      busy = true;
      const status = root.querySelector("#ticket-status");
      root.querySelectorAll("#ticket-bulk-set, #ticket-bulk-clear").forEach((button) => { button.disabled = true; });
      status.className = "gc-save-note";
      status.textContent = "更新しています…";
      try {
        const result = await callFunction("adjustAllTickets", { action: count === 0 ? "clear" : action, count });
        globalNote = action === "clear" || count === 0
          ? `${result.updated || 0}人のチケットを消しました。`
          : `${result.updated || 0}人の残数を${result.count}枚に変更しました。`;
        globalKind = "ok";
        await refreshPeople();
        draw();
      } catch (error) {
        status.className = "gc-save-note is-error";
        status.textContent = error.message;
        root.querySelectorAll("#ticket-bulk-set, #ticket-bulk-clear").forEach((button) => { button.disabled = false; });
      } finally {
        busy = false;
      }
    };
    const bulkSet = root.querySelector("#ticket-bulk-set");
    const bulkClear = root.querySelector("#ticket-bulk-clear");
    if (bulkSet) bulkSet.onclick = runBulk("set");
    if (bulkClear) bulkClear.onclick = runBulk("clear");
    if (!person || ticketTab !== "students") return;
    const run = (action, extra = {}) => async () => {
      if (busy) return;
      busy = true;
      const status = root.querySelector("#person-status");
      const dialogError = root.querySelector("#gift-error");
      const buttons = root.querySelectorAll("#gift-add, #gift-set, #gift-clear, #gift-override, #gift-override-clear, #gift-dialog-save, [data-lot]");
      buttons.forEach((button) => { button.disabled = true; });
      if (status) {
        status.className = "gc-save-note";
        status.textContent = "更新しています…";
      }
      const noExpiry = root.querySelector("#gift-none")?.checked;
      const day = root.querySelector("#gift-until")?.value;
      const count = extra.count === undefined ? Number(root.querySelector("#gift-count")?.value) : extra.count;
      const note = root.querySelector("#gift-note")?.value || "";
      try {
        const result = await callFunction("adjustStudentTickets", {
          studentId: person.id,
          action,
          count,
          note,
          noExpiry,
          expiresAt: day ? new Date(`${day}T23:59:59+09:00`).getTime() : null,
          lotId: extra.lotId,
        });
        person.available = result.available;
        person.monthlyOverride = result.monthlyOverride;
        person.lots = result.lots || [];
        notice = {
          add: "チケットを追加しました。",
          set: "残数を変更しました。",
          clear: "チケットを消しました。",
          remove: "この分を消しました。",
          override: extra.count == null ? "全体の設定に戻しました。" : "毎月の枚数を保存しました。",
        }[action] || "更新しました。";
        noticeKind = "ok";
        draw();
      } catch (error) {
        if (status) {
          status.className = "gc-save-note is-error";
          status.textContent = error.message;
        }
        if (dialogError) dialogError.textContent = error.message;
        buttons.forEach((button) => { button.disabled = false; });
      } finally {
        busy = false;
      }
    };
    const giftDialog = root.querySelector("#gift-dialog");
    const openGift = (action) => {
      root.querySelector("#gift-dialog").dataset.action = action;
      root.querySelector("#gift-dialog-title").textContent = action === "set" ? "残数を調整" : "チケットを追加";
      root.querySelector("#gift-dialog-save").textContent = action === "set" ? "残数を変更" : "追加する";
      root.querySelector("#gift-error").textContent = "";
      giftDialog.showModal();
    };
    root.querySelector("#gift-add").onclick = () => openGift("add");
    root.querySelector("#gift-set").onclick = () => openGift("set");
    root.querySelector("#gift-dialog-save").onclick = () => run(giftDialog.dataset.action || "add")();
    root.querySelector("#gift-dialog-cancel").onclick = () => giftDialog.close();
    const moreMenu = root.querySelector("#gift-menu");
    root.querySelector("#gift-more").onclick = (event) => {
      event.stopPropagation();
      moreMenu.hidden = !moreMenu.hidden;
    };
    root.onclick = (event) => {
      if (moreMenu && !moreMenu.hidden && !event.target.closest(".gc-more")) moreMenu.hidden = true;
    };
    root.querySelector("#gift-clear").onclick = async () => {
      moreMenu.hidden = true;
      if (await confirmAction({
        title: "チケットをすべて消しますか？",
        message: `${person.name || "このアカウント"} のチケットをすべて消します。元に戻すには、もう一度枚数を追加してください。`,
        confirmLabel: "消す",
        cancelLabel: "やめる",
        danger: true,
      })) run("clear")();
    };
    root.querySelector("#gift-override").onclick = () => {
      const raw = root.querySelector("#gift-month").value;
      return run("override", { count: raw === "" ? null : Number(raw) })();
    };
    root.querySelector("#gift-override-clear").onclick = run("override", { count: null });
    root.querySelectorAll("[data-lot]").forEach((button) => {
      button.onclick = async () => {
        if (await confirmAction({
          title: "この分のチケットを消しますか？",
          message: "この操作はあとから取り消せません。",
          confirmLabel: "消す",
          cancelLabel: "やめる",
          danger: true,
        })) run("remove", { lotId: button.dataset.lot })();
      };
    });
  };
  draw();
}

function personEditor(person, notice, noticeKind, perMonth) {
  const override = person.monthlyOverride == null ? "" : person.monthlyOverride;
  const current = person.monthlyOverride == null
    ? `全体と同じ（毎月 ${perMonth} 枚）`
    : `この生徒は毎月 ${person.monthlyOverride} 枚`;
  const lots = person.lots.length
    ? `<ul class="gc-lots">${person.lots.map((lot) => `<li><span><strong>${lot.remaining}枚</strong><small>${escapeHtml(whenLabel(lot.expiresAt))}${lot.note ? ` · ${escapeHtml(lot.note)}` : ""}</small></span><button type="button" class="gc-text-btn" data-lot="${escapeHtml(lot.id)}">消す</button></li>`).join("")}</ul>`
    : `<p class="gc-muted">割り当てられたチケットはありません。</p>`;
  return `
    <section class="gc-panel gc-ticket-detail">
      <div class="gc-ticket-who">
        <span class="gc-avatar">${escapeHtml((person.name || "?").slice(0, 1))}</span>
        <div>
          <h2>${escapeHtml(person.name || "名前なし")}</h2>
          <p>${escapeHtml([person.email, roleLabel(person.role)].filter(Boolean).join(" · "))}</p>
        </div>
      </div>
      <div class="gc-ticket-balance">
        <p class="gc-kicker">使えるチケット</p>
        <p class="gc-ticket-count"><strong>${person.available}</strong><span>枚</span></p>
      </div>
      <div class="gc-ticket-lots">
        <p class="gc-kicker">内訳</p>
        ${lots}
      </div>
      <div class="gc-ticket-actions">
        <button type="button" class="gc-primary" id="gift-add">チケットを追加</button>
        <button type="button" class="gc-secondary" id="gift-set">残数を調整</button>
        <div class="gc-more">
          <button type="button" class="gc-text-btn" id="gift-more" aria-label="その他の操作">⋯</button>
          <div id="gift-menu" class="gc-more-menu" hidden>
            <button type="button" id="gift-clear">すべて消す</button>
          </div>
        </div>
      </div>
      <section class="gc-ticket-month">
        <h3>毎月のチケット設定</h3>
        <p>空欄のときは全体の毎月 ${perMonth} 枚が使われます。数字を入れると、この生徒だけその枚数が優先されます。</p>
        <p class="gc-ticket-now">いまの設定：${escapeHtml(current)}</p>
        <label>毎月の枚数 <input id="gift-month" type="number" min="0" max="99" value="${override}" placeholder="空欄なら全体と同じ"></label>
        <div class="gc-row">
          <button type="button" class="gc-secondary" id="gift-override">毎月の枚数を保存</button>
          <button type="button" class="gc-text-btn" id="gift-override-clear">全体と同じに戻す</button>
        </div>
      </section>
      <p id="person-status" class="gc-save-note${noticeKind ? ` is-${noticeKind}` : ""}">${escapeHtml(notice || "")}</p>
      <dialog id="gift-dialog" class="gc-modal">
        <form class="gc-stack" onsubmit="return false">
          <h2 id="gift-dialog-title">チケットを追加</h2>
          <label>枚数 <input id="gift-count" type="number" min="0" max="500" value="1"></label>
          <label>期限 <input id="gift-until" type="date"></label>
          <label class="gc-choice"><input id="gift-none" type="checkbox"> 期限なし</label>
          <label>メモ <input id="gift-note" maxlength="80" placeholder="例: 体験、補填"></label>
          <p id="gift-error" class="gc-warn"></p>
          <div class="gc-row">
            <button type="button" class="gc-primary" id="gift-dialog-save">追加する</button>
            <button type="button" class="gc-secondary" id="gift-dialog-cancel">キャンセル</button>
          </div>
        </form>
      </dialog>
    </section>`;
}

async function loadPeople(db) {
  const [users, balances] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "ticketBalances")),
  ]);
  const byId = new Map();
  balances.forEach((item) => byId.set(item.id, item.data()));
  return users.docs.map((item) => {
    const data = item.data();
    const balance = byId.get(item.id) || {};
    const lots = Array.isArray(balance.lots) ? balance.lots : [];
    return {
      id: item.id,
      name: data.displayName || "",
      email: data.email || "",
      role: data.role || "",
      available: Number(balance.available || 0),
      monthlyOverride: balance.monthlyOverride ?? null,
      lots: lots.filter((lot) => Number(lot.remaining) > 0).map((lot) => ({
        id: lot.id,
        remaining: Number(lot.remaining || 0),
        expiresAt: lot.expiresAt?.toMillis?.() || 0,
        note: lot.note || "",
      })),
    };
  }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "ja"));
}

function classTimestamp(dateText, timeText) {
  const date = String(dateText || "").trim().replace(/[./]/g, "-");
  const time = String(timeText || "").trim();
  const dateMatch = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!dateMatch || !timeMatch) return NaN;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return NaN;
  const pad = (value) => String(value).padStart(2, "0");
  const parsed = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return NaN;
  const parts = jstParts(parsed);
  if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day) return NaN;
  return parsed.getTime();
}

function jstParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function jstKey(date) {
  const parts = jstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function wireAllDayToggle(root) {
  const button = root.querySelector("#class-all-day");
  const startTime = root.querySelector("#class-start-time");
  const endTime = root.querySelector("#class-end-time");
  const sync = () => {
    const on = button.getAttribute("aria-checked") === "true";
    startTime.closest("label").hidden = on;
    endTime.closest("label").hidden = on;
    startTime.required = !on;
    endTime.required = !on;
    button.classList.toggle("is-on", on);
    const text = button.querySelector(".gc-switch-text");
    if (text) text.textContent = on ? "オン" : "オフ";
  };
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") === "true";
    button.setAttribute("aria-checked", on ? "false" : "true");
    sync();
  });
  sync();
  return sync;
}

function publishTimes(root) {
  const allDay = root.querySelector("#class-all-day").getAttribute("aria-checked") === "true";
  const startDate = root.querySelector("#class-start-date").value;
  const endDate = root.querySelector("#class-end-date").value;
  return {
    allDay,
    startsAt: classTimestamp(startDate, allDay ? "00:00" : root.querySelector("#class-start-time").value),
    endsAt: classTimestamp(endDate, allDay ? "23:59" : root.querySelector("#class-end-time").value),
  };
}

function shiftDateKey(key, days) {
  const match = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return key;
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function inclusiveEndKey(item) {
  const startKey = jstKey(item.startsAt);
  if (!item.endsAt) return startKey;
  const endKey = jstKey(item.endsAt);
  if (item.endsAt.getTime() === classTimestamp(endKey, "00:00")) {
    const prev = shiftDateKey(endKey, -1);
    return prev < startKey ? startKey : prev;
  }
  return endKey < startKey ? startKey : endKey;
}

function coversDay(item, key) {
  if (!item.startsAt) return false;
  const startKey = jstKey(item.startsAt);
  return key >= startKey && key <= inclusiveEndKey(item);
}

function isAllDayClass(item) {
  if (!item.startsAt || !item.endsAt) return false;
  const startKey = jstKey(item.startsAt);
  const endKey = jstKey(item.endsAt);
  return item.startsAt.getTime() === classTimestamp(startKey, "00:00")
    && item.endsAt.getTime() === classTimestamp(endKey, "23:59");
}

function clockLabel(date) {
  const parts = jstParts(date);
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${hour}:${parts.minute}`;
}

function dayTimeLabel(item, key) {
  if (isAllDayClass(item)) return "終日";
  const startKey = jstKey(item.startsAt);
  const endKey = inclusiveEndKey(item);
  const startClock = clockLabel(item.startsAt);
  const endClock = item.endsAt ? clockLabel(item.endsAt) : "";
  if (startKey === endKey) return endClock ? `${startClock}–${endClock}` : startClock;
  if (key === startKey) return `${startClock}–`;
  if (key === endKey && endClock) return `–${endClock}`;
  return "終日";
}

function assignLanes(events) {
  const sorted = [...events].sort((a, b) => (
    a.startKey.localeCompare(b.startKey)
    || a.endKey.localeCompare(b.endKey)
    || String(a.item.title).localeCompare(String(b.item.title), "ja")
  ));
  const laneEnds = [];
  sorted.forEach((event) => {
    let lane = laneEnds.findIndex((endKey) => endKey < event.startKey);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(event.endKey);
    } else {
      laneEnds[lane] = event.endKey;
    }
    event.lane = lane;
  });
}

function monthCells(year, monthNumber) {
  const first = new Date(`${year}-${pad2(monthNumber)}-01T12:00:00+09:00`);
  const lead = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(jstParts(first).weekday);
  const count = daysInMonth(year, monthNumber);
  const total = Math.ceil((lead + count) / 7) * 7;
  const cells = [];
  for (let cell = 0; cell < total; cell += 1) {
    const dayNumber = cell - lead + 1;
    const inMonth = dayNumber >= 1 && dayNumber <= count;
    const shown = inMonth ? dayNumber : new Date(Date.UTC(year, monthNumber - 1, dayNumber)).getUTCDate();
    const key = inMonth
      ? `${year}-${pad2(monthNumber)}-${pad2(dayNumber)}`
      : jstKey(new Date(`${year}-${pad2(monthNumber)}-01T12:00:00+09:00`).getTime() + (dayNumber - 1) * 86400000);
    cells.push({ key, shown, inMonth });
  }
  return cells;
}

function calendarHost(list) {
  return list.closest("#hub-panel-platform") || list.parentElement;
}

function publishDialog(list) {
  return calendarHost(list)?.querySelector("#class-dialog") || null;
}

function classMatchesQuery(item, queryText) {
  if (!queryText) return true;
  const hay = `${item.title} ${item.teacherName} ${item.game} ${item.difficulty}`.toLowerCase();
  return hay.includes(queryText);
}

function wireClassSearch(root) {
  const input = root.querySelector("#class-find");
  const toggle = root.querySelector("#class-find-toggle");
  const clear = root.querySelector("#class-find-clear");
  const results = root.querySelector("#class-find-results");
  const search = input.closest(".gc-cal-search");
  const list = () => root.querySelector("#class-list");
  let timer = 0;
  const setOpen = (open) => {
    search.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) input.focus();
  };
  const hideResults = () => { results.hidden = true; results.replaceChildren(); };
  const showResults = () => {
    const queryText = input.value.trim().toLowerCase();
    clear.hidden = !input.value;
    results.replaceChildren();
    if (!queryText) {
      results.hidden = true;
      return;
    }
    const matches = (list()?._classes || []).filter((item) => item.startsAt && classMatchesQuery(item, queryText)).slice(0, 8);
    results.hidden = false;
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.textContent = "該当するクラスはありません。";
      results.appendChild(empty);
      return;
    }
    matches.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      const when = isAllDayClass(item) ? "終日" : clockLabel(item.startsAt);
      const parts = jstParts(item.startsAt);
      button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${Number(parts.month)}月${Number(parts.day)}日 ${when}</span>`;
      button.addEventListener("click", () => {
        const target = list();
        if (!target) return;
        const key = jstKey(item.startsAt);
        target._month = { year: Number(parts.year), month: Number(parts.month) };
        target._anchor = key;
        target._selected = key;
        hideResults();
        drawClassCalendar(target);
        openDayPanel(target, key);
      });
      results.appendChild(button);
    });
  };
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(showResults, 180);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    input.value = "";
    clear.hidden = true;
    hideResults();
    if (search.classList.contains("is-open")) setOpen(false);
  });
  clear.addEventListener("click", () => {
    input.value = "";
    clear.hidden = true;
    hideResults();
    input.focus();
  });
  toggle.addEventListener("click", () => setOpen(!search.classList.contains("is-open")));
  document.addEventListener("click", (event) => {
    if (!search.contains(event.target)) hideResults();
  });
}

function calendarArrow(label, path) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-cal-arrow";
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
  return button;
}

function shiftCalendar(list, direction) {
  if ((list._view || "month") === "week") {
    list._anchor = shiftDateKey(list._anchor || jstKey(new Date()), direction * 7);
  } else {
    let year = list._month.year;
    let month = list._month.month + direction;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    list._month = { year, month };
  }
  drawClassCalendar(list);
}

function focusToday(list) {
  const now = new Date();
  const parts = jstParts(now);
  const key = jstKey(now);
  list._month = { year: Number(parts.year), month: Number(parts.month) };
  list._anchor = key;
  list._selected = key;
  drawClassCalendar(list);
}

function weekCells(anchorKey) {
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(jstParts(new Date(`${anchorKey}T12:00:00+09:00`)).weekday);
  const start = shiftDateKey(anchorKey, -weekday);
  return Array.from({ length: 7 }, (_, index) => {
    const key = shiftDateKey(start, index);
    return { key, shown: Number(key.slice(8)), inMonth: true };
  });
}

function rangeTitle(cells) {
  const first = jstParts(new Date(`${cells[0].key}T12:00:00+09:00`));
  const last = jstParts(new Date(`${cells[6].key}T12:00:00+09:00`));
  if (first.year === last.year && first.month === last.month) {
    return `${Number(first.year)}年${Number(first.month)}月${Number(first.day)}日–${Number(last.day)}日`;
  }
  return `${Number(first.month)}月${Number(first.day)}日–${Number(last.month)}月${Number(last.day)}日`;
}

function mountMonthPicker(title, list) {
  const picker = document.createElement("div");
  picker.className = "gc-month-picker";
  picker.hidden = true;
  let year = (list._view || "month") === "week"
    ? Number(jstParts(new Date(`${(list._anchor || jstKey(new Date()))}T12:00:00+09:00`)).year)
    : list._month.year;
  const paint = () => {
    picker.replaceChildren();
    const years = document.createElement("div");
    years.className = "gc-picker-year";
    const prev = calendarArrow("前年", "M14.5 6.5 9 12l5.5 5.5");
    const next = calendarArrow("次年", "m9.5 6.5 5.5 5.5-5.5 5.5");
    const label = document.createElement("strong");
    label.textContent = `${year}年`;
    prev.onclick = (event) => { event.stopPropagation(); year -= 1; paint(); };
    next.onclick = (event) => { event.stopPropagation(); year += 1; paint(); };
    years.append(prev, label, next);
    const months = document.createElement("div");
    months.className = "gc-picker-months";
    for (let month = 1; month <= 12; month += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${month}月`;
      if (list._view !== "week" && year === list._month.year && month === list._month.month) button.className = "is-on";
      button.onclick = () => {
        list._view = "month";
        list._month = { year, month };
        list._anchor = `${year}-${pad2(month)}-01`;
        picker.hidden = true;
        drawClassCalendar(list);
      };
      months.appendChild(button);
    }
    picker.append(years, months);
  };
  title.addEventListener("click", (event) => {
    event.stopPropagation();
    picker.hidden = !picker.hidden;
    if (!picker.hidden) paint();
  });
  if (list._closePicker) document.removeEventListener("click", list._closePicker);
  list._closePicker = (event) => {
    if (!picker.hidden && !picker.contains(event.target) && event.target !== title) picker.hidden = true;
  };
  document.addEventListener("click", list._closePicker);
  title.after(picker);
}

function eventChip(list, item, key) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-event";
  const when = isAllDayClass(item) ? "終日" : clockLabel(item.startsAt);
  button.textContent = `${when} ${item.title}`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    list._selected = key;
    openDayPanel(list, key);
  });
  return button;
}

function moveCalendarFocus(list, event) {
  const day = event.target.closest?.(".gc-day");
  if (!day) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    list._selected = day.dataset.date;
    openDayPanel(list, day.dataset.date);
    return;
  }
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (!delta) return;
  event.preventDefault();
  const key = shiftDateKey(day.dataset.date, delta);
  const [year, month] = key.split("-").map(Number);
  list._selected = key;
  list._anchor = key;
  if ((list._view || "month") !== "week" && (year !== list._month.year || month !== list._month.month)) {
    list._month = { year, month };
  }
  drawClassCalendar(list);
  list.querySelector(`.gc-day[data-date="${key}"]`)?.focus();
}

function buildCalendarNav(list) {
  const view = list._view || "month";
  const nav = document.createElement("div");
  nav.className = "gc-cal-nav";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "gc-cal-title";
  const cells = view === "week" ? weekCells(list._anchor || jstKey(new Date())) : null;
  title.textContent = view === "week" ? rangeTitle(cells) : `${list._month.year}年${list._month.month}月`;
  const prev = calendarArrow(view === "week" ? "前の週" : "前の月", "M14.5 6.5 9 12l5.5 5.5");
  const next = calendarArrow(view === "week" ? "次の週" : "次の月", "m9.5 6.5 5.5 5.5-5.5 5.5");
  prev.onclick = () => shiftCalendar(list, -1);
  next.onclick = () => shiftCalendar(list, 1);
  const today = document.createElement("button");
  today.type = "button";
  today.className = "gc-today";
  today.textContent = "今日";
  today.onclick = () => focusToday(list);
  const views = document.createElement("div");
  views.className = "gc-view";
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", "表示");
  [["month", "月"], ["week", "週"]].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = view === value ? "is-on" : "";
    button.onclick = () => {
      list._view = value;
      if (!list._anchor) list._anchor = list._selected || jstKey(new Date());
      drawClassCalendar(list);
    };
    views.appendChild(button);
  });
  nav.append(title, prev, next, today, views);
  mountMonthPicker(title, list);
  return { nav, cells };
}

function drawClassCalendar(list) {
  const focus = sessionStorage.getItem("gc-focus-day");
  if (focus) {
    sessionStorage.removeItem("gc-focus-day");
    const [focusYear, focusMonth] = focus.split("-").map(Number);
    if (focusYear && focusMonth) list._month = { year: focusYear, month: focusMonth };
    list._anchor = focus;
    list._selected = focus;
    list._pendingDay = focus;
  }
  const classes = list._classes || [];
  const booked = list._booked || new Set();
  const canBook = list._canBook;
  if (!list._anchor) list._anchor = list._selected || jstKey(new Date());
  const month = list._month;
  const year = month.year;
  const monthNumber = month.month;
  const todayKey = jstKey(new Date());
  const visible = classes;
  const view = list._view || "month";
  const built = buildCalendarNav(list);
  const cells = view === "week" ? built.cells : monthCells(year, monthNumber);
  const multi = [];
  const singleByDay = new Map();
  visible.forEach((item) => {
    if (!item.startsAt) return;
    const startKey = jstKey(item.startsAt);
    const endKey = inclusiveEndKey(item);
    if (endKey > startKey) multi.push({ item, startKey, endKey, titled: false });
    else {
      if (!singleByDay.has(startKey)) singleByDay.set(startKey, []);
      singleByDay.get(startKey).push(item);
    }
  });
  assignLanes(multi);
  list.innerHTML = "";
  const nav = built.nav;
  const head = document.createElement("div");
  head.className = "gc-cal-head";
  ["日", "月", "火", "水", "木", "金", "土"].forEach((label) => {
    const cell = document.createElement("span");
    cell.textContent = label;
    head.appendChild(cell);
  });
  const grid = document.createElement("div");
  grid.className = view === "week" ? "gc-cal is-week" : "gc-cal";
  grid.setAttribute("role", "grid");
  for (let index = 0; index < cells.length; index += 7) {
    grid.appendChild(buildCalendarWeek(list, cells.slice(index, index + 7), {
      singleByDay,
      multi,
      booked,
      canBook,
      todayKey,
      selected: list._selected || "",
      maxEvents: view === "week" ? 8 : 3,
    }));
  }
  grid.addEventListener("keydown", (event) => moveCalendarFocus(list, event));
  const dialog = document.createElement("dialog");
  dialog.className = "gc-modal";
  dialog.id = "class-detail";
  dialog.innerHTML = `<h2 id="class-detail-title"></h2><div id="class-detail-body" class="gc-detail"></div><div class="gc-row"><button type="button" class="gc-primary" id="class-detail-book" hidden>予約する</button><button type="button" class="gc-danger" id="class-detail-delete" hidden>削除する</button><button type="button" class="gc-secondary" id="class-detail-close">閉じる</button></div><p id="class-detail-status" class="gc-warn"></p>`;
  dialog.querySelector("#class-detail-close").onclick = () => dialog.close();
  const navSlot = list.closest(".gc-classes")?.querySelector("#class-cal-nav-slot");
  if (navSlot) navSlot.replaceChildren(nav);
  else list.appendChild(nav);
  list.append(head, grid, dialog);
  if (!classes.length) {
    const empty = document.createElement("p");
    empty.className = "gc-muted";
    empty.textContent = "公開中のクラスはまだありません。";
    list.appendChild(empty);
  }
  const sheet = calendarHost(list)?.querySelector(":scope > .gc-day-sheet");
  if (sheet?.dataset.date && !sheet.hidden) renderDayPanel(list, sheet);
  const pendingDay = list._pendingDay;
  if (pendingDay) {
    list._pendingDay = "";
    list._selected = pendingDay;
    openDayPanel(list, pendingDay);
  }
}

function buildCalendarWeek(list, week, state) {
  const weekEl = document.createElement("div");
  weekEl.className = "gc-week";
  const weekStart = week[0].key;
  const weekEnd = week[6].key;
  const segments = [];
  state.multi.forEach((event) => {
    if (event.endKey < weekStart || event.startKey > weekEnd) return;
    const segStart = event.startKey > weekStart ? event.startKey : weekStart;
    const segEnd = event.endKey < weekEnd ? event.endKey : weekEnd;
    const startCol = week.findIndex((cell) => cell.key === segStart);
    const endCol = week.findIndex((cell) => cell.key === segEnd);
    if (startCol < 0 || endCol < startCol) return;
    segments.push({ event, startCol, endCol });
  });
  week.forEach((cell, index) => {
    const day = document.createElement("div");
    day.className = "gc-day";
    day.dataset.date = cell.key;
    const dayLanes = segments.reduce((max, seg) => (
      index >= seg.startCol && index <= seg.endCol ? Math.max(max, seg.event.lane + 1) : max
    ), 0);
    if (dayLanes) day.style.setProperty("--lanes", String(dayLanes));
    if (!cell.inMonth) day.classList.add("is-out");
    if (cell.key === state.todayKey) day.classList.add("is-today");
    if (cell.key === state.selected) day.classList.add("is-selected");
    day.tabIndex = cell.key === (state.selected || state.todayKey) ? 0 : -1;
    day.setAttribute("role", "gridcell");
    const number = document.createElement("b");
    number.textContent = String(cell.shown);
    day.appendChild(number);
    const items = state.singleByDay.get(cell.key) || [];
    const limit = state.maxEvents || 3;
    const shownItems = items.length > limit ? items.slice(0, limit - 1) : items;
    shownItems.forEach((item) => day.appendChild(eventChip(list, item, cell.key)));
    if (items.length > shownItems.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "gc-more";
      more.textContent = `+${items.length - shownItems.length}件`;
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        list._selected = cell.key;
        openDayPanel(list, cell.key);
      });
      day.appendChild(more);
    }
    day.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      list._selected = cell.key;
      list.querySelectorAll(".gc-day.is-selected").forEach((node) => node.classList.remove("is-selected"));
      day.classList.add("is-selected");
      openDayPanel(list, cell.key);
    });
    weekEl.appendChild(day);
  });
  if (segments.length) {
    const bars = document.createElement("div");
    bars.className = "gc-week-bars";
    segments.forEach((seg) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gc-bar";
      if (seg.event.startKey < weekStart) button.classList.add("is-continued");
      if (seg.event.endKey > weekEnd) button.classList.add("is-continues");
      button.title = seg.event.item.title;
      if (!seg.event.titled) {
        button.textContent = seg.event.item.title;
        seg.event.titled = true;
      } else {
        button.classList.add("is-follow");
        button.setAttribute("aria-label", seg.event.item.title);
      }
      button.style.gridColumn = `${seg.startCol + 1} / ${seg.endCol + 2}`;
      button.style.gridRow = String(seg.event.lane + 1);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openDayPanel(list, seg.event.startKey);
      });
      bars.appendChild(button);
    });
    weekEl.appendChild(bars);
  }
  return weekEl;
}

function ensureDaySheet(list) {
  const host = calendarHost(list);
  let sheet = host?.querySelector(":scope > .gc-day-sheet");
  if (sheet) return sheet;
  sheet = document.createElement("div");
  sheet.className = "gc-day-sheet";
  sheet.hidden = true;
  sheet.innerHTML = `
    <button type="button" class="gc-day-backdrop" aria-label="閉じる"></button>
    <aside class="gc-day-panel" role="dialog" aria-labelledby="gc-day-heading">
      <header class="gc-day-head">
        <h2 id="gc-day-heading"></h2>
        <button type="button" class="gc-cal-plus gc-day-plus" aria-label="クラスを作る" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>
        </button>
      </header>
      <div class="gc-day-body"></div>
    </aside>`;
  sheet.querySelector(".gc-day-backdrop").addEventListener("click", () => closeDaySheet(sheet));
  sheet.querySelector(".gc-day-plus").addEventListener("click", () => {
    const dialog = publishDialog(list);
    const key = sheet.dataset.date;
    if (!dialog || !key) return;
    const start = dialog.querySelector("#class-start-date");
    const end = dialog.querySelector("#class-end-date");
    if (start) start.value = key;
    if (end) end.value = key;
    dialog.showModal();
  });
  host.appendChild(sheet);
  return sheet;
}

function renderDayPanel(list, sheet) {
  const key = sheet.dataset.date;
  if (!key) return;
  const [year, month, day] = key.split("-").map(Number);
  sheet.querySelector("#gc-day-heading").textContent = `${year}年${month}月${day}日`;
  const plus = sheet.querySelector(".gc-day-plus");
  plus.hidden = !publishDialog(list);
  const body = sheet.querySelector(".gc-day-body");
  body.replaceChildren();
  const queryText = (list.dataset.query || "").trim().toLowerCase();
  const items = (list._classes || []).filter((item) => coversDay(item, key) && classMatchesQuery(item, queryText))
    .sort((a, b) => (a.startsAt?.getTime?.() || 0) - (b.startsAt?.getTime?.() || 0));
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "gc-muted";
    empty.textContent = "この日の予定はありません。";
    body.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gc-day-row";
    const time = document.createElement("span");
    time.textContent = dayTimeLabel(item, key);
    const title = document.createElement("span");
    title.textContent = item.title;
    row.append(time, title);
    row.addEventListener("click", () => openClassDetail(list, item, list._booked?.has(item.id), list._canBook));
    body.appendChild(row);
  });
}

function canDeleteClass(list, item) {
  const role = list._role || "";
  const uid = list._uid || getAuth().currentUser?.uid || "";
  if (!item?.id) return false;
  if (role === "owner") return true;
  if (role === "admin" && item.teacherId && item.teacherId === uid) return true;
  return false;
}

function openClassDetail(list, item, alreadyBooked, canBook) {
  const dialog = list.querySelector("#class-detail");
  const start = item.startsAt;
  const end = item.endsAt;
  const when = start
    ? `${start.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}${end ? ` – ${end.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}` : ""}`
    : "";
  const seats = Math.max(0, Number(item.capacity || 6) - Number(item.bookedCount || 0));
  dialog.querySelector("#class-detail-title").textContent = item.title;
  const body = dialog.querySelector("#class-detail-body");
  body.replaceChildren();
  [
    ["先生", item.teacherName || "未設定"],
    ["内容", `${item.game} · ${item.difficulty}`],
    ["日時", when],
    ["席", `残り ${seats}`],
  ].forEach(([label, value]) => {
    const row = document.createElement("p");
    row.textContent = `${label}：${value}`;
    body.appendChild(row);
  });
  const book = dialog.querySelector("#class-detail-book");
  const remove = dialog.querySelector("#class-detail-delete");
  const status = dialog.querySelector("#class-detail-status");
  status.textContent = alreadyBooked ? "予約済み" : "";
  book.hidden = !canBook || alreadyBooked;
  book.disabled = seats <= 0;
  book.textContent = seats <= 0 ? "満席" : "予約する";
  book.onclick = async () => {
    book.disabled = true;
    try {
      const studentId = document.getElementById("book-child")?.value;
      await callFunction("bookClass", studentId ? { classId: item.id, studentId } : { classId: item.id });
      status.textContent = "予約しました。";
      book.hidden = true;
      list._booked.add(item.id);
    } catch (error) {
      status.textContent = error.message;
      book.disabled = false;
    }
  };
  const allowDelete = canDeleteClass(list, item);
  remove.hidden = !allowDelete;
  remove.disabled = false;
  remove.onclick = async () => {
    const booked = Number(item.bookedCount || 0);
    const ok = await confirmAction({
      title: "クラスを削除しますか？",
      message: booked
        ? `「${item.title || "クラス"}」を削除します。\n予約している ${booked} 人のチケットは返却されます。\nこの操作は取り消せません。`
        : `「${item.title || "クラス"}」を削除します。\nこの操作は取り消せません。`,
      confirmLabel: "削除する",
      cancelLabel: "やめる",
      danger: true,
    });
    if (!ok) return;
    remove.disabled = true;
    status.textContent = "削除しています…";
    try {
      await callFunction("deleteClass", { classId: item.id });
      dialog.close();
      await paintClasses(list, list._canBook);
      const daySheet = calendarHost(list)?.querySelector(":scope > .gc-day-sheet");
      if (daySheet && !daySheet.hidden) renderDayPanel(list, daySheet);
      const note = list.closest(".gc-classes")?.querySelector("#class-status");
      if (note) {
        note.hidden = false;
        note.textContent = booked ? `クラスを削除し、${booked}人分のチケットを返却しました。` : "クラスを削除しました。";
      }
    } catch (error) {
      status.textContent = error.message || "削除できませんでした。";
      remove.disabled = false;
    }
  };
  dialog.showModal();
}

function openDayPanel(list, key) {
  const sheet = ensureDaySheet(list);
  sheet.dataset.closeToken = String(Number(sheet.dataset.closeToken || 0) + 1);
  sheet.dataset.date = key;
  renderDayPanel(list, sheet);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    sheet.hidden = false;
    sheet.classList.add("is-open");
    return;
  }
  if (sheet.hidden) {
    sheet.classList.remove("is-open");
    sheet.hidden = false;
    sheet.getBoundingClientRect();
  }
  sheet.classList.add("is-open");
}

function closeDaySheet(sheet) {
  if (!sheet || sheet.hidden) return;
  const token = String(Number(sheet.dataset.closeToken || 0) + 1);
  sheet.dataset.closeToken = token;
  sheet.classList.remove("is-open");
  const finish = () => {
    if (sheet.dataset.closeToken !== token || sheet.classList.contains("is-open")) return;
    sheet.hidden = true;
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  const panel = sheet.querySelector(".gc-day-panel");
  const done = (event) => {
    if (event?.type === "transitionend" && (event.target !== panel || event.propertyName !== "transform")) return;
    panel.removeEventListener("transitionend", done);
    finish();
  };
  panel.addEventListener("transitionend", done);
  window.setTimeout(done, 320);
}

async function linkedChildrenForBooking(db, uid) {
  const me = await getDoc(doc(db, "users", uid));
  const data = me.data() || {};
  const byId = new Map();
  for (const kid of data.linkedChildren || []) {
    if (kid?.id) byId.set(kid.id, { id: kid.id, name: kid.name || "こども" });
  }
  for (const id of data.linkedStudentIds || []) {
    if (!id || byId.has(id)) continue;
    byId.set(id, { id, name: "こども" });
  }
  return [...byId.values()];
}

async function paintClasses(list, canBook) {
  const db = getFirestore();
  const snap = await getDocs(query(collection(db, "classes"), where("status", "==", "open")));
  const booked = new Set();
  if (canBook && !snap.empty) {
    const uid = getAuth().currentUser.uid;
    const child = document.getElementById("book-child")?.value;
    const studentId = child || uid;
    const mine = await getDocs(query(collection(db, "bookings"), where("studentId", "==", studentId)));
    mine.forEach((item) => {
      if (item.data().status === "booked" && item.data().classId) booked.add(item.data().classId);
    });
  }
  const classes = snap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      title: data.title || "クラス",
      teacherId: data.teacherId || "",
      teacherName: data.teacherName || "",
      game: data.game || "",
      difficulty: data.difficulty || "",
      startsAt: data.startsAt?.toDate?.() || null,
      endsAt: data.endsAt?.toDate?.() || null,
      capacity: data.capacity,
      bookedCount: data.bookedCount,
    };
  }).sort((a, b) => (a.startsAt?.getTime?.() || 0) - (b.startsAt?.getTime?.() || 0));
  if (!list._month) {
    const anchor = classes.find((item) => item.startsAt && item.startsAt.getTime() >= Date.now() - 86400000) || classes[0];
    const parts = jstParts(anchor?.startsAt || new Date());
    list._month = { year: Number(parts.year), month: Number(parts.month) };
  }
  list._classes = classes;
  list._booked = booked;
  list._canBook = canBook;
  if (!list._uid) list._uid = getAuth().currentUser?.uid || "";
  list._repaint = () => drawClassCalendar(list);
  drawClassCalendar(list);
}
