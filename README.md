# ICHHAPUR Market — website

A mobile-first visitor guide to ICHHAPUR market (Ichhapur, Bhadrak, Odisha, 756127):
what the market is, which stores and services are listed there, how confident each
listing is, and how to get directions.

Plain HTML, CSS and JavaScript. **No frameworks, no build step, no dependencies, no
analytics, no keys.** Every file can be edited in a text editor. The only requests that
leave the browser are for the webfont (`fonts.googleapis.com` / `fonts.gstatic.com`);
every page falls back to the system sans if they are blocked.

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
| `landing.html` | **Home.** Frosted masthead over the market-street night photograph, the counted stat cards, the ticker, and six cards that link into the other pages. No section content lives here any more — each one has its own page. |
| `about.html` | About: how the listings were made, the illustrated market view, and the explicit list of things the site will not publish. |
| `whats-here.html` | What's here: the trade tiles with their per-category counts, plus the directions block and the map artwork. |
| `listings.html` | Listings: the nearest-first grid, the "needs confirmation" note, and the best-documented listing. |
| `sources.html` | Sources: the quotation pager, and one row per sourced listing with every link and the date it was read. |
| `contact.html` | Contact: the address block, and what a useful correction looks like. The form itself is in the guide. |
| `index.html` | **The guide** — it *is* the store directory: search, filters, all listings, about, location, contact form, footer. Same warm ground and same header as every other page. |
| `admin.html` | **The store admin panel.** Add, edit, delete listings and attach photographs, without opening a text editor. See "Editing the store list" below. |
| `data/stores.js` | **The published store directory. This is the file that visitors see.** Every page reads it. |
| `assets/js/market-data.js` | The shared data layer: merges `data/stores.js` with any local draft, saves, exports, and tells every open page when the data changed. Also holds the distance, map-link and thumbnail helpers. |
| `assets/js/site-nav.js` | **The shared chrome.** Builds the masthead (Home, About, What's here, Listings, Sources, Contact), the back bar under it, and the footer, then mounts them into every page — including the guide and the admin panel. Also wires the mobile drawer, `aria-current`, Escape, and the directions links. |
| `assets/css/site-chrome.css` | The CSS for that shared header, back bar and footer — **and the one place the theme's colour and type tokens are defined** (`:root`). Every page loads it first, so nothing else has to re-declare them. |
| `assets/css/styles.css` | The guide's components: layout, cards, filters, detail panel, the opening animation. It keeps the old token *names* (`--paper`, `--ink`, `--clay`, `--marigold`…) but their values are the new theme's, which is why ~700 lines of components survived the repaint untouched. |
| `assets/css/landing.css` | The six content pages' theme. Self-contained — it does not load `styles.css` — and holds no `:root` of its own. The Home hero and the five figure frames are the only surfaces still dark, on purpose. |
| `assets/css/admin.css` | The admin panel's theme, laid out for data entry. Loads `site-chrome.css` after it, so it declares only admin-only tokens (`--field`, `--danger`, `--panel-2`, the ok/warn pair, and the five-hue trade ramp) and inherits the rest. |
| `assets/img/market-street.svg` | The market-street illustration: the guide's hero, and the fallback figure on About and Listings. Hand-drawn vector, blank signboards on purpose — replace with real photographs when you have them. |
| `assets/img/dark/` | Only the six **photographic** night scenes now: the Home hero and the five sub-page figures. The folder name is left over from the old dark theme — the recoloured SVG set that used to live here is gone, because every page now uses the light drawings in `assets/img/trade/`. |
| `assets/img/dark/hero-market-street.jpg` | The Home hero backdrop — a **generated** market scene supplied by the owner, 1672×941, 238 KB. Not a photograph of ICHHAPUR, and the page says so. |
| `assets/img/dark/page-*.jpg` | The wide rounded image at the foot of each sub-page hero: `page-about`, `page-whats-here`, `page-listings`, `page-sources`, `page-contact`. All five are **generated** scenes in the site's night-market palette, 1792×1024, 275–391 KB each, and each figure is captioned as such. Replace them with real photographs when you have any. |
| `assets/img/trade/` | One small drawing per category (`medicines`, `mobile`, `general`, `market`, `service`), shown at the top of every store card — in the guide, on the content pages and in the admin panel. They stand for the *trade*, never for the shop. `market.svg` also fills the smaller What's here and Contact figures; About and Listings use the wide `assets/img/market-street.svg`. |
| `assets/img/illustration/` | Four drawn scenes in the site's own palette — `market-lane-wide`, `produce-stall`, `source-ledger`, `empty-lane` — as WebP (74–121 KB each). Encoded from `vibe_images/` by `tools/make-images.mjs`. Used on About, Listings, Sources and Contact, each captioned as a drawing rather than a photograph of ICHHAPUR. |
| `assets/img/og.png` | The 1200×630 share card, built from `tools/og-card.html` by the same script. Every page points at it with `og:image` / `twitter:image`. |
| `assets/img/icon-32.png`, `assets/img/icon-180.png` | Favicon and the iOS home-screen tile. `assets/img/market-street.svg` doubles as the maskable icon. |
| `assets/js/main.js` | In the guide: search, filters, store details, map, directions, suggestion form, and the URL deep links. |
| `assets/js/landing.js` | Fills the six content pages. One file serves all six: each renderer looks for the element it fills and returns when that page does not have it. |
| `assets/js/admin.js` | The admin panel: the listing table, the edit form, photo resizing, validation, export, discard, and the `.cat-<trade>` class it puts on each row, filter and editor so the CSS ramp lands on the right listing. |
| `assets/js/intro.js` | The opening signboard animation and its skip/fallback rules. |
| `docs/research-notes.md` | Where every listing came from, what is unproven, and what to ask about. |
| `scripts/serve.js` | Optional local preview server. Not deployed. |
| `tools/site-audit.mjs` | **The checker.** Drives headless Chrome over CDP and scores all eight pages at 375 and 1200 px on nine things — contrast, rendered-pixel contrast, overflow, console, links, alt text, metadata, images, motion — and prints one weighted percentage. `--motion` runs the opposite pass (motion allowed) and proves nothing is left invisible. `--json <file>` writes the full detail. Exits non-zero below 90%. |
| `tools/sync-check.mjs` | Opens the admin panel and all seven public pages as tabs of one browser, edits a listing through the real form, and checks what happens everywhere else — including that the save makes **zero** network requests and that an isolated browser profile (a stand-in for another device) still gets the published file. |
| `tools/make-images.mjs` | Encodes `vibe_images/*.png` into the WebP illustrations, and renders `tools/og-card.html` and the icons into `assets/img/`. |
| `tools/og-card.html` | The share card as a page — same theme, same type — so the PNG can be re-rendered by the script instead of hand-made. |
| `vibe_images/` | The four generated illustrations at full size, kept so `tools/make-images.mjs` can re-encode them. Not loaded by any page. |

---

## Eight pages, one header, one set of data

The site is six content pages plus the guide and the admin panel:

```
landing.html  about.html  whats-here.html  listings.html  sources.html  contact.html
index.html (the guide)    admin.html (the panel)
```

All eight get the **same** masthead with the six destinations, built by
`assets/js/site-nav.js`. Each destination is a real `<a href>`, so navigation works before
any script runs; the script only marks the current page with `aria-current` and wires the
mobile drawer.

**Every page except Home has a back bar** under the header. It shows a real link back to
`landing.html` by default and upgrades to "Back to Listings" (or whichever page you came
from) when the referrer is another page on this site — so it works with no JavaScript, and
it never leaves the site.

`index.html` is the working guide and stays the default page (hosts serve `index.html` from
a URL with no file name). It keeps its own footer, because that footer carries the accuracy
note and the "replay the welcome animation" control — a page never gets two footers.

Nothing is duplicated in content terms. Each section's full content lives on exactly one
page, Home only links to it, and all of it goes through `assets/js/market-data.js`, which
merges the published `data/stores.js` with any local draft. Editing the store file updates
every page, and saving in the admin panel updates the pages open in this browser straight
away.

If you would rather the guide *be* the home page, swap `index.html` and `landing.html` —
every link is relative and both read the same data.

The content pages hand off to the guide with ordinary URL parameters, which also work as
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

## The theme

Every page — all eight, the guide and the admin panel included — uses one visual system,
taken from the reference picture the owner supplied: a warm taupe ground, solid white cards
with generous rounding, one near-black for text and primary buttons, a translucent frosted
header, and all-sans type.

**One token source.** `assets/css/site-chrome.css` defines the whole palette and the type
stack in `:root`, and it is the first stylesheet every page loads. `landing.css` has no `:root`
block at all; `admin.css` declares only admin-only tokens. Change `--bg` or `--ink` there and
every page follows.

The tokens that matter (`site-chrome.css:20-47`):

| Token | Value | Where it shows |
| --- | --- | --- |
| `--bg` / `--bg-warm` | `#efe9e2` / `#e8dfd5` | the page ground, warm rather than white |
| `--panel` | `#ffffff` | cards, fields, the header pill |
| `--ink` | `#17181a` | body text and every primary button |
| `--accent` / `--accent-deep` | `#8a4a22` / `#6f3a1a` | links, eyebrows, focus rings |
| `--amber` `--clay` `--palm` | `#e8a75c` `#a8442a` `#2f6b50` | highlights, warnings, the "confirmed" badge |
| `--frame` | `rgba(247,243,239,.78)` | the masthead and back bar, frosted |
| `--r` / `--r-lg` | `16px` / `26px` | cards; the hero figures use `clamp(26px, 4.6vw, 44px)` so a squircle stays a squircle on a phone |

**Type.** One family — Plus Jakarta Sans, weights 400–800, preconnected and loaded with
`display=swap` on each page. Headings are the same family (`--display: var(--sans)`), bold and
tight-tracked; the serif that used to carry them is gone from the CSS and the font links, and
so is the second body family. Repo-wide greps for `Playfair`, `Mukta` and `--serif` return
nothing.

**"Open the guide".** The user asked for that header label to be pure black, so the header's
own pill inverts out of the primary-button pattern: `background: var(--panel)` (white) with
`color: #000`, its arrow icon un-chipped and also black (`site-chrome.css:151-159`). Verified
in the browser as `rgb(0,0,0)` on `rgb(255,255,255)` on all eight pages. Primary buttons
elsewhere stay near-black with white text, which is the reference's own pattern for its main
call to action.

**Frost, with a way out.** The masthead is `backdrop-filter: blur(18px) saturate(150%)` over
`--frame`, the back bar a lighter version of the same. Browsers without `backdrop-filter` get
`--frame-solid`, and `prefers-reduced-transparency: reduce` turns the blur off — nobody is
left reading type over an unblurred photograph.

**Three dark surfaces stay, deliberately.** The owner chose to keep the night-market
photography, so it needed somewhere to sit: the Home hero (`#1b1a18`, `landing.css:41`), the
`.pageshot` frames around the five sub-page figures, and the guide's About band plus its own
footer (`#24211e`). Their light-on-dark text is what the contrast pass below measured. Every
other surface on every page is light.

**A ramp for the trades.** The admin panel used to be one colour. Each trade now has its own
hue, and the hue is chosen by computation (`admin.css:38-66`): medicines `#2f6b50` and general
`#8a4a22` are the theme's own `--palm` and `--accent`, market `#856908` is the dark end of
`--amber`, and the two hues the daylight palette did not have — mobile `#5f2f48` and service
`#27506e` — were matched to it at the same low chroma and dark lightness. All five clear AA as
label text on white (5.22:1 at the worst, market) *and* on the 8.5% tint the chip sits in
(4.67:1 at the worst). Simulated as protanopia, deuteranopia and tritanopia and measured as
CIE76 distance, no two hues fall closer than 11.7 apart, so the ramp survives colour-vision
deficiency — and it never has to carry meaning alone: the chip prints the trade name, the
status tag is a square of uppercase text beside a round pill with a dot, and the storage meter
states its percentage in words. The hue is applied where it says something — the 3px bar down
the left of each row, the trade chip, the editor card's top rule and photo frame, the trade and
status selects (which go grey, not terracotta, when the filter reads "All trades") — and the
meter turns into a solid danger block past 95%, because at that point the draft is about to be
refused by the browser.

**Contrast.** Every foreground/background pair was computed (WCAG relative luminance, through
the full stack of translucent layers, `::after` scrims and image pixels sampled on a canvas)
at 375 and 1200 px on all eight pages — about 590 and 520 text elements respectively. **Zero
pairs below AA**, and zero on the gradient-surface pass. One real fix came out of it: the
guide's CTA strip ended on `#c05a2a`, which put its white text at 4.43:1, so the gradient now
runs to `#8f3a1c` (7.78:1). Everything else that flagged was a bug in the measuring script —
it was treating decorative 8–20% gradient glows as full-page backdrops, and walking past the
first opaque layer. The admin panel was re-run through the same audit after the ramp landed,
with the editor open, a toast showing and the meter forced to 98%: 146 text elements, zero
below AA.

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
   (`assets/img/market-street.svg` on About and Listings,
   `assets/img/trade/market.svg` on What's here and Contact). Every store
   card uses a drawing of its trade (`assets/img/trade/`, on the guide, on the content
   pages and in the admin panel — one light set, since the dark copy of those drawings was
   removed with the dark theme) because invented or borrowed photos of real
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

## Checking it yourself

Both checkers are plain Node (run with v22.14), need the preview server up, install
nothing and use the Chrome already on the machine:

```
node scripts/serve.js                    # leave this running on 127.0.0.1:4173
node tools/site-audit.mjs                # the score, plus every failure it found
node tools/site-audit.mjs --motion       # motion allowed — does the reveal layer leave anything hidden?
node tools/site-audit.mjs --json out.json # same run, full detail per text box
node tools/sync-check.mjs                # admin -> every page, and how far that does NOT reach
```

`CHROME=/path/to/chrome node tools/site-audit.mjs` overrides the browser path. The
audit launches Chrome with `--force-prefers-reduced-motion`, so the scored run measures
the calm version of every page; `--motion` drops that flag and checks the animated one.

---

## Status

Built and checked locally.

**The guide (`index.html`)** — mobile layout, search, category filters, the "well-placed
only" filter, empty and error states, store details panel, directions links, map, suggestion
form, keyboard navigation, reduced-motion and low-power fallbacks. It carries the shared
frosted masthead like every other page, so the old `.site-header` rules are gone from
`styles.css` and the section anchor offset was raised to clear the taller chrome
(`scroll-margin-top: 128px` — header plus back bar; the bar's offset is measured in JS,
because that height is not a number worth hard-coding). Its own footer, the accuracy
note and the replay link are unchanged.

**The six content pages** (`landing.html`, `about.html`, `whats-here.html`, `listings.html`,
`sources.html`, `contact.html`) — checked at 375, 620 and 1200 px. Each page's hero or
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
inherits it. Two `linear-gradient` scrims on `.hero::after` darken the left and the bottom so
the type has something to sit on; the crop keeps the lit storefronts — the whole width on
desktop, and the right of the source on mobile (`object-position: 84% 56%` above 900 px)
rather than the empty road. `.hero` carries `background-color: #1b1a18` for when the image
fails to load, and print drops the backdrop to white with black type.

The three stat boxes in that hero are iOS-style frosted glass, inverted for the light theme: a
72% white fill (`rgba(255, 255, 255, .72)`) over `backdrop-filter: blur(18px) saturate(180%)`,
with near-black ink for both the number (`#17181a`) and its label (`#45413c`), 20 px corners,
and a top sheen from a `::after` that fades out at 62%. The blur is on the card's own backdrop
only, so no text, image or button inherits an opacity. Browsers without `backdrop-filter`, and
visitors who ask for less transparency, get the same shape with a solid panel instead; print
drops the glass too. The headline, the lede and both lines of each card are inside the audited
set below — none of them falls below AA at 375 or 1200 px.

**The repaint, verified** — `node tools/site-audit.mjs` now measures it on every run. Each
visible text box on all eight pages is checked twice at 375 and at 1200 px: once from the
element-to-root stack of translucent layers (`::after` scrims read off computed styles), then
again from a screenshot taken with the glyphs made transparent, where the pixels inside the
text's own box are the real backdrop. That second pass is what catches copy dropped on a
bright part of a photograph — 1,294 boxes measured twice, 72 of them sitting over a picture.
**100.0% weighted, zero failures at either width**, zero console errors, zero broken images,
and no document-level horizontal overflow (`scrollWidth === clientWidth` everywhere — the only
clipped rails are the ticker and the filter strip, both intentional). Two real defects came out
of the pixel pass and were fixed, not explained away: the floating coordinate card on Home was
`position: static` at phone width, so the inline `<img>` painted over its top 22 px and put the
label on the drawing (3.34:1 — now `position: relative; z-index: 1`), and `--muted` measured
4.43:1 on the tan quote panel, so it is now `#575249` at 4.80:1 in both stylesheets.
`body` computes to
`rgb(239, 233, 226)` with `"Plus Jakarta Sans"` on every page, and the header pill computes
to `rgb(0, 0, 0)` on `rgb(255, 255, 255)` on every page. Every page was also rendered in
headless Chrome at both widths and looked at — hero, cards, figures, table and form — so the
theme was checked as a picture, not only as numbers.

**The motion layer** — scroll reveals (`data-reveal`) run on the six content pages, and five
groups now stagger their children in: the guide cards on Home, the listings grid, the trade
tiles, the source rows and the address block. Cards and chips answer a press with a small
`scale()` (`:active`), the Home figures ease open a hair on hover or keyboard focus, the ticker
keeps running, and the admin panel — which had no animation at all — now lifts its notice,
toolbar, list and export box in sequence, rows in once per load (guarded by an `is-fresh` class
so typing in the filter does not re-animate the table), and slides its editor and toast in.
Every one of those has a `prefers-reduced-motion` escape and a print escape, including the
staggered children, which start at `opacity: 0` and so must be lifted explicitly by the guard.
`node tools/site-audit.mjs --motion` runs the opposite check with motion allowed: after walking
each page top to bottom, no revealed group is left below `opacity: .05` on any of the eight
pages, and the keyframe sets (`fade-up`, `name-in`, `card-in`, `rise-in`, `panel-in`, `row-in`,
`rope`) are seen running.

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
is still reachable by keyboard. It now follows the same theme as the public pages — white
fields on the warm ground, near-black primary buttons, a solid black toast — and its 8 rows
render the light `assets/img/trade/` drawings like every other page. Each row, chip, editor
card and status select is painted with that trade's hue from the ramp described under
"The theme" above, so the eight listings read as five groups at a glance while every one of
them still says its trade in words.

**Live sync was measured, not assumed** — `node tools/sync-check.mjs` opens the admin panel and
all seven public pages as tabs of one browser, edits the first listing through the real form
(click **Edit**, type into Summary, click **Save**) and then reports:

- all 7 public pages had the new text in their data and re-rendered **without a reload** — the
  same JS context, proven by a marker the script puts on `window` before the save and reads
  after it (0 ms to 1 ms; the `storage` event, not a poll);
- every page then said so out loud: 7/7, the guide through its own `#draftNote` banner and the
  six content pages through the shared footer line;
- one 9.6 KB record under `ichhapur.working.v1`, 8 stores before and after — an edit never
  adds or drops a listing;
- **the save made zero network requests.** No API, no form endpoint, no analytics. The only
  requests any page makes at all are the Google Fonts stylesheet and its `.woff2` on
  `fonts.gstatic.com`, which carry nothing about the edit;
- `Export` produces the same 12 KB set as JSON, and `data/stores.js` as served is unchanged —
  publishing is a manual paste, and `data/stores.js` on disk kept the same SHA-256 through the
  whole run;
- a reload still shows the draft, and **an isolated browser profile loads the published file** —
  that isolated profile is the closest stand-in for a customer's phone available here, and it
  sees none of it;
- `Discard local draft` confirms first, removes the key, and all 7 pages revert live.

25 of 25 checks pass. The draft was discarded afterwards, so the working set matches
`data/stores.js` again.

**What "in sync for every customer" would actually take.** The above is the complete reach of
the current design: admin → every tab of *this browser on this machine*. Beyond that it needs a
hosted backend, which is not built, configured or paid for here — specifically a database or
JSON endpoint the pages fetch instead of `data/stores.js`, an authenticated write path so the
admin panel POSTs to it, and a read path the public pages poll or that pushes to them
(a redeploy on save, or a small polling/`EventSource` layer). None of those exist yet, so the
admin panel does not claim they do: it names its own scope at the top of the page, every page
says "Not deployed", and no invented endpoint is wired anywhere. Until then the supported loop
is admin → Export → paste into `data/stores.js` → commit, which is also what the site's own
notice tells the owner to do.

**Not deployed.** No hosting, domain, database or form service has been configured. Until
the site is hosted, the admin panel writes only to the browser it is opened in, and nothing
it changes is visible to a visitor on another device.
