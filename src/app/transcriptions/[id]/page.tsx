"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { TranscriptionData, formatTimestamp } from "./utils";
import { Modal, useModal } from "../../components/Modal";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import SpeakerTab from "./SpeakerTab";
import UtteranceTab from "./UtteranceTab";
import MinutesTab from "./MinutesTab";

const TABS = [
  { key: "speakers", label: "話者設定" },
  { key: "utterances", label: "文字起こし" },
  { key: "minutes", label: "議事録" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TranscriptionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;

  const tabParam = searchParams.get("tab") as TabKey | null;
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam) ? tabParam! : "speakers";

  const [data, setData] = useState<TranscriptionData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [speakerMapping, setSpeakerMapping] = useState<Record<string, string>>({});

  const { showConfirm, showAlert, modalProps } = useModal();

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/transcriptions/${id}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      if (d.speakerMapping) setSpeakerMapping(d.speakerMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    }
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [id]);

  const setTab = (key: TabKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    router.replace(url.pathname + url.search);
  };

  if (loading) return <LoadingSpinner fullPage text="読み込み中..." />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-red-600">エラー: {error || "データが見つかりません"}</p>
        <a href="/" className="text-blue-600 hover:underline mt-2 inline-block">
          ダッシュボードに戻る
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="text-blue-600 hover:underline text-sm mb-4 inline-block">
          &larr; ダッシュボードに戻る
        </a>

        <h1 className="text-2xl font-bold mb-2">{data.title}</h1>

        {/* メタ情報 */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-6">
          {data.category && <span className="bg-gray-100 px-2 py-0.5 rounded">{data.category}</span>}
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

        {/* タブバー */}
        <div className="flex border-b border-gray-200 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        {activeTab === "speakers" && (
          <SpeakerTab
            data={data}
            setData={setData as (d: TranscriptionData | ((prev: TranscriptionData | null) => TranscriptionData | null)) => void}
            speakerMapping={speakerMapping}
            setSpeakerMapping={setSpeakerMapping as (fn: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void}
            showConfirm={showConfirm}
            showAlert={showAlert}
            fetchData={fetchData}
          />
        )}
        {activeTab === "utterances" && (
          <UtteranceTab
            data={data}
            setData={(d: TranscriptionData) => setData(d)}
            speakerMapping={speakerMapping}
            showConfirm={showConfirm}
            showAlert={showAlert}
            fetchData={fetchData}
          />
        )}
        {activeTab === "minutes" && (
          <MinutesTab
            data={data}
            speakerMapping={speakerMapping}
            showConfirm={showConfirm}
            showAlert={showAlert}
          />
        )}
      </div>

      <Modal {...modalProps} />
    </div>
  );
}
