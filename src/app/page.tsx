"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSubmit = async () => {
    if (!file) return;

    setStatus("uploading");
    setResult("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setResult(JSON.stringify(data, null, 2));
      setStatus("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      setStatus("error");
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>文字起こし（Phase 1）</h1>

      <div style={{ marginTop: "1rem" }}>
        <input
          type="file"
          accept=".m4a,.mp3,.wav,.aac,.ogg,.flac,.wma,.mp4,.webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={handleSubmit}
          disabled={!file || status === "uploading"}
          style={{
            padding: "0.5rem 1rem",
            cursor: file && status !== "uploading" ? "pointer" : "not-allowed",
          }}
        >
          {status === "uploading" ? "処理中..." : "文字起こし開始"}
        </button>
      </div>

      {status === "uploading" && (
        <p style={{ marginTop: "1rem" }}>
          処理中...（長い音声ファイルの場合、数分かかることがあります）
        </p>
      )}

      {error && (
        <p style={{ marginTop: "1rem", color: "red" }}>エラー: {error}</p>
      )}

      {result && (
        <pre
          style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#f5f5f5",
            overflow: "auto",
            maxHeight: "80vh",
            fontSize: "0.875rem",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
