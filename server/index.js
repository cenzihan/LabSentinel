import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { initRag, ragSearch } from './rag.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'lab-safety-proxy' });
});

app.post('/api/chat', async (request, response) => {
  const { apiKey, baseUrl, model, messages } = request.body ?? {};

  if (!model || !Array.isArray(messages)) {
    response.status(400).json({ error: '缺少 model 或 messages 参数。' });
    return;
  }

  const finalKey = apiKey || process.env.SILICONFLOW_API_KEY;
  const finalUrl = baseUrl || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1/chat/completions';

  if (!finalKey) {
    response.status(400).json({ error: '未提供 API Key。' });
    return;
  }

  try {
    const upstream = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${finalKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const rawText = await upstream.text();
    let payload = null;

    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { raw: rawText };
    }

    if (!upstream.ok) {
      response.status(upstream.status).json({
        error: payload?.error?.message || payload?.message || `上游接口错误: ${upstream.status}`,
        upstream: payload,
      });
      return;
    }

    response.json({
      id: payload?.id,
      model: payload?.model,
      content: payload?.choices?.[0]?.message?.content ?? '',
      usage: payload?.usage ?? null,
      raw: payload,
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : '代理服务调用失败。',
    });
  }
});

app.post('/api/chat-stream', async (request, response) => {
  const { apiKey, baseUrl, model, messages } = request.body ?? {};

  if (!model || !Array.isArray(messages)) {
    response.status(400).json({ error: '缺少 model 或 messages 参数。' });
    return;
  }

  const finalKey = apiKey || process.env.SILICONFLOW_API_KEY;
  const finalUrl = baseUrl || process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1/chat/completions';

  if (!finalKey) {
    response.status(400).json({ error: '未提供 API Key。' });
    return;
  }

  try {
    const upstream = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${finalKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const rawText = await upstream.text();
      let payload = {};
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { raw: rawText };
      }
      response.status(upstream.status || 500).json({
        error: payload?.error?.message || payload?.message || `上游接口错误: ${upstream.status}`,
      });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      response.write(decoder.decode(value, { stream: true }));
    }

    response.end();
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : '流式代理调用失败。',
    });
  }
});

app.post('/api/rag-search', (request, response) => {
  const { keywords, topK } = request.body ?? {};

  if (!Array.isArray(keywords) || keywords.length === 0) {
    response.status(400).json({ error: '缺少 keywords 参数（字符串数组）。' });
    return;
  }

  const result = ragSearch(keywords, topK || 5);
  response.json(result);
});

initRag().then((info) => {
  console.log(`[RAG] Init complete: ${info.chunkCount} chunks indexed.`);
  app.listen(port, () => {
    console.log(`Lab safety proxy running at http://localhost:${port}`);
  });
});
