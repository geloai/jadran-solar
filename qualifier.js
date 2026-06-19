// Build B — AI WhatsApp kvalifikator (Claude).
// Vodi prirodan razgovor, kvalificira lead i ažurira Status u Airtableu.
const Anthropic = require('@anthropic-ai/sdk');
const { getKnowledgeBase } = require('./knowledge-base');
const { findLeadByPhone, updateLead } = require('./airtable');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory sesije po telefonskom broju (MVP — briše se restartom)
const sessions = {};

// Dostupnost za izlaske na teren (podesivo po klijentu)
const VISIT_AVAILABILITY = 'Izlasci na teren su radnim danom (ponedjeljak–petak), popodne između 16:00 i 19:00. NE nudi vikende ni jutarnje termine. Predloži termine u idućih 5–7 radnih dana.';

// Iz Airtable leada izvuci ono što već znamo (da Ana ne pita ponovno)
function buildKnown(lead) {
  if (!lead || !lead.fields) return '';
  const f = lead.fields;
  const parts = [];
  if (f.Address) parts.push('- Adresa: ' + f.Address);
  if (f['Monthly Bill']) parts.push('- Mjesečni račun za struju: ' + f['Monthly Bill'] + ' €');
  try {
    const est = JSON.parse(f['Estimate Data'] || '{}');
    if (est.recommendedPanels) {
      let p = '- Naša procjena: ' + est.recommendedPanels + ' panela';
      if (est.systemSizeKw) p += ' (' + est.systemSizeKw + ' kW)';
      if (est.monthlySavings) p += ', ~' + est.monthlySavings + ' €/mj uštede';
      parts.push(p);
    }
  } catch (e) {}
  return parts.join('\n');
}

const SYSTEM_PROMPT = `Ti si Ana, ljubazna i profesionalna savjetnica iz tvrtke Jadran Solar (solarne elektrane).
Razgovaraš putem WhatsAppa s osobom koja je na našoj stranici napravila besplatnu procjenu za solarne panele i ostavila kontakt.

Baza znanja o tvrtki (koristi za odgovore na pitanja):
---
${getKnowledgeBase()}
---

TVOJ GLAVNI CILJ: temeljito kvalificirati osobu (kao da vodiš prvi prodajni poziv) i ZAKAZATI KONKRETAN TERMIN besplatnog izlaska naših stručnjaka na teren.

ŠTO TREBAŠ SAZNATI (kroz prirodan razgovor, jedno po jedno — kao iskusan prodavač, ne kao anketa). Sve odgovore zapamti jer idu prodavaču kao priprema za poziv:
1. Je li vlasnik kuće/krova? (stan bez suglasnosti suvlasnika je teško izvedivo)
2. Kakav krov — obiteljska kuća; kosi ili ravni krov; okvirna starost/stanje
3. Ima li većih zasjenjenja (drveće, susjedne zgrade)
4. Mjesečni ili godišnji račun za struju (ako već ne znaš iz forme)
5. Način plaćanja / budžet (gotovina, kredit, FZOEU poticaji)
6. Zanima li ga baterija
7. Kad otprilike planira

ZAKAZIVANJE TERMINA:
- Kad je osoba kvalificirana i zainteresirana, predloži joj 2–3 KONKRETNA termina izlaska iz naše dostupnosti (vidi "DOSTUPNOST" niže) i navedi je da izabere jedan.
- Kad izabere, potvrdi termin i jasno reci da će je naš kolega NAZVATI da potvrdi točno vrijeme (ljudski kontakt, da se osjeća pouzdano).

JEZIK — VRLO VAŽNO:
- Piši ISKLJUČIVO pravilnim hrvatskim standardnim jezikom (ijekavica).
- NIKAD ne koristi srpske riječi ni ekavicu. Primjeri ispravno (hrvatski): lijepo (ne "lepo"), vrijeme (ne "vreme"), uvijek (ne "uvek"), poslije (ne "posle"), razumijem (ne "razumem"), tjedan (ne "nedelja" kad misliš 7 dana), tisuću (ne "hiljadu"), siječanj/veljača... (ne "januar/februar").
- Pazi na gramatiku, padeže i pravopis — pročitaj rečenicu prije slanja i ispravi pogreške.

PRAVILA:
- Piši kao na WhatsAppu: KRATKE, prirodne poruke (1–2 rečenice), JEDNO pitanje po poruci.
- Umjeren, profesionalan ton i malo emojija (najviše 1 po poruci, često nijedan). Nemoj biti pretjerano euforična.
- NE ponavljaj pitanja na koja je korisnik već odgovorio, ni ona čiji odgovor već znaš iz forme (vidi "ŠTO VEĆ ZNAMO" niže ako postoji). Npr. ako već znaš mjesečni račun ili adresu — NE pitaj ponovno, nego se na to nadoveži.
- Odgovaraj na pitanja koristeći bazu znanja. NIKAD ne izmišljaj cijene — točnu ponudu daje tim na besplatnom izlasku.
- Vodi razgovor prirodno, ne ispituj kao robot.
- Kad DOGOVORIŠ termin (ili je jasno da osoba NIJE kandidat), ispiši u ZASEBNOM REDU točno ovaj JSON (korisnik ga NE vidi, sustav ga čita):
  {"qualify": true, "appointment": "petak, 27.06. popodne", "battery": true, "notes": "brifing za prodavača: vlasnik kuće u Zaprešiću, kosi crijep, bez zasjenjenja, račun ~90 €/mj, plaća gotovinom do ~12.000 €, zanima baterija, planira proljeće"}
  - qualify: true ako je dobar kandidat, false ako nije
  - appointment: dogovoreni termin (ostavi prazno "" ako termin nije dogovoren)
  - notes: kratak, koristan SAŽETAK SVIH saznanja za prodavača (na hrvatskom)
- Nakon JSON-a osobi napiši toplu potvrdu (ponovi dogovoreni termin + da će je kolega nazvati da potvrdi), ili ljubaznu zahvalu ako nije kandidat.`;

