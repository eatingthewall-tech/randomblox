/* Randomblox shop — renders CATALOG (js/catalog.js). */
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = n => "$" + n.toFixed(2);
const IMG_V = "20260714d";                       // bump when item art changes
const imgSrc = p => p + (p.includes("?") ? "&" : "?") + "v=" + IMG_V;

const PILL = {
  Godly: "godly", Chroma: "chroma", Ancient: "ancient", Vintage: "vintage",
  Legendary: "legendary", Rare: "rare", Uncommon: "uncommon", Common: "common",
  Egg: "uncommon", Vehicle: "rare", Toy: "vintage",
  Diamond: "nflmvp", Amethyst: "nflallpro", Ruby: "nflpro", Gold: "nflstarter", Silver: "nflrookie", Bronze: "nflrookie", Custom: "nflmvp",
  Legend: "bdlegend", Epic: "bdepic", Basic: "bdbasic",
  Korblox: "korblox", Random: "account",
};
const RARITY_ORDER = ["Korblox","Chroma","Godly","Ancient","Vintage","Legend","Legendary","Epic","Rare","Basic","Uncommon","Common","Egg","Vehicle","Toy",
  "Custom","Diamond","Amethyst","Ruby","Gold","Silver","Bronze","Random"];
const CATS = {
  mm2: [["all", "Everything"], ["knife", "Knives"], ["gun", "Guns"], ["pet", "Pets"], ["collectible", "Collectibles"]],
  am:  [["all", "Everything"], ["pet", "Pets"], ["egg", "Eggs"], ["vehicle", "Vehicles"], ["toy", "Toys & items"]],
  nfl: [["all", "Everything"], ["gear", "Gear"], ["apparel", "Apparel"], ["headwear", "Headwear"], ["cleats", "Cleats"], ["chains", "Chains"], ["emote", "Emotes"], ["ball", "Ball & Trails"]],
  baddies: [["all", "Everything"], ["knuckles", "Brass Knuckles"], ["taser", "Tasers"], ["pan", "Frying Pans"], ["purse", "Purses"], ["board", "Hoverboards"], ["mace", "Maces & Whips"], ["rpg", "RPGs"], ["bat", "Spiked Bats"], ["flamethrower", "Flamethrowers"], ["finisher", "Finishers"], ["style", "Fighting Styles"], ["more", "More Skins"]],
  accounts: [["all", "Everything"]],
};
const GAME_LABEL = { mm2: "Murder Mystery 2", am: "Adopt Me", nfl: "NFL Universe", baddies: "Baddies", accounts: "Roblox Accounts" };
const GAME_GHOST = { mm2: "MM2", am: "ADOPT ME", nfl: "NFL UF", baddies: "BADDIES", accounts: "ACCOUNTS" };
const MOTION_OK = matchMedia("(prefers-reduced-motion: no-preference)").matches;
const BADDIE_GLYPH = { knuckles: "🥊", taser: "⚡", pan: "🍳", purse: "👛", board: "🛹", mace: "🔨", rpg: "🚀", toilet: "🚽", style: "🥋", more: "✨" };

const state = {
  game: "mm2", cat: "all", rarity: new Set(), inStock: false, q: "", sort: "rarity",
  cart: load("rbx-cart", {}),
};
function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
const byId = Object.fromEntries(CATALOG.map(i => [i.id, i]));

/* one-time reset: wipe every order / chat / read-marker so the queue starts
   empty and at #1 for everyone. Bump RESET_TAG to reset again later. */
const RESET_TAG = "2026-07-14";
if (localStorage.getItem("rbx-reset") !== RESET_TAG) {
  Object.keys(localStorage)
    .filter(k => k === "rbx-orders" || k.startsWith("rbx-chat-") || k.startsWith("rbx-seen-"))
    .forEach(k => localStorage.removeItem(k));
  localStorage.setItem("rbx-reset", RESET_TAG);
}

/* ---------- featured shelf: priciest MM2/AM grails (NFL & Baddies keep their own tabs) ----------
   9 cards = one 2x2 grail + 8 singles, filling the 6-column bento exactly */
(function featured() {
  const top = [...CATALOG].filter(i => i.game === "mm2" || i.game === "am").sort((a, b) => b.price - a.price).slice(0, 9);
  $("#featuredRow").innerHTML = top.map(cardHTML).join("");
  bindBuyButtons($("#featuredRow"));
})();

