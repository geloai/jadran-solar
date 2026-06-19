// Slanje poruka preko WhatsApp Cloud API-ja (Meta).
const axios = require('axios');

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendMessage(to, text) {
  if (!TOKEN || !PHONE_ID) {
    console.warn('WhatsApp nije konfiguriran (.env WHATSAPP_TOKEN / PHONE_NUMBER_ID). Poruka nije poslana.');
    return;
  }
  await axios.post(
    `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

module.exports = { sendMessage };
