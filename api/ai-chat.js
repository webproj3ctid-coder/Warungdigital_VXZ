const express = require('express');
const app = express();
app.use(express.json({ limit: '10mb' }));

const GROQ_API_KEY = process.env.GROQ_API_KEY || "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const ALLOWED_MODELS = [
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct",
  "llama-3.3-70b-versatile"
];

app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, history, model: reqModel } = req.body;
    if(!message) return res.status(400).json({ error: 'Pesan kosong' });

    const model = (reqModel && ALLOWED_MODELS.includes(reqModel)) ? reqModel : 'qwen/qwen3.6-27b';

    const systemPrompt = `Kamu adalah AI assistant WarungDigital, marketplace produk digital Indonesia. 
Jawab dengan ramah, santai, dan helpful. Pake bahasa Indonesia gaul dikit boleh.
Jangan jawab pertanyaan yang berkaitan dengan hal ilegal, SARA, atau konten dewasa.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: message }
    ];

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, top_p: 0.80, max_tokens: 1000 })
    });

    if (!response.ok) {
      const errText = await response.text();
      // Fallback ke Qwen kalau model error
      if(response.status === 400 || response.status === 404){
        const fb = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'qwen/qwen3.6-27b', messages, temperature: 0.7, max_tokens: 1000 })
        });
        if(fb.ok){
          const fbd = await fb.json();
          return res.json({ success: true, reply: fbd?.choices?.[0]?.message?.content, model: 'qwen/qwen3.6-27b (fallback)' });
        }
      }
      return res.status(500).json({ error: 'Groq error: ' + errText.substring(0, 200) });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || 'AI gak bisa jawab nih.';
    res.json({ success: true, reply, model });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai-chat', (req, res) => res.send('AI Chat (Groq) aktif! ✅'));

module.exports = app;
