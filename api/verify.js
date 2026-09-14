const express = require('express');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================================
// FIREBASE ADMIN
// ============================================================
const serviceAccount = {
  "type": "service_account",
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL,
  "universe_domain": "googleapis.com"
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://project1-f57d6-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const db = admin.database();

// ============================================================
// GROQ API CONFIG (MULTIMODAL - BISA BACA GAMBAR)
// ============================================================
const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.6-27b"; // Multimodal, bisa baca gambar

// ============================================================
// VERIFIKASI BUKTI TRANSFER
// ============================================================
app.post('/api/verify', async (req, res) => {
  try {
    const { orderId, buktiBase64, nominal, namaTujuan, penjual, produkNama } = req.body;

    console.log('🔍 VERIFY REQUEST:', { orderId, nominal, namaTujuan, penjual });

    if (!buktiBase64 || !nominal || !namaTujuan) {
      return res.status(400).json({ error: 'Data gak lengkap' });
    }

    // Cek duplikat
    const hash = crypto.createHash('sha256').update(buktiBase64).digest('hex');
    const dupSnap = await db.ref('warungdigital/proofs')
      .orderByChild('hash').equalTo(hash).once('value');
    
    if (dupSnap.exists()) {
      return res.json({
        success: true,
        verified: false,
        error: '❌ Bukti transfer ini udah pernah dipake sebelumnya!',
        aiResult: { valid: false, alasan: 'Bukti duplikat' }
      });
    }

    // Prompt AI
    const prompt = `Kamu adalah sistem verifikasi bukti transfer pembayaran yang SANGAT TELITI.

Data pesanan:
- Produk: ${produkNama || '-'}
- Nominal yang harus dibayar: Rp ${Number(nominal).toLocaleString('id-ID')}
- Nama tujuan transfer: ${namaTujuan}
- Penjual: ${penjual}

Tugas kamu:
1. Baca gambar bukti transfer ini dengan TELITI
2. Cek apakah nominal transfer SAMA PERSIS dengan Rp ${Number(nominal).toLocaleString('id-ID')}
3. Cek apakah nama tujuan transfer COCOK dengan "${namaTujuan}"
4. Cek apakah bukti transfer ini VALID (bukan screenshot palsu, bukan hasil edit)

DETEKSI EDIT/FOTO TIMPA:
5. Cek apakah ada tanda-tanda foto ini DIEDIT atau DITIMPA (copy-paste):
   - Font/ukuran angka yang gak konsisten
   - Warna/pencahayaan yang beda di area tertentu
   - Ada garis tepi atau bayangan aneh
   - Posisi teks yang gak sejajar
   - Kualitas gambar yang beda antara area nominal dan area lain
6. Kalau ada indikasi edit/timpa, tandai sebagai TIDAK VALID

DETEKSI ASAL GAMBAR:
7. Cek apakah gambar ini dari APLIKASI E-WALLET RESMI (DANA, OVO, GoPay, ShopeePay, dll)
8. Ciri screenshot resmi: ada logo aplikasi, elemen UI khas, font konsisten
9. Ciri bukan resmi: gak ada logo, layout campur, kualitas rendah, ada border aneh

Jawab HANYA dalam format JSON seperti ini (tanpa teks lain):
{
  "valid": true/false,
  "nominalTerbaca": "angka",
  "namaTujuanTerbaca": "nama",
  "nominalMatch": true/false,
  "namaMatch": true/false,
  "adaIndikasiEdit": true/false,
  "alasanEdit": "penjelasan",
  "asalGambar": "DANA/OVO/dll",
  "dariAplikasiResmi": true/false,
  "alasan": "penjelasan singkat"
}`;

    // Extract base64 murni
    const base64Data = buktiBase64.replace(/^data:image\/\w+;base64,/, '');

    // Panggil Groq API (format OpenAI-compatible)
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API error:', errText);
      return res.status(500).json({ error: 'Groq API error: ' + errText.substring(0, 200) });
    }

    const groqData = await groqRes.json();
    const aiText = groqData?.choices?.[0]?.message?.content || '';
    console.log('🤖 AI Response:', aiText);

    // Extract JSON dari response AI
    let aiResult;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      aiResult = { valid: false, nominalMatch: false, namaMatch: false, alasan: 'AI gak bisa baca bukti' };
    }

    // Simpen proof
    const proofId = 'PROOF-' + Date.now();
    await db.ref('warungdigital/proofs').child(proofId).set({
      orderId, hash, nominal, namaTujuan, penjual, aiResult, timestamp: Date.now()
    });

    // Result
    const isVerified = aiResult.valid && aiResult.nominalMatch && aiResult.namaMatch && !aiResult.adaIndikasiEdit;

    console.log(`✅ Verifikasi ${isVerified ? 'LOLOS' : 'GAGAL'}:`, aiResult.alasan);

    res.json({
      success: true,
      verified: isVerified,
      proofId,
      aiResult
    });

  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/verify', (req, res) => {
  res.send('Verify endpoint WarungDigital aktif! ✅');
});

module.exports = app;
