// /home/klabatdev/monitoring-security/notifier.js
require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const chokidar = require('chokidar');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ==================
// ENV CONFIG
// ==================
const LOG_PATH = process.env.LOG_PATH || '/var/log/modsec_audit.log';
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

if (!GEMINI_API_KEY || !TG_BOT_TOKEN || !TG_CHAT_ID) {
  console.error('❌ Error: GEMINI_KEY, TG_BOT_TOKEN, dan TG_CHAT_ID wajib diatur di .env');
  process.exit(1);
}

// ==================
// INIT GEMINI
// ==================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ==================
// TELEGRAM SENDER
// ==================
async function sendTelegram(message) {
  try {
    const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    const response = await axios.post(url, {
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });

    console.log('✅ Telegram terkirim:', response.data);
  } catch (error) {
    console.error('❌ Gagal kirim Telegram:', error.response?.data || error.message);
  }
}

// ==================
// PROCESS LOG
// ==================
async function processLogLine(logBlock) {
  if (
    !logBlock.includes('"message"') &&
    !logBlock.includes('Matched Data') &&
    !logBlock.includes('"ruleId"')
  ) return;

  const attackType =
    logBlock.match(/"message":"([^"]+)"/)?.[1] || 'Serangan tidak diketahui';

  const payload =
    logBlock.match(/Matched Data:\s*([^"]+)/i)?.[1] || 'payload tidak ditemukan';

  const ip =
    logBlock.match(/client_ip":"([^"]+)"/)?.[1] || 'unknown';

  const uri =
    logBlock.match(/"uri":"([^"]+)"/)?.[1] || '/';

  const ruleId =
    logBlock.match(/"ruleId":"?(\d{3,6})"?/)?.[1] || 'unknown';

  const time = new Date().toISOString();

  console.log(`⚠️ Serangan: ${attackType} | IP: ${ip}`);

  // ==================
  // GEMINI AI
  // ==================
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
Buat NOTIFIKASI keamanan SINGKAT untuk Telegram.

Format:
🚨 *MODSECURITY ALERT*

• Serangan: ${attackType}
• Rule ID: ${ruleId}
• IP: ${ip}
• Endpoint: ${uri}
• Payload: ${payload}
• Waktu: ${time}

Lalu sertakan 3 command Linux untuk memblokir IP (${ip}) dan cek log.
Akhiri dengan: "Tindakan cepat disarankan."
`;

  try {
    const result = await model.generateContent(prompt);
    const message = result.response.text().trim();
    await sendTelegram(message);
  } catch (err) {
    console.error('❌ Gemini error:', err.message);
    await sendTelegram(
      `🚨 *MODSECURITY ALERT*\nIP: ${ip}\nEndpoint: ${uri}\nTindakan cepat disarankan.`
    );
  }
}

// ==================
// WATCH LOG FILE
// ==================
console.log('🟢 Memantau log ModSecurity...');

const watcher = chokidar.watch(LOG_PATH, {
  persistent: true,
  followSymlinks: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 500,
  },
});

watcher.on('change', (path) => {
  try {
    const lines = fs.readFileSync(path, 'utf8').split('\n');
    const lastBlock = lines.slice(-15).join('\n'); // 🔥 penting (multiline log)
    processLogLine(lastBlock);
  } catch (err) {
    console.error('❌ Gagal baca log:', err.message);
  }
});

watcher.on('error', (error) => {
  console.error('❌ Watcher error:', error);
});
