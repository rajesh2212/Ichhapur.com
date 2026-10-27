/* ============================================================================
   ICHHAPUR Market — directory data
   ----------------------------------------------------------------------------
   This is the ONLY file you need to edit to change the store list.
   No rebuild, no design work required.

   HOW TO ADD A STORE
   1. Copy any whole block below (from `{` to `},`) and paste it inside `stores`.
   2. Give it a unique `id` (lowercase, no spaces).
   3. Fill the fields. Rules:
        • Only write down what a public source actually says.
        • Never add a rating, review count, stock claim, "best/most popular",
          an owner's name, or an "open now" status you have not confirmed.
        • If you are not sure a shop is really inside the market area, or you
          are not sure it still operates, keep
          "status": "needs-confirmation".
        • If you have no usable map position, leave "coordinates": null.
          The site will then hide the directions button automatically.
      Every source URL should carry the date you checked it.

   STATUS VALUES
        "listed"             — a public source places it near the market point.
                               Still shown as unverified; nothing here has been
                               checked by visiting the shop.
        "needs-confirmation" — the badge "Listing needs confirmation" appears
                               on the card, and uncertain fields are withheld.

   Keep docs/research-notes.md in step with this file.
   ========================================================================= */

window.MARKET_DATA = {
  market: {
    name: "ICHHAPUR",
    wordmark: "ICHHAPUR",
    tagline: "A visitor guide to the market and its stores",
    localityLine: "Ichhapur, Bhadrak, Odisha",
    pin: "756127",
    country: "India",

    /* Location supplied by the market owner on 2026-10-26. Used for the map
       pin, the distance figures and every "Get directions" link. Public
       pin-code directories disagree with it by about 7 km — see
       docs/research-notes.md §1. Do not present this as a verified boundary. */
    coordinates: { lat: 21.045677123140994, lng: 86.55692995394432 },
    coordinatesSourceLabel: "Location provided by the market owner",

    /* The site is front-end only until the owner supplies a real channel.
       Leave these null and the form keeps its honest "not connected yet"
       message. Fill one in and the form names it automatically. */
    contact: {
      email: null,
      phone: null
    }
  },

  categories: [
    { id: "medicines", label: "Medicines & health" },
    { id: "mobile", label: "Mobile phones & accessories" },
    { id: "general", label: "General & departmental stores" },
    { id: "market", label: "Markets & shopping areas" },
    { id: "service", label: "Public services" }
  ],

  stores: [
    {
      id: "sumitra-medical-store",
      name: "Sumitra Medical Store",
      category: "medicines",
      status: "listed",
      locality: "Ichhapur, near Barik Chhak on SH9",
      addressLine: "Ichhapur, Bhadrak Rural, Bhadrak, Odisha 756127",
      coordinates: { lat: 21.043619, lng: 86.549682 },
      coordinatesLabel: "Position published by a public map listing",
      phone: null,
      hours: "Mon–Sun, 7:00 am – 11:30 pm (per public listing)",
      description:
        "Listed as a chemist / medical store. The closest corroborated lead to the market location.",
      keywords: ["medicine", "medicines", "pharmacy", "chemist", "drug", "health"],
      note: "A second directory entry bundles this trader name with building materials. Whether that is the same shopfront is unconfirmed, so only the medicines side is published here.",
      sources: [
        {
          label: "JustDial — Sumitra Medical Store, Ichhapur",
          url: "https://www.justdial.com/Bhadrak/Sumitra-Medical-Store-Ichhapur/9999P6784-6784-231216061009-B8S7_BZDET",
          checked: "2026-10-26"
        },
        {
          label: "Mappls — SH 9, Bhadrak Rural, 756127",
          url: "https://www.mappls.com/place-sumitra+medical+store-sh+9-bhadrak+rural-bhadrak+district-odisha-756127-O7GBTP",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "janaushadhi-kendra-ichhapur",
      name: "Pradhan Mantri Bhartiya Janaushadhi Kendra",
      category: "medicines",
      status: "needs-confirmation",
      locality: "Shown near Sumitra Medical Store, Ichhapur",
      addressLine: "Bhadrak district, Odisha — exact address pending",
      coordinates: null,
      coordinatesLabel: null,
      phone: null,
      hours: null,
      description:
        "A government-listed generic-medicine kendra. Bhadrak district has PMBJP kendras, and one appears in a public map's nearby list about 630 m from Sumitra Medical Store.",
      keywords: ["generic medicine", "jan aushadhi", "pmbjp", "pharmacy", "affordable medicine"],
      note: "Which kendra ID serves this spot, its exact address, and whether it is currently operating are all unconfirmed. Check the official locator before publishing it as fact.",
      sources: [
        {
          label: "Mappls places nearby (628 m)",
          url: "https://www.mappls.com/place-sumitra+medical+store-sh+9-bhadrak+rural-bhadrak+district-odisha-756127-O7GBTP",
          checked: "2026-10-26"
        },
        {
          label: "Official kendra locator",
          url: "https://janaushadhi.gov.in/near-by-kendra",
          checked: "2026-10-26"
        },
        {
          label: "JustDial — Jan Aushadhi Kendra in Bhadrak",
          url: "https://www.justdial.com/Bhadrak/Jan-Aushadhi-Kendra/nct-12066529",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "jay-guru-medicine-store",
      name: "Jay Guru Medicine Store",
      category: "medicines",
      status: "needs-confirmation",
      locality: "Shown near Sumitra Medical Store, Ichhapur",
      addressLine: "Bhadrak, Odisha 756127 — exact address pending",
      coordinates: null,
      coordinatesLabel: null,
      phone: null,
      hours: null,
      description:
        "Appears in a public map's nearby list about 630 m from Sumitra Medical Store.",
      keywords: ["medicine", "pharmacy", "chemist"],
      note: "A similarly named trader also appears under mobile-phone repair, so this may be more than one shop, or the name may be duplicated across categories. Published with no contact details until confirmed.",
      sources: [
        {
          label: "Mappls nearby list",
          url: "https://www.mappls.com/j2xm5g",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "jaga-kalia-communication",
      name: "Jaga Kalia Communication",
      category: "mobile",
      status: "needs-confirmation",
      locality: "Jitanaga (Sadanandapur) and Dolasahi, both 756127",
      addressLine:
        "Listed as “Sadanandapur, Jitanaga, Bhadrak 756127” and separately as “Jagakalia Communication, Dolasahi, Bhadrak 756127”",
      coordinates: null,
      coordinatesLabel: null,
      phone: null,
      hours: null,
      description:
        "Mobile phones, accessories and repair, plus landline and smartwatch listings in directory tables.",
      keywords: ["mobile", "phone", "handset", "accessories", "repair", "sim", "smartwatch", "landline"],
      note: "Two directory entries use this trader name under different locality wordings, and both carry PIN 756127. It is not established whether they are one shop, two shops, or a duplicate record — and neither wording could be placed on a map, so no directions are offered.",
      sources: [
        {
          label: "JustDial — Jitanaga listing",
          url: "https://www.justdial.com/Bhadrak/Jaga-Kalia-Communication-Jitanaga/9999P6784-6784-220416001439-U8L4_BZDET",
          checked: "2026-10-26"
        },
        {
          label: "JustDial — Dolasahi listing",
          url: "https://www.justdial.com/Bhadrak/Jagakalia-Communication-Dolasahi-Dolasahi/9999P6784-6784-171230055441-S2H9_BZDET",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "lucky-store-ichhapur-road",
      name: "Lucky Store",
      category: "general",
      status: "needs-confirmation",
      locality: "Taragana, Ichhapur Road",
      addressLine: "Ichhapur, Bhadrak, Odisha 756127",
      coordinates: null,
      coordinatesLabel: null,
      phone: null,
      hours: null,
      description: "Listed under departmental / general stores for this area.",
      keywords: ["general store", "departmental", "grocery", "daily needs", "kirana"],
      note: "The same trader name appears in other localities nearby under different PIN codes (756130, 756123), so this record cannot be told apart from them without a local check.",
      sources: [
        {
          label: "JustDial — Departmental Stores in Dolasahi, Bhadrak",
          url: "https://www.justdial.com/Bhadrak/Departmental-Stores-in-Dolasahi/nct-10156727",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "dolasahi-market",
      name: "Dolasahi Market",
      category: "market",
      status: "needs-confirmation",
      locality: "Dolasahi, Tihidi tehsil — a neighbouring market area",
      addressLine: "Listed as “Chakasridharpur, Bhadrak 756127”",
      coordinates: { lat: 21.019158, lng: 86.592478 },
      coordinatesLabel:
        "Village reference point from a public locality listing — not the market entrance",
      phone: null,
      hours: null,
      description:
        "A market recorded against Dolasahi, which shares PIN 756127 with Ichhapur and has its own sub post office.",
      keywords: ["market", "bazaar", "haat", "shopping", "weekly market"],
      note: "Dolasahi sits about 4.7 km from the market location used on this site, so this is a nearby shopping area rather than a shop inside ICHHAPUR market. The source row is a multi-result table, so the address wording is not clean. Directions take you to the village reference point, not a verified market entrance.",
      sources: [
        {
          label: "JustDial — Markets in Dolasahi, Bhadrak",
          url: "https://www.justdial.com/Bhadrak/Markets-in-Dolasahi/nct-15562797",
          checked: "2026-10-26"
        },
        {
          label: "Locality entry — Dolasahi, Tihidi, Bhadrak",
          url: "https://geoiq.io/places/Dolasahi/VeUOAHsCJY",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "swarnalaxmi-mobile-store",
      name: "Swarnalaxmi Mobile Store",
      category: "mobile",
      status: "needs-confirmation",
      locality: "Bhadrak town — appears to be outside the market area",
      addressLine: "Near Rajghat Bridge / New Rajghat Bridge, Bypass, Bhadrak",
      coordinates: null,
      coordinatesLabel: null,
      phone: "+91 9861245539 (published by a public directory, unverified)",
      hours: null,
      description:
        "A large mobile-phone retailer listed in Bhadrak town; directory entries also cover accessories, repair and landline phones.",
      keywords: ["mobile", "phone", "smartphone", "accessories", "repair", "landline"],
      note: "Kept visible because enquiries about this name keep surfacing, but every source places it at Rajghat Bridge in Bhadrak town rather than in ICHHAPUR market. Do not read it as a market shop. The phone number comes from an unverified directory listing — confirm it before relying on it.",
      sources: [
        {
          label: "JustDial — Swarnalaxmi Mobile Store, New Rajghat Bridge",
          url: "https://www.justdial.com/Bhadrak/Swarnalaxmi-Mobile-Store-Near-Rajghat-Bridge-New-Rajghat-Bridge/9999P6784-6784-210317121257-N9E1_BZDET",
          checked: "2026-10-26"
        },
        {
          label: "Khojkhoji — Bhadrak Bypass listing",
          url: "https://www.khojakhoji.com/Bhadrak_Bypass/Electronics/Mobile-Phone/Mobile-Phone-Accessories-And-Parts",
          checked: "2026-10-26"
        },
        {
          label: "IndiaMART company profile",
          url: "https://www.indiamart.com/company/66530613/",
          checked: "2026-10-26"
        }
      ]
    },

    {
      id: "ichhapur-branch-post-office",
      name: "Ichhapur Branch Post Office",
      category: "service",
      status: "needs-confirmation",
      locality: "Ichhapur, Bhadrak",
      addressLine: "Branch post office for PIN 756127, Bhadrak division, Odisha circle",
      coordinates: null,
      coordinatesLabel: null,
      phone: null,
      hours: null,
      description:
        "The branch post office that shares this PIN code with the market area, listed alongside Dolasahi S.O under the same PIN.",
      keywords: ["post office", "postal", "mail", "parcel", "pin code", "dak ghar"],
      note: "Public pin-code directories publish a position for this office roughly 7 km from the market location used on this site, and disagree about whether speed post is handled here. Because of that conflict no map position or directions are offered — this entry is a landmark for the PIN code only.",
      sources: [
        {
          label: "Maps of India — Ichhapur pin code",
          url: "https://www.mapsofindia.com/pincode/india/odisha/bhadrak/ichhapur.html",
          checked: "2026-10-26"
        },
        {
          label: "Pincode.net.in — ICHHAPUR, BHADRAK",
          url: "https://pincode.net.in/ORISSA/BHADRAK/I/ICHHAPUR",
          checked: "2026-10-26"
        }
      ]
    }
  ]
};
