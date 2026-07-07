/* Randomblox shop — renders CATALOG (js/catalog.js). */
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = n => "$" + n.toFixed(2);
const IMG_V = "20260707c";                       // bump when item art changes
const imgSrc = p => p + (p.includes("?") ? "&" : "?") + "v=" + IMG_V;

const PILL = {
  Godly: "godly", Chroma: "chroma", Ancient: "ancient", Vintage: "vintage",
  Legendary: "legendary", Rare: "rare", Uncommon: "uncommon", Common: "common",
  Egg: "uncommon", Vehicle: "rare", Toy: "vintage",
};
const CATS = {
  mm2: [["all", "Everything"], ["knife", "Knives"], ["gun", "Guns"], ["pet", "Pets"], ["collectible", "Collectibles"]],
  am:  [["all", "Everything"], ["pet", "Pets"], ["egg", "Eggs"], ["vehicle", "Vehicles"], ["toy", "Toys & items"]],
};
const GAME_LABEL = { mm2: "Murder Mystery 2", am: "Adopt Me" };

const state = {
  game: "mm2", cat: "all", rarity: "", q: "", sort: "price-desc",
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
    const crop = i.img && i.img.startsWith("assets/items/");
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

/* ---------- nav / filters ---------- */
function setGame(g) {
  state.game = g;
  state.cat = "all";
  state.rarity = "";
  $$(".topnav-link[data-nav]").forEach(b => b.classList.toggle("is-on", b.dataset.nav === g));
  $("#shopTitle").textContent = GAME_LABEL[g];
  buildCatTabs();
  buildRaritySelect();
  render();
}
$$(".topnav-link[data-nav]").forEach(b => b.addEventListener("click", () => {
  setGame(b.dataset.nav);
  $("#shop").scrollIntoView({ block: "start" });
}));
$$("[data-jump]").forEach(b => b.addEventListener("click", () => {
  setGame(b.dataset.jump);
  $("#shop").scrollIntoView({ block: "start" });
}));

function buildCatTabs() {
  $("#catTabs").innerHTML = CATS[state.game].map(([v, label]) =>
    `<button class="cat-tab ${state.cat === v ? "is-on" : ""}" role="tab" data-cat="${v}">${label}</button>`).join("");
  $$("#catTabs .cat-tab").forEach(t => t.addEventListener("click", () => {
    state.cat = t.dataset.cat;
    $$("#catTabs .cat-tab").forEach(x => x.classList.toggle("is-on", x === t));
    render();
  }));
}
function buildRaritySelect() {
  const rs = [...new Set(CATALOG.filter(i => i.game === state.game).map(i => i.rarity))];
  const order = ["Chroma","Godly","Ancient","Vintage","Legendary","Rare","Uncommon","Common","Egg","Vehicle","Toy"];
  rs.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  $("#raritySel").innerHTML = `<option value="">All rarities</option>` +
    rs.map(r => `<option value="${r}">${r}</option>`).join("");
  $("#raritySel").value = "";
}
$("#raritySel").addEventListener("change", e => { state.rarity = e.target.value; render(); });
$("#sortSel").addEventListener("change", e => { state.sort = e.target.value; render(); });
$("#searchInput").addEventListener("input", e => { state.q = e.target.value.trim().toLowerCase(); render(); });

/* ---------- grid ---------- */
function catOf(i) {
  if (i.kind === "knife" || i.kind === "gun" || i.kind === "collectible") return i.kind;
  if (i.game === "mm2" && i.kind === "pet") return "pet";
  return i.kind; // pet / egg / vehicle / toy
}
function visible() {
  let list = CATALOG.filter(i => i.game === state.game);
  if (state.cat !== "all") list = list.filter(i => catOf(i) === state.cat);
  if (state.rarity) list = list.filter(i => i.rarity === state.rarity);
  if (state.q) list = list.filter(i => i.name.toLowerCase().includes(state.q));
  list.sort((a, b) =>
    state.sort === "price-asc" ? a.price - b.price :
    state.sort === "name" ? a.name.localeCompare(b.name) :
    b.price - a.price);
  return list;
}

function cardHTML(i) {
  const left = i.stock - (state.cart[i.id] || 0);
  const inCart = (state.cart[i.id] || 0) > 0;
  const pill = PILL[i.rarity] || "common";
  const crop = i.img && i.img.startsWith("assets/items/");
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

function render() {
  const list = visible();
  const bits = [`${list.length} items`, GAME_LABEL[state.game]];
  if (state.cat !== "all") bits.push(CATS[state.game].find(c => c[0] === state.cat)[1].toLowerCase());
  if (state.rarity) bits.push(state.rarity.toLowerCase());
  if (state.q) bits.push(`matching "${state.q}"`);
  $("#resultLine").textContent = bits.join(" — ");
  $("#grid").innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<div class="grid-empty"><b>Nothing matches that.</b>Clear the search or pick another category.</div>`;
  bindBuyButtons($("#grid"));
  // refresh featured buttons state too
  $$("#featuredRow [data-add]").forEach(b => {
    const i = byId[b.dataset.add];
    const left = i.stock - (state.cart[i.id] || 0);
    b.disabled = left <= 0;
    b.textContent = left <= 0 ? "In cart" : (state.cart[i.id] ? "Add another" : "Add to cart");
    b.classList.toggle("in-cart", (state.cart[i.id] || 0) > 0);
  });
}

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
  $("#cartCount").hidden = n === 0;
  $("#cartCount").textContent = n;
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

const drawer = $("#drawer"), scrim = $("#scrim");
function openDrawer() { renderDrawer(); drawer.hidden = false; scrim.hidden = false; $("#closeDrawer").focus(); }
function closeDrawer() { drawer.hidden = true; scrim.hidden = true; $("#cartBtn").focus(); }
$("#cartBtn").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);

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
  else if (!drawer.hidden) closeDrawer();
});

/* ---------- boot ---------- */
buildCatTabs();
buildRaritySelect();
syncCount();
render();
})();
