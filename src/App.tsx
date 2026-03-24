import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from 'react';
import './App.css';
import i3cLogo from '../logo/i3c.png';
import exampleImage1 from '../example/example1.jpg';

const DEFAULT_API_KEY = import.meta.env.VITE_SILICONFLOW_API_KEY || '';
const DEFAULT_BASE_URL = import.meta.env.VITE_SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/your-org/lab-safety-app';
const HAZARD_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
const OMNI_MODEL = 'Qwen/Qwen3-Omni-30B-A3B-Instruct';

const DEFAULT_HAZARD_PROMPT = `你是一名“高校实验室安全巡检专家”，擅长识别化学、材料、生物、电子、电气、机械等实验场景中的安全隐患。

请严格依据图像中可见证据完成分析，不要凭空猜测。若证据不足，请明确标记“无法确认”。

请重点检查以下风险维度：
1. 个人防护：未穿实验服、未戴护目镜、未戴手套、穿拖鞋、长发未束起等。
2. 化学品安全：试剂无标签、混放、敞口存放、易燃腐蚀品放置不当、废液容器不规范等。
3. 设备操作：明火或加热设备无人看管、离心机或旋转设备防护不足、电器线路杂乱、插排过载等。
4. 气体与压力容器：气瓶未固定、减压阀异常、软管松脱、疑似泄漏迹象、易燃气体环境不规范等。
5. 环境管理：通道堵塞、消防器材被遮挡、台面杂乱、地面液体或碎玻璃、通风橱使用不当等。
6. 生物与样品管理：样品容器无标识、污染暴露、医疗废物或锐器处理不当等。

输出要求：
- 只输出 JSON，不要输出 Markdown，不要加解释前后缀。
- 对于每个隐患，必须提供 bbox 字段标注其在图像中的位置，格式为 [x1, y1, x2, y2]，取值范围 0~1（归一化坐标，左上角为原点）。x1,y1 是左上角，x2,y2 是右下角。
- JSON 结构必须为：
{
  "has_hazard": true,
  "summary": "一句话总结",
  "overall_risk_level": "低/中/高",
  "hazards": [
    {
      "id": 1,
      "type": "隐患类型",
      "risk_level": "低/中/高",
      "bbox": [0.1, 0.2, 0.5, 0.6],
      "evidence": "图像中看到的证据",
      "impact": "可能造成的后果",
      "suggestion": "整改建议"
    }
  ],
  "uncertain_points": ["无法确认但值得复核的点"],
  "recommended_actions": ["优先执行的整改动作"]
}

判定规则：
- 没有明显隐患时，has_hazard 为 false，hazards 返回空数组。
- 若存在多个隐患，请按风险从高到低排序。
- 不同隐患的 bbox 不得重复或高度重叠，若两个隐患位于同一区域请合并为一条。
- bbox 所有坐标值必须统一使用 0~1 归一化范围，不要混用不同尺度。
- 若画面模糊或局部遮挡，请在 uncertain_points 中说明。`;

const DEFAULT_OMNI_SYSTEM_PROMPT = `你是一名“实验室安全多模态助手”。

你的职责：
1. 结合文本、图片、视频、音频信息，判断是否存在实验室安全风险。
2. 输出简洁、专业、可执行的建议。
3. 若信息不足，要明确说明缺失了什么，不得编造。
4. 优先关注人员防护、化学品管理、设备使用、用电安全、气瓶与压力容器、消防与疏散、环境整洁、异常声音或报警提示等。

回答格式建议：
- 结论
- 依据
- 风险等级
- 建议措施`;

type TabId = 'hazard' | 'omni';

type ApiSettings = {
  apiKey: string;
  baseUrl: string;
  githubUrl: string;
};

type MediaAsset = {
  dataUrl: string;
  previewUrl: string;
  mimeType: string;
  name: string;
};

