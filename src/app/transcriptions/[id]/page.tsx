"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

interface CorrectedUtterance {
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

interface TranscriptionData {
  id: string;
  title: string;
  category: string | null;
  status: string;
  originalFilename: string;
  fileSize: number;
  durationSeconds: number | null;
  speakerCount: number | null;
  utteranceCount: number | null;
  languageCode: string | null;
  utterances: Utterance[] | null;
  speakers: string[] | null;
  speakerMapping: Record<string, string> | null;
  correctedUtterances: CorrectedUtterance[] | null;
  correctionSummary: string | null;
  errorMessage: string | null;
  processingTimeMs: number | null;
  createdAt: string;
}

interface MinutesData {
  id: string;
  content: string;
  isEdited: boolean;
}

const SPEAKER_COLORS = [
  { bg: "#EEF2FF", border: "#818CF8", text: "#4338CA" },
  { bg: "#ECFDF5", border: "#6EE7B7", text: "#065F46" },
  { bg: "#FFF7ED", border: "#FDBA74", text: "#9A3412" },
  { bg: "#FDF2F8", border: "#F9A8D4", text: "#9D174D" },
  { bg: "#F0F9FF", border: "#7DD3FC", text: "#075985" },
  { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E" },
  { bg: "#F5F3FF", border: "#C4B5FD", text: "#5B21B6" },
  { bg: "#F0FDFA", border: "#5EEAD4", text: "#115E59" },
];

function getSpeakerColor(speakerId: string, speakers: string[]) {
  const index = speakers.indexOf(speakerId);
  if (index < 0) return SPEAKER_COLORS[0];
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getSpeakerLabel(speakerId: string, mapping: Record<string, string> | null): string {
  if (mapping && mapping[speakerId]) return mapping[speakerId];
  return speakerId;
}

// 「。」の後に改行を挿入して読みやすくする（末尾の「。」は除く）
function splitBySentence(text: string): string[] {
  return text.split(/(?<=。)(?!$)/);
}

function TextWithLineBreaks({ children }: { children: string }) {
  const sentences = splitBySentence(children);
  if (sentences.length <= 1) return <>{children}</>;
  return (
    <>
      {sentences.map((s, i) => (
        <span key={i} className={i < sentences.length - 1 ? "block mb-1.5" : ""}>
          {s}
        </span>
      ))}
    </>
  );
}

// 議事録の [[refs:0,1,5]] を折りたたみUIに変換するコンポーネント
function RefCollapsible({
  indices,
  utterances,
  correctedUtterances,
  speakerMapping,
  speakers,
}: {
  indices: number[];
  utterances: Utterance[];
  correctedUtterances: CorrectedUtterance[] | null;
  speakerMapping: Record<string, string> | null;
  speakers: string[];
}) {
  const [open, setOpen] = useState(false);
  const validIndices = indices.filter((i) => i >= 0 && i < utterances.length);
  if (validIndices.length === 0) return null;

  return (
    <span className="inline-block align-top">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-blue-600 hover:text-blue-800 hover:underline ml-1 cursor-pointer"
      >
        {open ? "▼根拠" : "▶根拠"}
      </button>
      {open && (
        <div className="mt-1 mb-2 border border-gray-200 rounded-md bg-gray-50 overflow-hidden text-sm">
          {validIndices.map((idx) => {
            const u = utterances[idx];
            const speakerId = u.speaker_id || "unknown";
            const color = getSpeakerColor(speakerId, speakers);
            const label = speakerMapping?.[speakerId] || speakerId;
            const cu = correctedUtterances?.[idx];
            const text = cu ? cu.corrected_text : u.text;
            return (
              <div
                key={idx}
                className="px-3 py-2 border-b border-gray-100 last:border-b-0"
                style={{ borderLeft: `3px solid ${color.border}` }}
              >
                <span className="text-xs text-gray-400 font-mono mr-2">
                  [{formatTimestamp(u.start)}]
                </span>
                <span className="text-xs font-semibold mr-2" style={{ color: color.text }}>
                  {label}:
                </span>
                <span className="text-gray-700">{text}</span>
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

function MinutesWithRefs({
  content,
  utterances,
  correctedUtterances,
  speakerMapping,
  speakers,
}: {
  content: string;
  utterances: Utterance[];
  correctedUtterances: CorrectedUtterance[] | null;
  speakerMapping: Record<string, string> | null;
  speakers: string[];
}) {
  // [[refs:0,1,5]] パターンでcontentを分割
  const refPattern = /\[\[refs:([\d,]+)\]\]/g;
  const segments: { type: "text" | "refs"; value: string; indices?: number[] }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = refPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    const indices = match[1].split(",").map(Number);
    segments.push({ type: "refs", value: match[0], indices });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  // refsが1つもなければ通常のReactMarkdown
  if (segments.every((s) => s.type === "text")) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "refs" ? (
          <RefCollapsible
            key={i}
            indices={seg.indices!}
            utterances={utterances}
            correctedUtterances={correctedUtterances}
            speakerMapping={speakerMapping}
            speakers={speakers}
          />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
            {seg.value}
          </ReactMarkdown>
        )
      )}
    </>
  );
}

function HighlightedText({ text, changes }: { text: string; changes: CorrectedUtterance["changes"] }) {
  if (!changes || changes.length === 0) {
    return <span><TextWithLineBreaks>{text}</TextWithLineBreaks></span>;
  }

  const parts: { text: string; change?: CorrectedUtterance["changes"][0] }[] = [];
  let remaining = text;

  for (const change of changes) {
    const idx = remaining.indexOf(change.corrected);
    if (idx >= 0) {
      if (idx > 0) parts.push({ text: remaining.slice(0, idx) });
      parts.push({ text: change.corrected, change });
      remaining = remaining.slice(idx + change.corrected.length);
    }
  }
  if (remaining) parts.push({ text: remaining });

  if (parts.length === 0) return <span><TextWithLineBreaks>{text}</TextWithLineBreaks></span>;

  return (
    <span>
      {parts.map((p, i) =>
        p.change ? (
          <span
            key={i}
            className="relative cursor-help group/tip"
            style={{
              backgroundColor: "#FEF9C3",
              borderBottom: "2px dotted #D97706",
            }}
          >
            <TextWithLineBreaks>{p.text}</TextWithLineBreaks>
            <span className="hidden group-hover/tip:block absolute bottom-full left-0 mb-1 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg whitespace-nowrap z-50">
              <span className="block">変更前: {p.change.original}</span>
              <span className="block text-gray-300">理由: {p.change.reason}</span>
            </span>
          </span>
        ) : (
          <span key={i}><TextWithLineBreaks>{p.text}</TextWithLineBreaks></span>
        )
      )}
    </span>
  );
}

export default function TranscriptionPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<TranscriptionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);

  const [showOriginal, setShowOriginal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // 議事録
  const [minutes, setMinutes] = useState<MinutesData | null>(null);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesEditText, setMinutesEditText] = useState("");

  // マージ
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  // AI話者分析
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    nameSuggestions: Record<string, { name: string; reason: string }>;
    mergeGroups: { speakerIds: string[]; reason: string }[];
  } | null>(null);
  const [mergeGroupPreview, setMergeGroupPreview] = useState<string | null>(null);

  // 話者発言プレビュー
  const [previewSpeaker, setPreviewSpeaker] = useState<string | null>(null);

  // 再実行
  const [correcting, setCorrecting] = useState(false);

  const fetchData = () => {
    return Promise.all([
      fetch(`/api/transcriptions/${id}`).then((r) => r.json()),
      fetch(`/api/transcriptions/${id}/minutes`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([d, m]) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        if (d.speakerMapping) setSpeakerMapping(d.speakerMapping);
        if (m) setMinutes(m);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [id]);

  // 話者ごとの発言件数を計算
  const utteranceCounts: Record<string, number> = {};
  if (data?.utterances) {
    for (const u of data.utterances) {
      const sid = u.speaker_id || "unknown";
      utteranceCounts[sid] = (utteranceCounts[sid] || 0) + 1;
    }
  }

  const handleMergeSpeakers = async (sourceSpeakerId: string, targetSpeakerId: string) => {
    const sourceLabel = getSpeakerLabel(sourceSpeakerId, speakerMapping);
    const targetLabel = getSpeakerLabel(targetSpeakerId, speakerMapping);
    const count = utteranceCounts[sourceSpeakerId] || 0;
    if (!confirm(`${sourceLabel}の${count}件の発言を${targetLabel}に統合します。この操作は元に戻せません。`)) return;

    setMerging(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/merge-speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSpeakerId, mergeSpeakerIds: [sourceSpeakerId] }),
      });
      if (!res.ok) throw new Error("マージに失敗しました");
      const updated = await res.json();
      setData(updated);
      if (updated.speakerMapping) setSpeakerMapping(updated.speakerMapping);
      setMergeSource(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "マージエラー");
    } finally {
      setMerging(false);
    }
  };

  const handleSaveMapping = async () => {
    setSavingMapping(true);
    setMappingSaved(false);
    try {
      const res = await fetch(`/api/transcriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerMapping }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      setData((prev) => (prev ? { ...prev, speakerMapping } : prev));
      const minutesRes = await fetch(`/api/transcriptions/${id}/minutes`);
      if (minutesRes.ok) {
        const updatedMinutes = await minutesRes.json();
        setMinutes(updatedMinutes);
      }
      setMappingSaved(true);
      setTimeout(() => setMappingSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存エラー");
    } finally {
      setSavingMapping(false);
    }
  };

  const handleSaveUtterance = async (index: number) => {
    const res = await fetch(`/api/transcriptions/${id}/utterances/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_text: editText }),
    });
    if (res.ok && data?.correctedUtterances) {
      const updated = [...data.correctedUtterances];
      updated[index] = { ...updated[index], corrected_text: editText, changes: [] };
      setData({ ...data, correctedUtterances: updated });
    }
    setEditingIndex(null);
  };

  // 清書やり直し
  const handleReCorrect = async () => {
    if (!confirm("清書をやり直します。現在の清書結果は上書きされます。よろしいですか？")) return;
    setCorrecting(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/correct`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("清書の再実行に失敗しました");

      // ポーリングで完了を待つ（最大15分）
      const poll = async () => {
        for (let i = 0; i < 180; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const statusRes = await fetch(`/api/transcriptions/${id}/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === "completed" || statusData.status === "error") {
              break;
            }
          }
        }
      };
      await poll();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "もう一度お試しください");
    } finally {
      setCorrecting(false);
    }
  };

  const handleAnalyzeSpeakers = async () => {
    setAnalyzing(true);
    setSuggestions(null);
    try {
      const res = await fetch(`/api/transcriptions/${id}/analyze-speakers`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "分析に失敗しました");
      }
      const result = await res.json();
      setSuggestions(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAllSuggestions = async () => {
    if (!suggestions) return;
    if (!confirm("全ての提案（名前設定＋マージ）を適用します。マージは元に戻せません。よろしいですか？")) return;

    // 1. 名前を全てセット
    const newMapping = { ...speakerMapping };
    for (const [sid, info] of Object.entries(suggestions.nameSuggestions)) {
      if (speakers.includes(sid)) {
        newMapping[sid] = info.name;
      }
    }
    setSpeakerMapping(newMapping);

    // 名前を保存
    try {
      const res = await fetch(`/api/transcriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerMapping: newMapping }),
      });
      if (!res.ok) throw new Error("名前の保存に失敗しました");
      setData((prev) => (prev ? { ...prev, speakerMapping: newMapping } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : "名前の保存に失敗しました");
      return;
    }

    // 2. マージグループを順次実行
    for (const group of suggestions.mergeGroups) {
      const validIds = group.speakerIds.filter((sid) => speakers.includes(sid));
      if (validIds.length < 2) continue;

      // 発言数最多をtargetに
      let targetId = validIds[0];
      let maxCount = utteranceCounts[targetId] || 0;
      for (const sid of validIds) {
        if ((utteranceCounts[sid] || 0) > maxCount) {
          maxCount = utteranceCounts[sid] || 0;
          targetId = sid;
        }
      }
      const mergeIds = validIds.filter((sid) => sid !== targetId);

      try {
        const res = await fetch(`/api/transcriptions/${id}/merge-speakers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetSpeakerId: targetId, mergeSpeakerIds: mergeIds }),
        });
        if (!res.ok) throw new Error("マージに失敗しました");
        const updated = await res.json();
        setData(updated);
        if (updated.speakerMapping) setSpeakerMapping(updated.speakerMapping);
      } catch (err) {
        alert(err instanceof Error ? err.message : "マージエラー");
        break;
      }
    }

    setSuggestions(null);
    await fetchData();
  };

  const handleMergeGroup = async (group: { speakerIds: string[]; reason: string }) => {
    const validIds = group.speakerIds.filter((sid) => speakers.includes(sid));
    if (validIds.length < 2) return;

    let targetId = validIds[0];
    let maxCount = utteranceCounts[targetId] || 0;
    for (const sid of validIds) {
      if ((utteranceCounts[sid] || 0) > maxCount) {
        maxCount = utteranceCounts[sid] || 0;
        targetId = sid;
      }
    }
    const mergeIds = validIds.filter((sid) => sid !== targetId);
    const targetLabel = getSpeakerLabel(targetId, speakerMapping);

    if (!confirm(`${mergeIds.map((s) => getSpeakerLabel(s, speakerMapping)).join("、")}を${targetLabel}に統合します。この操作は元に戻せません。`)) return;

    setMerging(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/merge-speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSpeakerId: targetId, mergeSpeakerIds: mergeIds }),
      });
      if (!res.ok) throw new Error("マージに失敗しました");
      const updated = await res.json();
      setData(updated);
      if (updated.speakerMapping) setSpeakerMapping(updated.speakerMapping);
      // このグループを提案から除去
      if (suggestions) {
        setSuggestions({
          ...suggestions,
          mergeGroups: suggestions.mergeGroups.filter((g) => g !== group),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "マージエラー");
    } finally {
      setMerging(false);
    }
  };

  const handleGenerateMinutes = async () => {
    if (minutes) {
      const msg = minutes.isEdited
        ? "手動で編集した内容が失われます。議事録を再生成してよろしいですか？"
        : "現在の議事録が上書きされます。よろしいですか？";
      if (!confirm(msg)) return;
    }
    setGeneratingMinutes(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/minutes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "議事録の生成に失敗しました。もう一度お試しください。");
      }
      const m = await res.json();
      setMinutes(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : "議事録の生成に失敗しました。もう一度お試しください。");
    } finally {
      setGeneratingMinutes(false);
    }
  };

  const handleSaveMinutes = async () => {
    const res = await fetch(`/api/transcriptions/${id}/minutes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: minutesEditText }),
    });
    if (res.ok) {
      const m = await res.json();
      setMinutes(m);
      setEditingMinutes(false);
    }
  };

  const handleDownloadMinutes = () => {
    if (!minutes || !data) return;
    const footer =
      "\n\n---\n\nこの議事録はAIにより自動生成されたものです。内容の正確性をご確認の上ご利用ください。";
    // ダウンロード時は [[refs:...]] を除去
    const cleanContent = minutes.content.replace(/\s*\[\[refs:[\d,]+\]\]/g, "");
    const blob = new Blob([cleanContent + footer], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title}_議事録.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">エラー: {error || "データが見つかりません"}</p>
        <a href="/" className="text-blue-600 hover:underline mt-2 inline-block">ダッシュボードに戻る</a>
      </div>
    );
  }

  const speakers = data.speakers || [];
  const corrected = data.correctedUtterances;
  const correctionFailed = data.correctionSummary === "清書処理でエラーが発生しました";

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        {/* ダッシュボードに戻る */}
        <a href="/" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
          &larr; ダッシュボードに戻る
        </a>

        <h1 className="text-2xl font-bold mb-2">{data.title}</h1>

        {/* メタ情報 */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
          {data.category && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">{data.category}</span>
          )}
          <span>{new Date(data.createdAt).toLocaleDateString("ja-JP")}</span>
          <span>話者数: {data.speakerCount ?? "-"}</span>
          <span>発言数: {data.utteranceCount ?? "-"}</span>
          {data.durationSeconds && <span>音声時間: {formatTimestamp(data.durationSeconds)}</span>}
          {data.processingTimeMs && <span>処理時間: {(data.processingTimeMs / 1000).toFixed(1)}秒</span>}
        </div>

        {/* エラー表示 */}
        {data.status === "error" && data.errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium">エラーが発生しました</p>
            <p className="text-red-600 text-sm mt-1">{data.errorMessage}</p>
          </div>
        )}

        {/* 話者マッピング */}
        {speakers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">話者の名前を設定</h2>
              {speakers.length >= 2 && (
                <button
                  onClick={handleAnalyzeSpeakers}
                  disabled={analyzing}
                  className="text-sm border border-purple-300 text-purple-700 px-3 py-1 rounded hover:bg-purple-50 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {analyzing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                      分析中...
                    </>
                  ) : (
                    "AIで話者を分析"
                  )}
                </button>
              )}
            </div>
            <div className="space-y-3">
              {speakers.map((speaker) => {
                const color = getSpeakerColor(speaker, speakers);
                const count = utteranceCounts[speaker] || 0;
                return (
                  <div key={speaker} className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color.border }} />
                      <span className="text-sm text-gray-600 w-24 shrink-0">{speaker}</span>
                      <button
                        onClick={() => setPreviewSpeaker(previewSpeaker === speaker ? null : speaker)}
                        className={`text-xs px-2 py-0.5 rounded-full shrink-0 cursor-pointer hover:bg-gray-200 transition-colors ${
                          previewSpeaker === speaker ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                        }`}
                        title="発言を表示"
                      >
                        {count}件 {previewSpeaker === speaker ? "▲" : "▼"}
                      </button>
                      <input
                        type="text"
                        value={speakerMapping[speaker] || ""}
                        onChange={(e) => setSpeakerMapping((prev) => ({ ...prev, [speaker]: e.target.value }))}
                        placeholder="名前を入力"
                        className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
                      />
                      {speakers.length > 1 && (
                        mergeSource === speaker ? (
                          <select
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) handleMergeSpeakers(speaker, e.target.value);
                            }}
                            disabled={merging}
                          >
                            <option value="">統合先を選択...</option>
                            {speakers.filter((s) => s !== speaker).map((s) => (
                              <option key={s} value={s}>
                                {getSpeakerLabel(s, speakerMapping)} ({utteranceCounts[s] || 0}件)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setMergeSource(mergeSource === speaker ? null : speaker)}
                            disabled={merging}
                            className="text-sm border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50 shrink-0"
                          >
                            マージ
                          </button>
                        )
                      )}
                    </div>
                    {mergeSource === speaker && (
                      <button
                        onClick={() => setMergeSource(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 ml-10"
                      >
                        キャンセル
                      </button>
                    )}
                    {suggestions?.nameSuggestions[speaker] && !speakerMapping[speaker] && (
                      <div className="ml-10 flex items-center gap-2">
                        <span className="text-xs text-purple-500">
                          AI提案: {suggestions.nameSuggestions[speaker].name}
                          <span className="text-gray-400 ml-1">({suggestions.nameSuggestions[speaker].reason})</span>
                        </span>
                        <button
                          onClick={() => setSpeakerMapping((prev) => ({ ...prev, [speaker]: suggestions.nameSuggestions[speaker].name }))}
                          className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-100"
                        >
                          採用
                        </button>
                      </div>
                    )}
                    {previewSpeaker === speaker && data?.utterances && (
                      <div className="ml-6 mt-1 border border-gray-200 rounded bg-gray-50 max-h-48 overflow-y-auto">
                        {data.utterances.map((u, i) => {
                          if ((u.speaker_id || "unknown") !== speaker) return null;
                          const cu = corrected?.[i];
                          const text = cu ? cu.corrected_text : u.text;
                          return (
                            <div key={i} className="px-3 py-1.5 text-xs border-b border-gray-100 last:border-b-0">
                              <span className="text-gray-400 font-mono mr-2">[{formatTimestamp(u.start)}]</span>
                              <span className="text-gray-700">{text.length > 80 ? text.slice(0, 80) + "…" : text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI分析マージグループ */}
            {suggestions && suggestions.mergeGroups.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-semibold text-purple-700">マージ候補（AI提案）</h3>
                {suggestions.mergeGroups.map((group, gi) => {
                  const validIds = group.speakerIds.filter((sid) => speakers.includes(sid));
                  if (validIds.length < 2) return null;
                  return (
                    <div key={gi} className="border-2 border-dashed border-purple-300 rounded-lg p-3 bg-purple-50/50">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {validIds.map((sid) => {
                          const color = getSpeakerColor(sid, speakers);
                          const previewKey = `merge-${gi}-${sid}`;
                          return (
                            <span key={sid} className="inline-flex flex-col">
                              <span className="inline-flex items-center gap-1 text-sm bg-white border border-gray-200 rounded px-2 py-0.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.border }} />
                                {getSpeakerLabel(sid, speakerMapping)}
                                <button
                                  onClick={() => setMergeGroupPreview(mergeGroupPreview === previewKey ? null : previewKey)}
                                  className={`text-xs px-1 rounded cursor-pointer hover:bg-gray-100 ${
                                    mergeGroupPreview === previewKey ? "text-blue-600" : "text-gray-400"
                                  }`}
                                >
                                  {utteranceCounts[sid] || 0}件 {mergeGroupPreview === previewKey ? "▲" : "▼"}
                                </button>
                              </span>
                              {mergeGroupPreview === previewKey && data?.utterances && (
                                <div className="mt-1 border border-gray-200 rounded bg-white max-h-40 overflow-y-auto w-72">
                                  {data.utterances.map((u, ui) => {
                                    if ((u.speaker_id || "unknown") !== sid) return null;
                                    const cu = corrected?.[ui];
                                    const text = cu ? cu.corrected_text : u.text;
                                    return (
                                      <div key={ui} className="px-2 py-1 text-xs border-b border-gray-50 last:border-b-0">
                                        <span className="text-gray-400 font-mono mr-1">[{formatTimestamp(u.start)}]</span>
                                        <span className="text-gray-700">{text.length > 80 ? text.slice(0, 80) + "…" : text}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{group.reason}</p>
                      <button
                        onClick={() => handleMergeGroup(group)}
                        disabled={merging}
                        className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        このグループをマージ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 提案を全て適用 */}
            {suggestions && (
              <div className="mt-4 pt-3 border-t border-purple-200">
                <button
                  onClick={handleApplyAllSuggestions}
                  disabled={merging}
                  className="text-sm bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  提案を全て適用
                </button>
                <button
                  onClick={() => setSuggestions(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 ml-3"
                >
                  提案を閉じる
                </button>
              </div>
            )}

            {/* 同名検出ヒント */}
            {(() => {
              const nameMap: Record<string, string[]> = {};
              for (const s of speakers) {
                const name = speakerMapping[s]?.trim();
                if (name) {
                  if (!nameMap[name]) nameMap[name] = [];
                  nameMap[name].push(s);
                }
              }
              const dupes = Object.entries(nameMap).filter(([, ids]) => ids.length > 1);
              if (dupes.length === 0) return null;
              return (
                <div className="mt-3 space-y-2">
                  {dupes.map(([name, ids]) => (
                    <div key={name} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-800">
                      同じ名前「{name}」の話者が{ids.length}人います。マージしますか？
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSaveMapping} disabled={savingMapping} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingMapping ? "保存中..." : "名前を保存する"}
              </button>
              {mappingSaved && <span className="text-sm text-green-600">保存しました</span>}
            </div>
          </div>
        )}

        {/* 清書セクションヘッダ */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">文字起こし結果</h2>
            {corrected && (
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className={`px-3 py-1 rounded text-sm border ${
                  showOriginal ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-blue-50 border-blue-300 text-blue-700"
                }`}
              >
                {showOriginal ? "清書済みを表示" : "原文を表示"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {data.correctionSummary && !correctionFailed && (
              <span className="text-sm text-gray-500">{data.correctionSummary}</span>
            )}
            <button
              onClick={handleReCorrect}
              disabled={correcting}
              className="text-sm border border-blue-300 text-blue-700 px-3 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
            >
              {correcting ? "清書中..." : "清書をやり直す"}
            </button>
          </div>
        </div>

        {/* 清書エラー通知 */}
        {correctionFailed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm text-yellow-800">
            清書処理でエラーが発生しました。原文のまま表示しています。「清書をやり直す」で再試行できます。
          </div>
        )}

        {/* 清書中ローディング */}
        {correcting && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-700">清書中...（通常30秒〜1分程度）</span>
          </div>
        )}

        {/* Utterances */}
        <div className="bg-white rounded-lg shadow p-6 space-y-2">
          {data.utterances && data.utterances.length > 0 ? (
            data.utterances.map((u, i) => {
              const speakerId = u.speaker_id || "unknown";
              const color = getSpeakerColor(speakerId, speakers);
              const label = getSpeakerLabel(speakerId, speakerMapping);
              const cu = corrected?.[i];
              const displayText = showOriginal || !cu ? u.text : cu.corrected_text;
              const changes = showOriginal || !cu ? [] : cu.changes;
              const isEditing = editingIndex === i;

              return (
                <div
                  key={i}
                  className="rounded-md px-4 py-3 relative group"
                  style={{ backgroundColor: color.bg, borderLeft: `3px solid ${color.border}` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-mono">[{formatTimestamp(u.start)}]</span>
                      <span className="text-sm font-semibold" style={{ color: color.text }}>
                        {u.type === "audio_event" ? "[event]" : label}
                      </span>
                    </div>
                    {cu && !showOriginal && !isEditing && (
                      <button
                        onClick={() => { setEditingIndex(i); setEditText(cu.corrected_text); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-sm transition-opacity"
                        title="編集"
                      >
                        &#9998;
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full border border-gray-300 rounded p-2 text-sm"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={() => handleSaveUtterance(i)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">保存</button>
                        <button onClick={() => setEditingIndex(null)} className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300">キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-800 text-sm leading-relaxed">
                      <HighlightedText text={displayText} changes={changes} />
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-gray-500">発言データがありません</p>
          )}
        </div>

        {/* 議事録セクション */}
        <div className="mt-8 border-t pt-8">
          {!minutes && !generatingMinutes && (
            <div className="text-center">
              <button
                onClick={handleGenerateMinutes}
                className="bg-green-600 text-white px-6 py-3 rounded-lg text-lg hover:bg-green-700"
              >
                議事録を生成する
              </button>
              <p className="text-sm text-gray-500 mt-3">
                この議事録はAIが自動生成します。
                内容の正確性を必ず確認し、必要に応じて編集してからご利用ください。
              </p>
            </div>
          )}

          {generatingMinutes && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-600">議事録を生成中...（通常30秒〜1分程度で完了します）</p>
            </div>
          )}

          {minutes && !generatingMinutes && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">議事録</h2>
                <div className="flex gap-2">
                  {!editingMinutes && (
                    <>
                      <button
                        onClick={() => { setEditingMinutes(true); setMinutesEditText(minutes.content); }}
                        className="text-sm border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
                      >
                        編集
                      </button>
                      <button
                        onClick={handleDownloadMinutes}
                        className="text-sm border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
                      >
                        テキストでダウンロード
                      </button>
                      <button
                        onClick={handleGenerateMinutes}
                        className="text-sm border border-orange-300 text-orange-700 px-3 py-1 rounded hover:bg-orange-50"
                      >
                        議事録を再生成する
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 mb-4">
                この議事録はAIが自動生成したものです。内容の正確性をご確認ください。
              </div>

              {editingMinutes ? (
                <div>
                  <textarea
                    value={minutesEditText}
                    onChange={(e) => setMinutesEditText(e.target.value)}
                    className="w-full border border-gray-300 rounded p-4 text-sm font-mono"
                    rows={20}
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleSaveMinutes} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">保存</button>
                    <button onClick={() => setEditingMinutes(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">キャンセル</button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 prose prose-sm max-w-none">
                  <MinutesWithRefs
                    content={minutes.content}
                    utterances={data.utterances || []}
                    correctedUtterances={data.correctedUtterances || null}
                    speakerMapping={data.speakerMapping || null}
                    speakers={speakers}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
