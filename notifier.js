// /opt/sqli-notifier/notifier.js
require('dotenv').config();
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // ✅ Nama package benar
const axios = require('axios');
const chokidar = require('chokidar');

// Konfigurasi
const LOG_PATH = process.env.LOG_PATH || '/var/log/modsec_audit.log';
const GEMINI_API_KEY = process.env.GEMINI_KEY; // Sesuaikan dengan .env
const WHATSAPP_TARGET = process.env.WHATSAPP_TARGET;
const FONNTE_TOKEN = process.env.TOKEN_FONTE;

if (!GEMINI_API_KEY || !FONNTE_TOKEN || !WHATSAPP_TARGET) {
  console.error('❌ Error: Pastikan GEMINI_KEY, TOKEN_FONTE, dan WHATSAPP_TARGET diatur di .env');
  process.exit(1);
}

// ✅ Inisialisasi benar
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Fungsi: kirim ke Fonnte
async function sendWhatsApp(message) {
  try {
    // ✅ Hapus spasi di URL
    const response = await axios.post('https://api.fonnte.com/send',
      new URLSearchParams({
        target: WHATSAPP_TARGET,
        message: message,
      }),
      {
        headers: {
          Authorization: FONNTE_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    console.log('✅ WhatsApp terkirim:', response.data);
  } catch (error) {
    console.error('❌ Gagal kirim WhatsApp:', error.message);
    if (error.response) {
      console.error('Response error:', JSON.stringify(error.response.data));
    }
  }
}

// Fungsi: proses log line
async function processLogLine(line) {
  // Deteksi baris yang mengandung ModSecurity attack
  // Biasanya ada "message", "ruleId", atau "Matched Data"
  if (
    !line.includes('"message"') &&
    !line.includes('Matched Data') &&
    !line.includes('"ruleId"')
  ) {
    return;
  }

  // 🔍 Ekstrak jenis serangan
  const attackMatch =
    line.match(/"message":"([^"]+)"/) ||
    line.match(/Matched Data:[^"]+/);

  const attackType = attackMatch ? attackMatch[1] : 'Serangan tidak diketahui';

  // 🔍 Ekstrak Payload
  const payloadMatch =
    line.match(/Matched Data:\s*([^"]+)/i) ||
    line.match(/ARGS:(?:json\.|args\.|[\w.-]+:)?\s*([^"'\]]+)/i);

  const payload = payloadMatch ? payloadMatch[1].trim() : 'payload tidak ditemukan';

  // 🔍 Ekstrak IP
  const ipMatch = line.match(/client_ip":"([^"]+)"/);
  const ip = ipMatch ? ipMatch[1] : 'unknown';

  // 🔍 Ekstrak endpoint
  const uriMatch = line.match(/"uri":"([^"]+)"/);
  const uri = uriMatch ? uriMatch[1] : '/';

  // 🔍 Rule ID
  const ruleMatch = line.match(/"ruleId":"?(\d{3,6})"?/);
  const ruleId = ruleMatch ? ruleMatch[1] : 'unknown';

  const time = new Date().toISOString();

  console.log(`⚠️ Serangan terdeteksi: ${attackType} dari ${ip} ke ${uri}`);

  // ======================
  //   🔥 AI Notification
  // ======================

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
Kamu adalah asisten incident response. Buat NOTIFIKASI singkat (maksimal 2 kalimat) tentang serangan yang terdeteksi oleh ModSecurity.
Gunakan bahasa Indonesia profesional dan langsung ke inti: sebutkan jenis serangan ("${attackType}"), rule ID (${ruleId}), IP (${ip}), endpoint (${uri}), payload, dan waktu deteksi (${time}).
Setelah itu, berikan 3–4 baris command Linux untuk memblokir IP (${ip}) menggunakan ufw/iptables beserta perintah melihat log.
Tidak perlu penjelasan tambahan. Output harus ringkas dan bisa langsung di-copy.
Akhiri dengan kalimat: "Tindakan cepat disarankan.".
`;

  try {
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();
    await sendWhatsApp(summary);
  } catch (geminiError) {
    console.error('❌ Error Gemini:', geminiError.message);
    const fallback = `⚠️ Serangan terdeteksi!\nJenis: ${attackType}\nIP: ${ip}\nURI: ${uri}`;
    await sendWhatsApp(fallback);
  }
}


// Mulai pantau file log
console.log('🟢 Memulai pemantauan log ModSecurity log...');
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
    console.log(lines);
    const lastLine = lines[lines.length - 2];
    if (lastLine) {
      processLogLine(lastLine);
    }
  } catch (readError) {
    console.error('❌ Gagal membaca file log:', readError.message);
  }
});

watcher.on('error', (error) => {
  console.error('❌ Error memantau log:', error);
});