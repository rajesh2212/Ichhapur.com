# Research notes — ICHHAPUR Market website

Every entry in `data/stores.js` must be traceable to a note in this file.
Nothing here was confirmed by visiting a shop. Public listings are treated as
**leads**, not ground truth.

All checks performed on **2026 October 26**.

---

## 1. Location facts (owner-supplied)

Owner supplied, used as-is:

| Field | Value |
| --- | --- |
| Market / locality name | ICHHAPUR |
| Address area | Ichhapur, Bhadrak, Odisha, India |
| PIN code | 756127 |
| Map coordinates | 21.045677123140994, 86.55692995394432 |

### Verification of the PIN code

`756127` is a real PIN code in Bhadrak district, Odisha. Multiple independent
pin-code listings agree that it contains **Ichhapur B.O** (Branch Office,
delivery type) and **Dolasahi S.O** (Sub Office), under Bhadrak division,
Odisha circle (Bhubaneswar HQ region).

Sources checked: mapsofindia.com, pincode.net.in, ndtv.com, prokerala.com,
abplive.com, icbse.com, indyatour.com (lists ~7 post offices for 756127).
One source (icbse) describes Ichhapur as a "Speed Post Branch Post Office";
others list it as delivery-only. **Unresolved — do not assert speed-post
availability.**

### Verification of the coordinates — IMPORTANT DISCREPANCY

Reverse-geocoding `21.045677, 86.556930` against OpenStreetMap (Nominatim,
zoom 16) returns:

> SH9, Tihidi, Bhadrak Rural, Bhadrak, Odisha, **756130**, India

The point falls on **State Highway 9**, roughly 4–5 km east-southeast of
Bhadrak town. Its OSM postcode tag (756130) differs from the owner's 756127.

Separately, pin-code sources publish coordinates for *Ichhapur post office* of
**21.061235 N, 86.490685 E** — about **7.1 km northwest** of the owner's point,
on the opposite side of Bhadrak town.

Distance from the owner's point, computed with the haversine formula:

| Reference point | Coordinates | Distance |
| --- | --- | --- |
| Sumitra Medical Store (Mappls) | 21.043619, 86.549682 | **0.8 km** |
| Ichhapur B.O, per pin-code sites | 21.061235, 86.490685 | 7.1 km |
| Dolasahi village (geoiq) | 21.019158, 86.592478 | 4.7 km |
| Tihidi block centre (OSM) | 20.9927351, 86.6371107 | 8.9 km |

**Decision.** Per the build brief, the owner's coordinates are used for the map
marker, the directions links and the distance calculations. They are labelled
**"location provided by the market"** everywhere, and the site explicitly states
that they do not mark a verified market boundary. The 7.1 km disagreement with
pin-code directories is recorded here and surfaced as an open question for the
owner — it must be resolved before the location section can be called accurate.

Two candidate explanations, neither confirmed: (a) the name "Ichhapur" refers to
both a revenue village near the post office and a market hamlet on SH9; (b) one
of the two coordinate sets is simply wrong in its source. **Do not guess in
public copy.**

### OpenStreetMap coverage

An Overpass Turbo query for `shop=*` and `amenity=marketplace|pharmacy|bank|post_office`
within 3 km of the owner's coordinates returned **zero mapped objects**. OSM has
no commercial POI data for this spot, so it cannot corroborate or refute any
store lead. All store data therefore comes from Indian business directories and
map services.

---

## 2. Store leads — one row per candidate

Status vocabulary used by the site:

- `listed` — a public source places it at/near the market point with a usable
  address. Still **not** independently verified.
- `needs-confirmation` — the public source does not place it clearly inside the
  ICHHAPUR market area, or details conflict. Rendered in the UI with the exact
  label **"Listing needs confirmation"**.

No rating, review count, "best/most popular" claim, stock statement, ownership
claim or "open now" status is published anywhere on the site, even where a
source supplied one (see §3).

### 2.1 Sumitra Medical Store — `listed`