/* ---------- hero: the collector wall (his real inventory, racked in 3D) ---------- */
(function heroWall() {
  const box = $("#heroWall");
  if (!box) return;
  // 4 best-looking items per game, interleaved so every column mixes games
  const perGame = ["mm2", "am", "nfl", "baddies"].map(g =>
    [...CATALOG].filter(i => i.game === g && i.img).sort((a, b) => b.price - a.price).slice(0, 4));
  const rows = innerWidth < 920 ? 2 : 4;   // mobile backdrop needs half the weight
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let g = 0; g < 4; g++) tiles.push(perGame[(g + r) % 4][r]);
  box.innerHTML = `<div class="wall-grid">` + tiles.map(i => {
    const pill = PILL[i.rarity] || "common";
    const crop = i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") || i.img.startsWith("assets/baddies/");
    return `<div class="wtile" style="--rar:var(--pill-${pill}-ink)">
      <img class="${crop ? "is-crop" : ""}" src="${imgSrc(i.img)}" alt="" loading="eager" decoding="async">
    </div>`;
  }).join("") + `</div>`;

  // gentle parallax: the rack leans a few px toward the pointer
  if (MOTION_OK && matchMedia("(pointer: fine)").matches) {
    const grid = box.firstElementChild;
    $(".hero").addEventListener("pointermove", e => {
      const r = box.getBoundingClientRect();
      grid.style.setProperty("--wx", (((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(1) + "px");
      grid.style.setProperty("--wy", (((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(1) + "px");
    }, { passive: true });
  }
})();

/* ---------- hero dice: floating 3D dice on the copy side ---------- */
(function heroDice() {
  const box = $("#heroDice");
  if (!box) return;
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const face = (n, cls) =>
    `<span class="df ${cls}">${[...Array(9)].map((_, i) => `<i class="${PIPS[n].includes(i) ? "on" : ""}"></i>`).join("")}</span>`;
  const die = (s, x, y, dur, delay, extra = "") =>
    `<span class="die-wrap ${extra}" style="--s:${s}px;left:${x};top:${y};--fd:${dur}s;--dd:${delay}s">
      <span class="die">${face(1, "df-f")}${face(6, "df-bk")}${face(3, "df-r")}${face(4, "df-l")}${face(2, "df-t")}${face(5, "df-b")}</span>
    </span>`;
  // 3 dice only — calmer, less busy than a full scatter
  box.innerHTML =
    die(112, "46%", "10%", 9, 0, "die-main keep-m") +
    die(62, "2.5%", "7%", 12, -3) +
    die(80, "1.5%", "86%", 11, -6, "keep-m");
})();

/* ---------- pick-your-game: the official game covers, full bleed ---------- */
(function gameBand() {
  const box = $("#gameBand");
  if (!box) return;
  box.innerHTML = ["mm2", "am", "nfl", "baddies"].map(g => {
    const n = CATALOG.filter(i => i.game === g).length;
    return `<button class="gcard" data-jump="${g}" style="--ga:var(--g-${g})">
      <img class="gcard-cover" src="${imgSrc(`assets/games/${g}-thumb.png`)}" alt="" loading="lazy" decoding="async">
      <span class="gcard-scrim" aria-hidden="true"></span>
      <span class="gcard-meta">
        <b>${GAME_LABEL[g]}</b>
        <span class="gcard-n">${n} items in stock</span>
      </span>
      <span class="gcard-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </button>`;
  }).join("");
})();

/* ---------- roblox accounts: carousels + gender pick ---------- */
const ACCT_IMGS = {
  korblox: ["korblox-1","korblox-2","korblox-3"].map(n => `assets/accounts/${n}.png`),
  random: ["r01","r02","r03","r04","r05","r06","r07","r08","r09","r10","r11","r12"].map(n => `assets/accounts/${n}.png`),
};
(function accounts() {
  $$(".acct-media").forEach(box => {
    const imgs = ACCT_IMGS[box.dataset.carousel] || [];
    box.innerHTML =
      imgs.map((s, i) => `<img src="${imgSrc(s)}" class="${i === 0 ? "is-on" : ""}" alt="" loading="lazy" decoding="async">`).join("") +
      (imgs.length > 1
        ? `<button class="am-nav am-prev" aria-label="Previous picture">‹</button>
           <button class="am-nav am-next" aria-label="Next picture">›</button>
           <span class="am-dots" aria-hidden="true">${imgs.map((_, i) => `<i class="${i === 0 ? "is-on" : ""}"></i>`).join("")}</span>`
        : "");
    if (imgs.length < 2) return;
    let idx = 0, timer = null;
    const show = n => {
      idx = (n + imgs.length) % imgs.length;
      $$("img", box).forEach((im, i) => im.classList.toggle("is-on", i === idx));
      $$(".am-dots i", box).forEach((d, i) => d.classList.toggle("is-on", i === idx));
    };
    const restart = () => { clearInterval(timer); timer = setInterval(() => show(idx + 1), 10000); };
    $(".am-prev", box).addEventListener("click", () => { show(idx - 1); restart(); });
    $(".am-next", box).addEventListener("click", () => { show(idx + 1); restart(); });
    restart();
  });

  $$("[data-acct-add]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.acctAdd === "acc-korblox") addToCart("acc-korblox", b);
    else openGenderPick(b);
  }));
})();

const genderPick = $("#genderPick");
let gpFromBtn = null;
function openGenderPick(btn) { gpFromBtn = btn; genderPick.hidden = false; }
function closeGenderPick() { genderPick.hidden = true; }
$("#gpClose")?.addEventListener("click", closeGenderPick);
genderPick?.addEventListener("click", e => { if (e.target === genderPick) closeGenderPick(); });
$$(".gp-choice").forEach(c => c.addEventListener("click", () => {
  addToCart(c.dataset.gender === "male" ? "acc-random-male" : "acc-random-female", gpFromBtn);
  closeGenderPick();
}));

function syncAcctButtons() {
  $$("[data-acct-add]").forEach(b => {
    let left, inCart;
    if (b.dataset.acctAdd === "acc-korblox") {
      const i = byId["acc-korblox"];
      left = i.stock - (state.cart[i.id] || 0);
      inCart = (state.cart[i.id] || 0) > 0;
    } else {
      const m = byId["acc-random-male"], f = byId["acc-random-female"];
      left = (m.stock - (state.cart[m.id] || 0)) + (f.stock - (state.cart[f.id] || 0));
      inCart = (state.cart[m.id] || 0) + (state.cart[f.id] || 0) > 0;
    }
    b.disabled = left <= 0;
    b.textContent = left <= 0 ? "In cart" : inCart ? "Add another" : "Add to cart";
    b.classList.toggle("in-cart", inCart);
  });
}

/* ---------- pause the hero light show while it's offscreen ---------- */
(function heroPause() {
  const hero = $(".hero");
  if (!hero || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(es => {
    document.body.classList.toggle("hero-off", !es[0].isIntersecting);
  }, { threshold: 0 }).observe(hero);
})();

/* ---------- scroll reveals: sections rise in as they enter ---------- */
(function reveals() {
  if (!MOTION_OK || !("IntersectionObserver" in window)) return;
  document.body.classList.add("rv-on");
  const mark = (sel, stagger = 0) => $$(sel).forEach((el, i) => {
    el.classList.add("rv");
    if (stagger) el.style.setProperty("--rvd", (i * stagger).toFixed(2) + "s");
  });
  mark(".hero-facts li", 0.06);
  mark(".section-head");
  mark(".gcard", 0.07);
  mark(".how h2"); mark(".how-steps li", 0.08);
  mark(".faq h2"); mark(".faq-item", 0.06);
  mark(".footer-in");
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  $$(".rv").forEach(el => io.observe(el));
})();

/* ---------- holo tilt on product cards (fine pointers only) ---------- */
if (matchMedia("(pointer: fine)").matches && MOTION_OK) {
  document.addEventListener("pointermove", e => {
    const card = e.target.closest(".card");
    document.querySelectorAll(".card.is-tilt").forEach(c => {
      if (c !== card) { c.classList.remove("is-tilt"); c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); }
    });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.classList.add("is-tilt");
    card.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
    card.style.setProperty("--ry", ((px - 0.5) * 9).toFixed(2) + "deg");
    card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
  }, { passive: true });
}

/* ---------- fly-to-cart ---------- */
function flyToCart(fromBtn) {
  if (!MOTION_OK || !fromBtn) return;
  const img = fromBtn.closest(".card, .acct-card, .qv-panel")
    ?.querySelector(".card-art img, .acct-media img.is-on, .qv-art img");
  const target = innerWidth <= 900 ? $('.botnav-item[data-bot="cart"]') : $("#cartBtn");
  if (!img || !target) return;
  const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
  const ghost = img.cloneNode();
  Object.assign(ghost.style, {
    position: "fixed", left: a.left + "px", top: a.top + "px",
    width: a.width + "px", height: a.height + "px",
    borderRadius: "12px", zIndex: 90, pointerEvents: "none", objectFit: "cover",
  });
  document.body.appendChild(ghost);
  ghost.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.08)`, opacity: 0.4 },
  ], { duration: 550, easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => ghost.remove();
}

/* ---------- sticky offsets (header + browse bar) ---------- */
function setStickyVars() {
  const root = document.documentElement;
  root.style.setProperty("--hdr", ($(".topbar")?.offsetHeight || 56) + "px");
  root.style.setProperty("--browse", ($("#browsebar")?.offsetHeight || 0) + "px");
}
window.addEventListener("resize", setStickyVars);

/* scroll helper: smooth when it works, but ALWAYS arrives — some
   embedded/mobile browsers silently drop smooth scrolls */
function goTo(y, instant = false) {
  /* "instant" must be explicit: a plain scrollTo still obeys the page's
     CSS scroll-behavior, which is exactly what breaks on some browsers */
  if (instant || !MOTION_OK) { window.scrollTo({ top: y, behavior: "instant" }); return; }
  window.scrollTo({ top: y, behavior: "smooth" });
  setTimeout(() => {
    if (Math.abs(window.scrollY - y) > 500) window.scrollTo({ top: y, behavior: "instant" });
  }, 500);
}
function scrollToShop(instant = false) {
  goTo($("#shop").offsetTop - ($(".topbar")?.offsetHeight || 56) - 8, instant);
}

/* ---------- game switch ---------- */
function setGame(g) {
  state.game = g;
  state.cat = "all";
  state.rarity = new Set();
  state.inStock = false;
  $$(".game-tab[data-nav]").forEach(b => {
    const on = b.dataset.nav === g;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on);
  });
  $$(".botnav-item[data-bot]").forEach(b => {
    if (["mm2", "am", "nfl", "baddies", "accounts"].includes(b.dataset.bot)) b.classList.toggle("is-on", b.dataset.bot === g);
  });
  $("#shopTitle").textContent = GAME_LABEL[g];
  document.body.dataset.game = g;
  const ghost = $("#shopGhost");
  if (ghost) ghost.textContent = GAME_GHOST[g] || "";
  syncInStockUI();
  buildCatTabs();
  buildRarityChips();
  render();
}
// jump straight to the shop (instant): a smooth scroll across the 25k-px grid
// stutters and then hard-snaps, which reads as the page "bugging out"
$$(".game-tab[data-nav]").forEach(b => b.addEventListener("click", () => { setGame(b.dataset.nav); scrollToShop(true); }));
$$("[data-jump]").forEach(b => b.addEventListener("click", () => { setGame(b.dataset.jump); scrollToShop(true); }));
$("#heroBrowse")?.addEventListener("click", () => {
  const games = $("#games");
  if (games) goTo(games.offsetTop - ($(".topbar")?.offsetHeight || 56) - 8);
  else scrollToShop();
});
$("#logoHome")?.addEventListener("click", e => { e.preventDefault(); goTo(0, true); });
$$(".botnav-item[data-bot]").forEach(b => b.addEventListener("click", () => {
  const t = b.dataset.bot;
  if (t === "home") goTo(0, true);
  else if (t === "cart") openDrawer();
  else { setGame(t); scrollToShop(true); }   // tab-bar taps jump straight there
}));

/* ---------- category tabs ---------- */
function buildCatTabs() {
  $("#catTabs").innerHTML = CATS[state.game].map(([v, label]) =>
    `<button class="cat-tab ${state.cat === v ? "is-on" : ""}" role="tab" aria-selected="${state.cat === v}" data-cat="${v}">${label}</button>`).join("");
  $$("#catTabs .cat-tab").forEach(t => t.addEventListener("click", () => {
    state.cat = t.dataset.cat;
    buildCatTabs();
    buildRarityChips();
    render();
  }));
}

/* ---------- rarity chips (with live facet counts) ---------- */
function raritiesFor(game) {
  const present = [...new Set(CATALOG.filter(i => i.game === game).map(i => i.rarity))];
  present.sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b));
  return present;
}
function facetCount(rar) {
  return CATALOG.filter(i =>
    i.game === state.game &&
    (state.cat === "all" || catOf(i) === state.cat) &&
    (!state.inStock || i.stock > 0) &&
    (!state.q || i.name.toLowerCase().includes(state.q)) &&
    i.rarity === rar).length;
}
function chipHTML(rar) {
  const pill = PILL[rar] || "common";
  const on = state.rarity.has(rar);
  const n = facetCount(rar);
  const dis = n === 0 && !on ? "disabled" : "";
  return `<button class="rarity-chip ${on ? "is-on" : ""}" data-rar="${rar}" aria-pressed="${on}" ${dis}
    style="--pill-bg:var(--pill-${pill}-bg);--pill-ink:var(--pill-${pill}-ink)">
    <span class="rc-dot"></span>${rar}<span class="rc-n">${n}</span></button>`;
}
function buildRarityChips() {
  const html = raritiesFor(state.game).map(chipHTML).join("");
  $("#rarityChips").innerHTML = html;
  $("#sheetRarity").innerHTML = html;
  $$(".rarity-chip").forEach(c => c.addEventListener("click", () => toggleRarity(c.dataset.rar)));
}
function toggleRarity(r) {
  if (state.rarity.has(r)) state.rarity.delete(r); else state.rarity.add(r);
  buildRarityChips();
  render();
}

/* ---------- in-stock / sort / search ---------- */
function syncInStockUI() {
  ["#inStockBtn", "#sheetInStock"].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.setAttribute("aria-pressed", state.inStock);
    el.classList.toggle("is-on", state.inStock);
  });
}
function setInStock(v) { state.inStock = v; syncInStockUI(); buildRarityChips(); render(); }
$("#inStockBtn").addEventListener("click", () => setInStock(!state.inStock));
$("#sheetInStock").addEventListener("click", () => setInStock(!state.inStock));

function setSort(v) {
  state.sort = v;
  $("#sortSel").value = v;
  $$("#sheetSort [data-sort]").forEach(b => b.setAttribute("aria-checked", b.dataset.sort === v));
  render();
}
$("#sortSel").addEventListener("change", e => setSort(e.target.value));
$$("#sheetSort [data-sort]").forEach(b => b.addEventListener("click", () => setSort(b.dataset.sort)));

$("#searchInput").addEventListener("input", e => {
  state.q = e.target.value.trim().toLowerCase();
  buildRarityChips();
  render();
});

/* ---------- filtering ---------- */
function catOf(i) {
  if (i.kind === "knife" || i.kind === "gun" || i.kind === "collectible") return i.kind;
  if (i.game === "mm2" && i.kind === "pet") return "pet";
  return i.kind; // pet / egg / vehicle / toy
}
function visible() {
  let list = CATALOG.filter(i => i.game === state.game);
  if (state.cat !== "all") list = list.filter(i => catOf(i) === state.cat);
  if (state.rarity.size) list = list.filter(i => state.rarity.has(i.rarity));
  if (state.inStock) list = list.filter(i => i.stock > 0);
  if (state.q) list = list.filter(i => i.name.toLowerCase().includes(state.q));
  const cmp =
    state.sort === "price-asc" ? (a, b) => a.price - b.price :
    state.sort === "name" ? (a, b) => a.name.localeCompare(b.name) :
    state.sort === "rarity" ? (a, b) => (RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)) || (b.price - a.price) :
    (a, b) => b.price - a.price;
  return list.sort(cmp);
}

/* ---------- card ---------- */
/* deterministic "market value" compare-at price so each item shows an honest-feeling
   discount off what the value sites list (the shops all do this) */
function saleInfo(i) {
  if (i.price <= 45) return null;                        // only premium items are on sale
  let h = 2166136261;
  for (let k = 0; k < i.id.length; k++) { h ^= i.id.charCodeAt(k); h = Math.imul(h, 16777619); }
  const mult = 1.2 + ((h >>> 0) % 55) / 100;            // 1.20 .. 1.74
  const was = Math.max(i.price + 0.5, Math.round(i.price * mult * 100) / 100);
  const pct = Math.round((was - i.price) / was * 100);
  return { was, pct, save: Math.round((was - i.price) * 100) / 100 };
}
function cardHTML(i) {
  const left = i.stock - (state.cart[i.id] || 0);
  const inCart = (state.cart[i.id] || 0) > 0;
  const pill = PILL[i.rarity] || "common";
  const crop = i.img && (i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") || i.img.startsWith("assets/baddies/") || i.img.startsWith("assets/accounts/"));
  const variant = i.badge && i.badge !== "CHROMA" && i.badge !== "FX"
    ? `<span class="pill" style="--pill-bg:var(--pill-rare-bg);--pill-ink:var(--pill-rare-ink)">${i.badge}</span>` : "";
  const fx = i.badge === "FX" ? `<span class="pill">FX</span>` : "";
  const s = saleInfo(i);
  return `<article class="card" data-id="${i.id}" data-rarity="${pill}" style="--rar:var(--pill-${pill}-ink);--rar-soft:var(--pill-${pill}-bg)">
    <div class="card-art ${crop ? "is-crop" : ""}">
      ${i.img ? `<img loading="lazy" src="${imgSrc(i.img)}" alt="">`
              : `<span class="card-noart" aria-hidden="true">${i.name[0]}</span>`}
      ${s ? `<span class="card-save">-${s.pct}%</span>` : ""}
      ${i.stock > 1 ? `<span class="card-stock">×${i.stock} left</span>` : ""}
    </div>
    <div class="card-body">
      <div class="card-name">${i.name}</div>
      <div class="card-tags">
        <span class="pill" style="--pill-bg:var(--pill-${pill}-bg);--pill-ink:var(--pill-${pill}-ink)">${i.rarity}</span>
        ${variant}${fx}
      </div>
      <div class="card-row">
        <span class="card-prices"><span class="card-price">${money(i.price)}</span>${s ? `<s class="card-was">${money(s.was)}</s>` : ""}</span>
        <button class="card-buy ${inCart ? "in-cart" : ""}" data-add="${i.id}" ${left <= 0 ? "disabled" : ""}>
          ${left <= 0 ? "In cart" : inCart ? `Add another` : "Add to cart"}
        </button>
      </div>
    </div>
  </article>`;
}

function bindBuyButtons(root) {
  $$("[data-add]", root).forEach(b => b.addEventListener("click", () => addToCart(b.dataset.add, b)));
}

/* ---------- render ---------- */
function render() {
  const list = visible();
  const grid = $("#grid");

  // result line
  const bits = [`${list.length} item${list.length !== 1 ? "s" : ""}`];
  if (state.cat !== "all") bits.push(CATS[state.game].find(c => c[0] === state.cat)[1].toLowerCase());
  if (state.q) bits.push(`matching “${state.q}”`);
  $("#resultLine").textContent = bits.join(" · ");
  $("#sheetCount").textContent = list.length;

  if (!list.length) {
    grid.classList.remove("grouped");
    grid.innerHTML = `<div class="grid-empty">
      <b>Nothing matches that.</b>
      <span>Try clearing a filter or picking another category.</span>
      <button class="btn-clear" id="clearEmpty">Clear filters</button></div>`;
    const ce = $("#clearEmpty"); if (ce) ce.addEventListener("click", clearFilters);
  } else if (state.sort === "rarity") {
    grid.classList.add("grouped");
    const order = RARITY_ORDER.filter(r => list.some(i => i.rarity === r));
    grid.innerHTML = order.map(r => {
      const items = list.filter(i => i.rarity === r);
      const pill = PILL[r] || "common";
      return `<section class="rar-group">
        <header class="rar-group-head" style="--pill-ink:var(--pill-${pill}-ink)">
          <span class="rg-dot"></span><h3>${r}</h3><span class="rg-n">${items.length}</span>
        </header>
        <div class="subgrid">${items.map(cardHTML).join("")}</div>
      </section>`;
    }).join("");
  } else {
    grid.classList.remove("grouped");
    grid.innerHTML = list.map(cardHTML).join("");
  }
  bindBuyButtons(grid);
  renderApplied();
  updateFiltersBadge();
  // defer the sticky-offset read to the next frame so it never forces a
  // synchronous reflow of the freshly-built grid (that was the switch lag)
  requestAnimationFrame(setStickyVars);
  syncAcctButtons();

  // keep featured buttons in sync
  $$("#featuredRow [data-add]").forEach(b => {
    const i = byId[b.dataset.add];
    const left = i.stock - (state.cart[i.id] || 0);
    b.disabled = left <= 0;
    b.textContent = left <= 0 ? "In cart" : (state.cart[i.id] ? "Add another" : "Add to cart");
    b.classList.toggle("in-cart", (state.cart[i.id] || 0) > 0);
  });
}

/* ---------- applied filters + badges ---------- */
function renderApplied() {
  const chips = [];
  if (state.cat !== "all")
    chips.push(`<button class="applied-chip" data-clear="cat">${CATS[state.game].find(c => c[0] === state.cat)[1]}<span aria-hidden="true">✕</span></button>`);
  [...state.rarity].sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b))
    .forEach(r => chips.push(`<button class="applied-chip" data-clear="rar:${r}">${r}<span aria-hidden="true">✕</span></button>`));
  if (state.inStock) chips.push(`<button class="applied-chip" data-clear="instock">In stock<span aria-hidden="true">✕</span></button>`);

  const box = $("#applied");
  if (!chips.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<span class="applied-label">Filtering by</span>${chips.join("")}<button class="applied-clear" data-clear="all">Clear all</button>`;
  $$("#applied [data-clear]").forEach(b => b.addEventListener("click", () => clearOne(b.dataset.clear)));
}
function clearOne(k) {
  if (k === "all") return clearFilters();
  if (k === "cat") { state.cat = "all"; buildCatTabs(); }
  else if (k === "instock") { state.inStock = false; syncInStockUI(); }
  else if (k.startsWith("rar:")) state.rarity.delete(k.slice(4));
  buildRarityChips();
  render();
}
function clearFilters() {
  state.cat = "all"; state.rarity = new Set(); state.inStock = false;
  syncInStockUI(); buildCatTabs(); buildRarityChips(); render();
}
function updateFiltersBadge() {
  const n = (state.cat !== "all" ? 1 : 0) + state.rarity.size + (state.inStock ? 1 : 0);
  const b = $("#filtersBadge");
  if (n) { b.hidden = false; b.textContent = n; } else b.hidden = true;
  $("#filtersBtn").classList.toggle("has-filters", n > 0);
}

/* ---------- mobile filter sheet ---------- */
const filterSheet = $("#filterSheet"), scrim = $("#scrim");
function openSheet() { filterSheet.hidden = false; scrim.hidden = false; $("#closeSheet").focus(); }
function closeSheet() { filterSheet.hidden = true; if ($("#drawer").hidden) scrim.hidden = true; }
$("#filtersBtn").addEventListener("click", openSheet);
$("#closeSheet").addEventListener("click", closeSheet);
$("#applyFilters").addEventListener("click", closeSheet);
$("#sheetClear").addEventListener("click", clearFilters);

/* ---------- cart ---------- */
const entries = () => Object.entries(state.cart).filter(([, q]) => q > 0);
const cartTotal = () => entries().reduce((n, [id, q]) => n + byId[id].price * q, 0);
const cartCount = () => entries().reduce((n, [, q]) => n + q, 0);

function addToCart(id, btn) {
  const item = byId[id];
  const q = state.cart[id] || 0;
  if (q >= item.stock) return;
  state.cart[id] = q + 1;
  save("rbx-cart", state.cart);
  flyToCart(btn);
  syncCount();
  render();
}
function setQty(id, q) {
  state.cart[id] = Math.max(0, Math.min(q, byId[id].stock));
  if (!state.cart[id]) delete state.cart[id];
  save("rbx-cart", state.cart);
  syncCount(); renderDrawer(); render();
}
function syncCount() {
  const n = cartCount();
  ["#cartCount", "#botCartCount"].forEach(sel => {
    const el = $(sel); if (!el) return;
    el.hidden = n === 0;
    el.textContent = n;
  });
}

function renderDrawer() {
  const body = $("#drawerBody");
  const es = entries();
  if (!es.length) {
    body.innerHTML = `<div class="cart-empty">Your cart is empty.</div>`;
    $("#drawerFoot").innerHTML = "";
    return;
  }
  body.innerHTML = es.map(([id, q]) => {
    const i = byId[id];
    return `<div class="cart-row">
      ${i.img ? `<img src="${imgSrc(i.img)}" alt="">` : `<span></span>`}
      <div>
        <div class="cart-row-name">${i.name}</div>
        <div class="cart-row-sub">${GAME_LABEL[i.game]} · ${i.rarity}</div>
        <div class="qty-mini">
          <button data-dec="${id}" aria-label="One less ${i.name}">−</button>
          <span>${q}</span>
          <button data-inc="${id}" aria-label="One more ${i.name}" ${q >= i.stock ? "disabled" : ""}>+</button>
          <em>of ${i.stock}</em>
        </div>
      </div>
      <div class="cart-row-end">
        <span class="cart-row-price">${money(i.price * q)}</span>
        <button class="cart-remove" data-rm="${id}">Remove</button>
      </div>
    </div>`;
  }).join("");
  $("#drawerFoot").innerHTML = `
    <div class="total-row"><span>${cartCount()} item${cartCount() > 1 ? "s" : ""}</span><b>${money(cartTotal())}</b></div>
    <button class="primary-btn" id="goCheckout">Check out</button>`;
  $$("#drawerBody [data-inc]").forEach(b => b.addEventListener("click", () => setQty(b.dataset.inc, (state.cart[b.dataset.inc] || 0) + 1)));
  $$("#drawerBody [data-dec]").forEach(b => b.addEventListener("click", () => setQty(b.dataset.dec, (state.cart[b.dataset.dec] || 0) - 1)));
  $$("#drawerBody [data-rm]").forEach(b => b.addEventListener("click", () => setQty(b.dataset.rm, 0)));
  $("#goCheckout").addEventListener("click", openCheckout);
}

const drawer = $("#drawer");
function openDrawer() { renderDrawer(); drawer.hidden = false; scrim.hidden = false; $("#closeDrawer").focus(); }
function closeDrawer() { drawer.hidden = true; if (filterSheet.hidden) scrim.hidden = true; }
$("#cartBtn").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
scrim.addEventListener("click", () => { closeSheet(); closeDrawer(); });

/* ---------- checkout ---------- */
const co = $("#checkout"), coBody = $("#checkoutBody");
const setCoWide = on => $(".checkout-panel")?.classList.toggle("co-wide", !!on);

/* real VIP private-server links, one per game. Accounts use the live chat instead. */
const VIP_LINKS = {
  mm2:     "https://www.roblox.com/share?code=31918145a25ec44d91400d790306df2b&type=Server",
  am:      "https://www.roblox.com/games/920587237?privateServerLinkCode=_K_fHtcXliZJ6bU50wdT1xG_8VlH25O2",
  nfl:     "https://www.roblox.com/share?code=a687359d4575e84a89ea666f407914fe&type=Server",
  baddies: "https://www.roblox.com/share?code=0d70f61fd27dee44ad02faccedee7dfa&type=Server",
};
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- the queue: device-local, driven by real order timestamps ---------- */
function queueInfo(order, orders) {
  const DAY2 = 48 * 3600 * 1000;
  const now = Date.now(), t = +new Date(order.when);
  // live orders (last 48h) placed at or before this one. The queue starts empty
  // (0 people) and only real orders made on this device ever count.
  // only active (not-yet-delivered) orders from the last 48h hold a spot
  const pos = Math.max(1, orders.filter(o =>
    !o.done && now - +new Date(o.when) < DAY2 && +new Date(o.when) <= t).length);
  const ahead = pos - 1;                       // people in front of this order
  // wait bands scale with how many are in the queue:
  //   1-10 in queue  -> 1 to 30 minutes
  //   11-50 in queue -> 1 to 3 hours
  const big = pos > 10;
  const waitLo = 1;
  const waitHi = big ? 3 : 30;
  const waitUnit = big ? "hours" : "minutes";
  const capMin = big ? waitHi * 60 : waitHi;
  const elapsedMin = (now - t) / 60000;
  const pct = Math.round(Math.min(92, Math.max(8, (elapsedMin / capMin) * 100)));
  return { pos, ahead, waitLo, waitHi, waitUnit, pct };
}

/* shared inline icons */
const IC = {
  link: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20l1-4.9a8.4 8.4 0 1 1 17-3.6Z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  user: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.4 8-6.4s7 2.2 8 6.4"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8a3 3 0 1 0-3-3c0 2 3 3 3 3ZM12 8a3 3 0 1 1 3-3c0 2-3 3-3 3Z"/></svg>`,
  send: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>`,
  chev: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

const CHAT_SEED = {
  account: "The account login lands right here the moment the owner is online. Leave a message and it'll be waiting.",
  fallback: "Can't get into the VIP server? Send a message here and the owner will sort out another way to trade.",
};

/* one chat log per order, keyed by order number. Each message carries who:
   "buyer" | "owner"; perspective decides which side is "me" (right) vs "them". */
function paintChat(logEl, key, perspective, seed) {
  const msgs = load(key, []);
  logEl.innerHTML =
    (seed ? `<div class="chat-msg chat-sys">${seed}</div>` : "") +
    msgs.map(m => `<div class="chat-msg ${(m.who || "buyer") === perspective ? "chat-me" : "chat-them"}">${esc(m.t)}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
}
function pushChat(key, text, who) {
  const msgs = load(key, []);
  msgs.push({ t: text, when: Date.now(), who });
  save(key, msgs);
}

/* live sync: any open chat repaints the moment the other side sends, with no
   reload. A `storage` event fires in every OTHER tab of this browser, and the
   interval catches the sending tab too. (Across separate devices, live chat
   needs a shared backend — localStorage only syncs within one browser.) */
function syncChats() {
  $$(".coq-chat").forEach(box => {
    const log = $(".chat-log", box);
    if (!log) return;
    const key = "rbx-chat-" + box.dataset.order;
    const msgs = load(key, []);
    if (+log.dataset.n === msgs.length) return;          // nothing new — don't disturb
    const persp = box.dataset.persp || "buyer";
    const seed = persp === "owner" ? "" : (CHAT_SEED[box.dataset.mode] || CHAT_SEED.account);
    paintChat(log, key, persp, seed);
    log.dataset.n = msgs.length;
    if (persp === "owner") save("rbx-seen-" + box.dataset.order, msgs.length);
  });
  if (typeof refreshOwnerBadge === "function") refreshOwnerBadge();
}
window.addEventListener("storage", syncChats);
setInterval(syncChats, 1200);

function queueHTML(order, orders) {
  const games = [...new Set((order.items || []).map(x => byId[x.id]?.game).filter(Boolean))];
  const vipGames = games.filter(g => VIP_LINKS[g]);
  const hasAccounts = games.includes("accounts");
  const accountsOnly = hasAccounts && !vipGames.length;
  const chatMode = hasAccounts ? "account" : "fallback";

  // the chat stays folded until you click the summary — keeps the page calm
  const chatFold = summary => `
    <details class="coq-fold coq-chatfold">
      <summary><span class="fold-ic">${IC.chat}</span><span class="fold-tx">${summary}</span><span class="fold-chev">${IC.chev}</span></summary>
      <div class="coq-chat" data-order="${esc(order.no)}" data-mode="${chatMode}" data-persp="buyer">
        <div class="chat-log" aria-live="polite"></div>
        <form class="chat-form" autocomplete="off">
          <input class="chat-input" type="text" maxlength="240" placeholder="Message the owner" aria-label="Message the owner">
          <button class="chat-send" type="submit" aria-label="Send message">${IC.send}</button>
        </form>
      </div>
    </details>`;

  /* delivered orders: no queue, no VIP — just a receipt + the chat */
  if (order.done) {
    return `
      <div class="q-slim">
        <div class="q-order q-delivered">
          <span class="qo-label">Your order number</span>
          <b class="qo-code">${esc(order.no)}</b><span class="qo-pos qo-pos-done">Delivered</span>
          <p class="qo-wait">This order has been delivered. Thanks for shopping with us!</p>
        </div>
        ${chatFold("Open live chat")}
      </div>`;
  }

  /* account-only orders: no queue, no wait — just the live chat, one click away */
  if (accountsOnly) {
    return `
      <div class="q-slim">
        <div class="q-order">
          <span class="qo-label">Your order number</span>
          <b class="qo-code">${esc(order.no)}</b><span class="qo-pos qo-pos-plain">No queue</span>
          <p class="qo-wait">Delivered to you in the live chat.</p>
        </div>
        ${chatFold("Open live chat")}
        <p class="qo-fine">The owner sends the account email and password in the chat as soon as they're online.</p>
      </div>`;
  }

  /* game / mixed orders: order number + wait, the VIP link, and two folded panels
     (the steps, and the chat fallback) so nothing hits all at once */
  const q = queueInfo(order, orders);
  const waitTxt = `${q.waitLo} to ${q.waitHi} ${q.waitUnit}`;
  // the VIP link is hidden until the buyer reaches the front of the queue
  const atFront = q.ahead === 0;
  const lockIc = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2.2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>`;
  const vipTiles = atFront
    ? vipGames.map(g =>
        `<a class="coq-tile" href="${VIP_LINKS[g]}" target="_blank" rel="noopener">
           <span class="qi-ic">${IC.link}</span>
           <span class="coq-tx"><b>${esc(GAME_LABEL[g])} VIP server</b><i>You're up — open it now</i></span></a>`).join("")
    : `<div class="coq-tile coq-tile-locked" aria-disabled="true">
         <span class="qi-ic">${lockIc}</span>
         <span class="coq-tx"><b>VIP server locked</b><i>Unlocks when you reach the front of the queue</i></span></div>`;

  return `
    <div class="q-slim">
      <div class="q-order">
        <span class="qo-label">Your order number</span>
        <b class="qo-code">${esc(order.no)}</b><span class="qo-pos">${q.ahead === 0 ? "You're next" : q.ahead + " ahead of you"}</span>
        <p class="qo-wait">Estimated wait: ${waitTxt}</p>
      </div>
      <div class="coq-links">${vipTiles}</div>
      <details class="coq-fold">
        <summary><span class="fold-ic">${IC.bell}</span><span class="fold-tx">When it's your turn</span><span class="fold-chev">${IC.chev}</span></summary>
        <ol class="q-turn">
          <li><span class="qt-ic">${IC.bell}</span><div class="qt-tx"><b>1. You reach the front</b><p>Your spot moves up to the front of the queue.</p></div></li>
          <li><span class="qt-ic">${IC.link}</span><div class="qt-tx"><b>2. Join the VIP server</b><p>Open the VIP link above and hop in. Can't join? Use the chat.</p></div></li>
          <li><span class="qt-ic">${IC.user}</span><div class="qt-tx"><b>3. Your items are prepared</b><p>Your order is matched to your code and sent to you inside the server.</p></div></li>
          <li><span class="qt-ic">${IC.gift}</span><div class="qt-tx"><b>4. Accept the trade</b><p>The trade comes through in game. Accept it and you're done.</p></div></li>
        </ol>
      </details>
      ${chatFold("Can't join the server? Open live chat")}
      <p class="qo-fine">Wait times aren't always exact, they shift with the owner's availability.</p>
    </div>`;
}

/* buyer-side chat: buyer messages sit right, owner replies land left */
function bindQueueChat(root = document) {
  $$(".coq-chat", root).forEach(box => {
    const key = "rbx-chat-" + box.dataset.order;
    const seed = CHAT_SEED[box.dataset.mode] || CHAT_SEED.account;
    const log = $(".chat-log", box), form = $(".chat-form", box), input = $(".chat-input", box);
    const repaint = () => paintChat(log, key, "buyer", seed);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      pushChat(key, t, "buyer");
      input.value = "";
      repaint();
    });
    repaint();
  });
}
let payingTotal = 0;
function openCheckout() {
  setCoWide(false);
  if (!entries().length) return;
  closeDrawer(); co.hidden = false; stepSummary();
}
function closeCheckout() { co.hidden = true; }
$("#closeCheckout").addEventListener("click", closeCheckout);

function linesHTML(es) {
  const rows = es.map(([id, q]) => {
    const i = byId[id];
    return `<div class="co-line"><span>${i.name}${q > 1 ? ` ×${q}` : ""}</span>
      <span class="co-price">${money(i.price * q)}</span></div>`;
  }).join("");
  return `<div class="co-summary">${rows}
    <div class="co-line co-total"><span>Total</span><span class="co-price">${money(cartTotal())}</span></div></div>`;
}

const coCrop = p => !!p && (p.startsWith("assets/items/") || p.startsWith("assets/nfl/") || p.startsWith("assets/baddies/") || p.startsWith("assets/accounts/"));

/* payment-method marks (Stripe renders the real branded element once connected) */
const PAY_IC = {
  card: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19" stroke-width="2.4"/></svg>`,
  paypal: `<svg viewBox="0 0 24 24" width="16" height="18"><path d="M7.6 20.5H5.2L7.4 5.9c.05-.3.3-.5.6-.5h5.2c2.9 0 4.7 1.5 4.2 4.3-.5 3-2.7 4.3-5.6 4.3H9.9c-.3 0-.55.2-.6.5l-.6 4c-.05.3-.3.5-.6.5z" fill="#002c8a"/><path d="M18.2 8.3c.5 2.9-1.4 4.9-4.6 4.9h-1.8c-.3 0-.55.2-.6.5l-.8 5.3c-.04.26.16.5.43.5h2.1c.26 0 .48-.19.52-.44l.5-3.2c.04-.25.26-.44.52-.44h1.3c2.6 0 4.5-1.4 4.9-3.9.28-1.7-.4-3-1.6-3.6-.1.6-.2 1.2-.37 1.79z" fill="#009be1"/></svg>`,
  apple: `<svg viewBox="0 0 24 24" width="15" height="18" fill="currentColor"><path d="M16.37 1.43c0 1.14-.42 2.19-1.11 2.99-.84.95-2.21 1.68-3.38 1.59-.14-1.12.42-2.28 1.06-3.03.72-.85 2.29-1.43 3.43-1.55zM20.5 17.02c-.55 1.28-.82 1.85-1.53 2.98-.99 1.58-2.39 3.55-4.12 3.56-1.54.02-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.73-.02-3.06-1.79-4.05-3.37C.13 15.77-.16 10.6 1.55 7.84 2.76 5.89 4.68 4.75 6.48 4.75c1.84 0 2.99 1.01 4.51 1.01 1.47 0 2.37-1.01 4.5-1.01 1.61 0 3.31.88 4.52 2.39-3.97 2.18-3.32 7.85.49 7.89z"/></svg>`,
  google: `<svg viewBox="0 0 24 24" width="17" height="17"><path d="M21.6 12.2c0-.64-.06-1.25-.16-1.84H12v3.49h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.17z" fill="#4285f4"/><path d="M12 22c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.09v2.58A9.99 9.99 0 0 0 12 22z" fill="#34a853"/><path d="M6.42 13.92a5.99 5.99 0 0 1 0-3.84V7.5H3.09a10 10 0 0 0 0 9l3.33-2.58z" fill="#fbbc05"/><path d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.86-2.86C16.95 2.98 14.7 2 12 2A9.99 9.99 0 0 0 3.09 7.5l3.33 2.58C7.2 7.72 9.4 5.96 12 5.96z" fill="#ea4335"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>`,
};

function stepSummary() {
  const es = entries();
  coBody.innerHTML = `
    <p class="co-step">Step 1 of 3</p>
    <h2 class="co-title" id="checkoutTitle">Your order</h2>
    <div class="co-items">
      ${es.map(([id, q]) => {
        const i = byId[id];
        return `<div class="co-item">
          <span class="co-thumb ${coCrop(i.img) ? "is-crop" : ""}">${i.img ? `<img src="${imgSrc(i.img)}" alt="" loading="lazy">` : `<span>${esc(i.name[0])}</span>`}</span>
          <span class="co-item-main"><b>${esc(i.name)}</b><i>${esc(GAME_LABEL[i.game] || "")}${q > 1 ? ` · ×${q}` : ""}</i></span>
          <span class="co-item-price">${money(i.price * q)}</span>
        </div>`;
      }).join("")}
    </div>
    <div class="co-totrow"><span>Total</span><b>${money(cartTotal())}</b></div>
    <button class="primary-btn" id="coNext">Continue to payment</button>`;
  $("#coNext").addEventListener("click", stepPay);
}

/* Step 2: collect who we're delivering to, then hand off to Stripe's hosted
   checkout. Card details never touch this site. */
function stepPay() {
  payingTotal = cartTotal();
  coBody.innerHTML = `
    <p class="co-step">Step 2 of 3</p>
    <h2 class="co-title" id="checkoutTitle">Your details</h2>
    <form id="payForm" novalidate>
      <div class="co-field"><label for="f-name">Full name</label>
        <input id="f-name" name="name" required autocomplete="name"></div>
      <div class="pay-2col">
        <div class="co-field"><label for="f-user">Roblox username</label>
          <input id="f-user" name="user" required autocomplete="off" placeholder="Who gets the items"></div>
        <div class="co-field"><label for="f-mail">Email</label>
          <input id="f-mail" name="mail" type="email" required autocomplete="email" placeholder="For your receipt"></div>
      </div>

      <div class="pay-panel pay-wallet">
        <p>You'll finish on <b>Stripe's secure page</b> — card, Apple&nbsp;Pay or Google&nbsp;Pay. Your card details are never seen by us.</p>
      </div>

      <button class="primary-btn pay-submit" type="submit"><span class="pay-lock">${PAY_IC.lock}</span><span data-pay-label>Pay ${money(payingTotal)}</span></button>
      <p class="pay-err" id="payErr" hidden></p>
      <p class="co-note pay-secure"><span class="pay-lock">${PAY_IC.lock}</span> Secure checkout, powered by Stripe.</p>
    </form>`;

  const form = $("#payForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const btn = $(".pay-submit", coBody), label = $("[data-pay-label]", coBody), err = $("#payErr");
    err.hidden = true;
    btn.disabled = true;
    label.textContent = "Taking you to Stripe…";
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: entries().map(([id, q]) => ({ id, q })),
          user: form.user.value.trim(),
          email: form.mail.value.trim(),
          name: form.name.value.trim(),
          orderNo: orderNumber(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || "Could not start checkout.");
      location.href = d.url;
    } catch (ex) {
      btn.disabled = false;
      label.textContent = `Pay ${money(payingTotal)}`;
      err.textContent = `${ex.message} If it keeps happening, message us in the live chat.`;
      err.hidden = false;
    }
  });
}

