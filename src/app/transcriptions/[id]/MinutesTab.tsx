"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  TranscriptionData,
  MinutesData,
  Utterance,
  CorrectedUtterance,
  getSpeakerColor,
  formatTimestamp,
} from "./utils";

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
                <span className="text-xs text-gray-400 font-mono mr-2">[{formatTimestamp(u.start)}]</span>
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

interface MinutesTabProps {
  data: TranscriptionData;
  speakerMapping: Record<string, string>;
  showConfirm: (title: string, message: string, variant?: "primary" | "danger") => Promise<boolean>;
  showAlert: (title: string, message: string) => Promise<boolean>;
}

export default function MinutesTab({ data, speakerMapping, showConfirm, showAlert }: MinutesTabProps) {
  const id = data.id;
  const speakers = data.speakers || [];

  const [minutes, setMinutes] = useState<MinutesData | null>(null);
  const [loadingMinutes, setLoadingMinutes] = useState(true);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesEditText, setMinutesEditText] = useState("");

  useEffect(() => {
    fetch(`/api/transcriptions/${id}/minutes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && m.id) setMinutes(m);
      })
      .finally(() => setLoadingMinutes(false));
  }, [id]);

  const handleGenerateMinutes = async () => {
    if (minutes) {
      const msg = minutes.isEdited
        ? "手動で編集した内容が失われます。議事録を再生成してよろしいですか？"
        : "現在の議事録が上書きされます。よろしいですか？";
      const ok = await showConfirm("議事録再生成", msg, "danger");
      if (!ok) return;
    }
    setGeneratingMinutes(true);
    try {
      const res = await fetch(`/api/transcriptions/${id}/minutes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok && res.status !== 202) {
        const err = await res.json();
        throw new Error(err.error || "議事録の生成に失敗しました。もう一度お試しください。");
      }

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const pollRes = await fetch(`/api/transcriptions/${id}/minutes`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === "ready" && pollData.id) {
              setMinutes(pollData);
              return;
            }
          }
        } catch {
          // ネットワークエラーは無視してリトライ
        }
      }
      throw new Error("議事録の生成がタイムアウトしました。ページを再読み込みしてください。");
    } catch (err) {
      await showAlert("エラー", err instanceof Error ? err.message : "議事録の生成に失敗しました。もう一度お試しください。");
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
    if (!minutes) return;
    const footer = "\n\n---\n\nこの議事録はAIにより自動生成されたものです。内容の正確性をご確認の上ご利用ください。";
    const cleanContent = minutes.content.replace(/\s*\[\[refs:[\d,]+\]\]/g, "");
    const blob = new Blob([cleanContent + footer], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.title}_議事録.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingMinutes) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">読み込み中...</span>
      </div>
    );
  }

  return (
    <div>
      {!minutes && !generatingMinutes && (
        <div className="text-center py-8">
          <button
            onClick={handleGenerateMinutes}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg hover:bg-blue-700"
          >
            議事録を生成する
          </button>
          <p className="text-sm text-gray-500 mt-3">
            この議事録はAIが自動生成します。内容の正確性を必ず確認し、必要に応じて編集してからご利用ください。
          </p>
        </div>
      )}

      {generatingMinutes && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
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
                    onClick={() => {
                      setEditingMinutes(true);
                      setMinutesEditText(minutes.content);
                    }}
                    className="text-sm border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50"
                  >
                    編集
                  </button>
                  <button
                    onClick={handleDownloadMinutes}
                    className="text-sm border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50"
                  >
                    テキストでダウンロード
                  </button>
                  <button
                    onClick={handleGenerateMinutes}
                    className="text-sm border border-red-300 text-red-700 px-3 py-1 rounded hover:bg-red-50"
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
                <button
                  onClick={handleSaveMinutes}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditingMinutes(false)}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 prose prose-sm max-w-none">
              <MinutesWithRefs
                content={minutes.content}
                utterances={data.utterances || []}
                correctedUtterances={data.correctedUtterances || null}
                speakerMapping={speakerMapping || null}
                speakers={speakers}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
