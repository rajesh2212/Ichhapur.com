# ICHHAPUR Market — website

A mobile-first visitor guide to ICHHAPUR market (Ichhapur, Bhadrak, Odisha, 756127):
what the market is, which stores and services are listed there, how confident each
listing is, and how to get directions.

Plain HTML, CSS and JavaScript. **No frameworks, no build step, no dependencies, no
tracking, no keys.** Every file can be edited in a text editor.

---

## Look at it

Either works:

```
node scripts/serve.js          # then open http://127.0.0.1:4173
```

…or just double-click `index.html` (or `landing.html` for the Home page). The store
data is loaded as a plain script, so the site also works opened straight from the disk.
(`scripts/serve.js` is a preview helper only — you can delete it, and it is not part of
the site.)

`admin.html` opens the same way. It has no login and no server behind it — see "Editing
the store list" below for what that means before you trust anything it shows you.

---

## What is in here

| Path | What it is |
| --- | --- |
| `landing.html` | **Home.** Dark charcoal-and-gold hero over a market-street photograph, the counted stat cards, the ticker, and six cards that link into the other pages. No section content lives here any more — each one has its own page. |
| `about.html` | About: how the listings were made, the illustrated market view, and the explicit list of things the site will not publish. |
| `whats-here.html` | What's here: the trade tiles with their per-category counts, plus the directions block and the map artwork. |
| `listings.html` | Listings: the nearest-first grid, the "needs confirmation" note, and the best-documented listing. |
| `sources.html` | Sources: the quotation pager, and one row per sourced listing with every link and the date it was read. |
| `contact.html` | Contact: the address block, and what a useful correction looks like. The form itself is in the guide. |
| `index.html` | **The guide** — it *is* the store directory: search, filters, all listings, about, location, contact form, footer. Light cream body under the same dark header. |
| `admin.html` | **The store admin panel.** Add, edit, delete listings and attach photographs, without opening a text editor. See "Editing the store list" below. |
| `data/stores.js` | **The published store directory. This is the file that visitors see.** Every page reads it. |
| `assets/js/market-data.js` | The shared data layer: merges `data/stores.js` with any local draft, saves, exports, and tells every open page when the data changed. Also holds the distance, map-link and thumbnail helpers. |
| `assets/js/site-nav.js` | **The shared chrome.** Builds the dark masthead (Home, About, What's here, Listings, Sources, Contact), the back bar under it, and the footer, then mounts them into every page — including the guide and the admin panel. Also wires the mobile drawer, `aria-current`, Escape, and the directions links. |
| `assets/css/site-chrome.css` | The CSS for that shared header, back bar and footer. Its colour tokens are scoped to the chrome, not `:root`, so the dark header cannot repaint the guide's light body. |
| `assets/css/styles.css` | Colours, type, layout, the opening animation. The guide's light theme. |
| `assets/css/landing.css` | The dark pages' theme. Self-contained — it does not load `styles.css`. |
| `assets/css/admin.css` | The admin panel's dark theme, laid out for data entry. |
| `assets/img/market-street.svg` | The market-street illustration used in the guide hero. Hand-drawn vector, blank signboards on purpose — replace with real photographs when you have them. |
| `assets/img/dark/` | The same artwork recoloured for the dark pages, plus `market-street-night.svg` (the About and Listings figures) and `market.svg` for the smaller figures. |
| `assets/img/dark/hero-market-street.jpg` | The Home hero backdrop — a **generated** market scene supplied by the owner, 1672×941, 238 KB. Not a photograph of ICHHAPUR, and the page says so. |
| `assets/img/dark/page-*.jpg` | The wide rounded image at the foot of each sub-page hero: `page-about`, `page-whats-here`, `page-listings`, `page-sources`, `page-contact`. All five are **generated** scenes in the site's night-market palette, 1792×1024, 275–391 KB each, and each figure is captioned as such. Replace them with real photographs when you have any. |
| `assets/img/trade/` | One small drawing per category (`medicines`, `mobile`, `general`, `market`, `service`), shown at the top of each store card in the guide. They stand for the *trade*, never for the shop. |
| `assets/js/main.js` | In the guide: search, filters, store details, map, directions, suggestion form, and the URL deep links. |
| `assets/js/landing.js` | Fills the dark pages. One file serves all six: each renderer looks for the element it fills and returns when that page does not have it. |
| `assets/js/admin.js` | The admin panel: the listing table, the edit form, photo resizing, validation, export, discard. |
| `assets/js/intro.js` | The opening signboard animation and its skip/fallback rules. |
| `docs/research-notes.md` | Where every listing came from, what is unproven, and what to ask about. |
| `scripts/serve.js` | Optional local preview server. Not deployed. |

---

## Eight pages, one header, one set of data

The site is six dark pages plus the guide and the admin panel:

```
landing.html  about.html  whats-here.html  listings.html  sources.html  contact.html
index.html (the guide)    admin.html (the panel)
```

All eight get the **same** charcoal-and-gold masthead with the six destinations, built by
`assets/js/site-nav.js`. Each destination is a real `<a href>`, so navigation works before
any script runs; the script only marks the current page with `aria-current` and wires the
mobile drawer.

**Every page except Home has a back bar** under the header. It shows a real link back to
`landing.html` by default and upgrades to "Back to Listings" (or whichever page you came
from) when the referrer is another page on this site — so it works with no JavaScript, and
it never leaves the site.

`index.html` is the working guide and stays the default page (hosts serve `index.html` from
a URL with no file name). Its body keeps the light cream theme and its own footer, because
that footer carries the accuracy note and the "replay the welcome animation" control — a
page never gets two footers.

Nothing is duplicated in content terms. Each section's full content lives on exactly one
page, Home only links to it, and all of it goes through `assets/js/market-data.js`, which
merges the published `data/stores.js` with any local draft. Editing the store file updates
every page, and saving in the admin panel updates the pages open in this browser straight
away.

If you would rather the guide *be* the home page, swap `index.html` and `landing.html` —
every link is relative and both read the same data.

The dark pages hand off to the guide with ordinary URL parameters, which also work as
shareable links:

| Link | What the visitor sees | Where it is used |
| --- | --- | --- |
| `index.html?cat=mobile#stores` | One category, its filter chip switched on. | The trade tiles on What's here. |
| `index.html?open=sumitra-medical-store#stores` | That listing's detail sheet, open on arrival. | Each listing card, and the best-documented feature. |
| `index.html#stores` | The directory, unfiltered. | The header pill and most "open the guide" links. |
| `index.html#location` | The map block. | What's here. |
| `index.html#about` | The method section. | About and Sources. |
| `index.html?kind=correction#contact` | The suggestion form with "a correction" already chosen. | Contact. |
| `index.html?kind=missing&store=Name#contact` | The form with the store name filled in. | Contact. |

`?q=<word>` also works — it puts the word straight in the search box — and so does
`?confirmed=1`, which hides every listing that still needs confirmation. Neither is linked
from a page; both are for hand-written or shared links.

The header's own "Get directions" pill is pointed at the owner-supplied market coordinates
by `site-nav.js`, on every page.

---

## Editing the store list

There are two ways, and they are meant to be used together.

### Option A — the admin panel (`admin.html`)

Open `admin.html` and click **Add a store**, or **Edit** on any row. The form covers name,
trade, status, locality, address, position, directions note, description, search words,
telephone, hours, photograph and sources. The panel carries the same shared header as the
public pages, so the site navigation and a back control are available while you edit; it
keeps its own footer because that one reports the storage allowance and the last save time.

What it does and does not do:

- **It saves into this browser only.** There is no server, no account and no password —
  the panel says so at the top of the page. A visitor on another phone still sees
  `data/stores.js`.
- **It is live between tabs of this browser.** Save in the admin tab and any public page
  already open — the guide, Home, About, What's here, Listings, Sources — re-renders on the
  spot. Each then shows a "you are looking at a local draft" note so nobody mistakes the
  draft for the published list.
- **Paste a map link instead of typing coordinates.** `Read the position` pulls the marker
  out of Google Maps, Mappls and OpenStreetMap URLs, or plain `lat, lng`. It reports how
  far the result is from the market pin, and refuses to save a point more than 60 km away —
  that is how a differently-named Ichhapur gets caught.
- **A photograph is resized in the browser** to 1280 px and stored as text, which is why
  the panel shows how much of the browser's ~5 MB allowance is used.
- **`Export` is how a change becomes public.** It downloads the whole working set as JSON;
  paste it into `data/stores.js` and every visitor sees it. `Discard local draft` throws
  the local changes away and returns to the published file.
- **Validation protects the honesty rules, not just the syntax.** A listing cannot be
  marked “Publicly listed” without at least one named source with a working link, and a
  source row with no label or a non-`http` link is refused.

Deep link straight into a listing: `admin.html?edit=sumitra-medical-store`.

### Option B — edit `data/stores.js`

Add, change or remove a listing in `data/stores.js` — no redesign needed, and the pages
rebuild themselves around whatever is in that file (categories, counts and filters all come
from the data).

For each store:

- `status` — `"listed"` when a public source places it near the market pin, otherwise
  `"needs-confirmation"`. The second one prints the badge **“Listing needs
  confirmation”** on the card, so use it whenever you are unsure.
- `coordinates` — `{ lat, lng }` or `null`. A directions button appears **only** when
  coordinates exist; without them the card says so instead of guessing.
- `sources` — the label, URL and `checked` date for where the information came from.
  These are shown to visitors in the store details panel, so fill them in.
- `note` — the honest caveat: what is ambiguous, duplicated or unverified. On
  `listings.html` it becomes the "Unresolved" line of the best-documented listing, and in
  the guide it prints in that listing's detail panel. `sources.html` shows the same
  listings' source links, marked "Needs confirmation".
- `photo` / `photoAlt` — see item 5 below.
- `hours` / `phone` — leave `null` unless a source really states it, and say which.

Then add a matching row to `docs/research-notes.md`. The two files are meant to stay in
step.

Things deliberately **not** published anywhere, even though public listings offered
them: star ratings, review counts, “open now”, stock or brand availability, owners' and
staff names, GST numbers, and any “best”/“most popular” claim.

---

## The suggestion form is not connected

The form validates and then assembles a message the visitor can copy. It sends nothing
and stores nothing, and it says so on screen — because no email address, phone number or
form service was supplied.

To make it real, pick one and tell me which:

1. **Publish a channel** — put an address or number in `market.contact` in
   `data/stores.js`. The form's note changes to name it automatically, and visitors can
   send you the message directly.
2. **A form service** (Formspree, Basin, Getform, a Google Form, …) or **your own
   backend** — this needs a few lines of real code plus a test, so ask for it rather than
   editing blind. Until then, nothing is sent, and the page says so.

Until then, treat the form as a draft-and-copy tool, and do not describe it as
“contact us”.

---

## The opening animation

A hanging market signboard with a striped awning swings in on the first visit and
reveals **ICHHAPUR** in about 2.2 seconds.

- A visible **Skip intro** button, and any scroll, tap, click or Escape closes it.
- Visitors with *reduce motion* enabled never see it; the page is there immediately.
- On devices without 3D support, or with 2 CPU cores / 2 GB RAM or less, it plays a flat
  2D fade instead.
- It is shown once, then remembered. Force it with `?intro=play`, or use the
  “Replay the welcome animation” link in the footer.
- It is decoration: the real heading (“Discover ICHHAPUR”) and all content stay
  available to screen readers throughout.

---

## What the site owner still needs to provide

1. **The location conflict — most important.** The supplied pin (21.045677123140994,
   86.55692995394432) sits on SH9, and OpenStreetMap tags that spot with PIN **756130**,
   while pin-code directories place *Ichhapur post office* about **7 km away** at
   roughly 21.0612, 86.4907. The site uses your coordinates as given and flags the
   disagreement, but one of the two is wrong. Please confirm the true market spot.
2. **A verified store list.** The 8 listings here come from public directories and none
   has been checked at a shopfront. Names, exact positions, hours and phone numbers all
   need a local pass — especially the two entries that could not be placed on a map at
   all, and Swarnalaxmi Mobile Store, which every source puts in **Bhadrak town**, not in
   this market.
3. **A contact channel** for the form (see above).
4. **A logo**, if you want one — the current wordmark and storefront artwork are
   placeholders I drew, not your branding.
5. **Photographs** of the market, taken by you or explicitly licensed to this project.
   The guide hero uses a hand-drawn illustration (`assets/img/market-street.svg`). The Home
   hero now sits over `assets/img/dark/hero-market-street.jpg`, a generated market scene the
   owner supplied for atmosphere — it is labelled as such in the caption under the hero, and
   it is not a record of this market, so a real photograph should replace it when one
   exists. The five sub-pages each open with a generated scene of their own
   (`assets/img/dark/page-about.jpg` and its four siblings), also captioned as generated
   rather than photographed. The smaller figures still use the drawings
   (`assets/img/dark/market-street-night.svg` on About and Listings,
   `assets/img/dark/market.svg` on What's here and Contact). Every store
   card uses a drawing of its trade (`assets/img/trade/` on the guide, `assets/img/dark/`
   on the dark pages and in the admin panel) because invented or borrowed photos of real
   local shops would be misleading — and because no photo of this market exists in the
   public sources checked. A picture
   found on the internet is someone else's photograph of somewhere else; putting it under a
   shop's name tells visitors that is what the shop looks like.

   When you do have real photos, attach one in `admin.html` (the Picture block shrinks it
   to fit) or add two lines to that listing in `data/stores.js`:

   ```js
   photo: "assets/img/sumitra.jpg",
   photoAlt: "Sumitra Medical Store's shuttered frontage on the market road"
   ```

   The card swaps the drawing for your photo automatically and starts describing it to
   screen readers. Keep the file under ~200 KB, and get each shopkeeper's permission
   before publishing a recognisable shopfront. For a hero or a figure, point the `<img>`
   in the page at the file, keep its `width`/`height` attributes so nothing jumps while
   loading, and update the "not a photograph" caption.

   A photo attached in the admin panel lives as a data URL inside that browser's storage,
   so it only reaches visitors after you export and paste it into `data/stores.js` — or
   after the site is hosted with real file storage.
6. **Background for the About page** — how long the market has been here, how it
   works, what it is known for, market days. `about.html` and the guide's About section are
   deliberately plain until you supply it, so nothing here is fabricated.
7. **The post office's actual services** (whether speed post is handled there), since
   sources disagree.

---

## Status

Built and checked locally.

**The guide (`index.html`)** — mobile layout, search, category filters, the "well-placed
only" filter, empty and error states, store details panel, directions links, map, suggestion
form, keyboard navigation, reduced-motion and low-power fallbacks. It now carries the shared
dark masthead over its light body, so the old `.site-header` rules are gone from
`styles.css` and the section anchor offset was raised to clear the taller chrome
(`scroll-margin-top: 128px` — header 66px plus back bar 56px). Its own footer, the accuracy
note and the replay link are unchanged.

**The six dark pages** (`landing.html`, `about.html`, `whats-here.html`, `listings.html`,
`sources.html`, `contact.html`) — checked at 375, 687, 760 and 1200 px. Each page's hero or
pagehead, its computed cards, the category tiles, the nearest-first listing grid, the
best-documented feature, the source rows, the quotation pager with its arrow-key control,
and the address block all render from the data file. Scroll reveals work, including with
reduced motion forced on. No page scrolls sideways (`scrollWidth - clientWidth === 0` on
all eight), and the console is clean on each.

**The shared chrome** — the six-item header appears on every page, including the guide and
the admin panel, with `aria-current` set to the page you are on (the guide lights up
"Listings"; the admin panel lights up nothing, since it is a tool rather than a
destination). Every non-Home page has the back bar: it says "Back to Listings" when you
arrive from another page of this site, and falls back to a plain link to Home when there is
no same-site referrer — so opening a page directly, or with JavaScript off, still gets you
out. The bar sticks under the masthead at all three widths, with the offset measured in JS
rather than hard-coded. The mobile drawer goes full-width, closes on Escape and returns
focus to the burger. Heading levels were checked page by page and the two places where a
card row jumped from `h1` straight to `h3` now have a real `h2`.

**The Home hero backdrop** — `assets/img/dark/hero-market-street.jpg` sits in `.hero__media`
at `opacity: .8`, a layer that holds the image and nothing else, so no text, card or button
inherits it. Measured against the composited result at 375 and 1280 px: zero pixels of the
headline fall below 4.5:1 (minimum 12.1:1 on mobile, ~6:1 on desktop) and none of the lede
either (minimum 7.6:1). The crop keeps the lit storefronts — the whole width on desktop, and
the right 65–88% of the source on mobile rather than the empty road. `.hero` carries
`background-color: #0b0d10` for when the image does not load, and print plus
`prefers-contrast: more` still drop the backdrop.

The three stat boxes in that hero are iOS-style frosted glass: a 40% fill
(`rgba(22, 28, 36, .4)`) over `backdrop-filter: blur(18px) saturate(180%)`, 18 px corners,
and a top sheen. The blur is on the card's own backdrop only, so no text, image or button
inherits an opacity. Measured against a blurred copy of the hero behind them, at 375 and
1280 px: no pixel of the number or its label falls below 4.5:1 (minimum 11.4:1). Browsers
without `backdrop-filter`, and visitors who ask for less transparency, get the same shape
with a solid panel instead; print drops the glass too.

**The sub-page hero images** — About, What's here, Listings, Sources and Contact each close
their `.pagehead` with a `.pageshot` figure: one wide rounded rectangle under the heading and
its two pills. The corner radius is `clamp(26px, 4.6vw, 44px)` so it scales with the picture
instead of looking pinched on a phone, and the box keeps its proportions per width — 4:3
below 620 px, 16:9 to 900 px, 16:7 above. `aspect-ratio` on the `<img>` reserves the space
before the file decodes, so nothing jumps. Measured in all five pages at 375, 620 and
1200 px: no horizontal overflow anywhere, every file decoded, and the caption chip stays
inside the rounded frame. The overlay gradient is a `::before`, which paints under the
positioned caption, so the label is never dimmed. Print drops the figures entirely.

**The admin panel (`admin.html`)** — add, edit, delete, the photo picker and its resize,
the paste-a-map-link parser, every validation path, export/download, "discard local draft",
the `?edit=<id>` deep link, and the table's behaviour on a narrow screen (8 rows, 16 action
buttons, row headers via `scope="row"`). Its skip link sits above the shared masthead so it
is still reachable by keyboard.

**Live sync was verified rather than assumed**: with the guide and a sub-page open as tabs
of the same browser, saving in the admin panel re-rendered both without a reload — the
Listings badge went from 7 to 8 and both pages started saying the listings came from a local
draft (the guide gets a banner above the directory, the dark pages say it in the shared
footer line). That sync is browser-local — it is the `storage` event, not a server. The test
draft was discarded afterwards, so the working set matches `data/stores.js` again.

**Not deployed.** No hosting, domain, database or form service has been configured. Until
the site is hosted, the admin panel writes only to the browser it is opened in, and nothing
it changes is visible to a visitor on another device.