- **Category:** Pharmacy / medicines (directory category: "Chemists").
- **Address lead:** "Ichhapur, Bhadrak"; another listing renders it as
  "At – Barik Chhack, Bypass, Ichhapur".
- **Coordinates:** 21.043619, 86.549682 — from the Mappls place URL for
  "sumitra medical store, sh 9, bhadrak rural, bhadrak district, odisha 756127"
  (the base64 fragment decodes to `21.043619+86.549682+17`).
- **Distance from market point:** 0.8 km. **Closest corroborated lead to the
  owner's coordinates**, and on SH9 like the owner's point.
- **Hours per listing:** Mon–Sun 7:00 am – 11:30 pm (JustDial). Shown on the
  site flagged as "per public listing, unverified".
- **Sources:** justdial.com (JustDial ID …231216061009-B8S7), mappls.com
  (place code O7GBTP), plus a related JustDial entry "Bajaranga Fly Ash Bricks &
  Sumitra Medical Store, Bhadrak Bypass" (…250621105748-M8N4) which bundles the
  same trader name with building materials. **That bundling is ambiguous — the
  site lists medicines only, and does not publish the building-material side or
  the partially masked GST number.**
- **Risk:** the two JustDial entries may or may not be the same shopfront.

### 2.2 Pradhan Mantri Bhartiya Janaushadhi Kendra — `needs-confirmation`

- Appears in Mappls' "places nearby" strip for Sumitra Medical Store as
  "Pradhan Mantri Ja…" at **628 m**, so a jan aushadhi kendra in this general
  area is plausible.
- A Bhadrak-district PMBJP kendra is independently supported: the programme
  lists kendras for Odisha/Bhadrak (reference `PMBJK04202` appears in a
  public copy of an updated kendra list, and genericdrugscan.com lists Bhadrak
  kendras). JustDial counts ~24 "Jan Aushadhi Kendra" results district-wide.
- **Not established:** which kendra ID corresponds to this location, its exact
  address, or whether it is currently operating.
- **Site handling:** included as a lead with no coordinates and no directions
  button; the detail panel points at the official locator
  (janaushadhi.gov.in/near-by-kendra) and asks the owner to confirm.

### 2.3 Jay Guru Medicine Store — `needs-confirmation`

- Thin lead only: Mappls nearby strips list "Jayguru Medicine…" at 631 m from
  Sumitra Medical Store. Also seen as "Jayaguru Mobile Care" in a JustDial
  mobile-repair table, so **the trader name may cover more than one shop or
  category**.
- **Site handling:** published with no coordinates, no phone, no hours, and the
  confirmation badge. Owner should delete or firm this up.

### 2.4 Jaga Kalia Communication — `needs-confirmation`

