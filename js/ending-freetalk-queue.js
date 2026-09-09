/**
 * One-slot delivery queue for the first Ending Phase 2 child turn.
 *
 * The ending UI only accepts one answer while a fresh Live session is becoming
 * ready. A successful send consumes the slot; a failed send leaves the exact
 * text queued for the setup/reconnect fallback to retry.
 */
export class EndingFreeTalkTurnQueue {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.nextRequestId = 0;
    this.pending = null;
    this.lastDispatched = null;
  }

  enqueue(text, { source = "unknown" } = {}) {
    const exactText = String(text || "").trim();
    if (!exactText) return null;
    if (this.pending) {
      if (this.pending.text === exactText) return { ...this.pending };
      return null;
    }
    this.pending = {
      requestId: ++this.nextRequestId,
      text: exactText,
      source,
      queuedAt: this.now(),
    };
    return { ...this.pending };
  }

  flush({ ready = false, send } = {}) {
    if (!this.pending || !ready || typeof send !== "function") return false;
    const turn = this.pending;
    if (!send({ ...turn })) return false;
    this.lastDispatched = {
      ...turn,
      dispatchedAt: this.now(),
    };
    this.pending = null;
    return true;
  }

  peek() {
    return this.pending ? { ...this.pending } : null;
  }

  reset() {
    this.nextRequestId += 1;
    this.pending = null;
    this.lastDispatched = null;
  }
}