type HazardResult = {
  has_hazard?: boolean;
  summary?: string;
  overall_risk_level?: string;
  hazards?: Array<{
    id?: number;
    type?: string;
    risk_level?: string;
    bbox?: [number, number, number, number];
    evidence?: string;
    impact?: string;
    suggestion?: string;
  }>;
  uncertain_points?: string[];
  recommended_actions?: string[];
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('hazard');
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHazardPromptSettings, setShowHazardPromptSettings] = useState(false);
  const [hazardDragging, setHazardDragging] = useState(false);
  const [settings, setSettings] = useState<ApiSettings>({
    apiKey: DEFAULT_API_KEY,
    baseUrl: DEFAULT_BASE_URL,
    githubUrl: DEFAULT_GITHUB_URL,
  });

  const [hazardPrompt, setHazardPrompt] = useState(DEFAULT_HAZARD_PROMPT);
  const [hazardImage, setHazardImage] = useState<MediaAsset | null>(null);
  const [hazardLoading, setHazardLoading] = useState(false);
  const [hazardStep, setHazardStep] = useState('');
  const [hazardError, setHazardError] = useState('');
  const [hazardRaw, setHazardRaw] = useState('');
  const [hazardResult, setHazardResult] = useState<HazardResult | null>(null);
  const [ragExcerpts, setRagExcerpts] = useState<Array<{ idx: number; text: string }>>([]);

  const [omniSystemPrompt, setOmniSystemPrompt] = useState(DEFAULT_OMNI_SYSTEM_PROMPT);
  const [omniUserPrompt, setOmniUserPrompt] = useState('请结合我上传的内容，分析是否存在实验室安全隐患，并给出整改建议。');
  const [omniImage, setOmniImage] = useState<MediaAsset | null>(null);
  const [omniVideo, setOmniVideo] = useState<MediaAsset | null>(null);
  const [omniAudio, setOmniAudio] = useState<MediaAsset | null>(null);
  const [omniLoading, setOmniLoading] = useState(false);
  const [omniError, setOmniError] = useState('');
  const [omniResponse, setOmniResponse] = useState('');

  const [videoRecording, setVideoRecording] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);

  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lab_safety_settings');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<ApiSettings>;
      setSettings({
        apiKey: parsed.apiKey || DEFAULT_API_KEY,
        baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
        githubUrl: parsed.githubUrl || DEFAULT_GITHUB_URL,
      });
    } catch {
      setSettings({
        apiKey: DEFAULT_API_KEY,
        baseUrl: DEFAULT_BASE_URL,
        githubUrl: DEFAULT_GITHUB_URL,
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lab_safety_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    return () => {
      stopVideoRecording();
      stopAudioRecording();
    };
  }, []);

  const settingsSummary = useMemo(() => {
    const masked = settings.apiKey ? `${settings.apiKey.slice(0, 6)}...${settings.apiKey.slice(-4)}` : 'Not Configured';
    return masked;
  }, [settings.apiKey]);

  async function handleSingleFile(file: File, setter: (asset: MediaAsset | null) => void) {
    const asset = await fileToMediaAsset(file);
    setter(asset);
  }

  async function handleMediaSelect(
    event: ChangeEvent<HTMLInputElement>,
    setter: (asset: MediaAsset | null) => void,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleSingleFile(file, setter);
    event.target.value = '';
  }

  async function handleHazardDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setHazardDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    await handleSingleFile(file, setHazardImage);
  }

  async function handleLoadHazardExample() {
    const response = await fetch(exampleImage1);
    const blob = await response.blob();
    const file = new File([blob], 'example1.jpg', { type: blob.type || 'image/jpeg' });
    await handleSingleFile(file, setHazardImage);
  }

  async function handleHazardSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hazardImage) {
      setHazardError('请先上传、拖入或拍摄一张实验室图片。');
      return;
    }

    setHazardLoading(true);
    setHazardStep('步骤 1/3：AI 识别隐患...');
    setHazardError('');
    setHazardRaw('');
    setHazardResult(null);
    setRagExcerpts([]);

    try {
      // Step 1: VLM identifies hazards with bbox
      const step1Text = await callProxyWithFallback({
        settings,
        model: HAZARD_MODEL,
        messages: [
          { role: 'system', content: '你必须只输出合法 JSON。' },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: hazardImage.dataUrl, detail: 'high' } },
              { type: 'text', text: hazardPrompt },
            ],
          },
        ],
        onChunk: (chunk) => setHazardRaw((prev) => prev + chunk),
      });

      const step1Raw = parseJsonFromText(step1Text) as HazardResult;

      // Deduplicate hazards with near-identical bboxes (distance < 0.05)
      if (step1Raw.hazards?.length) {
        const normVal = (v: number) => (v > 1 ? v / 1000 : v);
        const seen: number[][] = [];
        step1Raw.hazards = step1Raw.hazards.filter((h) => {
          if (!h.bbox || h.bbox.length !== 4) return true;
          const nb = h.bbox.map(normVal);
          const dup = seen.some((s) => s.every((v, i) => Math.abs(v - nb[i]) < 0.05));
          if (!dup) seen.push(nb);
          return !dup;
        });
        // Re-assign sequential IDs
        step1Raw.hazards.forEach((h, i) => { h.id = i + 1; });
      }
      const step1Result = step1Raw;

      // Step 2: Extract keywords and search regulations via RAG
      setHazardStep('步骤 2/3：检索安全条例...');
      const keywords = extractHazardKeywords(step1Result);
      let excerpts: string[] = [];

      if (keywords.length > 0) {
        try {
          const ragResponse = await fetch('/api/rag-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords, topK: 5 }),
          });
          if (ragResponse.ok) {
            const ragData = await ragResponse.json();
            excerpts = (ragData.results || []).map((r: { text: string }) => r.text);
            setRagExcerpts(excerpts.map((text: string, i: number) => ({ idx: i + 1, text })));
          }
        } catch {
          // RAG search failure is non-fatal; continue without regulation context
        }
      }

      // Step 3: If we have regulation excerpts, do a second VLM call with context
      if (excerpts.length > 0) {
        setHazardStep('步骤 3/3：基于条例生成最终分析...');
        setHazardRaw('');

        const ragContext = excerpts.map((e, i) => `【条例片段 ${i + 1}】${e}`).join('\n\n');
        const step3Prompt = `你是一名"高校实验室安全巡检专家"。以下是第一步 AI 识别的隐患信息和检索到的实验室安全条例。

请基于安全条例对隐患进行最终分析，在每个隐患的 suggestion 中引用相关条例（标注"依据条例片段 X"）。
保持原有 JSON 结构（包含 id、bbox 等字段），可以修正或补充第一步的判断。

【第一步识别结果】
${step1Text}

【实验室安全条例参考】
${ragContext}

输出要求：只输出合法 JSON，结构与第一步相同。`;

        const finalText = await callProxyWithFallback({
          settings,
          model: HAZARD_MODEL,
          messages: [
            { role: 'system', content: '你必须只输出合法 JSON。' },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: hazardImage.dataUrl, detail: 'high' } },
                { type: 'text', text: step3Prompt },
              ],
            },
          ],
          onChunk: (chunk) => setHazardRaw((prev) => prev + chunk),
        });

        const finalRaw = parseJsonFromText(finalText) as HazardResult;

        // Deduplicate hazards with near-identical bboxes in final result too
        if (finalRaw.hazards?.length) {
          const normVal = (v: number) => (v > 1 ? v / 1000 : v);
          const seen: number[][] = [];
          finalRaw.hazards = finalRaw.hazards.filter((h) => {
            if (!h.bbox || h.bbox.length !== 4) return true;
            const nb = h.bbox.map(normVal);
            const dup = seen.some((s) => s.every((v, i) => Math.abs(v - nb[i]) < 0.05));
            if (!dup) seen.push(nb);
            return !dup;
          });
          finalRaw.hazards.forEach((h, i) => { h.id = i + 1; });
        }
        const finalResult = finalRaw;
        setHazardResult(finalResult);

        // Filter excerpts to only those referenced, renumber sequentially
        const referencedIds = new Set<number>();
        for (const h of finalResult.hazards || []) {
          const matches = (h.suggestion || '').matchAll(/条例片段\s*(\d+)/g);
          for (const m of matches) referencedIds.add(Number(m[1]));
        }
        if (referencedIds.size > 0) {
          // Build old→new index mapping (e.g. {4→1, 5→2})
          const sortedIds = [...referencedIds].sort((a, b) => a - b);
          const idMap = new Map<number, number>();
          sortedIds.forEach((oldIdx, i) => idMap.set(oldIdx, i + 1));

          // Remap references in suggestion text
          for (const h of finalResult.hazards || []) {
            if (h.suggestion) {
              h.suggestion = h.suggestion.replace(/条例片段\s*(\d+)/g, (_, num) => {
                const newIdx = idMap.get(Number(num));
                return newIdx ? `条例片段 ${newIdx}` : `条例片段 ${num}`;
              });
            }
          }
          setHazardResult({ ...finalResult });

          // Store with sequential numbering
          setRagExcerpts(sortedIds
            .filter((oldIdx) => oldIdx >= 1 && oldIdx <= excerpts.length)
            .map((oldIdx, i) => ({ idx: i + 1, text: excerpts[oldIdx - 1] })));
        }
      } else {
        // No RAG excerpts available, use step 1 result directly
        setHazardResult(step1Result);
      }
    } catch (error) {
      setHazardError(getErrorMessage(error));
    } finally {
      setHazardLoading(false);
      setHazardStep('');
    }
  }

  async function handleOmniSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contentParts: Array<Record<string, unknown>> = [];
    if (omniImage) contentParts.push({ type: 'image_url', image_url: { url: omniImage.dataUrl, detail: 'high' } });
    if (omniVideo) contentParts.push({ type: 'video_url', video_url: { url: omniVideo.dataUrl, detail: 'high', max_frames: 16, fps: 1 } });
    if (omniAudio) contentParts.push({ type: 'audio_url', audio_url: { url: omniAudio.dataUrl } });
    if (omniUserPrompt.trim()) contentParts.push({ type: 'text', text: omniUserPrompt.trim() });

    if (contentParts.length === 0) {
      setOmniError('请至少输入文字，或上传一项图片、视频、音频。');
      return;
    }

    setOmniLoading(true);
    setOmniError('');
    setOmniResponse('');

    try {
      await callProxyWithFallback({
        settings,
        model: OMNI_MODEL,
        messages: [
          { role: 'system', content: omniSystemPrompt.trim() || DEFAULT_OMNI_SYSTEM_PROMPT },
          { role: 'user', content: contentParts },
        ],
        onChunk: (chunk) => setOmniResponse((prev) => prev + chunk),
      });
    } catch (error) {
      setOmniError(getErrorMessage(error));
    } finally {
      setOmniLoading(false);
    }
  }

  async function startVideoRecording() {
    if (videoRecording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoStreamRef.current = stream;
    videoChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickSupportedMimeType(['video/webm;codecs=vp9,opus', 'video/webm']) });
    videoRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) videoChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(videoChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const file = new File([blob], `lab-video-${Date.now()}.webm`, { type: blob.type });
      setOmniVideo(await fileToMediaAsset(file));
      stream.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
      setVideoRecording(false);
    };
    recorder.start();
    setVideoRecording(true);
  }

  function stopVideoRecording() {
    if (videoRecorderRef.current && videoRecording) {
      videoRecorderRef.current.stop();
    }
    if (!videoRecording && videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
  }

  async function startAudioRecording() {
    if (audioRecording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStreamRef.current = stream;
    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: pickSupportedMimeType(['audio/webm', 'audio/mp4']) });
    audioRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const file = new File([blob], `lab-audio-${Date.now()}.webm`, { type: blob.type });
      setOmniAudio(await fileToMediaAsset(file));
      stream.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      setAudioRecording(false);
    };
    recorder.start();
    setAudioRecording(true);
  }

  function stopAudioRecording() {
    if (audioRecorderRef.current && audioRecording) {
      audioRecorderRef.current.stop();
    }
    if (!audioRecording && audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left" onClick={() => window.location.reload()}>
          <div className="header-logo-wrap">
            <img src={i3cLogo} alt="LabSentinel Logo" className="header-logo-image" />
          </div>
          <h1 className="brand-title">LabSentinel</h1>
          <a href={settings.githubUrl} target="_blank" rel="noreferrer" className="header-inline-icon" title="GitHub Repository" onClick={(event) => event.stopPropagation()}>
            <GitHubIcon />
          </a>
        </div>

        <nav className="center-nav">
          <button className={activeTab === 'hazard' ? 'center-tab active' : 'center-tab'} type="button" onClick={() => setActiveTab('hazard')}>
            <VisionIcon />
            <span>图片安全隐患</span>
          </button>
          <button className={activeTab === 'omni' ? 'center-tab active' : 'center-tab'} type="button" onClick={() => setActiveTab('omni')}>
            <OmniIcon />
            <span>多模态安全咨询</span>
          </button>
        </nav>

        <div className="topbar-right">
          <div className="engine-badge">
            <span className="engine-dot"></span>
            <span>{activeTab === 'hazard' ? HAZARD_MODEL : OMNI_MODEL}</span>
          </div>
          <button className="icon-button" type="button" title="API 配置" onClick={() => setShowSettings(true)}>
            <ConfigIcon />
          </button>
          <button className="about-button" type="button" title="介绍" onClick={() => setShowAbout(true)}>
            ?
          </button>
        </div>
      </header>

      <main className="page-content">
        {activeTab === 'hazard' ? (
          <section className="page-view vision-layout">
            <div className="vision-left">
              <div className="vision-upload-card">
                <div className="vision-card-head">
                  <div>
                    <p className="page-kicker">AI Vision</p>
                    <h2>图片安全隐患检测</h2>
                  </div>
                  <span className="model-chip">{HAZARD_MODEL}</span>
                </div>

                <div
                  className={hazardDragging ? 'vision-dropzone active' : 'vision-dropzone'}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setHazardDragging(true);
                  }}
                  onDragLeave={() => setHazardDragging(false)}
                  onDrop={(event) => void handleHazardDrop(event)}
                >
                  {hazardImage ? (
                    <>
                      <img src={hazardImage.previewUrl} alt="Preview" className="vision-preview-image" />
                      <div className="vision-preview-actions">
                        <button type="button" className="danger-circle" onClick={() => setHazardImage(null)}>
                          <CloseIcon />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="vision-empty-upload">
                      <div className="vision-empty-icon">
                        <VisionIcon />
                      </div>
                      <h4>拖入或上传图片</h4>
                      <p>可以把图片直接拖到这里，也可以从设备上传，或者直接拍照。</p>
                      <input id="hazard-upload-input" type="file" accept="image/*" className="hidden-input" onChange={(event) => void handleMediaSelect(event, setHazardImage)} />
                      <div className="vision-upload-actions">
                        <label htmlFor="hazard-upload-input" className="mini-action">上传</label>
                        <label className="mini-action">
                          拍照
                          <input type="file" accept="image/*" capture="environment" className="hidden-input" onChange={(event) => void handleMediaSelect(event, setHazardImage)} />
                        </label>
                        <button type="button" className="mini-action" onClick={() => void handleLoadHazardExample()}>加载示例</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="vision-action-row">
                  <button className="secondary-action" type="button" onClick={() => setShowHazardPromptSettings(true)}>
                    <ConfigIcon />
                    Prompt 配置
                  </button>
                  <button className="primary-action" type="submit" onClick={(event) => void handleHazardSubmit(event as unknown as FormEvent<HTMLFormElement>)} disabled={hazardLoading || !hazardImage}>
                    {hazardLoading ? (hazardStep || '分析中...') : '开始检测'}
                  </button>
                </div>

                {hazardError ? <div className="error-box">{hazardError}</div> : null}
              </div>
            </div>

            <div className="vision-right">
              <div className="vision-result-card">
                <div className="vision-result-head">
                  <div className="result-tab-group">
                    <button className="result-tab active" type="button">结果</button>
                    {hazardRaw ? <button className="result-tab" type="button">原始 JSON</button> : null}
                  </div>
                </div>

                <div className="vision-result-body">
                  {hazardResult ? (
                    <div className="result-stack">
                      <div className={hazardResult.has_hazard ? 'status-banner danger' : 'status-banner safe'}>
                        <strong>{hazardResult.has_hazard ? '检测到安全隐患' : '未检测到明显隐患'}</strong>
                        <span>{hazardResult.overall_risk_level || '待返回'}</span>
                      </div>
                      {hazardImage && hazardResult?.hazards?.length ? (
                        <div className="result-block">
                          <h4>隐患标注图</h4>
                          <BboxOverlay imageSrc={hazardImage.previewUrl} hazards={hazardResult.hazards} />
                        </div>
                      ) : null}
                      <ResultBlock title="总结" content={hazardResult.summary || '暂无总结。'} />
                      <div className="result-block">
                        <h4>隐患条目</h4>
                        {hazardResult.hazards?.length ? (
                          <div className="hazard-list">
                            {hazardResult.hazards.map((item, index) => (
                              <article className="hazard-item" key={`${item.type || 'hazard'}-${index}`}>
                                <div className="hazard-head">
                                  <span className="hazard-area-badge" style={{ backgroundColor: BBOX_COLORS[index % BBOX_COLORS.length] }}>
                                    区域 {item.id ?? index + 1}
                                  </span>
                                  <strong>{item.type || `隐患 ${index + 1}`}</strong>
                                  <span>{item.risk_level || '未评级'}</span>
                                </div>
                                <p><strong>证据:</strong> {item.evidence || '暂无'}</p>
                                <p><strong>影响:</strong> {item.impact || '暂无'}</p>
                                <p><strong>建议:</strong> <SuggestionWithLinks text={item.suggestion || '暂无'} /></p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state small">当前没有返回具体隐患条目。</div>
                        )}
                      </div>
                      {ragExcerpts.length > 0 ? (
                        <div className="result-block">
                          <h4>参考安全条例</h4>
                          <div className="rag-excerpt-list">
                            {ragExcerpts.map((excerpt) => (
                              <div className="rag-excerpt" key={`rag-${excerpt.idx}`} id={`rag-excerpt-${excerpt.idx}`}>
                                <span className="rag-excerpt-badge">条例片段 {excerpt.idx}</span>
                                <p>{excerpt.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <ResultList title="待复核点" items={hazardResult.uncertain_points} />
                      <ResultList title="优先整改建议" items={hazardResult.recommended_actions} />
                    </div>
                  ) : (
                    <div className="empty-state vision-result-empty">
                      <VisionIcon />
                      <p>结构化检测结果会在分析完成后显示在这里。</p>
                    </div>
                  )}
                </div>

                {hazardRaw ? (
                  <div className="vision-raw-block">
                    <h4>原始输出</h4>
                    <textarea value={hazardRaw} readOnly rows={8} />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="page-view">
            <div className="page-intro">
              <div>
                <p className="page-kicker">Omni</p>
                <h2>多模态安全咨询</h2>
                <p>支持文本、图片、视频、音频自由组合输入。浏览器中可直接调用摄像头和麦克风进行录制。</p>
              </div>
              <div className="page-summary-card">
                <p>平台</p>
                <strong>SiliconFlow</strong>
                <span>{settingsSummary}</span>
              </div>
            </div>

            <form className="feature-grid" onSubmit={handleOmniSubmit}>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">输入区域</p>
                    <h3>多模态配置</h3>
                  </div>
                  <span className="model-chip">{OMNI_MODEL}</span>
                </div>

                <label className="field">
                  <span>系统提示词</span>
                  <textarea value={omniSystemPrompt} onChange={(event) => setOmniSystemPrompt(event.target.value)} rows={8} />
                </label>

                <label className="field">
                  <span>用户问题</span>
                  <textarea value={omniUserPrompt} onChange={(event) => setOmniUserPrompt(event.target.value)} rows={5} />
                </label>

                <div className="media-sections">
                  <MediaSection title="图片输入" actionLabel="上传或拍照" preview={omniImage ? <img className="image-preview compact" src={omniImage.previewUrl} alt="图片预览" /> : null} footer={omniImage ? <button className="text-button" type="button" onClick={() => setOmniImage(null)}>移除图片</button> : null}>
                    <label className="upload-box">
                      <span>选择图片</span>
                      <input type="file" accept="image/*" onChange={(event) => void handleMediaSelect(event, setOmniImage)} />
                    </label>
                    <label className="upload-box">
                      <span>拍照输入</span>
                      <input type="file" accept="image/*" capture="environment" onChange={(event) => void handleMediaSelect(event, setOmniImage)} />
                    </label>
                  </MediaSection>

                  <MediaSection title="视频输入" actionLabel="上传或录制" preview={omniVideo ? <video className="media-preview" src={omniVideo.previewUrl} controls /> : null} footer={omniVideo ? <button className="text-button" type="button" onClick={() => setOmniVideo(null)}>移除视频</button> : null}>
                    <label className="upload-box">
                      <span>上传视频</span>
                      <input type="file" accept="video/*" onChange={(event) => void handleMediaSelect(event, setOmniVideo)} />
                    </label>
                    <button className={videoRecording ? 'warn-button' : 'ghost-button block'} type="button" onClick={() => void (videoRecording ? stopVideoRecording() : startVideoRecording())}>
                      {videoRecording ? '停止录像' : '摄像头录像'}
                    </button>
                  </MediaSection>

                  <MediaSection title="音频输入" actionLabel="上传或录制" preview={omniAudio ? <audio className="audio-preview" src={omniAudio.previewUrl} controls /> : null} footer={omniAudio ? <button className="text-button" type="button" onClick={() => setOmniAudio(null)}>移除音频</button> : null}>
                    <label className="upload-box">
                      <span>上传音频</span>
                      <input type="file" accept="audio/*" onChange={(event) => void handleMediaSelect(event, setOmniAudio)} />
                    </label>
                    <button className={audioRecording ? 'warn-button' : 'ghost-button block'} type="button" onClick={() => void (audioRecording ? stopAudioRecording() : startAudioRecording())}>
                      {audioRecording ? '停止录音' : '麦克风录音'}
                    </button>
                  </MediaSection>
                </div>

                <button className="primary-button" type="submit" disabled={omniLoading}>
                  {omniLoading ? '提交中...' : '发送给全能助手'}
                </button>

                {omniError ? <div className="error-box">{omniError}</div> : null}
              </div>

              <div className="panel result-panel">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">模型输出</p>
                    <h3>安全咨询回答</h3>
                  </div>
                </div>
                {omniResponse ? <div className="response-box">{omniResponse}</div> : <div className="empty-state tall">模型回答会在提交后显示在这里。</div>}
              </div>
            </form>
          </section>
        )}
      </main>

      {showSettings ? (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="panel-kicker">配置中心</p>
                <h3>API 与链接</h3>
              </div>
              <button className="text-button" type="button" onClick={() => setShowSettings(false)}>关闭</button>
            </div>

            <label className="field">
              <span>API Key</span>
              <input type="password" value={settings.apiKey} onChange={(event) => setSettings((prev) => ({ ...prev, apiKey: event.target.value }))} placeholder="sk-..." />
            </label>

            <label className="field">
              <span>Base URL</span>
              <input type="text" value={settings.baseUrl} onChange={(event) => setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))} placeholder={DEFAULT_BASE_URL} />
            </label>

            <label className="field">
              <span>GitHub 链接</span>
              <input type="text" value={settings.githubUrl} onChange={(event) => setSettings((prev) => ({ ...prev, githubUrl: event.target.value }))} placeholder={DEFAULT_GITHUB_URL} />
            </label>
          </section>
        </div>
      ) : null}

      {showHazardPromptSettings ? (
        <div className="modal-backdrop" onClick={() => setShowHazardPromptSettings(false)}>
          <section className="settings-modal prompt-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <p className="panel-kicker">Prompt 配置</p>
                <h3>图片隐患检测提示词</h3>
              </div>
              <button className="text-button" type="button" onClick={() => setShowHazardPromptSettings(false)}>关闭</button>
            </div>
            <label className="field">
              <span>提示词</span>
              <textarea value={hazardPrompt} onChange={(event) => setHazardPrompt(event.target.value)} rows={16} />
            </label>
          </section>
        </div>
      ) : null}

      {showAbout ? (
        <div className="modal-backdrop" onClick={() => setShowAbout(false)}>
          <section className="about-modal" onClick={(event) => event.stopPropagation()}>
            <div className="about-sidebar">
              <span className="about-label">ABOUT</span>
              <button className="about-side-button active" type="button">项目介绍</button>
            </div>
            <div className="about-content">
              <button className="close-icon" type="button" onClick={() => setShowAbout(false)}><CloseIcon /></button>
              <div className="about-logo">L</div>
              <h3>LabSentinel</h3>
              <p className="about-subtitle">围绕实验室巡检、隐患识别和安全问答做的统一入口。</p>
              <p className="about-text">当前版本已经把图片隐患检测页和多模态咨询页统一到同一套风格，并尽量向参考的 ai-doc-helper 视觉模块靠拢。</p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const BBOX_COLORS = [
  '#FF4136', '#FF851B', '#FFDC00', '#2ECC40', '#0074D9',
  '#B10DC9', '#F012BE', '#01FF70', '#7FDBFF', '#FF6384',
];

function BboxOverlay({
  imageSrc,
  hazards,
}: {
  imageSrc: string;
  hazards?: HazardResult['hazards'];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgObjRef = useRef<HTMLImageElement | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const cw = container.clientWidth;
    if (cw === 0) return; // not laid out yet
    const ch = 390;

    // Set canvas buffer size AND matching CSS size to avoid scaling mismatch
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    const img = imgObjRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Fit image inside canvas with padding
    const pad = 16;
    const areaW = cw - pad * 2;
    const areaH = ch - pad * 2;
    const scale = Math.min(areaW / img.naturalWidth, areaH / img.naturalHeight);
    const renderedW = img.naturalWidth * scale;
    const renderedH = img.naturalHeight * scale;
    const offsetX = pad + (areaW - renderedW) / 2;
    const offsetY = pad + (areaH - renderedH) / 2;

    ctx.drawImage(img, offsetX, offsetY, renderedW, renderedH);

    if (!hazards?.length) return;

    // Per-value normalization: model mixes 0-1 and 0-1000 within a single bbox
    function normalizeBbox(raw: number[]): [number, number, number, number] {
      const norm = (v: number) => (v > 1 ? v / 1000 : v);
      let [bx1, by1, bx2, by2] = raw.map(norm);
      // Ensure proper order
      if (bx1 > bx2) { const t = bx1; bx1 = bx2; bx2 = t; }
      if (by1 > by2) { const t = by1; by1 = by2; by2 = t; }
      // Clamp to [0, 1]
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      return [clamp(bx1), clamp(by1), clamp(bx2), clamp(by2)];
    }

    hazards.forEach((item, index) => {
      if (!item.bbox || item.bbox.length !== 4) return;
      const [x1, y1, x2, y2] = normalizeBbox(item.bbox);
      const px1 = offsetX + x1 * renderedW;
      const py1 = offsetY + y1 * renderedH;
      const px2 = offsetX + x2 * renderedW;
      const py2 = offsetY + y2 * renderedH;
      const w = px2 - px1;
      const h = py2 - py1;

      const color = BBOX_COLORS[index % BBOX_COLORS.length];
      const label = `区域 ${item.id ?? index + 1}`;

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(px1, py1, w, h);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(px1, py1, w, h);
      ctx.globalAlpha = 1;

      ctx.font = 'bold 16px sans-serif';
      const tm = ctx.measureText(label);
      const textH = 24;
      const textW = tm.width + 10;
      ctx.fillStyle = color;
      ctx.fillRect(px1, py1 - textH, textW, textH);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, px1 + 5, py1 - 6);
    });
  }, [hazards]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgObjRef.current = img;
      // Use rAF to ensure container is laid out before drawing
      requestAnimationFrame(() => draw());
    };
    img.src = imageSrc;
  }, [imageSrc, draw]);

  useEffect(() => {
    // Redraw on mount (after layout) and on resize
    requestAnimationFrame(() => draw());
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  return (
    <div ref={containerRef} className="bbox-overlay-container">
      <canvas ref={canvasRef} />
    </div>
  );
}

function MediaSection({ title, actionLabel, children, preview, footer }: { title: string; actionLabel: string; children: ReactNode; preview: ReactNode; footer: ReactNode; }) {
  return (
    <section className="media-card">
      <div className="media-card-head"><div><h4>{title}</h4><p>{actionLabel}</p></div></div>
      <div className="upload-grid">{children}</div>
      <div className="media-preview-wrap">{preview || <div className="empty-state small">尚未添加{title}</div>}</div>
      {footer}
    </section>
  );
}

function SuggestionWithLinks({ text }: { text: string }) {
  const parts = text.split(/(条例片段\s*\d+)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/条例片段\s*(\d+)/);
        if (match) {
          const num = match[1];
          return (
            <a
              key={i}
              href={`#rag-excerpt-${num}`}
              className="rag-link"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`rag-excerpt-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              条例片段 {num}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ResultBlock({ title, content }: { title: string; content: string }) {
  return <div className="result-block"><h4>{title}</h4><p>{content}</p></div>;
}

function ResultList({ title, items }: { title: string; items?: string[] }) {
  return <div className="result-block"><h4>{title}</h4>{items?.length ? <ul className="plain-list">{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <p>暂无</p>}</div>;
}

function GitHubIcon() {
  return <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.111.793-.261.793-.577v-2.17C5.662 21.365 4.967 19.4 4.967 19.4c-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.082-.729.082-.729 1.205.085 1.839 1.238 1.839 1.238 1.07 1.834 2.807 1.304 3.492.997.107-.775.419-1.304.763-1.604-2.665-.304-5.466-1.333-5.466-5.93 0-1.31.469-2.38 1.236-3.22-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.229A11.47 11.47 0 0 1 12 6.844c1.02.005 2.047.138 3.006.404 2.292-1.551 3.3-1.229 3.3-1.229.653 1.652.242 2.873.119 3.176.77.84 1.235 1.91 1.235 3.22 0 4.609-2.804 5.624-5.475 5.922.43.37.814 1.102.814 2.222v3.293c0 .319.192.69.8.576C20.565 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z" /></svg>;
}

function ConfigIcon() {
  return <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10.325 4.317a1.724 1.724 0 0 1 3.35 0 1.724 1.724 0 0 0 2.573 1.066 1.724 1.724 0 0 1 2.37 2.37 1.724 1.724 0 0 0 1.065 2.572 1.724 1.724 0 0 1 0 3.35 1.724 1.724 0 0 0-1.066 2.573 1.724 1.724 0 0 1-2.37 2.37 1.724 1.724 0 0 0-2.572 1.065 1.724 1.724 0 0 1-3.35 0 1.724 1.724 0 0 0-2.573-1.066 1.724 1.724 0 0 1-2.37-2.37 1.724 1.724 0 0 0-1.065-2.572 1.724 1.724 0 0 1 0-3.35 1.724 1.724 0 0 0 1.066-2.573 1.724 1.724 0 0 1 2.37-2.37 1.724 1.724 0 0 0 2.572-1.065Z" /><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>;
}

function VisionIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

function OmniIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h10" /><path d="M4 12h16" /><path d="M4 17h8" /><circle cx="18" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></svg>;
}

function CloseIcon() {
  return <svg className="button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
}

function pickSupportedMimeType(types: string[]) {
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

async function fileToMediaAsset(file: File): Promise<MediaAsset> {
  const dataUrl = await readFileAsDataUrl(file);
  return { dataUrl, previewUrl: URL.createObjectURL(file), mimeType: file.type, name: file.name };
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });
}

function extractHazardKeywords(result: HazardResult): string[] {
  const keywords: string[] = [];
  if (result.hazards?.length) {
    for (const h of result.hazards) {
      if (h.type) keywords.push(h.type);
      if (h.evidence) {
        const short = h.evidence.slice(0, 40);
        keywords.push(short);
      }
    }
  }
  if (result.summary) {
    keywords.push(result.summary.slice(0, 60));
  }
  return [...new Set(keywords)];
}

function parseJsonFromText(text: string) {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const rawJson = codeBlockMatch?.[1] || text.match(/\{[\s\S]*\}/)?.[0];
  if (!rawJson) throw new Error('模型没有返回可解析的 JSON。');
  return JSON.parse(rawJson);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查网络、API Key 或模型配置。';
}

async function callProxyStream({ settings, model, messages, onChunk }: { settings: ApiSettings; model: string; messages: Array<Record<string, unknown>>; onChunk: (chunk: string) => void; }) {
  const response = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: settings.apiKey, baseUrl: settings.baseUrl, model, messages }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || '代理请求失败。');
  }
  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8');
  if (!reader) throw new Error('流式响应不可用。');
  let buffer = '';
  let finalText = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      const payload = JSON.parse(data);
      const delta = payload?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        finalText += delta;
        onChunk(delta);
      }
    }
  }
  return finalText;
}

async function callProxyWithFallback({ settings, model, messages, onChunk }: { settings: ApiSettings; model: string; messages: Array<Record<string, unknown>>; onChunk: (chunk: string) => void; }) {
  try {
    return await callProxyStream({ settings, model, messages, onChunk });
  } catch (error) {
    const message = getErrorMessage(error);
    const shouldFallback =
      message.includes('代理请求失败') ||
      message.includes('流式响应不可用') ||
      message.includes('Cannot POST /api/chat-stream');

    if (!shouldFallback) {
      throw error;
    }

    const fallback = await callProxySafe({ settings, model, messages });
    if (fallback.content) {
      onChunk(fallback.content);
    }
    return fallback.content;
  }
}

async function callProxySafe({ settings, model, messages }: { settings: ApiSettings; model: string; messages: Array<Record<string, unknown>> }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: settings.apiKey, baseUrl: settings.baseUrl, model, messages }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || '代理请求失败。');
  }

  return {
    content: typeof payload.content === 'string' ? payload.content : '',
    raw: payload,
  };
}

export default App;
