"use client";

import { useState } from "react";
import {
  TranscriptionData,
  CorrectedUtterance,
  getSpeakerColor,
  getSpeakerLabel,
  formatTimestamp,
  TextWithLineBreaks,
} from "./utils";

function HighlightedText({ text, changes }: { text: string; changes: CorrectedUtterance["changes"] }) {
  if (!changes || changes.length === 0) {
    return (
      <span>
        <TextWithLineBreaks>{text}</TextWithLineBreaks>
      </span>
    );
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

  if (parts.length === 0)
    return (
      <span>
        <TextWithLineBreaks>{text}</TextWithLineBreaks>
      </span>
    );

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
          <span key={i}>
            <TextWithLineBreaks>{p.text}</TextWithLineBreaks>
          </span>
        )
      )}
    </span>
  );
}

interface UtteranceTabProps {
  data: TranscriptionData;
  setData: (d: TranscriptionData) => void;
  speakerMapping: Record<string, string>;
  showConfirm: (title: string, message: string, variant?: "primary" | "danger") => Promise<boolean>;
  showAlert: (title: string, message: string) => Promise<boolean>;
  fetchData: () => Promise<void>;
}

export default function UtteranceTab({ data, setData, speakerMapping, showConfirm, showAlert, fetchData }: UtteranceTabProps) {
  const id = data.id;
  const speakers = data.speakers || [];
  const corrected = data.correctedUtterances;
  const correctionFailed = data.correctionSummary === "清書処理でエラーが発生しました";

  const [showOriginal, setShowOriginal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [correcting, setCorrecting] = useState(false);

  const handleSaveUtterance = async (index: number) => {
    const res = await fetch(`/api/transcriptions/${id}/utterances/${index}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_text: editText }),
    });
    if (res.ok && data.correctedUtterances) {
      const updated = [...data.correctedUtterances];
      updated[index] = { ...updated[index], corrected_text: editText, changes: [] };
      setData({ ...data, correctedUtterances: updated });
    }
    setEditingIndex(null);
  };

  const handleReCorrect = async () => {
    const ok = await showConfirm(
      "清書やり直し",
      "清書をやり直します。現在の清書結果は上書きされます。よろしいですか？",
      "danger"
    );
    if (!ok) return;
    setCorrecting(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/correct`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("清書の再実行に失敗しました");

      for (let i = 0; i < 180; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/transcriptions/${id}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status === "completed" || statusData.status === "error") break;
        }
      }
      await fetchData();
    } catch (err) {
      await showAlert("エラー", err instanceof Error ? err.message : "もう一度お試しください");
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <div>
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
            className="text-sm border border-red-300 text-red-700 px-3 py-1 rounded hover:bg-red-50 disabled:opacity-50"
          >
            {correcting ? "清書中..." : "清書をやり直す"}
          </button>
        </div>
      </div>

      {correctionFailed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm text-yellow-800">
          清書処理でエラーが発生しました。原文のまま表示しています。「清書をやり直す」で再試行できます。
        </div>
      )}

      {correcting && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-blue-700">清書中...（通常30秒〜1分程度）</span>
        </div>
      )}

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
                      onClick={() => {
                        setEditingIndex(i);
                        setEditText(cu.corrected_text);
                      }}
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
                      <button
                        onClick={() => handleSaveUtterance(i)}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingIndex(null)}
                        className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50"
                      >
                        キャンセル
                      </button>
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
    </div>
  );
}