function orderNumber() {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `RBX-${t}${r}`;
}

function stepDone(username) {
  const no = orderNumber();
  const es = entries();
  const orders = load("rbx-orders", []);
  orders.push({ no, when: new Date().toISOString(), user: username,
    total: payingTotal, items: es.map(([id, q]) => ({ id, q })) });
  save("rbx-orders", orders);

  const order = orders[orders.length - 1];
  const gamesInOrder = [...new Set(es.map(([id]) => byId[id]?.game).filter(Boolean))];
  const acctOnly = gamesInOrder.length > 0 && gamesInOrder.every(g => g === "accounts");
  setCoWide(false);
  coBody.innerHTML = `
    <p class="co-step">Step 3 of 3</p>
    <h2 class="co-title" id="checkoutTitle">${acctOnly ? `Your account is on the way, ${esc(username)}` : `You're in the queue, ${esc(username)}`}</h2>
    ${queueHTML(order, orders)}
    <p class="co-note">Your order number is saved on this device under "My order".
    Have it handy ${acctOnly ? "in the chat" : "for the trade"}.</p>
    ${linesHTML(es)}
    <button class="primary-btn" id="coDone" style="margin-top:16px">Done</button>`;
  $("#coDone").addEventListener("click", closeCheckout);
  bindQueueChat(coBody);

  state.cart = {};
  save("rbx-cart", state.cart);
  syncCount(); render();
}

/* Shown when Stripe sends the buyer back after a real payment. `d` comes from
   /api/order, which asks Stripe directly — so this can't be faked from the URL. */
function showPaidOrder(d) {
  const orders = load("rbx-orders", []);
  if (!orders.some(o => o.no === d.orderNo)) {
    orders.push({ no: d.orderNo, when: new Date().toISOString(), user: d.user,
      total: d.total, items: d.items, paid: true });
    save("rbx-orders", orders);
  }
  const order = orders.find(o => o.no === d.orderNo);
  const es = (d.items || []).map(x => [x.id, x.q]);
  const games = [...new Set(es.map(([id]) => byId[id]?.game).filter(Boolean))];
  const acctOnly = games.length > 0 && games.every(g => g === "accounts");

  setCoWide(false);
  co.hidden = false;
  coBody.innerHTML = `
    <p class="co-step">Payment confirmed</p>
    <h2 class="co-title" id="checkoutTitle">${acctOnly ? `Your account is on the way, ${esc(d.user)}` : `You're in the queue, ${esc(d.user)}`}</h2>
    ${queueHTML(order, orders)}
    <p class="co-note">Paid ${money(d.total)}. Your order number is saved on this device under "My order".
    Have it handy ${acctOnly ? "in the chat" : "for the trade"}.</p>
    ${es.length ? linesHTML(es) : ""}
    <button class="primary-btn" id="coDone" style="margin-top:16px">Done</button>`;
  $("#coDone").addEventListener("click", closeCheckout);
  bindQueueChat(coBody);

  state.cart = {};
  save("rbx-cart", state.cart);
  syncCount(); render();
}

/* Stripe return: /?paid=<session_id> on success, /?canceled=1 if they backed out */
(function stripeReturn() {
  const p = new URLSearchParams(location.search);
  const paid = p.get("paid"), canceled = p.get("canceled");
  if (!paid && !canceled) return;
  const clean = () => history.replaceState(null, "", location.pathname + location.hash);

  if (canceled) { clean(); openDrawer(); return; }

  setCoWide(false);
  co.hidden = false;
  coBody.innerHTML = `<h2 class="co-title">Confirming your payment…</h2>
    <p class="co-note">One second, checking with Stripe.</p>`;

  fetch(`/api/order?session_id=${encodeURIComponent(paid)}`)
    .then(r => r.json())
    .then(d => {
      clean();
      if (d && d.paid) showPaidOrder(d);
      else coBody.innerHTML = `<h2 class="co-title">Payment wasn't completed</h2>
        <p class="co-note">Nothing was charged. If you think this is wrong, open the live chat and we'll check it.</p>`;
    })
    .catch(() => {
      clean();
      coBody.innerHTML = `<h2 class="co-title">Couldn't confirm the payment</h2>
        <p class="co-note">If you were charged, open the live chat with your email and we'll sort it right away.</p>`;
    });
})();

