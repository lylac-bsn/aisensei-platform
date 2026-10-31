/**
 * Fancy confirm dialog for Gamecollege hub screens.
 * Returns a Promise<boolean> — true when the user confirms.
 */
let activeDialog = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function linesToHtml(message) {
  return String(message || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

export function confirmAction({
  title = "確認",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "キャンセル",
  danger = false,
  icon = "",
} = {}) {
  if (activeDialog?.open) {
    try { activeDialog.close("cancel"); } catch { /* ignore */ }
  }

  const dialog = document.createElement("dialog");
  dialog.className = `gc-modal gc-confirm${danger ? " is-danger" : ""}`;
  dialog.setAttribute("aria-labelledby", "gc-confirm-title");
  dialog.innerHTML = `
    <form method="dialog" class="gc-confirm-card">
      <div class="gc-confirm-art" aria-hidden="true">${icon || (danger ? "!" : "?")}</div>
      <div class="gc-confirm-copy">
        <h3 id="gc-confirm-title">${escapeHtml(title)}</h3>
        <div class="gc-confirm-message">${linesToHtml(message)}</div>
      </div>
      <div class="gc-confirm-actions">
        <button type="submit" class="gc-confirm-cancel" value="cancel">${escapeHtml(cancelLabel)}</button>
        <button type="submit" class="gc-confirm-ok${danger ? " is-danger" : ""}" value="ok" autofocus>${escapeHtml(confirmLabel)}</button>
      </div>
    </form>`;

  activeDialog = dialog;
  document.body.appendChild(dialog);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (activeDialog === dialog) activeDialog = null;
      resolve(Boolean(ok));
      requestAnimationFrame(() => {
        try { dialog.remove(); } catch { /* ignore */ }
      });
    };

    dialog.addEventListener("close", () => {
      finish(dialog.returnValue === "ok");
    }, { once: true });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close("cancel");
    });

    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else {
        dialog.setAttribute("open", "");
      }
    } catch {
      finish(window.confirm([title, message].filter(Boolean).join("\n")));
    }
  });
}
