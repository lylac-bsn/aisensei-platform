/**
 * COllAB SVG icons — cute pastel cover art, favorites, medals, and answer shapes.
 */

function svg(paths, {
  size = 24,
  className = "cb-icon",
  viewBox = "0 0 64 64",
} = {}) {
  const body = Array.isArray(paths) ? paths.join("") : paths;
  return `<svg class="${className}" viewBox="${viewBox}" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

const COVER_BY_EMOJI = {
  "🐱": "animals",
  "🍎": "food",
  "🎨": "colors",
  "🔤": "alphabet",
  "🔡": "alphabet",
  "🏫": "school",
  "💬": "conversation",
  "🎮": "game",
};

/** Soft multi-color cover art (64×64). */
const COVER_ART = {
  animals: `
    <circle cx="32" cy="34" r="18" fill="#FFB7C5"/>
    <ellipse cx="18" cy="18" rx="8" ry="10" fill="#FFB7C5"/>
    <ellipse cx="46" cy="18" rx="8" ry="10" fill="#FFB7C5"/>
    <ellipse cx="18" cy="19" rx="4" ry="5.5" fill="#FF8FAB"/>
    <ellipse cx="46" cy="19" rx="4" ry="5.5" fill="#FF8FAB"/>
    <circle cx="25" cy="32" r="3.2" fill="#5C4A42"/>
    <circle cx="39" cy="32" r="3.2" fill="#5C4A42"/>
    <circle cx="26.2" cy="31" r="1.1" fill="#fff"/>
    <circle cx="40.2" cy="31" r="1.1" fill="#fff"/>
    <ellipse cx="24" cy="39" rx="3.5" ry="2.2" fill="#FF8FAB" opacity=".85"/>
    <ellipse cx="40" cy="39" rx="3.5" ry="2.2" fill="#FF8FAB" opacity=".85"/>
    <path d="M28.5 42.5c1.2 2.2 2.6 3.2 3.5 3.2s2.3-1 3.5-3.2" fill="none" stroke="#5C4A42" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="32" cy="37.5" rx="2.2" ry="1.5" fill="#FF8FAB"/>
  `,
  food: `
    <path d="M32 10c2.2 4.5 1.4 8-.8 10.2 4.6-3.4 10.8.4 10.8 7.4 0 9.2-6.2 16.2-10 19.4-3.8-3.2-10-10.2-10-19.4 0-7 6.2-10.8 10.8-7.4C30.6 18 29.8 14.5 32 10z" fill="#FF7373"/>
    <path d="M31.2 12.2c1.4 2.8 1.2 5.2.2 6.8 1.8-1 3.4-.4 4.4.8-1.8-4.2-3.2-6.4-4.6-7.6z" fill="#FF9A9A"/>
    <path d="M32 8.5c.4 3.2-.2 5.6-1.6 7.2 2.8-1.2 5.4.2 6.2 2.4-.2-4.6-2.2-7.8-4.6-9.6z" fill="#75D7A3"/>
    <circle cx="26" cy="24" r="2.4" fill="#fff" opacity=".55"/>
    <path d="M22 48c2.4 4.2 5.4 6.5 10 6.5s7.6-2.3 10-6.5" fill="none" stroke="#E85A5A" stroke-width="2.4" stroke-linecap="round"/>
  `,
  colors: `
    <ellipse cx="32" cy="38" rx="20" ry="14" fill="#FFF6E8"/>
    <path d="M14 38c0-10.5 8-19 18-19s18 8.5 18 19" fill="#FFE8D2"/>
    <circle cx="22" cy="34" r="5.2" fill="#FF7373"/>
    <circle cx="32" cy="28" r="5.2" fill="#67B8FF"/>
    <circle cx="42" cy="34" r="5.2" fill="#FFD85A"/>
    <circle cx="27" cy="42" r="4.4" fill="#75D7A3"/>
    <circle cx="37" cy="42" r="4.4" fill="#B59BFF"/>
    <path d="M46 18c4 1.5 7.5 5.2 8.5 10.2" fill="none" stroke="#C4A484" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="55.5" cy="15.5" r="3.4" fill="#FF7373"/>
  `,
  alphabet: `
    <rect x="8" y="18" width="22" height="22" rx="6" fill="#67B8FF"/>
    <rect x="34" y="24" width="22" height="22" rx="6" fill="#FFD85A"/>
    <text x="19" y="34.5" text-anchor="middle" font-size="14" font-weight="800" font-family="system-ui,sans-serif" fill="#fff">A</text>
    <text x="45" y="40.5" text-anchor="middle" font-size="14" font-weight="800" font-family="system-ui,sans-serif" fill="#8B6914">B</text>
    <circle cx="48" cy="14" r="7.5" fill="#FF7373"/>
    <text x="48" y="18.2" text-anchor="middle" font-size="10" font-weight="800" font-family="system-ui,sans-serif" fill="#fff">C</text>
  `,
  school: `
    <rect x="14" y="26" width="36" height="26" rx="4" fill="#75D7A3"/>
    <path d="M10 28 L32 14 L54 28 Z" fill="#5ECF95"/>
    <rect x="28" y="36" width="8" height="16" rx="1.5" fill="#FFF9F1"/>
    <rect x="18" y="32" width="7" height="7" rx="1.5" fill="#EAF6FF"/>
    <rect x="39" y="32" width="7" height="7" rx="1.5" fill="#EAF6FF"/>
    <circle cx="32" cy="20" r="2.2" fill="#FFD85A"/>
    <path d="M32 14 V10" stroke="#C4A484" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="32" cy="8.5" r="2" fill="#FF7373"/>
  `,
  conversation: `
    <rect x="10" y="12" width="40" height="30" rx="14" fill="#67B8FF"/>
    <path d="M22 40 L16 52 L30 42 Z" fill="#67B8FF"/>
    <circle cx="24" cy="27" r="3.2" fill="#fff"/>
    <circle cx="32" cy="27" r="3.2" fill="#fff"/>
    <circle cx="40" cy="27" r="3.2" fill="#fff"/>
    <path d="M38 44c6 1.5 12 5 14 10" fill="none" stroke="#B59BFF" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  `,
  game: `
    <rect x="8" y="22" width="48" height="26" rx="13" fill="#B59BFF"/>
    <rect x="12" y="26" width="40" height="18" rx="9" fill="#9B82F0"/>
    <rect x="18" y="31" width="3.2" height="10" rx="1.6" fill="#fff"/>
    <rect x="14.6" y="34.4" width="10" height="3.2" rx="1.6" fill="#fff"/>
    <circle cx="42" cy="33" r="3" fill="#FF7373"/>
    <circle cx="48" cy="38" r="3" fill="#FFD85A"/>
    <circle cx="20" cy="18" r="2" fill="#75D7A3"/>
    <circle cx="44" cy="16" r="1.6" fill="#67B8FF"/>
  `,
};

export function coverIconKey(item = {}) {
  const emoji = String(item.coverEmoji || "").trim();
  if (COVER_BY_EMOJI[emoji]) return COVER_BY_EMOJI[emoji];
  const category = String(item.category || "").trim().toLowerCase();
  if (COVER_ART[category]) return category;
  const title = String(item.title || "").toLowerCase();
  if (/どうぶつ|animal|cat|dog/.test(title)) return "animals";
  if (/たべもの|food|apple/.test(title)) return "food";
  if (/いろ|color/.test(title)) return "colors";
  if (/abc|alphabet|字母/.test(title)) return "alphabet";
  if (/がっこう|school/.test(title)) return "school";
  if (/かいわ|conversation|hello/.test(title)) return "conversation";
  return "game";
}

export function coverIconMarkup(item = {}, size = 64) {
  const key = coverIconKey(item);
  const art = COVER_ART[key] || COVER_ART.game;
  return `<span class="cb-cover-icon is-${key}">${svg(art, { size, className: "cb-icon cb-icon-cover" })}</span>`;
}

export function heartIcon(filled = false, size = 18) {
  const body = filled
    ? '<path fill="currentColor" d="M12 20.4S3.6 14.8 3.6 9.7A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 8.4 2.3C20.4 14.8 12 20.4 12 20.4z"/>'
    : '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 20.4S3.6 14.8 3.6 9.7A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 8.4 2.3C20.4 14.8 12 20.4 12 20.4z"/>';
  return `<svg class="cb-icon cb-icon-heart${filled ? " is-on" : ""}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function medalIcon(place, size = 22) {
  const tones = {
    1: { fill: "#FFE27A", rim: "#F5C518", ribbon: "#FF7373" },
    2: { fill: "#E8EEF5", rim: "#A8B6C6", ribbon: "#67B8FF" },
    3: { fill: "#FFD2B0", rim: "#E0A070", ribbon: "#75D7A3" },
  };
  const tone = tones[place];
  if (!tone) return escapeText(String(place || ""));
  return `<span class="cb-medal-icon is-${place}"><svg class="cb-icon cb-icon-medal" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <path d="M8 2.8h2.4l1.6 4.4L13.6 2.8H16l-3 6.4H11z" fill="${tone.ribbon}"/>
    <circle cx="12" cy="15" r="6.4" fill="${tone.fill}"/>
    <circle cx="12" cy="15" r="4.6" fill="none" stroke="${tone.rim}" stroke-width="1.5"/>
    <text x="12" y="17.2" text-anchor="middle" font-size="7" font-weight="800" fill="#5C4A22">${place}</text>
  </svg></span>`;
}