/* ---------- order lookup: past orders are clickable and pull themselves up ---------- */
function openMyOrder(selectedNo) {
  const orders = load("rbx-orders", []);
  co.hidden = false;
  if (!orders.length) {
    setCoWide(false);
    coBody.innerHTML = `
      <h2 class="co-title" id="checkoutTitle">My order</h2>
      <p class="co-note">No orders on this device yet. When you check out, your order number
      shows up here.</p>`;
    return;
  }
  setCoWide(false);
  const sel = orders.find(o => o.no === selectedNo) || orders[orders.length - 1];
  const others = orders.filter(o => o.no !== sel.no).reverse();
  coBody.innerHTML = `
    <h2 class="co-title" id="checkoutTitle">My order${orders.length > 1 ? "s" : ""}</h2>
    ${queueHTML(sel, orders)}
    ${others.length ? `<div class="order-list">
      <p class="ol-label">Past orders</p>` +
      others.map(o => `
      <button class="order-row${o.no === sel.no ? " is-on" : ""}" data-order-no="${esc(o.no)}">
        <span><b>${esc(o.no)}</b> · ${new Date(o.when).toLocaleDateString()} · ${o.items.reduce((n, x) => n + x.q, 0)} items</span>
        <span class="co-price">${money(o.total)}</span></button>`).join("") + `</div>` : ""}`;
  $$("#checkoutBody .order-row").forEach(b =>
    b.addEventListener("click", () => openMyOrder(b.dataset.orderNo)));
  bindQueueChat(coBody);
}
$("#orderLookupBtn").addEventListener("click", () => openMyOrder());

