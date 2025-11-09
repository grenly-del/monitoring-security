// /opt/sqli-notifier/notifier.js
require('dotenv').config();
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const axios = require('axios');
const chokidar = require('chokidar');

// Konfigurasi
const LOG_PATH = process.env.LOG_PATH || '/var/log/modsec_audit.log';
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const WHATSAPP_TARGET = '082187199940';
const FONNTE_TOKEN = process.env.TOKEN_FONTE;

if (!GEMINI_API_KEY || !FONNTE_TOKEN || !WHATSAPP_TARGET) {
  console.error('❌ Error: Pastikan GEMINI_API_KEY, FONNTE_TOKEN, dan WHATSAPP_TARGET diatur di .env');
  process.exit(1);
}

// Inisialisasi Google Generative AI
const genAI = new GoogleGenAI({apiKey: GEMINI_API_KEY});
// Fungsi: kirim ke Fonnte
async function sendWhatsApp(message) {
  try {
    // Hapus spasi ekstra di URL
    const response = await axios.post('https://api.fonnte.com/send',
      new URLSearchParams({
        target: WHATSAPP_TARGET,
        message: message
      }),
      {
        headers: {
          'Authorization': FONNTE_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('✅ WhatsApp terkirim:', response.data);
  } catch (error) {
    console.error('❌ Gagal kirim WhatsApp:', error.message);
  }
}

// Fungsi: proses log line
async function processLogLine(line) {
  if (!line.includes('942100') || !line.includes('SQL Injection')) return;

  // Ekstrak data dari log
  const payloadMatch = line.match(/json\.username:\s*([^]]+)/);
  const ipMatch = line.match(/client_ip":\s*"([^"]+)"/);
  const uriMatch = line.match(/uri ": "([^"]+)"/);

  const payload = payloadMatch ? payloadMatch[1].trim() : 'tidak diketahui';
  const ip = ipMatch ? ipMatch[1] : 'unknown';
  const uri = uriMatch ? uriMatch[1] : '/';

  console.log(`🔍 Serangan terdeteksi dari ${ip} ke ${uri}`);

  // Gunakan model Gemini
  const prompt = `
    Ringkas dalam 1 kalimat untuk notifikasi WhatsApp:
    Terjadi upaya SQL injection di server.
    - IP: ${ip}
    - Endpoint: ${uri}
    - Payload: ${payload}
    Gunakan bahasa Indonesia, formal, dan sertakan emoji peringatan.
  `;

  try {
    const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
    });
    const summary = response.text().trim();
    await sendWhatsApp(summary);
  } catch (geminiError) {
    console.error('❌ Error Gemini:', geminiError.message);
    const fallback = `⚠️ Serangan SQLi terdeteksi!\nIP: ${ip}\nURI: ${uri}`;
    await sendWhatsApp(fallback);
  }
}

// Mulai pantau file log
console.log('🟢 Memulai pemantauan log ModSecurity...');
const watcher = chokidar.watch(LOG_PATH, {
  persistent: true,
  followSymlinks: true,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 500
  }
});

watcher.on('change', (path) => {
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const lastLine = lines[lines.length - 2];
  if (lastLine) {
    processLogLine(lastLine);
  }
});

watcher.on('error', (error) => {
  console.error('❌ Error memantau log:', error);
});