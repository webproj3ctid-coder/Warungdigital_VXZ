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
// GEMINI API KEY (FORMAT BARU AQ.)
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6I_Qe4ijniu5d1AQoq6-tagfeM91dtM8UYMlIwH5zF5Fw";
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================================
// VERIFIKASI BUKTI TRANSFER
// ============================================================
app.post('/api/verify', async (req, res) => {
  try {
    const { orderId, buktiBase64, nominal, namaTujuan, penjual, produkNama } = req.body;

    console.log('🔍 VERIFY REQUEST:', { orderId, nominal, namaTujuan, penjual, produkNama });

    if (!buktiBase64 || !nominal || !namaTujuan) {
      return res.status(400).json({ error: 'Data gak lengkap' });
    }

    // ============================================================
    // 1. CEK DUPLIKAT (anti-timpa foto)
    // ============================================================
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

    // ============================================================
    // 2. VERIFIKASI PAKE GEMINI AI
    // ============================================================
    const base64Data = buktiBase64.replace(/^data:image\/\w+;base64,/, '');
    
    const prompt = `Kamu adalah sistem verifikasi bukti transfer pembayaran yang SANGAT TELITI.

Data pesanan:
- Produk: ${produkNama || '-'}
- Nominal yang harus dibayar: Rp ${Number(nominal).toLocaleString('id-ID')}
- Nama tujuan transfer: ${namaTujuan}
- Penjual: ${penjual}

Tugas kamu:
1. Baca gambar bukti transfer ini dengan TELITI
2. Cek apakah nominal transfer SAMA PERSIS dengan Rp ${Number(nominal).toLocaleString('id-ID')} (harus exact, gak boleh selisih)
3. Cek apakah nama tujuan transfer COCOK dengan "${namaTujuan}"
4. Cek apakah bukti transfer ini VALID (bukan screenshot palsu, bukan hasil edit, bukan screenshot aplikasi lain)

Jawab HANYA dalam format JSON seperti ini (tanpa teks lain):
{
  "valid": true/false,
  "nominalTerbaca": "angka yang kebaca",
  "namaTujuanTerbaca": "nama yang kebaca",
  "nominalMatch": true/false,
  "namaMatch": true/false,
  "alasan": "penjelasan singkat dalam bahasa Indonesia"
}`;

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
          ]
        }]
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(500).json({ error: 'Gemini API error: ' + errText });
    }

    const geminiData = await geminiRes.json();
    const aiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('🤖 AI Response:', aiText);

    // Extract JSON dari response AI
    let aiResult;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiResult = JSON.parse(jsonMatch[0]);
    } catch (e) {
      aiResult = { valid: false, nominalMatch: false, namaMatch: false, alasan: 'AI gak bisa baca bukti' };
    }

    // ============================================================
    // 3. SIMPEN PROOF KE FIREBASE
    // ============================================================
    const proofId = 'PROOF-' + Date.now();
    await db.ref('warungdigital/proofs').child(proofId).set({
      orderId,
      hash,
      nominal,
      namaTujuan,
      penjual,
      aiResult,
      timestamp: Date.now()
    });

    // ============================================================
    // 4. RESULT
    // ============================================================
    const isVerified = aiResult.valid && aiResult.nominalMatch && aiResult.namaMatch;

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
