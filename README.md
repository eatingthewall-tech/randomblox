# Randomblox

A fan-run item shop for **Murder Mystery 2** and **Adopt Me** — every item is sold
from one real inventory and delivered by in-game trade.

Static site (plain HTML / CSS / JS), no build step. Hosted on GitHub Pages.

## Structure

| Path | What it is |
| --- | --- |
| `index.html` | The whole page shell |
| `css/styles.css` | Styles |
| `js/catalog.js` | The item catalog (names, prices, rarity, art) |
| `js/app.js` | Rendering, filtering, cart & checkout |
| `assets/` | Item art (`am/`, `hd/`, `wiki/`, `cleaned/`) |

## Running locally

Any static server works, e.g.:

```sh
python3 -m http.server 8112
```

then open <http://localhost:8112>.

---

Not affiliated with Roblox, Nikilis or Uplift Games. Checkout is a demo — no card is
charged and nothing is sent anywhere; items are delivered by in-game trade.