export function shapeIcon(index, size = 18) {
  const shapes = [
    '<path fill="currentColor" d="M12 3.5 20.5 19.5H3.5z"/>',
    '<path fill="currentColor" d="M12 3.2 20.8 12 12 20.8 3.2 12z"/>',
    '<circle fill="currentColor" cx="12" cy="12" r="8"/>',
    '<rect fill="currentColor" x="5" y="5" width="14" height="14" rx="2.5"/>',
  ];
  return `<svg class="cb-icon cb-icon-shape is-${index % 4}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${shapes[index % shapes.length]}</svg>`;
}

export function checkIcon(size = 18) {
  return `<svg class="cb-icon cb-icon-check" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5 9.5 17 19 7.5"/></svg>`;
}

export function presentIcon(exit = false, size = 18) {
  if (exit) {
    return `<svg class="cb-icon cb-icon-close" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>`;
  }
  return `<svg class="cb-icon cb-icon-present" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`;
}

export function sparkleIcon(size = 18) {
  return `<svg class="cb-icon cb-icon-sparkle" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.5 13.6 9.2 20 12l-6.4 2.8L12 21.5l-1.6-6.7L4 12l6.4-2.8z"/></svg>`;
}

export function confettiIcon(size = 18) {
  return `<svg class="cb-icon cb-icon-confetti" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <rect x="5" y="3" width="3" height="7" rx="1.5" fill="#FF7373" transform="rotate(-18 6.5 6.5)"/>
    <rect x="11" y="2" width="3" height="8" rx="1.5" fill="#FFD85A" transform="rotate(12 12.5 6)"/>
    <rect x="16" y="4" width="3" height="7" rx="1.5" fill="#67B8FF" transform="rotate(-8 17.5 7.5)"/>
    <rect x="7" y="12" width="3" height="7" rx="1.5" fill="#75D7A3" transform="rotate(16 8.5 15.5)"/>
    <rect x="14" y="13" width="3" height="7" rx="1.5" fill="#B59BFF" transform="rotate(-14 15.5 16.5)"/>
  </svg>`;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
