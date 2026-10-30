/** Host lobby student balls — Matter.js physics + DOM pastel bubbles.
 *  DOM nodes stay visible even when canvas sizing fails.
 */

const COLORS = ["#C9EBD8", "#C5DFF5", "#F8D0BC", "#F3E6A6", "#D9CEF2", "#F5C8D6", "#F0B8B0", "#BFE8E2"];
const INK = "#5C4A42";

function softPastel(hex) {
  const raw = String(hex || "").trim();
  if (!raw) return COLORS[0];
  const value = raw.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return COLORS[0];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luma >= 0.72) return `#${value}`;
  const wash = (channel) => Math.round(channel + (255 - channel) * 0.45);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(wash(r))}${toHex(wash(g))}${toHex(wash(b))}`;
}

function fitBallLabel(label, name, size) {
  const text = String(name || "？").trim() || "？";
  label.textContent = text;
  label.title = text;
  // Fit full nickname inside the circle — scale down, never ellipsize.
  let fontSize = Math.min(20, Math.max(11, size * 0.3));
  const maxW = size * 0.78;
  label.style.fontSize = `${fontSize}px`;
  label.style.lineHeight = "1.05";
  // Allow wrap for longer names so every character stays visible.
  label.style.whiteSpace = text.length > 6 ? "normal" : "nowrap";
  while (fontSize > 9) {
    const tooWide = label.scrollWidth > maxW + 1;
    const tooTall = label.scrollHeight > size * 0.78;
    if (!tooWide && !tooTall) break;
    fontSize -= 0.5;
    label.style.fontSize = `${fontSize}px`;
  }
}

export function createBallLobby(canvas) {
  const space = canvas?.parentElement;
  if (!canvas || !space) return { sync() {}, destroy() {}, resize() {} };

  const Matter = window.Matter;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const balls = new Map(); // id -> { body?, el, size, color, name }
  let viewW = 0;
  let viewH = 0;
  let raf = 0;
  let alive = true;
  let engine = null;
  let runner = null;
  let floor = null;
  let left = null;
  let right = null;
  let ceiling = null;

  // Layer for DOM balls (above any leftover canvas).
  let layer = space.querySelector(".cb-ball-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "cb-ball-layer";
    space.appendChild(layer);
  }
  canvas.style.display = "none";

  const measure = () => {
    const host = space.closest(".cb-lobby-host") || space.parentElement;
    const join = host?.querySelector?.(".cb-lobby-join-block");
    const hostRect = host?.getBoundingClientRect?.();
    const joinRect = join?.getBoundingClientRect?.();
    const spaceRect = space.getBoundingClientRect();

    let w = Math.floor(spaceRect.width || hostRect?.width || 640);
    let h = Math.floor(spaceRect.height || 0);

    // If flex collapsed the space, size from host area under the join block.
    if (h < 120 && hostRect && joinRect) {
      h = Math.floor(hostRect.bottom - joinRect.bottom - 4);
    }
    if (h < 120 && hostRect) {
      h = Math.floor(hostRect.height * 0.45);
    }
    w = Math.max(260, w);
    h = Math.max(220, h);
    return { w, h };
  };

  const placeWalls = (w, h) => {
    if (!engine || !Matter) return;
    const { Bodies, Composite } = Matter;
    const wallOpts = {
      isStatic: true,
      friction: 0.35,
      restitution: 0.35,
    };
    if (floor) Composite.remove(engine.world, [floor, left, right, ceiling]);
    floor = Bodies.rectangle(w / 2, h + 22, w + 180, 52, wallOpts);
    left = Bodies.rectangle(-30, h / 2, 60, h + 220, wallOpts);
    right = Bodies.rectangle(w + 30, h / 2, 60, h + 220, wallOpts);
    ceiling = Bodies.rectangle(w / 2, -100, w + 180, 40, wallOpts);
    Composite.add(engine.world, [floor, left, right, ceiling]);
  };

  const applySize = () => {
    if (!alive) return;
    const { w, h } = measure();
    if (w === viewW && h === viewH) return;
    viewW = w;
    viewH = h;
    space.style.height = `${h}px`;
    space.style.minHeight = `${h}px`;
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    placeWalls(w, h);
  };

  const makeEl = (player, size, color) => {
    const el = document.createElement("div");
    el.className = "cb-fall-ball";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = color;
    el.style.color = INK;
    el.title = player.name || "";
    const label = document.createElement("span");
    label.className = "cb-fall-ball-label";
    el.appendChild(label);
    fitBallLabel(label, player.name, size);
    layer.appendChild(el);
    // Refit after layout so scrollWidth is accurate.
    requestAnimationFrame(() => fitBallLabel(label, player.name, size));
    return el;
  };

  const paintDom = () => {
    balls.forEach((item) => {
      const { el, body, size } = item;
      if (!el) return;
      let x;
      let y;
      let angle = 0;
      if (body) {
        x = body.position.x;
        y = body.position.y;
        angle = body.angle || 0;
      } else {
        x = item.x;
        y = item.y;
      }
      // Ball can roll; keep the name upright and readable.
      el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${angle}rad)`;
      const label = el.querySelector(".cb-fall-ball-label");
      if (label) label.style.transform = `rotate(${-angle}rad)`;
    });
  };

  const tick = () => {
    if (!alive) return;
    // Lightweight non-Matter fall if engine unavailable.
    if (!engine) {
      balls.forEach((item) => {
        item.vy = (item.vy || 0) + (reduce ? 0.25 : 0.55);
        item.y = Math.min(viewH - item.size / 2 - 4, (item.y || 0) + item.vy);
        if (item.y >= viewH - item.size / 2 - 4) {
          item.vy *= -0.45;
          if (Math.abs(item.vy) < 0.4) item.vy = 0;
        }
      });
    }
    paintDom();
    raf = requestAnimationFrame(tick);
  };

  if (Matter) {
    const { Engine, Runner } = Matter;
    engine = Engine.create({
      gravity: { x: 0, y: reduce ? 0.35 : 0.95 },
      enableSleeping: true,
    });
    runner = Runner.create();
    Runner.run(runner, engine);
  } else {
    console.warn("[COllAB] Matter.js missing — using simple fall");
  }

  applySize();
  raf = requestAnimationFrame(tick);

  const resize = () => {
    viewW = 0;
    viewH = 0;
    applySize();
  };

  window.addEventListener("resize", resize);
  const ro = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => applySize())
    : null;
  ro?.observe(space.closest(".cb-lobby-host") || space);
  requestAnimationFrame(resize);

  const sync = (players = []) => {
    if (!alive) return;
    applySize();
    const seen = new Set();
    const w = viewW || measure().w;
    const h = viewH || measure().h;

    players.forEach((player, index) => {
      if (!player?.id) return;
      seen.add(player.id);
      const existing = balls.get(player.id);
      if (existing) {
        existing.name = player.name || "？";
        existing.el.title = existing.name;
        const label = existing.el.querySelector(".cb-fall-ball-label") || existing.el;
        fitBallLabel(label, existing.name, existing.size);
        if (player.ballColor) {
          existing.color = softPastel(player.ballColor);
          existing.el.style.background = existing.color;
        }
        return;
      }

      const size = Math.max(60, Math.min(110, Number(player.ballSize) || (60 + (index * 7) % 51)));
      const color = softPastel(player.ballColor || COLORS[index % COLORS.length]);
      const el = makeEl(player, size, color);
      const startX = 36 + Math.random() * Math.max(48, w - 72);
      const startY = -40 - Math.random() * 60;

      let body = null;
      if (engine && Matter) {
        const { Bodies, Composite, Body } = Matter;
        body = Bodies.circle(startX, startY, size / 2, {
          restitution: reduce ? 0.2 : 0.62,
          friction: 0.08,
          frictionAir: 0.018,
          density: 0.0018,
          sleepThreshold: 28,
        });
        Composite.add(engine.world, body);
        if (!reduce) {
          Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 3.5,
            y: 1.5 + Math.random() * 2.5,
          });
        }
      }

      balls.set(player.id, {
        body,
        el,
        size,
        color,
        name: player.name || "？",
        x: startX,
        y: startY,
        vy: reduce ? 1 : 2.5,
      });
    });

    balls.forEach((item, id) => {
      if (seen.has(id)) return;
      if (item.body && engine && Matter) {
        Matter.Composite.remove(engine.world, item.body);
      }
      item.el?.remove();
      balls.delete(id);
    });

    paintDom();
  };

  const destroy = () => {
    alive = false;
    window.removeEventListener("resize", resize);
    ro?.disconnect();
    cancelAnimationFrame(raf);
    if (runner && Matter) Matter.Runner.stop(runner);
    if (engine && Matter) Matter.Engine.clear(engine);
    balls.forEach((item) => item.el?.remove());
    balls.clear();
    layer?.remove();
    space.style.height = "";
    space.style.minHeight = "";
    canvas.style.display = "";
  };

  return { sync, destroy, resize };
}