/* ---------- owner console: unlocked only on the owner's own device ----------
   Visiting ?owner=<key> once flips a localStorage flag on THIS device; the console
   then lists every order on the device with its own separate chat thread so the
   owner can read and reply. (Live chat across devices would need a shared backend;
   here each browser keeps its own copy.) */
/* The owner password is NEVER in this file — it lives in the OWNER_PASSWORD env
   var on Vercel and is only ever checked server-side. Visiting /?owner=<password>
   once stores it on this device and reveals the console. */
const ownerPanel = $("#ownerPanel"), ownerBody = $("#ownerBody"), ownerBtn = $("#ownerBtn");
const ownerKey = () => localStorage.getItem("rbx-owner-key") || "";
let ownerOrders = [];

function unreadFor(no) {
  const seen = load("rbx-seen-" + no, 0);
  return load("rbx-chat-" + no, []).slice(seen).filter(m => (m.who || "buyer") === "buyer").length;
}
function ownerUnread() {
  return unreadFor("general") + load("rbx-orders", []).reduce((n, o) => n + unreadFor(o.no), 0);
}
function refreshOwnerBadge() {
  const badge = $("#ownerFabBadge");
  if (!badge) return;
  const n = ownerUnread();
  badge.textContent = n;
  badge.hidden = n === 0;
}