- **Category:** Mobile phones, accessories and repair (directory categories:
  "Mobile Phone Dealers", "Mobile Phone Accessory Dealers", "Smart Watch
  Dealers", "Mobile Phone Repair Services", "Landline Phone Dealers").
- **Two distinct listings**, both PIN **756127**:
  1. "Jaga Kalia Communication", Sadanandapur, **Jitanaga**, Bhadrak 756127
     (JustDial …220416001439-U8L4). Some tables append "Tulamtula Road".
  2. "Jagakalia Communication Dolasahi", **Dolasahi**, Bhadrak 756127
     (JustDial …171230055441-S2H9).
- **Distance:** Jitanaga could not be geocoded from OSM or pin-code sources, so
  no distance is computed or shown.
- **Site handling:** both listings published under one entry, with the two
  locality wordings shown verbatim and no coordinates, therefore **no directions
  button**. Ratings seen in sources (4.0/3.7 over 22 ratings) are **not**
  republished (see §3).

### 2.5 Lucky Store — `needs-confirmation`

- **Category:** Departmental / general store.
- **Address lead:** JustDial "Departmental Stores in Dolasahi, Bhadrak" gives
  "Lucky Store — Taragana, Ichhapur Road, Ichhapur, Bhadrak 756127" alongside
  other "Lucky Store" rows for Bidyadharpur, Tihidi 756130 and Sabrang 756123.
  **Same name, several locations — cannot be resolved remotely.**
- **Site handling:** published with the Ichhapur Road / 756127 wording only, no
  coordinates, confirmation badge.

### 2.6 Dolasahi Market — `needs-confirmation`

- **Category:** Market / shopping area.
- **Address lead:** JustDial "Markets in Dolasahi, Bhadrak" row:
  "Dolasahi Market — Chakasridharpur, Bhadrak 756127" (the same table row also
  carries "Allinager Market" and an SH9 / Sadanandapur / Paliabindha address,
  so the row is a **multi-result table, not a clean single address**).
- **Locality context:** Dolasahi is a village in **Tihidi tehsil**, Bhadrak
  district, PIN 756127 (Dolasahi S.O). onefivenine describes it as ~11 km from
  the district headquarters; geoiq gives 21.019158, 86.592478 and a population
  of 3,280 (1,706 male / 1,574 female).
- **Distance from market point:** 4.7 km.
- **Judgement:** this is a **neighbouring market area, not a shop inside
  ICHHAPUR market**. It is published, but distance is shown, the coordinates are
  labelled a *village reference point* rather than the market's entrance, and
  the confirmation badge is applied.
- **Site handling:** population figure deliberately **not** published on the
  site (single unsourced aggregator, and not useful to a visitor).

### 2.7 Swarnalaxmi Mobile Store — `needs-confirmation` (outside the market area)

- **Category:** Mobile phones, accessories, repair; also landline/cordless
  phones per an IndiaMART company profile (ID 66530613).
- **Address lead:** "Near Rajghat Bridge / New Rajghat Bridge, Bypass, Bhadrak";
  another table adds "Near IDBI Bank" and "Matha Sahi". This is **Bhadrak town**,
  several kilometres from the market point — *not* Ichhapur.
- **Phone published by a directory:** +91 9861245539 (khojakhoji.com listing).
  Republished **with attribution** and flagged as unverified, because a wrong
  number sent to a business causes real unwanted calls.
- **Why it is on the site at all:** it was named in the build brief as a lead.
  Rather than silently dropping it, it is published with the locality wording
  "Bhadrak town", the distance, and an explicit note that it appears to be
  **outside** the immediate market area, so visitors are not misled into thinking
  it is a shop in ICHHAPUR market.
- **Ratings seen (5.0 over ~196–198 reviews) are not republished** — see §3.
- A Facebook post naming a specific individual as an employee of this store was
  found and **is not republished** (personal data, not needed by a visitor).

### 2.8 Ichhapur Branch Post Office — `needs-confirmation` (service / landmark)

- **Supported by many sources:** "Ichhapur B.O / Ichhapur Post Office, PIN
  756127, Bhadrak district, Odisha; Bhadrak division; Odisha circle; related
  sub office Dolasahi S.O; taluka Bhadrak (some sources say Bhadrak Rural)."
- **Location conflict:** published coordinates 21.061235, 86.490685 sit ~7.1 km
  from the owner's market point, so **no coordinates and no directions button
  are published** — the site states the conflict in plain words instead.
- Useful as a landmark for the PIN, and it demonstrates the honest handling of a
  source disagreement.

### Leads checked and NOT added

- Other names visible in directory tables near Bhadrak (Mishra Communication
  /Guamal 756163, Schi Mobile /Betada 756168, Jayaguru Mobile Care /Sahada
  Sabrang 756123, Jayaguru Mobile Care, Babool Mobile /College Road Naripur,
  Khushi Mobile, Bhadranee Mobiles, Mamata Medicine Store, Sai Sanjibani,
  Allinager Market) — **PINs or localities fall outside 756127, or could not be
  placed near the market point at all.** Excluded under the brief's rule that
  Bhadrak-area listings must not be silently treated as stores inside this
  market. Re-verify any of these locally before adding.

---

## 3. Deliberately excluded information

To stay inside the brief's accuracy rules, the site publishes **no**:

- star ratings or review counts (sources showed 5.0/196, 4.0/22, 3.7/3 for these
  traders) — unverifiable, and a "best/most popular" claim by another route;
- "open now" / currently-closed status;
- product stock, brand availability or price claims;
- ownership, manager or employee names;
- partially masked GST numbers;
- market size, shop count, visitor numbers, founding date, history, festivals or
  "local specialities" — **no credible source for ICHHAPUR specifically was
  found**, so the About section is written neutrally and says so.

The directory count in the hero is generated from `data/stores.js` at runtime and
worded as "listings compiled from public sources", never as "X shops in the
market".

---

## 4. Contact details

The owner supplied **no email address, phone number, or form backend**. So the
suggestion form is **front-end only**: it validates, then shows an honest message
that submission is not yet connected, and offers "Copy message" so the visitor can
send it by whatever channel the owner later publishes. It does **not** claim to
have sent anything, and no third-party form endpoint was wired up.

---

## 5. Sources

Location & post office
- https://www.mapsofindia.com/pincode/india/odisha/bhadrak/ichhapur.html
- https://pincode.net.in/ORISSA/BHADRAK/I/ICHHAPUR
- https://www.ndtv.com/tools/pincodes/odisha/bhadrak/ichhapur-bo
- https://www.prokerala.com/pincode/ichhapur-bhadrak.html
- https://news.abplive.com/pincode/odisha/bhadrak/ichhapur-pincode-756127.html
- https://www.icbse.com/pincodes/ichhapur-office-86666
- https://www.indyatour.com/directory/pincode/756127
- https://pincode.khojidoggy.com/756127
- https://pin.codes.in/pincode/756127/dolasahi-s-o
- https://www.mapsofindia.com/pincode/india/odisha/bhadrak/dolasahi.html
- http://www.onefivenine.com/india/villages/Bhadrak/Tihidi/Dolasahi
- https://geoiq.io/places/Dolasahi/VeUOAHsCJY
- OpenStreetMap Nominatim reverse geocode + Overpass Turbo POI query (see §1)

Stores
- https://www.justdial.com/Bhadrak/Sumitra-Medical-Store-Ichhapur/9999P6784-6784-231216061009-B8S7_BZDET
- https://www.justdial.com/Bhadrak/Bajaranga-Fly-Ash-Bricks-Sumitra-Medical-Store-Bhadrak-Bypass/9999P6784-6784-250621105748-M8N4_BZDET
- https://www.mappls.com/place-sumitra+medical+store-sh+9-bhadrak+rural-bhadrak+district-odisha-756127-O7GBTP
- https://www.justdial.com/Bhadrak/Chemists-in-Maitapur/nct-10096237/page-5
- https://www.justdial.com/Bhadrak/Jaga-Kalia-Communication-Jitanaga/9999P6784-6784-220416001439-U8L4_BZDET
- https://www.justdial.com/Bhadrak/Jagakalia-Communication-Dolasahi-Dolasahi/9999P6784-6784-171230055441-S2H9_BZDET
- https://www.justdial.com/Bhadrak/Mobile-Phone-Accessory-Dealers/nct-11218144/page-2
- https://www.justdial.com/Bhadrak/Top-Mobile-Phone-Repair-Services-in-Paliabindha/nct-15562797
- https://www.justdial.com/Bhadrak/Departmental-Stores-in-Dolasahi/nct-10156727
- https://www.justdial.com/Bhadrak/Markets-in-Dolasahi/nct-15562797
- https://www.justdial.com/Bhadrak/Swarnalaxmi-Mobile-Store-Near-Rajghat-Bridge-New-Rajghat-Bridge/9999P6784-6784-210317121257-N9E1_BZDET
- https://www.justdial.com/Bhadrak/Mobile-Phone-Dealers/nct-11216691
- https://www.khojakhoji.com/Bhadrak_Bypass/Electronics/Mobile-Phone/Mobile-Phone-Accessories-And-Parts
- https://www.indiamart.com/company/66530613/
- https://www.justdial.com/Bhadrak/Jan-Aushadhi-Kendra/nct-12066529
- https://janaushadhi.gov.in/near-by-kendra
- https://www.genericdrugscan.com/jan-aushadhi-stores/odisha/bhadrak
