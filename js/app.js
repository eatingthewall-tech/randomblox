/* Randomblox shop — renders CATALOG (js/catalog.js). */
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = n => "$" + n.toFixed(2);
const IMG_V = "20260713d";                       // bump when item art changes
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
  box.innerHTML =
    die(118, "46%", "10%", 9, 0, "die-main keep-m") +
    die(66, "2.5%", "7%", 12, -3) +
    die(84, "1.5%", "86%", 11, -6, "keep-m") +
    die(46, "38%", "66%", 13, -2) +
    die(30, "49%", "40%", 10, -8);
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
  korblox: ["korblox-1","korblox-2","korblox-3"].map(n => `assets/accounts/${n}.jpg`),
  random: ["r01","r02","r03","r04","r05","r06","r07","r08","r09","r10","r11","r12"].map(n => `assets/accounts/${n}.jpg`),
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
  // animate individual cards, never #grid itself — the full grid is >20k px
  // tall and promoting it to a compositor layer blanks the renderer
  if (MOTION_OK) [...$("#grid").children].slice(0, 18).forEach((c, i) =>
    c.animate(
      [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 260, delay: i * 22, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" }));
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
function cardHTML(i) {
  const left = i.stock - (state.cart[i.id] || 0);
  const inCart = (state.cart[i.id] || 0) > 0;
  const pill = PILL[i.rarity] || "common";
  const crop = i.img && (i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") || i.img.startsWith("assets/baddies/") || i.img.startsWith("assets/accounts/"));
  const variant = i.badge && i.badge !== "CHROMA" && i.badge !== "FX"
    ? `<span class="pill" style="--pill-bg:var(--pill-rare-bg);--pill-ink:var(--pill-rare-ink)">${i.badge}</span>` : "";
  const fx = i.badge === "FX" ? `<span class="pill">FX</span>` : "";
  return `<article class="card" data-id="${i.id}" data-rarity="${pill}" style="--rar:var(--pill-${pill}-ink);--rar-soft:var(--pill-${pill}-bg)">
    <div class="card-art ${crop ? "is-crop" : ""}">
      ${i.img ? `<img loading="lazy" src="${imgSrc(i.img)}" alt="">`
              : `<span class="card-noart" aria-hidden="true">${i.name[0]}</span>`}
      ${i.stock > 1 ? `<span class="card-stock">×${i.stock} in stock</span>` : ""}
    </div>
    <div class="card-body">
      <div class="card-name">${i.name}</div>
      <div class="card-tags">
        <span class="pill" style="--pill-bg:var(--pill-${pill}-bg);--pill-ink:var(--pill-${pill}-ink)">${i.rarity}</span>
        ${variant}${fx}
      </div>
      <div class="card-row">
        <span class="card-price">${money(i.price)}</span>
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
  setStickyVars();
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
  const pos = Math.max(1, orders.filter(o =>
    now - +new Date(o.when) < DAY2 && +new Date(o.when) <= t).length);
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

function queueHTML(order, orders) {
  const games = [...new Set((order.items || []).map(x => byId[x.id]?.game).filter(Boolean))];
  const vipGames = games.filter(g => VIP_LINKS[g]);
  const hasAccounts = games.includes("accounts");
  const accountsOnly = hasAccounts && !vipGames.length;

  const icLink = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`;
  const icChat = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 20l1-4.9a8.4 8.4 0 1 1 17-3.6Z"/></svg>`;
  const icBell = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;
  const icUser = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.2 4.2-6.4 8-6.4s7 2.2 8 6.4"/></svg>`;
  const icGift = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8v13"/><path d="M12 8a3 3 0 1 0-3-3c0 2 3 3 3 3ZM12 8a3 3 0 1 1 3-3c0 2-3 3-3 3Z"/></svg>`;
  const icSend = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg>`;

  // one live chat per order. mode "account" = the delivery channel (waits for the
  // owner); mode "fallback" = a manual backup for buyers who can't join the server
  const chatBox = mode => `
    <div class="coq-chat" data-order="${esc(order.no)}" data-mode="${mode}">
      <div class="chat-head">
        <span class="chat-ic">${icChat}</span>
        <div class="chat-h-tx">
          <b>${mode === "account" ? "Live chat" : "Can't join the server?"}</b>
          <i class="chat-status"><span class="chat-dot"></span>${mode === "account"
            ? "The owner delivers your account here"
            : "Message the owner to trade another way"}</i>
        </div>
      </div>
      <div class="chat-log" aria-live="polite"></div>
      <form class="chat-form" autocomplete="off">
        <input class="chat-input" type="text" maxlength="240" placeholder="${mode === "account"
          ? "Message the owner while you wait"
          : "Tell the owner you can't get in the server"}" aria-label="Message the owner">
        <button class="chat-send" type="submit" aria-label="Send message">${icSend}</button>
      </form>
    </div>`;

  /* account-only orders: no queue, no wait time. The account is handed over in the
     live chat as soon as the owner is online. */
  if (accountsOnly) {
    return `
      <div class="q-panel q-acct">
        <div class="qp-head"><h3>Your account order</h3><span class="q-live"><i></i>Chat open</span></div>
        <div class="q-order">
          <span class="qo-label">Your order number</span>
          <b class="qo-code">${esc(order.no)}</b><span class="qo-pos qo-pos-plain">No queue</span>
          <p class="qo-wait">Handed to you straight through the live chat below.</p>
        </div>
        <p class="qo-fine">The owner sends the account email and password in the chat as soon as they're online. Message anytime meanwhile.</p>
      </div>
      <div class="coq-links">${chatBox("account")}</div>`;
  }

  /* game / mixed orders: queue + the right VIP link(s), with a live chat as the
     manual fallback for anyone who can't get into the private server */
  const q = queueInfo(order, orders);
  const waitTxt = `${q.waitLo} to ${q.waitHi} ${q.waitUnit}`;
  const vipTiles = vipGames.map(g =>
    `<a class="coq-tile" href="${VIP_LINKS[g]}" target="_blank" rel="noopener">
       <span class="qi-ic">${icLink}</span>
       <span class="coq-tx"><b>${esc(GAME_LABEL[g])} VIP server</b><i>Open it when it's your turn</i></span></a>`).join("");
  const chat = chatBox(hasAccounts ? "account" : "fallback");

  return `
    <div class="coq-grid">
      <div class="q-panel">
        <div class="qp-head"><h3>Your queue status</h3><span class="q-live"><i></i>Queue open</span></div>
        <div class="q-order">
          <span class="qo-label">Your order number</span>
          <b class="qo-code">${esc(order.no)}</b><span class="qo-pos">${q.ahead === 0 ? "You're next" : q.ahead + " ahead of you"}</span>
          <p class="qo-wait">Estimated wait: ${waitTxt}</p>
        </div>
        <div class="q-progress">
          <div class="qp-top"><span>Queue progress</span><span>${q.pct}%</span></div>
          <div class="qp-bar"><i style="width:${q.pct}%"></i></div>
          <p>The VIP server link is ready below. Can't get in? Use the live chat.</p>
        </div>
        <p class="qo-fine">Wait times aren't always exact, they shift with the owner's availability.</p>
      </div>
      <div class="q-panel">
        <div class="qp-head"><h3>When it's your turn</h3></div>
        <ol class="q-turn">
          <li><span class="qt-ic">${icBell}</span><div class="qt-tx"><b>1. You reach the front</b><p>Your spot moves up to the front of the queue.</p></div></li>
          <li><span class="qt-ic">${icLink}</span><div class="qt-tx"><b>2. Join the VIP server</b><p>Open the VIP link for your game below and hop in. Can't join? Use the chat.</p></div></li>
          <li><span class="qt-ic">${icUser}</span><div class="qt-tx"><b>3. Meet at spawn</b><p>Head to spawn with your order code ready.</p></div></li>
          <li><span class="qt-ic">${icGift}</span><div class="qt-tx"><b>4. Accept the trade</b><p>The trade comes through in game. Accept it and you're done.</p></div></li>
        </ol>
      </div>
    </div>
    <div class="coq-links">${vipTiles}${chat}</div>`;
}

/* the live chat is device-local: messages persist per order number so the buyer's
   notes are still there when they reopen "My order" */
function bindQueueChat(root = document) {
  $$(".coq-chat", root).forEach(box => {
    const key = "rbx-chat-" + box.dataset.order;
    const mode = box.dataset.mode || "account";
    const seed = mode === "account"
      ? "The account login lands right here the moment the owner is online. Leave a message and it'll be waiting."
      : "Can't get into the VIP server? Send a message here and the owner will sort out another way to trade.";
    const log = $(".chat-log", box), form = $(".chat-form", box), input = $(".chat-input", box);
    const paint = () => {
      const msgs = load(key, []);
      log.innerHTML =
        `<div class="chat-msg chat-sys">${seed}</div>` +
        msgs.map(m => `<div class="chat-msg chat-me">${esc(m.t)}</div>`).join("");
      log.scrollTop = log.scrollHeight;
    };
    form.addEventListener("submit", e => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      const msgs = load(key, []);
      msgs.push({ t, when: Date.now() });
      save(key, msgs);
      input.value = "";
      paint();
    });
    paint();
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

function stepSummary() {
  coBody.innerHTML = `
    <p class="co-step">Step 1 of 3</p>
    <h2 class="co-title" id="checkoutTitle">Your order</h2>
    ${linesHTML(entries())}
    <p class="co-note">Look it over. This is the exact list we'll trade in game.</p>
    <button class="primary-btn" id="coNext">Continue</button>`;
  $("#coNext").addEventListener("click", stepPay);
}

function stepPay() {
  payingTotal = cartTotal();
  coBody.innerHTML = `
    <p class="co-step">Step 2 of 3</p>
    <h2 class="co-title" id="checkoutTitle">Payment</h2>
    <form id="payForm" novalidate>
      <div class="co-field"><label for="f-name">Name</label>
        <input id="f-name" name="name" required autocomplete="name"></div>
      <div class="co-field"><label for="f-user">Roblox username</label>
        <input id="f-user" name="user" required autocomplete="off" placeholder="So I know who to friend"></div>
      <div class="co-field"><label for="f-mail">Email</label>
        <input id="f-mail" name="mail" type="email" required autocomplete="email" placeholder="Receipt goes here"></div>
      <div class="co-field"><label for="f-card">Card number</label>
        <input id="f-card" name="card" inputmode="numeric" placeholder="0000 0000 0000 0000" maxlength="19" required></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="co-field"><label for="f-exp">Expiry</label>
          <input id="f-exp" name="exp" placeholder="MM/YY" maxlength="5" required></div>
        <div class="co-field"><label for="f-cvc">CVC</label>
          <input id="f-cvc" name="cvc" inputmode="numeric" placeholder="123" maxlength="4" required></div>
      </div>
      <p class="co-note">Test checkout. No card gets charged and nothing is sent anywhere.</p>
      <button class="primary-btn" type="submit">Pay ${money(payingTotal)}</button>
    </form>`;
  $("#payForm").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target;
    if (!f.checkValidity()) { f.reportValidity(); return; }
    stepDone(f.user.value.trim());
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
  setCoWide(true);
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

/* ---------- order lookup ---------- */
$("#orderLookupBtn").addEventListener("click", () => {
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
  setCoWide(true);
  coBody.innerHTML = `
    <h2 class="co-title" id="checkoutTitle">My order${orders.length > 1 ? "s" : ""}</h2>
    ${queueHTML(orders[orders.length - 1], orders)}
    ${orders.length > 1 ? `<div class="order-list" style="margin-top:14px">` +
      orders.slice(0, -1).reverse().map(o => `
      <div class="co-line"><span><b>${o.no}</b> · ${new Date(o.when).toLocaleDateString()} · ${o.items.reduce((n, x) => n + x.q, 0)} items</span>
      <span class="co-price">${money(o.total)}</span></div>`).join("") + `</div>` : ""}`;
  bindQueueChat(coBody);
});

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
        <span class="qv-price">${money(i.price)}</span>
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
