import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { initRag, ragSearch } from './rag.js';

// Configure proxy if HTTPS_PROXY is set
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[Proxy] Using proxy: ${proxyUrl}`);
}

const app = express();
const port = process.env.SERVER_PORT || 3001;

// Helper function to detect model-related errors and format clearer messages
function formatModelError(originalMessage, model) {
  const lowerMsg = (originalMessage || '').toLowerCase();

  // Detect common model error patterns
  if (
    lowerMsg.includes('model not found') ||
    lowerMsg.includes('invalid model') ||
    lowerMsg.includes('model does not exist') ||
    lowerMsg.includes('unsupported model') ||
    lowerMsg.includes('unknown model') ||
    lowerMsg.includes('model unavailable') ||
    lowerMsg.includes('no such model') ||
    lowerMsg.includes('模型不存在') ||
    lowerMsg.includes('模型不可用')
  ) {
    return `模型 "${model}" 不存在或不可用，请检查模型名称是否正确，或在设置中选择预设模型。`;
  }

  return originalMessage;
}

app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'lab-safety-proxy' });
});

// Preset model lists for frontend selection
const VISION_MODELS = [
  { name: 'Qwen/Qwen2-VL-7B-Instruct', label: 'Qwen2-VL-7B' },
  { name: 'Qwen/Qwen2.5-VL-32B-Instruct', label: 'Qwen2.5-VL-32B' },
  { name: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL-32B (推荐)' },
  { name: 'deepseek-ai/deepseek-vl2', label: 'DeepSeek-VL2' },
  { name: 'THUDM/glm-4v-9b', label: 'GLM-4V-9B' },
];

const OMNI_MODELS = [
  { name: 'Qwen/Qwen2.5-Omni-7B', label: 'Qwen2.5-Omni-7B' },
  { name: 'Qwen/Qwen3-Omni-30B-A3B-Instruct', label: 'Qwen3-Omni-30B (推荐)' },
];

app.get('/api/models', (_request, response) => {
  const defaultVision = process.env.VITE_HAZARD_MODEL || 'Qwen/Qwen3-VL-32B-Instruct';
  const defaultOmni = process.env.VITE_OMNI_MODEL || 'Qwen/Qwen3-Omni-30B-A3B-Instruct';

  response.json({
    visionModels: VISION_MODELS,
    omniModels: OMNI_MODELS,
    defaults: {
      vision: defaultVision,
      omni: defaultOmni,
    },
  });
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
      const originalError = payload?.error?.message || payload?.message || `上游接口错误: ${upstream.status}`;
      const formattedError = formatModelError(originalError, model);
      response.status(upstream.status).json({
        error: formattedError,
        isModelError: formattedError !== originalError,
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
      // Increase timeout for large image payloads through proxy
      signal: AbortSignal.timeout(120000), // 2 minutes
    });

    if (!upstream.ok || !upstream.body) {
      const rawText = await upstream.text();
      let payload = {};
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { raw: rawText };
      }
      const originalError = payload?.error?.message || payload?.message || `上游接口错误: ${upstream.status}`;
      const formattedError = formatModelError(originalError, model);
      response.status(upstream.status || 500).json({
        error: formattedError,
        isModelError: formattedError !== originalError,
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
    console.error('[chat-stream] Error details:', error);
    const errorMessage = error instanceof Error ? `${error.message} (${error.cause ? String(error.cause) : 'no cause'})` : '流式代理调用失败。';
    console.error('[chat-stream] Final URL:', finalUrl);
    console.error('[chat-stream] Request body size:', JSON.stringify({ model, messages, temperature: 0.2, stream: true }).length, 'bytes');
    response.status(500).json({
      error: errorMessage,
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
