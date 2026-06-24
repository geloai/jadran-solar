# ☀️ Jadran Solar — AI Lead Generation & Qualification System

An end-to-end system that turns a solar company's website visitors into **qualified, booked appointments** — fully automated, 24/7, in Croatian.

A visitor gets an instant solar-savings estimate, leaves their contact, and an **AI agent immediately engages them on WhatsApp**, qualifies them like a sales rep would, and **books a site-visit appointment** — landing a hot, pre-briefed lead in the CRM.

> Built solo as my first full AI-automation project. *Jadran Solar* is a fictional company used for the demo.

**🔗 Live demo:** https://jadran-solar.onrender.com
## Walkthrough (screenshots)

> The app UI is in **Croatian** (built for the Croatian market). English captions below each image.

**1. Instant savings estimate** — the visitor enters their address and monthly electricity bill.
<img width="900" alt="Estimate form" src="https://github.com/user-attachments/assets/a542d87f-14be-4e05-99d1-75e9f4a98600" />

**2. Roof on satellite** — the user is prompted to outline their roof for a precise, personalized estimate.
<img width="420" alt="Roof step" src="https://github.com/user-attachments/assets/1cf9370b-43a6-4e8f-8492-88324b418e87" />

**3. Drawing the roof** — tapping the corners computes the roof area (slope-corrected, ~134 m²).
<img width="420" alt="Drawing the roof" src="https://github.com/user-attachments/assets/954a4006-2cae-44b0-819b-62bab2953e36" />

**4. Results** — the headline shows the *maximum potential* (system + battery), with a consumption-vs-max comparison, the battery upside, and the lead-capture form.
<img width="500" alt="Results page" src="https://github.com/user-attachments/assets/3b4c986d-337b-4f4f-9091-f745d3322028" />

**5. AI qualification on WhatsApp** — the AI agent (Ana) qualifies the lead in Croatian, like a sales rep would.
<img width="800" alt="WhatsApp qualification" src="https://github.com/user-attachments/assets/3da67211-9b53-4f43-8829-cd3654372303" />

**6. Booking the appointment** — Ana proposes concrete slots, books one, and tells the lead a colleague will call to confirm.
<img width="800" alt="WhatsApp booking" src="https://github.com/user-attachments/assets/22dc85de-a671-4e28-baaf-8e5403232cb3" />

**7. Result in the CRM (Airtable)** — the lead is auto-updated to **"Zakazano" (Booked)** with the appointment time and a full **sales briefing** for the human rep.
<img width="1000" alt="Airtable CRM result" src="https://github.com/user-attachments/assets/9e93a316-9668-47c8-93c7-e5eedd9edb3a" />



---

## What it does

**1. Instant estimate (web form)**
- Visitor enters address + monthly electricity bill → gets an instant solar estimate (recommended panels, system size, annual/monthly savings).
- Location-accurate sun data via the **EU PVGIS API** (falls back from Google Solar where coverage is missing — common in Croatia).
- Interactive **satellite roof drawing** (Google Maps) → computes roof area (slope-corrected) for a "maximum system" scenario, incl. battery benefit.
- Captured leads are saved to an **Airtable CRM**.

**2. AI qualification + booking (WhatsApp)**
- The moment a lead comes in, an **AI agent ("Ana", powered by Claude)** engages them on WhatsApp.
- Holds a natural Croatian conversation, answers FAQs from a knowledge base, and **qualifies** the lead (ownership, roof type/condition, shading, budget, battery interest, timeline).
- **Books a concrete site-visit appointment** and updates the lead in Airtable: `Status → Booked`, appointment time, and a **sales briefing** for the human rep.

---

## How it works

```
Web form ──► /api/estimate ──► Google Geocoding + Solar / PVGIS ──► estimate
   │                                                                  │
   └── contact submit ──► /api/contact ──► Airtable CRM (Status: New) ─┘
                                                  │
WhatsApp message ──► Meta Cloud API ──► /api/whatsapp/webhook
                                                  │
                                   Claude agent (qualify + book)
                                                  │
                              Airtable update (Status: Booked + briefing)
                                                  │
                              Reply sent back via WhatsApp Cloud API
```

- **Conversational AI:** Claude with a Croatian system prompt; injects the lead's known data so it never re-asks; emits a structured JSON action when it qualifies/books, which the server parses to update the CRM.
- **Speed-to-lead:** the WhatsApp reply is fully automated within the 24h customer-service window (user-initiated, so no template approval needed).

---

## Tech stack

| Area | Tech |
|---|---|
| Backend | Node.js, Express |
| AI | Anthropic **Claude** API (tool-style structured actions, prompt engineering) |
| Solar data | Google Solar API, Google Geocoding API, **PVGIS** (EU JRC) |
| Maps / UI | Google Maps JavaScript API (satellite + geometry), vanilla HTML/CSS/JS |
| Messaging | **WhatsApp Cloud API** (Meta) — webhook receive + send |
| CRM | Airtable REST API |
| Hosting | Render (24/7), GitHub |

---

## Key things I built / learned

- Integrating **multiple external APIs** (Google, PVGIS, Airtable, Meta) into one coherent flow.
- A **conversational LLM agent** that qualifies leads and drives toward a concrete goal (booking), with CRM side-effects via structured outputs.
- **WhatsApp Cloud API** end-to-end: webhook verification, receiving messages, app↔WABA subscription, sending replies, permanent System User token.
- Real-world accuracy work: PVGIS for location-specific irradiation, slope-correcting satellite roof area, modelling Croatia's 2026 net-billing rules.
- Deploying and operating a live service (env management, stable webhook, secrets kept out of source).

---

## Run locally

```bash
npm install
# create .env with your own keys (see variables below)
npm start          # http://localhost:3000
```

**Environment variables** (`.env`):
```
GOOGLE_MAPS_API_KEY=        # backend: Geocoding + Solar
GOOGLE_MAPS_BROWSER_KEY=    # frontend: Maps JS (referrer-restricted)
ANTHROPIC_API_KEY=
AIRTABLE_TOKEN=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_NAME=
WHATSAPP_TOKEN=             # Meta WhatsApp Cloud API (System User token)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```

The WhatsApp webhook is served at `/api/whatsapp/webhook` (configured in the Meta app dashboard).

---

## Project structure

```
server.js          # Express server + routes (estimate, contact, WhatsApp webhook)
solar-api.js       # Geocoding + Solar API + PVGIS + roof/battery scenarios
qualifier.js       # Claude WhatsApp agent (qualification + appointment booking)
whatsapp.js        # WhatsApp Cloud API send
airtable.js        # CRM read/write
knowledge-base.js  # loads the company knowledge base
public/index.html  # frontend (form, estimate, map, roof drawing)
```