(function ownerUnlock() {
  const p = new URLSearchParams(location.search);
  const given = p.get("owner");
  if (given) {
    localStorage.setItem("rbx-owner-key", given);   // verified server-side, not here
    localStorage.setItem("rbx-owner", "1");
    p.delete("owner");
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  if (localStorage.getItem("rbx-owner") === "1" && ownerBtn) {
    ownerBtn.hidden = false;
    refreshOwnerBadge();
    window.addEventListener("storage", refreshOwnerBadge);
    setInterval(refreshOwnerBadge, 20000);
  }
})();

function openOwner() { renderOwnerList(); ownerPanel.hidden = false; }
function closeOwner() { ownerPanel.hidden = true; refreshOwnerBadge(); }

/* Delivered-state lives in the owner's own storage, keyed by order number, so it
   works for Stripe orders too (which never touch this device's rbx-orders). */
function isDone(no) { return !!load("rbx-done", {})[no]; }
function setOrderDone(no, done) {
  const m = load("rbx-done", {});
  if (done) m[no] = true; else delete m[no];
  save("rbx-done", m);
  const orders = load("rbx-orders", []);          // keep a same-device buyer record in sync
  const o = orders.find(x => x.no === no);
  if (o) { o.done = done; save("rbx-orders", orders); }
}

function generalRowHTML() {
  const gUnread = unreadFor("general");
  const gCount = load("rbx-chat-general", []).length;
  return `
    <button class="own-row" data-own="general">
      <span class="own-av own-av-web">${IC.chat}</span>
      <span class="own-main">
        <b>Website chat</b>
        <i>Pre-sale &amp; general questions${gCount ? "" : " · no messages yet"}</i>
      </span>
      ${gUnread ? `<span class="own-badge">${gUnread}</span>` : ""}
      <span class="own-go">${IC.chev}</span>
    </button>`;
}

/* Real paid orders come from Stripe (every buyer, any device), not localStorage. */
async function renderOwnerList() {
  ownerBody.innerHTML = `
    <h2 class="co-title">Owner console</h2>
    <p class="co-note">Loading paid orders from Stripe…</p>
    <div class="own-list">${generalRowHTML()}</div>`;
  $$("#ownerBody .own-row").forEach(b => b.addEventListener("click", () => renderOwnerChat(b.dataset.own)));

  let err = null;
  try {
    const r = await fetch("/api/orders", { headers: { "x-owner-key": ownerKey() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) err = d.error || `Couldn't load orders (${r.status}).`;
    else ownerOrders = d.orders || [];
  } catch {
    err = "Couldn't reach the server. Orders only load on the live site, not a local preview.";
  }

  ownerBody.innerHTML = `
    <h2 class="co-title">Owner console</h2>
    <p class="co-note">${err ? "Website chat still works below." :
      `${ownerOrders.length} paid order${ownerOrders.length === 1 ? "" : "s"} from Stripe, newest first. Every buyer, any device.`}</p>
    ${err ? `<p class="pay-err">${esc(err)}</p>` : ""}
    <div class="own-list">
      ${generalRowHTML()}
      ${ownerOrders.map(o => {
        const games = [...new Set((o.items || []).map(x => byId[x.id]?.game).filter(Boolean))];
        const tag = games.length === 1 && games[0] === "accounts"
          ? "Account" : games.map(g => GAME_LABEL[g] || g).join(", ");
        const n = (o.items || []).reduce((a, x) => a + x.q, 0);
        const unread = unreadFor(o.no);
        const done = isDone(o.no);
        return `
        <button class="own-row${done ? " own-row-done" : ""}" data-own="${esc(o.no)}">
          <span class="own-av">${esc((o.user || "?").slice(0, 1).toUpperCase())}</span>
          <span class="own-main">
            <b>${esc(o.user || "Buyer")}</b>
            <i>${esc(o.no)} · ${n} item${n === 1 ? "" : "s"} · ${money(o.total)} · ${done ? "Delivered" : esc(tag || "order")}</i>
          </span>
          ${unread ? `<span class="own-badge">${unread}</span>` : ""}
          <span class="own-go">${IC.chev}</span>
        </button>`;
      }).join("")}
    </div>`;
  $$("#ownerBody .own-row").forEach(b => b.addEventListener("click", () => renderOwnerChat(b.dataset.own)));
}

function renderOwnerChat(no) {
  const isGeneral = no === "general";
  const o = isGeneral
    ? { no: "general", user: "Website visitor", total: 0, items: [] }
    : (ownerOrders.find(x => x.no === no) || load("rbx-orders", []).find(x => x.no === no));
  if (!o) return renderOwnerList();
  const key = "rbx-chat-" + no;
  const done = isGeneral ? false : isDone(no);
  const lines = isGeneral
    ? "Pre-sale / general question — no order attached yet."
    : (o.items || []).map(x => `${byId[x.id]?.name || x.id}${x.q > 1 ? " ×" + x.q : ""}`).join(", ");
  const when = o.when ? new Date(o.when).toLocaleString() : "";
  ownerBody.innerHTML = `
    <button class="own-back" id="ownBack">${IC.chev}<span>All chats</span></button>
    <div class="own-chat-head">
      <span class="own-av own-av-lg${isGeneral ? " own-av-web" : ""}">${isGeneral ? IC.chat : esc((o.user || "?").slice(0, 1).toUpperCase())}</span>
      <div><b>${esc(o.user || "Buyer")}</b><i>${isGeneral ? "Website chat" : esc(no) + " · " + money(o.total) + (when ? " · " + esc(when) : "")}</i></div>
    </div>
    ${isGeneral ? "" : `
    <div class="own-deliver">
      <p><span>Trade to</span><b>${esc(o.user || "—")}</b></p>
      <p><span>Items</span><b>${esc(lines || "—")}</b></p>
      ${o.email ? `<p><span>Email</span><b>${esc(o.email)}</b></p>` : ""}
    </div>`}
    ${isGeneral ? `<p class="own-items">${esc(lines)}</p>` : ""}
    ${isGeneral ? "" : `<button class="own-done-btn${done ? " is-done" : ""}" id="ownDone">${done ? "Delivered — tap to reopen" : "Mark delivered &amp; remove from queue"}</button>`}
    <div class="coq-chat own-chat" data-order="${esc(no)}" data-persp="owner">
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form" autocomplete="off">
        <input class="chat-input" type="text" maxlength="240" placeholder="Reply to ${esc(o.user || "the buyer")}" aria-label="Reply to buyer">
        <button class="chat-send" type="submit" aria-label="Send reply">${IC.send}</button>
      </form>
    </div>`;
  $("#ownBack").addEventListener("click", renderOwnerList);
  $("#ownDone")?.addEventListener("click", () => {
    setOrderDone(no, !isDone(no));
    renderOwnerChat(no);
  });
  const box = $(".own-chat", ownerBody);
  const log = $(".chat-log", box), form = $(".chat-form", box), input = $(".chat-input", box);
  const repaint = () => paintChat(log, key, "owner", "");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    pushChat(key, t, "owner");
    input.value = "";
    repaint();
  });
  save("rbx-seen-" + no, load(key, []).length);   // mark this thread read
  repaint();
}

ownerBtn?.addEventListener("click", openOwner);
$("#closeOwner")?.addEventListener("click", closeOwner);

/* ---------- always-on live chat widget (no order needed) ---------- */
(function liveChatWidget() {
  const fab = $("#chatFab"), widget = $("#chatWidget");
  if (!fab || !widget) return;
  const KEY = "rbx-chat-general", SEEN = "rbx-cw-seen";
  const SEED = "Hey! Ask us anything about items, prices, or your order, no purchase needed. Drop a message and we'll reply right here.";
  const log = $("#cwLog"), form = $("#cwForm"), input = $("#cwInput"), badge = $("#chatFabBadge");
  let open = false;

  const unread = () => load(KEY, []).slice(load(SEEN, 0)).filter(m => (m.who || "buyer") === "owner").length;
  const refreshBadge = () => { const n = unread(); badge.textContent = n; badge.hidden = n === 0; };
  const repaint = () => paintChat(log, KEY, "buyer", SEED);
  const setOpen = o => {
    open = o; widget.hidden = !o; fab.classList.toggle("is-open", o);
    fab.setAttribute("aria-label", o ? "Close chat" : "Chat with us");
    if (o) { repaint(); save(SEEN, load(KEY, []).length); refreshBadge(); setTimeout(() => input.focus(), 60); }
  };

  fab.addEventListener("click", () => setOpen(!open));
  $("#chatWidgetClose").addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", e => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    pushChat(KEY, t, "buyer"); input.value = ""; repaint();
    if (typeof refreshOwnerBadge === "function") refreshOwnerBadge();
  });
  window.addEventListener("storage", refreshBadge);
  refreshBadge();
})();


