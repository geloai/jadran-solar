# Jadran Solar — AI Sales System (Project Context)

## Velika slika
Gradimo sustav od **3 povezana builda** za hrvatsku solarnu tvrtku (izmišljena: **Jadran Solar d.o.o.**).
Cilj cijelog sustava: **uhvatiti lead → odmah ga kvalificirati → pomoći sales repu da ga zatvori.**
**Airtable je kičma** kroz koju lead putuje kroz sve faze.

```
Build A (Lead Capture)  →  Build B (Kvalifikacija)  →  Build C (Sales Copilot)
  forma + procjena           AI piše leadu na WhatsApp     pomaže repu zatvoriti
  sprema u Airtable          kvalificira + označi status   research + email + CRM
```

Sustav je inspiriran kursom (Liam Ottley, "Build 2/3/4") ALI je potpuno prilagođen:
| Kurs | Mi |
|---|---|
| n8n (no-code) | **Custom Node.js/Express, sve u Claude Code-u (BEZ n8n)** |
| Gemini 2.5 Flash | **Anthropic Claude (Haiku)** |
| Smith Solar, Texas, USD | **Jadran Solar, cijela Hrvatska, EUR, net billing 2026** |
| Build 2 = chat widget | **Build A = web forma** (optimizirana za hvatanje kontakta, NE edukacija) |
| Build 3 = glasovni agent (Retell) | **Build B = WhatsApp AI kvalifikator** (bez telefonske regulative) |
| Build 4 = Lovable frontend | **Build C = frontend pisan u Claude Code-u** |
| Airtable CRM | **Isto — Airtable** |

Kurs-ov "Build 1" (Telegram receipt bot) **preskačemo** — samo vježba, nije dio sustava.

## Zaključane odluke
- **Bez n8n** — sve custom u Claude Code-u.
- **Bez chatbota** — stari `agent.js` se uklanja; ostaje samo aplikacija/forma.
- **Build B kanal = WhatsApp** (instant proaktivni dodir + dvosmjerna kvalifikacija; opt-in kvačica na formi za GDPR/WhatsApp compliance). Email kao premosnica dok se WhatsApp API ne posloži.
- **Bez outbound poziva** (regulativa). Bez glasovne telefonije zasad.
- **Redoslijed: A → B → C.**
- Glavna brojka uštede na formi ostaje optimistična (lead magnet) — vidi memory `jadran-solar-savings-headline`.

## Tech stack
- **Backend:** Node.js + Express (`server.js`)
- **AI:** Anthropic Claude Haiku (`claude-haiku-4-5-20251001`)
- **Solar:** Google Solar API + Geocoding API (+ hrvatski fallback jer Solar API slabo pokriva HR)
- **CRM:** Airtable (REST API)
- **Frontend:** Vanilla HTML/JS (`public/index.html`) — forma, ne chat
- **Karta:** Google Maps JS API (zaseban frontend ključ, referrer-restricted)

## Struktura
```
solar-chatbot/
├── server.js          # Express: /api/estimate, /api/contact, /api/config (/api/chat se uklanja)
├── solar-api.js       # Geocoding + Solar API + fallback + roof scenario (max krov)
├── airtable.js        # Kreiranje leada u Airtable
├── knowledge-base.js  # Učitava jadran_solar_kb.txt
├── jadran_solar_kb.txt# Baza znanja (Jadran Solar, net billing 2026)
├── agent.js           # STARI chatbot brain — ZA UKLANJANJE
├── .env               # Ključevi (GOOGLE_MAPS_API_KEY backend, GOOGLE_MAPS_BROWSER_KEY frontend, ANTHROPIC, AIRTABLE)
└── public/index.html  # Forma + rezultati + karta + iscrtavanje krova
```

## Hrvatske specifičnosti
- Struja ~0,18 €/kWh; instalacija ~900 €/kWp; panel 400W.
- Sunčanost fallback: lat < 44 (Dalmacija) ~1.550 kWh/kWp, lat ≥ 44 ~1.350 kWh/kWp.
- **Net billing od 2026.:** sam potrošiš → uštedi 0,18 €/kWh; višak prodaš → ~0,05 €/kWh.
- Struka dimenzionira **prema potrošnji (~100–110%)**, ne maksimum krova. Maksimum krova samo uz EV/dizalicu/bateriju.
- Poticaji: PDV 5% (umj. 25%), FZOEU potpore do ~40%, +3–5% vrijednost nekretnine.

