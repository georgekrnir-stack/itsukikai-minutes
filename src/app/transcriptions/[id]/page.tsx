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
  processingTimeMs: number | null;
  createdAt: string;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptionPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<TranscriptionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/transcriptions/${id}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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
          <span>ファイル: {data.originalFilename} ({(data.fileSize / 1024 / 1024).toFixed(1)} MB)</span>
        </div>

        {/* Utterances */}
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          {data.utterances && data.utterances.length > 0 ? (
            data.utterances.map((u, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs text-gray-400 w-12 shrink-0 pt-1 text-right">
                  {formatTimestamp(u.start)}
                </span>
                <div>
                  <span className="text-sm font-medium text-blue-700">
                    {u.type === "audio_event" ? "[event]" : u.speaker_id}
                  </span>
                  <span className="ml-2 text-gray-800">{u.text}</span>
                </div>
              </div>
            ))
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