/* ---------- quick view: click a card to enlarge it ---------- */
const qv = $("#qv"), qvBody = $("#qvBody");
function openQV(id) {
  const i = byId[id];
  if (!i) return;
  const pill = PILL[i.rarity] || "common";
  const left = i.stock - (state.cart[id] || 0);
  const crop = i.img && (i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") ||
    i.img.startsWith("assets/baddies/") || i.img.startsWith("assets/accounts/"));
  const badge = i.badge && i.badge !== "CHROMA" && i.badge !== "FX"
    ? `<span class="pill" style="--pill-bg:var(--pill-rare-bg);--pill-ink:var(--pill-rare-ink)">${i.badge}</span>` : "";
  qvBody.innerHTML = `
    <div class="qv-art ${crop ? "is-crop" : ""}" style="--rar:var(--pill-${pill}-ink);--rar-soft:var(--pill-${pill}-bg)">
      ${i.img ? `<img src="${imgSrc(i.img)}" alt="${i.name}">` : `<span class="card-noart" aria-hidden="true">${i.name[0]}</span>`}
    </div>
    <div class="qv-info">
      <div class="card-tags">
        <span class="pill" style="--pill-bg:var(--pill-${pill}-bg);--pill-ink:var(--pill-${pill}-ink)">${i.rarity}</span>${badge}
      </div>
      <h2 class="qv-name">${i.name}</h2>
      <p class="qv-sub">${GAME_LABEL[i.game] || ""} · ${i.stock > 0 ? `×${i.stock} in stock` : "out of stock"}</p>
      <div class="qv-row">
        <span class="qv-prices"><span class="qv-price">${money(i.price)}</span>${(() => { const s = saleInfo(i); return s ? `<s class="card-was">${money(s.was)}</s><span class="qv-save">-${s.pct}%</span>` : ""; })()}</span>
        <button class="card-buy ${state.cart[id] ? "in-cart" : ""}" data-qv-add="${id}" ${left <= 0 ? "disabled" : ""}>
          ${left <= 0 ? "In cart" : state.cart[id] ? "Add another" : "Add to cart"}
        </button>
      </div>
    </div>`;
  qv.hidden = false;
  $("[data-qv-add]", qvBody)?.addEventListener("click", e => {
    addToCart(id, e.currentTarget);
    openQV(id);   // refresh button/stock state in place
  });
}
function closeQV() { qv.hidden = true; }
$("#qvClose").addEventListener("click", closeQV);
qv.addEventListener("click", e => { if (e.target === qv) closeQV(); });
document.addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (!card || !card.dataset.id) return;
  if (e.target.closest("[data-add], [data-qv-add], button")) return;
  openQV(card.dataset.id);
});

/* esc closes the top layer */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!qv.hidden) closeQV();
  else if (!genderPick.hidden) closeGenderPick();
  else if (!co.hidden) closeCheckout();
  else if (!filterSheet.hidden) closeSheet();
  else if (!drawer.hidden) closeDrawer();
});

/* ---------- boot ---------- */
document.body.dataset.game = state.game;
const bootGhost = $("#shopGhost");
if (bootGhost) bootGhost.textContent = GAME_GHOST[state.game];
buildCatTabs();
buildRarityChips();
syncCount();
setStickyVars();
$("#searchInput").value = "";
setSort(state.sort);   // sync sort control + first render (grouped by rarity)
})();
