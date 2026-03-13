"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";

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

// テキスト中の変更箇所をハイライト付きで表示
function HighlightedText({ text, changes }: { text: string; changes: CorrectedUtterance["changes"] }) {
  if (!changes || changes.length === 0) {
    return <span>{text}</span>;
  }

  // 変更箇所を見つけてハイライト
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

  // パーツが生成できなかった場合はそのまま表示
  if (parts.length === 0) return <span>{text}</span>;

  return (
    <span>
      {parts.map((p, i) =>
        p.change ? (
          <span
            key={i}
            className="relative cursor-help"
            style={{
              backgroundColor: "#FEF9C3",
              borderBottom: "2px dotted #D97706",
            }}
            title={`変更前: ${p.change.original}\n理由: ${p.change.reason}`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
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

  useEffect(() => {
    Promise.all([
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
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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

  const handleGenerateMinutes = async () => {
    setGeneratingMinutes(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/minutes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "生成に失敗しました");
      }
      const m = await res.json();
      setMinutes(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : "エラー");
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
    const blob = new Blob([minutes.content + footer], { type: "text/markdown" });
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
        <a href="/" className="text-blue-600 hover:underline mt-2 inline-block">トップに戻る</a>
      </div>
    );
  }

  const speakers = data.speakers || [];
  const corrected = data.correctedUtterances;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">{data.title}</h1>

        {/* メタ情報 */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
          <span>話者数: {data.speakerCount ?? "-"}</span>
          <span>発言数: {data.utteranceCount ?? "-"}</span>
          {data.durationSeconds && <span>音声時間: {formatTimestamp(data.durationSeconds)}</span>}
          {data.processingTimeMs && <span>処理時間: {(data.processingTimeMs / 1000).toFixed(1)}秒</span>}
        </div>

        {/* 話者マッピング */}
        {speakers.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">話者の名前を設定</h2>
            <div className="space-y-3">
              {speakers.map((speaker) => {
                const color = getSpeakerColor(speaker, speakers);
                return (
                  <div key={speaker} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color.border }} />
                    <span className="text-sm text-gray-600 w-24 shrink-0">{speaker}</span>
                    <input
                      type="text"
                      value={speakerMapping[speaker] || ""}
                      onChange={(e) => setSpeakerMapping((prev) => ({ ...prev, [speaker]: e.target.value }))}
                      placeholder="名前を入力"
                      className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleSaveMapping} disabled={savingMapping} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {savingMapping ? "保存中..." : "名前を保存する"}
              </button>
              {mappingSaved && <span className="text-sm text-green-600">保存しました</span>}
            </div>
          </div>
        )}

        {/* 清書サマリー + 切替ボタン */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
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
          {data.correctionSummary && (
            <span className="text-sm text-gray-500">{data.correctionSummary}</span>
          )}
        </div>

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
                      <span className="text-sm font-semibold" style={{ color: "#111827" }}>
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

        {/* 議事録生成セクション */}
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
                元の文字起こしデータは上部で確認できます。
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
                        ダウンロード
                      </button>
                      <button
                        onClick={handleGenerateMinutes}
                        className="text-sm border border-orange-300 text-orange-700 px-3 py-1 rounded hover:bg-orange-50"
                      >
                        再生成する
                      </button>
                    </>
                  )}
                </div>
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
                  <ReactMarkdown>{minutes.content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <a href="/" className="text-blue-600 hover:underline">新しい文字起こしを作成</a>
        </div>
      </div>
    </div>
  );
}