---

## Build A — Lead Capture  [STATUS: ~90%]
Web forma na stranici: adresa + račun → procjena (ušteda, paneli, kW) → karta + iscrtavanje krova → kontakt forma (ime/telefon/email) → Airtable.
**Preostalo za 100%:**
- [ ] Ukloniti stari chatbot (`agent.js`, `/api/chat`, ovisnosti)
- [ ] Dodati u Airtable `Status` polje (npr. New / Contacted / Qualified / Disqualified) — treba Buildu B
- [ ] Dodati WhatsApp opt-in kvačicu na kontakt formu (+ spremati pristanak)
- [ ] (opcionalno) instant email s procjenom kao prvi dodir

## Build B — WhatsApp AI Kvalifikator  [KOD GOTOV, ČEKA META SETUP]
Korisnik (lead) piše na WhatsApp → Claude (Ana) vodi kratki kvalifikacijski razgovor na hrvatskom, odgovara iz baze znanja, pa označi lead u Airtableu.
- **Kanal:** WhatsApp Cloud API (Meta). Korisnik prvi piše (wa.me iz Builda A) → 24h prozor, bez template odobrenja.
- **Datoteke:**
  - `whatsapp.js` — slanje poruka preko Cloud API-ja
  - `qualifier.js` — Claude agent (persona "Ana"), sesije po telefonu (in-memory), detektira kvalifikacijski JSON `{"qualify":bool,"battery":bool,"notes":"..."}` → update Airtable `Status`
  - `server.js` — `GET/POST /api/whatsapp/webhook` (Meta verifikacija + primanje poruka)
- **Kvalifikacijski kriteriji (HR):** vlasnik kuće/krova, prikladan krov, budžet/financiranje, interes za bateriju, timeline.
- **.env:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (=`jadran-solar-verify-2026`)
- **Testirano lokalno** (qualifier razgovor + JSON detekcija + čišćenje). Webhook radi, ali Status update u Airtableu zahtijeva da lead postoji (match po zadnjih 8 znamenki telefona).
- **PREOSTAJE za živi test:** Meta Developer app + testni broj + token u `.env`, javni webhook preko **ngrok** (localhost ne prima Meta webhookove). Za produkciju: pravi broj + Meta verifikacija + hosting.
- **Opcionalno kasnije:** dodati `Notes` stupac u Airtable za spremanje sažetka kvalifikacije (sad se samo logira + Status).
- Bez glasa, bez outbound poziva, bez n8n.

## Build C — Sales Copilot  [NIJE ZAPOČET]
Frontend (Claude Code) + backend Claude agent s alatima, pomaže repu oko kvalificiranih leadova.
- **Za rezidencijalne kupce:** povuci cijeli kontekst leada (forma + procjena + WhatsApp kvalifikacija), napiši personaliziran follow-up (email/WhatsApp), zakaži izlazak na teren, pomakni status kroz pipeline.
- **Za poslovni segment** (hoteli, OPG, skladišta — Jadran ih radi): zadržati lagani B2B research (firma, web) kao opciju.
- Alati: Airtable (search/update), slanje emaila, opcionalno web research.

---

## Pokretanje lokalno
```bash
cd solar-chatbot
node server.js          # ili Claude Preview launch.json "jadran-solar"
# http://127.0.0.1:3000
```

## Poznate napomene
- Google Solar API slabo pokriva HR → fallback kalkulacija po geo. širini.
- Frontend Maps ključ je referrer-restricted (localhost/127.0.0.1; dodati pravu domenu pri deployu).
- Backend ključ (Geocoding/Solar) NE smije imati referrer restrikciju (nema referrer sa servera).
- Session storage (stari chatbot) je bio in-memory — nebitno nakon uklanjanja chatbota.
