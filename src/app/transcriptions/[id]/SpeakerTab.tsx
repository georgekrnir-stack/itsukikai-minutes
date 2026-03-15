"use client";

import { useState } from "react";
import {
  TranscriptionData,
  CorrectedUtterance,
  getSpeakerColor,
  getSpeakerLabel,
  formatTimestamp,
} from "./utils";

interface SpeakerTabProps {
  data: TranscriptionData;
  setData: (d: TranscriptionData | ((prev: TranscriptionData | null) => TranscriptionData | null)) => void;
  speakerMapping: Record<string, string>;
  setSpeakerMapping: (fn: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  showConfirm: (title: string, message: string, variant?: "primary" | "danger") => Promise<boolean>;
  showAlert: (title: string, message: string) => Promise<boolean>;
  fetchData: () => Promise<void>;
}

export default function SpeakerTab({
  data,
  setData,
  speakerMapping,
  setSpeakerMapping,
  showConfirm,
  showAlert,
  fetchData,
}: SpeakerTabProps) {
  const id = data.id;
  const speakers = data.speakers || [];
  const corrected = data.correctedUtterances;

  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    nameSuggestions: Record<string, { name: string; reason: string }>;
    mergeGroups: { speakerIds: string[]; reason: string }[];
  } | null>(data.speakerSuggestions || null);
  const [mergeGroupPreview, setMergeGroupPreview] = useState<string | null>(null);
  const [previewSpeaker, setPreviewSpeaker] = useState<string | null>(null);

  // 話者ごとの発言件数
  const utteranceCounts: Record<string, number> = {};
  if (data.utterances) {
    for (const u of data.utterances) {
      const sid = u.speaker_id || "unknown";
      utteranceCounts[sid] = (utteranceCounts[sid] || 0) + 1;
    }
  }

  const handleMergeSpeakers = async (sourceSpeakerId: string, targetSpeakerId: string) => {
    const sourceLabel = getSpeakerLabel(sourceSpeakerId, speakerMapping);
    const targetLabel = getSpeakerLabel(targetSpeakerId, speakerMapping);
    const count = utteranceCounts[sourceSpeakerId] || 0;
    const ok = await showConfirm(
      "話者マージ",
      `${sourceLabel}の${count}件の発言を${targetLabel}に統合します。この操作は元に戻せません。`,
      "danger"
    );
    if (!ok) return;

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
      await showAlert("エラー", err instanceof Error ? err.message : "マージエラー");
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
      setData((prev: TranscriptionData | null) => (prev ? { ...prev, speakerMapping } : prev));
      setMappingSaved(true);
      setTimeout(() => setMappingSaved(false), 2000);
    } catch (err) {
      await showAlert("エラー", err instanceof Error ? err.message : "保存エラー");
    } finally {
      setSavingMapping(false);
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
      await showAlert("エラー", err instanceof Error ? err.message : "分析に失敗しました");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAllSuggestions = async () => {
    if (!suggestions) return;
    const ok = await showConfirm(
      "全提案を適用",
      "全ての提案（名前設定＋マージ）を適用します。マージは元に戻せません。よろしいですか？",
      "danger"
    );
    if (!ok) return;

    const newMapping = { ...speakerMapping };
    for (const [sid, info] of Object.entries(suggestions.nameSuggestions)) {
      if (speakers.includes(sid)) {
        newMapping[sid] = info.name;
      }
    }
    setSpeakerMapping(newMapping);

    try {
      const res = await fetch(`/api/transcriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerMapping: newMapping }),
      });
      if (!res.ok) throw new Error("名前の保存に失敗しました");
      setData((prev: TranscriptionData | null) => (prev ? { ...prev, speakerMapping: newMapping } : prev));
    } catch (err) {
      await showAlert("エラー", err instanceof Error ? err.message : "名前の保存に失敗しました");
      return;
    }

    for (const group of suggestions.mergeGroups) {
      const validIds = group.speakerIds.filter((sid) => speakers.includes(sid));
      if (validIds.length < 2) continue;

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
        await showAlert("エラー", err instanceof Error ? err.message : "マージエラー");
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

    const ok = await showConfirm(
      "グループマージ",
      `${mergeIds.map((s) => getSpeakerLabel(s, speakerMapping)).join("、")}を${targetLabel}に統合します。この操作は元に戻せません。`,
      "danger"
    );
    if (!ok) return;

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
      if (suggestions) {
        setSuggestions({
          ...suggestions,
          mergeGroups: suggestions.mergeGroups.filter((g) => g !== group),
        });
      }
    } catch (err) {
      await showAlert("エラー", err instanceof Error ? err.message : "マージエラー");
    } finally {
      setMerging(false);
    }
  };

  if (speakers.length === 0) {
    return <p className="text-gray-500 py-8 text-center">話者データがありません</p>;
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
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
                  onChange={(e) => setSpeakerMapping((prev: Record<string, string>) => ({ ...prev, [speaker]: e.target.value }))}
                  placeholder="名前を入力"
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1"
                />
                {speakers.length > 1 &&
                  (mergeSource === speaker ? (
                    <select
                      className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleMergeSpeakers(speaker, e.target.value);
                      }}
                      disabled={merging}
                    >
                      <option value="">統合先を選択...</option>
                      {speakers
                        .filter((s) => s !== speaker)
                        .map((s) => (
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
                  ))}
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
                    onClick={() =>
                      setSpeakerMapping((prev: Record<string, string>) => ({
                        ...prev,
                        [speaker]: suggestions.nameSuggestions[speaker].name,
                      }))
                    }
                    className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-100"
                  >
                    採用
                  </button>
                </div>
              )}
              {previewSpeaker === speaker && data.utterances && (
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
                        {mergeGroupPreview === previewKey && data.utterances && (
                          <div className="mt-1 border border-gray-200 rounded bg-white max-h-40 overflow-y-auto w-72">
                            {data.utterances.map((u, ui) => {
                              if ((u.speaker_id || "unknown") !== sid) return null;
                              const cu = corrected?.[ui];
                              const text = cu ? cu.corrected_text : u.text;
                              return (
                                <div key={ui} className="px-2 py-1 text-xs border-b border-gray-50 last:border-b-0">
                                  <span className="text-gray-400 font-mono mr-1">[{formatTimestamp(u.start)}]</span>
                                  <span className="text-gray-700">
                                    {text.length > 80 ? text.slice(0, 80) + "…" : text}
                                  </span>
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
                  className="text-xs border border-purple-300 text-purple-700 px-3 py-1 rounded hover:bg-purple-50 disabled:opacity-50"
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
            className="text-sm border border-purple-300 text-purple-700 px-4 py-2 rounded hover:bg-purple-50 disabled:opacity-50"
          >
            提案を全て適用
          </button>
          <button onClick={() => setSuggestions(null)} className="text-sm text-gray-500 hover:text-gray-700 ml-3">
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
        <button
          onClick={handleSaveMapping}
          disabled={savingMapping}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {savingMapping ? "保存中..." : "名前を保存する"}
        </button>
        {mappingSaved && <span className="text-sm text-green-600">保存しました</span>}
      </div>
    </div>
  );
}
