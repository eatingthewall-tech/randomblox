/* Randomblox shop — renders CATALOG (js/catalog.js). */
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = n => "$" + n.toFixed(2);
const IMG_V = "20260708b";                       // bump when item art changes
const imgSrc = p => p + (p.includes("?") ? "&" : "?") + "v=" + IMG_V;

const PILL = {
  Godly: "godly", Chroma: "chroma", Ancient: "ancient", Vintage: "vintage",
  Legendary: "legendary", Rare: "rare", Uncommon: "uncommon", Common: "common",
  Egg: "uncommon", Vehicle: "rare", Toy: "vintage",
  MVP: "nflmvp", "All-Pro": "nflallpro", Pro: "nflpro", Starter: "nflstarter", Rookie: "nflrookie",
  Legend: "bdlegend", Epic: "bdepic", Basic: "bdbasic",
};
const RARITY_ORDER = ["Chroma","Godly","Ancient","Vintage","Legend","Legendary","Epic","Rare","Basic","Uncommon","Common","Egg","Vehicle","Toy",
  "MVP","All-Pro","Pro","Starter","Rookie"];
const CATS = {
  mm2: [["all", "Everything"], ["knife", "Knives"], ["gun", "Guns"], ["pet", "Pets"], ["collectible", "Collectibles"]],
  am:  [["all", "Everything"], ["pet", "Pets"], ["egg", "Eggs"], ["vehicle", "Vehicles"], ["toy", "Toys & items"]],
  nfl: [["all", "Everything"], ["gear", "Gear"], ["apparel", "Apparel"], ["headwear", "Headwear"], ["cleats", "Cleats"], ["chains", "Chains"], ["emote", "Emotes"], ["ball", "Ball & Trails"]],
  baddies: [["all", "Everything"], ["knuckles", "Brass Knuckles"], ["taser", "Tasers"], ["pan", "Frying Pans"], ["purse", "Purses"], ["board", "Hoverboards"], ["mace", "Chain Maces"], ["rpg", "RPGs"], ["toilet", "Toilets"], ["style", "Fighting Styles"], ["more", "More Skins"]],
};
const GAME_LABEL = { mm2: "Murder Mystery 2", am: "Adopt Me", nfl: "NFL Universe", baddies: "Baddies" };
const BADDIE_GLYPH = { knuckles: "🥊", taser: "⚡", pan: "🍳", purse: "👛", board: "🛹", mace: "🔨", rpg: "🚀", toilet: "🚽", style: "🥋", more: "✨" };

const state = {
  game: "mm2", cat: "all", rarity: new Set(), inStock: false, q: "", sort: "rarity",
  cart: load("rbx-cart", {}),
};
function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
const byId = Object.fromEntries(CATALOG.map(i => [i.id, i]));

/* ---------- featured shelf: priciest items across both games ---------- */
(function featured() {
  const top = [...CATALOG].sort((a, b) => b.price - a.price).slice(0, 8);
  $("#featuredRow").innerHTML = top.map(cardHTML).join("");
  bindBuyButtons($("#featuredRow"));
})();

