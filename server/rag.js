import fs from 'fs';
import path from 'path';

const TXT_PATH = path.resolve('data', 'safe.txt');
const CHUNK_SIZE = 300;
const CHUNK_OVERLAP = 50;

let chunks = [];
let idfCache = {};
let initialized = false;

/**
 * Tokenize Chinese + English text into terms.
 * Splits on whitespace and punctuation, keeps Chinese characters as individual tokens.
 */
function tokenize(text) {
  const normalized = text.toLowerCase().replace(/[，。、；：！？""''（）《》【】\n\r\t]/g, ' ');
  const raw = normalized.match(/[\u4e00-\u9fff]|[a-z0-9]+/g);
  return raw || [];
}

/**
 * Compute term frequency for a list of tokens.
 */
function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  return tf;
}

/**
 * Build IDF (inverse document frequency) from all chunks.
 */
function buildIdf(allChunkTokens) {
  const N = allChunkTokens.length;
  const df = {};
  for (const tokens of allChunkTokens) {
    const unique = new Set(tokens);
    for (const t of unique) {
      df[t] = (df[t] || 0) + 1;
    }
  }
  const idf = {};
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((N - count + 0.5) / (count + 0.5) + 1);
  }
  return idf;
}

/**
 * BM25 score for a single document against a query.
 */
function bm25Score(queryTokens, docTf, docLen, avgDl, idf, k1 = 1.5, b = 0.75) {
  let score = 0;
  for (const qt of queryTokens) {
    const tf = docTf[qt] || 0;
    const idfVal = idf[qt] || 0;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDl));
    score += idfVal * (numerator / denominator);
  }
  return score;
}

/**
 * Split text into overlapping chunks.
 */
function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const result = [];
  const chars = [...text];
  let start = 0;
  while (start < chars.length) {
    const end = Math.min(start + chunkSize, chars.length);
    const chunk = chars.slice(start, end).join('');
    if (chunk.trim().length > 0) {
      result.push(chunk.trim());
    }
    start += chunkSize - overlap;
  }
  return result;
}

/**
 * Initialize the RAG index by parsing the PDF and building BM25 structures.
 * Call this once at server startup.
 */
export async function initRag() {
  if (initialized) return { chunkCount: chunks.length };

  if (!fs.existsSync(TXT_PATH)) {
    console.warn(`[RAG] TXT not found at ${TXT_PATH}. RAG search will return empty results. Run: node scripts/pdf-to-txt.js`);
    initialized = true;
    return { chunkCount: 0 };
  }

  try {
    const fullText = fs.readFileSync(TXT_PATH, 'utf-8');

    chunks = splitIntoChunks(fullText);
    const allTokens = chunks.map((c) => tokenize(c));
    idfCache = buildIdf(allTokens);

    chunks = chunks.map((text, i) => {
      const tokens = allTokens[i];
      return { text, tokens, tf: termFrequency(tokens), len: tokens.length };
    });

    initialized = true;
    console.log(`[RAG] Indexed ${chunks.length} chunks from ${TXT_PATH}`);
    return { chunkCount: chunks.length };
  } catch (err) {
    console.error('[RAG] Failed to parse PDF:', err.message);
    initialized = true;
    return { chunkCount: 0, error: err.message };
  }
}

/**
 * Search the indexed chunks using BM25.
 * @param {string[]} keywords - Array of search keywords
 * @param {number} topK - Number of top results to return
 * @returns {{ results: Array<{ text: string, score: number }> }}
 */
export function ragSearch(keywords, topK = 5) {
  if (!chunks.length) {
    return { results: [], message: 'RAG 索引为空，请确认 data/safe.pdf 已放入。' };
  }

  const queryTokens = keywords.flatMap((kw) => tokenize(kw));
  if (!queryTokens.length) {
    return { results: [], message: '未能从关键词中提取有效检索词。' };
  }

  const avgDl = chunks.reduce((sum, c) => sum + c.len, 0) / chunks.length;

  const scored = chunks.map((chunk) => ({
    text: chunk.text,
    score: bm25Score(queryTokens, chunk.tf, chunk.len, avgDl, idfCache),
  }));

  scored.sort((a, b) => b.score - a.score);

  const results = scored.slice(0, topK).filter((r) => r.score > 0);
  return { results };
}
