"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [useKeyterms, setUseKeyterms] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setError("");

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || "無題の会議");
    if (useKeyterms) {
      formData.append("useKeyterms", "true");
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        router.push(`/transcriptions/${data.id}/status`);
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setError(data.error || `HTTP ${xhr.status}`);
        } catch {
          setError(`HTTP ${xhr.status}`);
        }
        setUploading(false);
        setUploadProgress(null);
      }
    });

    xhr.addEventListener("error", () => {
      setError("アップロードに失敗しました");
      setUploading(false);
      setUploadProgress(null);
    });

    xhr.open("POST", "/api/transcriptions");
    xhr.send(formData);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">文字起こし</h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              会議タイトル
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 2024年3月 経営会議"
              className="w-full border border-gray-300 rounded px-3 py-2"
              disabled={uploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              音声ファイル
            </label>
            <input
              type="file"
              accept=".m4a,.mp3,.wav,.aac,.ogg,.flac,.wma,.mp4,.webm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
            {file && (
              <p className="text-sm text-gray-500 mt-1">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useKeyterms}
                onChange={(e) => setUseKeyterms(e.target.checked)}
                disabled={uploading}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700">
                Keyterm Promptingを使用する（固有名詞の認識精度が向上しますが、コストが20%増加します）
              </span>
            </label>
          </div>

          {/* アップロードプログレス */}
          {uploadProgress !== null && (
            <div>
              <p className="text-sm text-gray-600 mb-1">
                アップロード中... {uploadProgress}%
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {uploading ? "アップロード中..." : "文字起こし開始"}
          </button>

          {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
        </div>
      </div>
    </div>
  );
}