/* ---------- hero case: the two priciest grails as a display case ---------- */
(function heroCase() {
  const box = $("#heroCase");
  if (!box) return;
  const top = [...CATALOG].sort((a, b) => b.price - a.price).slice(0, 2);
  box.innerHTML = top.map(i => {
    const pill = PILL[i.rarity] || "common";
    const crop = i.img && (i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") || i.img.startsWith("assets/baddies/"));
    return `<div class="grail" style="--rar:var(--pill-${pill}-ink)">
      <div class="grail-stage">
        ${i.img ? `<img class="${crop ? "is-crop" : ""}" src="${imgSrc(i.img)}" alt="">` : ""}
      </div>
      <div class="grail-meta">
        <span class="grail-name">${i.name}</span>
        <span class="grail-price">${money(i.price)}</span>
      </div>
    </div>`;
  }).join("");
})();

/* ---------- sticky offsets (header + browse bar) ---------- */
function setStickyVars() {
  const root = document.documentElement;
  root.style.setProperty("--hdr", ($(".topbar")?.offsetHeight || 56) + "px");
  root.style.setProperty("--browse", ($("#browsebar")?.offsetHeight || 0) + "px");
}
window.addEventListener("resize", setStickyVars);

function scrollToShop() {
  const y = $("#shop").offsetTop - ($(".topbar")?.offsetHeight || 56) - 8;
  window.scrollTo({ top: y, behavior: "smooth" });
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
    if (["mm2", "am", "nfl", "baddies"].includes(b.dataset.bot)) b.classList.toggle("is-on", b.dataset.bot === g);
  });
  $("#shopTitle").textContent = GAME_LABEL[g];
  syncInStockUI();
  buildCatTabs();
  buildRarityChips();
  render();
}
$$(".game-tab[data-nav]").forEach(b => b.addEventListener("click", () => { setGame(b.dataset.nav); scrollToShop(); }));
$$("[data-jump]").forEach(b => b.addEventListener("click", () => { setGame(b.dataset.jump); scrollToShop(); }));
$$(".botnav-item[data-bot]").forEach(b => b.addEventListener("click", () => {
  const t = b.dataset.bot;
  if (t === "home") window.scrollTo({ top: 0, behavior: "smooth" });
  else if (t === "cart") openDrawer();
  else { setGame(t); scrollToShop(); }
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
  const crop = i.img && (i.img.startsWith("assets/items/") || i.img.startsWith("assets/nfl/") || i.img.startsWith("assets/baddies/"));
  const variant = i.badge && i.badge !== "CHROMA" && i.badge !== "FX"
    ? `<span class="pill" style="--pill-bg:var(--pill-rare-bg);--pill-ink:var(--pill-rare-ink)">${i.badge}</span>` : "";
  const fx = i.badge === "FX" ? `<span class="pill">FX</span>` : "";
  return `<article class="card" data-rarity="${pill}" style="--rar:var(--pill-${pill}-ink);--rar-soft:var(--pill-${pill}-bg)">
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
  $$("[data-add]", root).forEach(b => b.addEventListener("click", () => addToCart(b.dataset.add)));
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

function addToCart(id) {
  const item = byId[id];
  const q = state.cart[id] || 0;
  if (q >= item.stock) return;
  state.cart[id] = q + 1;
  save("rbx-cart", state.cart);
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
let payingTotal = 0;
function openCheckout() {
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

  coBody.innerHTML = `
    <p class="co-step">Step 3 of 3</p>
    <h2 class="co-title" id="checkoutTitle">You're in the queue</h2>
    <div class="order-num" role="status">${no}</div>
    <p class="co-note">That's your order number, ${username}. It's saved on this device under
    "My order", and you'll want it handy when we trade.</p>
    ${linesHTML(es)}
    <div class="directions">
      <h3>Directions</h3>
      <p>Directions will be posted here soon.</p>
    </div>
    <button class="primary-btn" id="coDone" style="margin-top:16px">Done</button>`;
  $("#coDone").addEventListener("click", closeCheckout);

  state.cart = {};
  save("rbx-cart", state.cart);
  syncCount(); render();
}

/* ---------- order lookup ---------- */
$("#orderLookupBtn").addEventListener("click", () => {
  const orders = load("rbx-orders", []);
  co.hidden = false;
  if (!orders.length) {
    coBody.innerHTML = `
      <h2 class="co-title" id="checkoutTitle">My order</h2>
      <p class="co-note">No orders on this device yet. When you check out, your order number
      shows up here.</p>`;
    return;
  }
  coBody.innerHTML = `
    <h2 class="co-title" id="checkoutTitle">My order${orders.length > 1 ? "s" : ""}</h2>
    <div class="order-list">` +
    orders.slice().reverse().map(o => `
      <div class="co-line"><span><b>${o.no}</b> · ${new Date(o.when).toLocaleDateString()} · ${o.items.reduce((n, x) => n + x.q, 0)} items</span>
      <span class="co-price">${money(o.total)}</span></div>`).join("") +
    `</div>
    <div class="directions">
      <h3>Directions</h3>
      <p>Directions will be posted here soon.</p>
    </div>`;
});

/* esc closes the top layer */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!co.hidden) closeCheckout();
  else if (!filterSheet.hidden) closeSheet();
  else if (!drawer.hidden) closeDrawer();
});

/* ---------- boot ---------- */
buildCatTabs();
buildRarityChips();
syncCount();
setStickyVars();
$("#searchInput").value = "";
setSort(state.sort);   // sync sort control + first render (grouped by rarity)
})();
