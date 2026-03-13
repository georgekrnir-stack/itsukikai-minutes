"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [status, setStatus] = useState<string>("uploading");
  const [title, setTitle] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ファイルサイズからの推定時間（MB × 2秒）
  // ファイルサイズが不明な場合は120秒
  const [estimatedSeconds] = useState(120);

  const remainingSeconds = Math.max(0, estimatedSeconds - elapsedSeconds);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/transcriptions/${id}/status`);
      const data = await res.json();
      setStatus(data.status);
      if (data.title) setTitle(data.title);

      if (data.status === "completed") {
        router.push(`/transcriptions/${id}`);
      } else if (data.status === "error") {
        setErrorMessage(data.errorMessage || "不明なエラー");
      }
    } catch {
      // ネットワークエラーは無視して次のポーリングを待つ
    }
  }, [id, router]);

  // ポーリング（3秒ごと）
  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  // 経過時間カウンター
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = Math.min(
    95,
    (elapsedSeconds / estimatedSeconds) * 100
  );

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold mb-4 text-red-600">エラー</h1>
          {title && <p className="text-gray-600 mb-4">{title}</p>}
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-red-600">{errorMessage}</p>
            <a
              href="/"
              className="inline-block mt-4 text-blue-600 hover:underline"
            >
              トップに戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">文字起こし中...</h1>
        {title && <p className="text-gray-600 mb-6">{title}</p>}

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          {/* プログレスバー */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* カウントダウン */}
          <div className="text-center">
            {remainingSeconds > 0 ? (
              <p className="text-lg">
                推定残り時間: <span className="font-bold">{formatTime(remainingSeconds)}</span>
              </p>
            ) : (
              <p className="text-lg">まもなく完了します...</p>
            )}
            <p className="text-sm text-gray-500 mt-1">
              経過時間: {formatTime(elapsedSeconds)}
            </p>
          </div>

          <p className="text-sm text-gray-500 text-center">
            ブラウザを閉じても処理は続きます。後からこのページに戻れます。
          </p>
        </div>
      </div>
    </div>
  );
}
