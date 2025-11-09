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
  if (!line.includes('942100') || !line.includes('SQL Injection')) return;

  // Ekstrak data dari log
  // 🔍 Ekstrak payload dari ARGS (misalnya "ARGS:json.username: Test' or '10' = '10")
  const payloadMatch =
    line.match(/ARGS:(?:json\.|args\.|[\w.-]+:)?\s*([^"'\]]+)/i) ||
    line.match(/Matched Data:\s*([^"]+)/i);

  const ipMatch = line.match(/client_ip":\s*"([^"]+)"/);
  const uriMatch = line.match(/uri ": "([^"]+)"/);

  const payload = payloadMatch ? payloadMatch[1].trim() : 'tidak diketahui';
  const ip = ipMatch ? ipMatch[1] : 'unknown';
  const uri = uriMatch ? uriMatch[1] : '/';
  const time = new Date().toISOString();

  console.log(`🔍 Serangan terdeteksi dari ${ip} ke ${uri}`);

  // ✅ Gunakan model yang tersedia
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
  Kamu adalah asisten incident response. Buat NOTIFIKASI singkat, profesional, dan langsung ke poin (tidak perlu salam panjang atau penutup formal).
  Gunakan bahasa Indonesia yang tegas tapi tidak bertele-tele. Sertakan:
  - Ringkasan singkat insiden (jenis, IP sumber, endpoint, payload, waktu deteksi).
  - Risiko singkat (2–3 baris).
  - LANGSUNG beri beberapa opsi perintah shell Ubuntu yang dapat dicopy-paste untuk
    1) memblokir IP sementara dan permanen (ufw, ipset+iptables),
    2) memblokir di level nginx (deny),
    3) menambahkan ke fail2ban (jika tersedia) — sertakan contoh perintah fail2ban-client,
    4) perintah untuk cek log cepat (grep/tail).
  Untuk setiap opsi shell: berikan 1) perintahnya (paste-ready), 2) penjelasan 1 baris apa yang dilakukan, dan 3) perintah untuk membatalkan/unban (jika relevan).
  Masukkan placeholder berikut yang sudah diisi: IP: ${ip}, Endpoint: ${uri}, Payload: ${payload}, Waktu: ${time}.
  Jangan tambahkan salam/penutup formal. Akhiri dengan satu baris singkat: "Tindakan cepat disarankan: pilih opsi dan jalankan.".
  `;

  try {
    // ✅ Sintaks generateContent yang benar
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();
    await sendWhatsApp(summary);
  } catch (geminiError) {
    console.error('❌ Error Gemini:', geminiError.message);
    const fallback = `⚠️ Serangan SQLi terdeteksi!\nIP: ${ip}\nURI: ${uri}`;
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