"use client";

import { useCallback, useRef, useState } from "react";

interface FileDropZoneProps {
  accept: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileDropZone({ accept, file, onFileSelect, disabled }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptExtensions = accept.split(",").map((s) => s.trim().toLowerCase());

  const isAccepted = useCallback(
    (f: File) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return acceptExtensions.some((a) => a === ext || f.type.startsWith(a.replace(".*", "")));
    },
    [acceptExtensions]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const f = e.dataTransfer.files[0];
      if (f && isAccepted(f)) onFileSelect(f);
    },
    [disabled, isAccepted, onFileSelect]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFileSelect(e.target.files?.[0] ?? null);
    },
    [onFileSelect]
  );

  if (file) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)}</p>
        </div>
        <button
          onClick={() => {
            onFileSelect(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          disabled={disabled}
          className="text-sm border border-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50 shrink-0 ml-3"
        >
          変更
        </button>
        <input ref={inputRef} type="file" accept={accept} onChange={handleInputChange} className="hidden" />
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-blue-400 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <p className="text-sm text-gray-600 mb-1">
        ファイルをドラッグ&ドロップ、またはクリックして選択
      </p>
      <p className="text-xs text-gray-400">
        対応形式: {acceptExtensions.map((a) => a.replace(".", "").toUpperCase()).join(", ")}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled}
        className="hidden"
      />
    </div>
  );
}
