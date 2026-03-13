"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const STEPS = [
  { key: "uploading", label: "アップロード" },
  { key: "transcribing", label: "文字起こし" },
  { key: "correcting", label: "テキスト清書" },
];

function getStepIndex(status: string): number {
  if (status === "uploading") return 0;
  if (status === "transcribing") return 1;
  if (status === "correcting") return 2;
  return 3; // completed
}

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [status, setStatus] = useState<string>("uploading");
  const [title, setTitle] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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
        <h1 className="text-2xl font-bold mb-4">処理中...</h1>
        {title && <p className="text-gray-600 mb-6">{title}</p>}

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
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

          <p className="text-sm text-gray-500 text-center">
            経過時間: {formatTime(elapsedSeconds)}
          </p>

          <p className="text-sm text-gray-500 text-center">
            ブラウザを閉じても処理は続きます。後からこのページに戻れます。
          </p>
        </div>
      </div>
    </div>
  );
}
