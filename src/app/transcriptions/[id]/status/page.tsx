"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const STEPS = [
  { key: "uploading", label: "アップロード" },
  { key: "transcribing", label: "文字起こし" },
  { key: "correcting", label: "テキスト清書" },
  { key: "analyzing", label: "話者分析" },
];

function getStepIndex(status: string): number {
  if (status === "uploading") return 0;
  if (status === "transcribing") return 1;
  if (status === "correcting") return 2;
  if (status === "analyzing") return 3;
  return 4; // completed
}

// ファイルサイズ(bytes)から推定処理時間(秒)を計算
// 実績ベース: 10MB音声 → 文字起こし~60s, 清書~90s, 話者分析~20s
function estimateTotalSeconds(fileSizeBytes: number): number {
  const sizeMB = fileSizeBytes / (1024 * 1024);
  // 文字起こし: 音声1分あたり~6秒、m4aは約1MB/分
  const transcribeTime = Math.max(30, sizeMB * 6);
  // 清書: 音声長に比例するが最低60秒
  const correctTime = Math.max(60, sizeMB * 8);
  // 話者分析: 比較的固定（大きいファイルでも30秒程度）
  const analyzeTime = 30;
  return Math.ceil(transcribeTime + correctTime + analyzeTime);
}

// ステップごとの進捗割合
function getStepProgress(stepIndex: number): number {
  // transcribing=0~35%, correcting=35~80%, analyzing=80~100%
  const boundaries = [0, 0.05, 0.35, 0.80, 1.0];
  return boundaries[stepIndex] || 0;
}

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [status, setStatus] = useState<string>("uploading");
  const [title, setTitle] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [fileSize, setFileSize] = useState<number>(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/transcriptions/${id}/status`);
      const data = await res.json();
      setStatus(data.status);
      if (data.title) setTitle(data.title);
      if (data.fileSize) setFileSize(data.fileSize);

      if (data.status === "completed") {
        router.push(`/transcriptions/${id}`);
      } else if (data.status === "error") {
        setErrorMessage(data.errorMessage || "不明なエラー");
      }
    } catch {
      // ネットワークエラーは無視
    }
  }, [id, router]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

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

  const currentStep = getStepIndex(status);
  const estimatedTotal = fileSize > 0 ? estimateTotalSeconds(fileSize) : 0;
  const estimatedRemaining = Math.max(0, estimatedTotal - elapsedSeconds);

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

  // プログレスバー計算
  const stepStart = getStepProgress(currentStep);
  const stepEnd = getStepProgress(currentStep + 1);
  const stepRange = stepEnd - stepStart;
  // ステップ内での経過を推定（ステップの所要時間に対する経過割合）
  const stepEstimate = estimatedTotal > 0
    ? Math.min(1, (elapsedSeconds - estimatedTotal * stepStart) / (estimatedTotal * stepRange))
    : 0.5;
  const progressPercent = Math.min(99, Math.round((stepStart + stepRange * Math.max(0, stepEstimate)) * 100));

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">処理中...</h1>
        {title && <p className="text-gray-600 mb-6">{title}</p>}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* プログレスバー */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{progressPercent}%</span>
              {estimatedTotal > 0 && estimatedRemaining > 0 && (
                <span>残り約{Math.ceil(estimatedRemaining / 60)}分</span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* ステップ表示 */}
          <div className="space-y-3">
            {STEPS.map((step, i) => {
              const isDone = i < currentStep;
              const isActive = i === currentStep;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {isDone ? (
                    <span className="text-green-600 font-bold text-lg">&#10003;</span>
                  ) : isActive ? (
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="w-5 h-5 rounded-full border-2 border-gray-300 inline-block" />
                  )}
                  <span
                    className={
                      isDone
                        ? "text-green-700"
                        : isActive
                        ? "text-blue-700 font-medium"
                        : "text-gray-400"
                    }
                  >
                    {step.label}
                    {isDone && " 完了"}
                    {isActive && "中..."}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-gray-500">
              経過時間: {formatTime(elapsedSeconds)}
              {estimatedTotal > 0 && (
                <span className="text-gray-400 ml-2">
                  / 推定 {formatTime(estimatedTotal)}
                </span>
              )}
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
