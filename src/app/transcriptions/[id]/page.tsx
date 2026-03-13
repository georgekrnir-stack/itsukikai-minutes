"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: "audio_event";
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
  transcriptText: string | null;
  utterances: Utterance[] | null;
  speakers: string[] | null;
  speakerMapping: Record<string, string> | null;
  processingTimeMs: number | null;
  createdAt: string;
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
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getSpeakerLabel(
  speakerId: string,
  speakerMapping: Record<string, string> | null
): string {
  if (speakerMapping && speakerMapping[speakerId]) {
    return speakerMapping[speakerId];
  }
  return speakerId;
}

export default function TranscriptionPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<TranscriptionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Speaker mapping state
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({});
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/transcriptions/${id}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        if (d.speakerMapping) {
          setSpeakerMapping(d.speakerMapping);
        }
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
        <a href="/" className="text-blue-600 hover:underline mt-2 inline-block">
          トップに戻る
        </a>
      </div>
    );
  }

  const speakers = data.speakers || [];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold mb-2">{data.title}</h1>

        {/* メタ情報 */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
          <span>話者数: {data.speakerCount ?? "-"}</span>
          <span>発言ブロック数: {data.utteranceCount ?? "-"}</span>
          {data.durationSeconds && (
            <span>音声時間: {formatTimestamp(data.durationSeconds)}</span>
          )}
          {data.processingTimeMs && (
            <span>処理時間: {(data.processingTimeMs / 1000).toFixed(1)}秒</span>
          )}
          <span>
            ファイル: {data.originalFilename} (
            {(data.fileSize / 1024 / 1024).toFixed(1)} MB)
          </span>
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
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color.border }}
                    />
                    <span className="text-sm text-gray-600 w-24 shrink-0">
                      {speaker}
                    </span>
                    <input
                      type="text"
                      value={speakerMapping[speaker] || ""}
                      onChange={(e) =>
                        setSpeakerMapping((prev) => ({
                          ...prev,
                          [speaker]: e.target.value,
                        }))
                      }
                      placeholder="名前を入力"
                      className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSaveMapping}
                disabled={savingMapping}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {savingMapping ? "保存中..." : "名前を保存する"}
              </button>
              {mappingSaved && (
                <span className="text-sm text-green-600">保存しました</span>
              )}
            </div>
          </div>
        )}

        {/* Utterances */}
        <div className="bg-white rounded-lg shadow p-6 space-y-2">
          {data.utterances && data.utterances.length > 0 ? (
            data.utterances.map((u, i) => {
              const speakerId = u.speaker_id || "unknown";
              const color = getSpeakerColor(speakerId, speakers);
              const label = getSpeakerLabel(speakerId, speakerMapping);

              return (
                <div
                  key={i}
                  className="rounded-md px-4 py-3"
                  style={{
                    backgroundColor: color.bg,
                    borderLeft: `3px solid ${color.border}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-mono">
                      [{formatTimestamp(u.start)}]
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: color.text }}
                    >
                      {u.type === "audio_event" ? "[event]" : label}
                    </span>
                  </div>
                  <p className="text-gray-800 text-sm leading-relaxed">
                    {u.text}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="text-gray-500">発言データがありません</p>
          )}
        </div>

        <div className="mt-6">
          <a href="/" className="text-blue-600 hover:underline">
            新しい文字起こしを作成
          </a>
        </div>
      </div>
    </div>
  );
}
