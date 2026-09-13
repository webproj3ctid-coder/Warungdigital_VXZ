const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6I_Qe4ijniu5d1AQoq6-tagfeM91dtM8UYMlIwH5zF5Fw";
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if(!message) return res.status(400).json({ error: 'Pesan kosong' });

    const systemPrompt = `Kamu adalah AI assistant WarungDigital, marketplace produk digital Indonesia. 
Jawab dengan ramah, santai, dan helpful. Pake bahasa Indonesia gaul dikit boleh.
Kalau ditanya soal web ini, jelasin: web ini buat jual-beli produk digital, verifikasi AI pakai Gemini, pembayaran manual via e-wallet (DANA, OVO, GoPay, dll), penjual harus daftarin e-wallet dulu.
Jangan jawab pertanyaan yang berkaitan dengan hal ilegal, SARA, atau konten dewasa.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Ok, gua siap bantu!' }] }
    ];
    (history || []).forEach(h => {
      contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] });
    });
    contents.push({ role: 'user', parts: [{ text: message }] });

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.9, maxOutputTokens: 1000 } })
    });

    if(!geminiRes.ok){
      const errText = await geminiRes.text();
      return res.status(500).json({ error: 'Gemini error: ' + errText.substring(0,200) });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'AI gak bisa jawab nih.';
    res.json({ success: true, reply });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai-chat', (req, res) => res.send('AI Chat aktif! ✅'));

module.exports = app;