async function handleMessage(phone, text) {
  let s = sessions[phone];
  if (!s) {
    const lead = await findLeadByPhone(phone).catch(() => null);
    s = sessions[phone] = {
      history: [],
      recordId: lead ? lead.id : null,
      name: lead && lead.fields ? (lead.fields.Name || '') : '',
      known: buildKnown(lead)
    };
  }

  s.history.push({ role: 'user', content: text });

  const danas = new Date().toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let sys = SYSTEM_PROMPT + `\n\nDANAŠNJI DATUM: ${danas}.\nDOSTUPNOST: ${VISIT_AVAILABILITY}`;
  if (s.name) sys += `\n\nIme osobe je: ${s.name}.`;
  if (s.known) sys += `\n\nŠTO VEĆ ZNAMO O OVOJ OSOBI (iz forme — NE pitaj ponovno za ovo, nego se nadoveži):\n${s.known}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: sys,
    messages: s.history.slice(-20)
  });

  let reply = response.content[0].text;

  // Detektiraj odluku o kvalifikaciji (model ga zna umotati u ```json ... ```)
  const jsonMatch = reply.match(/\{[\s\S]*?"qualify"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const action = JSON.parse(jsonMatch[0]);
      const fields = {};
      if (action.qualify === false) {
        fields.Status = 'Disqualified';
      } else if (action.appointment) {
        fields.Status = 'Booked';
        fields.Appointment = action.appointment;
      } else {
        fields.Status = 'Qualified';
      }
      if (action.notes) fields.Notes = action.notes;
      if (s.recordId) {
        await updateLead(s.recordId, fields).catch(e => console.error('Airtable update:', e.message));
      }
      console.log(`[${phone}] Status: ${fields.Status}${action.appointment ? ' | Termin: ' + action.appointment : ''} | ${action.notes || ''}`);
    } catch (e) {
      console.error('Neispravan kvalifikacijski JSON:', e.message);
    }
    // Ukloni JSON i eventualni code-fence omotač iz poruke korisniku
    reply = reply
      .replace(/```(?:json)?\s*\{[\s\S]*?"qualify"[\s\S]*?\}\s*```/g, '')
      .replace(/\{[\s\S]*?"qualify"[\s\S]*?\}/g, '')
      .replace(/```+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  s.history.push({ role: 'assistant', content: reply });
  return reply;
}

module.exports = { handleMessage };
