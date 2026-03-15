"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface TranscriptionItem {
  id: string;
  title: string;
  category: string | null;
  status: string;
  speakerCount: number | null;
  createdAt: string;
  errorMessage: string | null;
  user: { name: string } | null;
  hasMinutes: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: "完了", color: "bg-green-100 text-green-800" },
  uploading: { label: "アップロード中", color: "bg-blue-100 text-blue-800" },
  transcribing: { label: "文字起こし中", color: "bg-blue-100 text-blue-800" },
  correcting: { label: "清書中", color: "bg-yellow-100 text-yellow-800" },
  error: { label: "エラー", color: "bg-red-100 text-red-800" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "経営会議": "🏢",
  "委員会": "👥",
  "プロジェクト": "📐",
  "研修・教育": "📚",
  "部門会議": "🏠",
  "その他": "📋",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [items, setItems] = useState<TranscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchList = async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/transcriptions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.transcriptions);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchList();
  };

  const handleCardClick = (item: TranscriptionItem) => {
    if (item.status === "completed" || item.status === "error") {
      router.push(`/transcriptions/${item.id}`);
    } else {
      router.push(`/transcriptions/${item.id}/status`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <a
            href="/upload"
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 font-medium"
          >
            + 新しい議事録を作成
          </a>
        </div>

        {/* 検索・フィルタ */}
        <div className="flex gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="タイトルで検索..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
            >
              検索
            </button>
          </form>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="all">すべて</option>
            <option value="completed">完了</option>
            <option value="transcribing">処理中</option>
            <option value="correcting">清書中</option>
            <option value="error">エラー</option>
          </select>
        </div>

        {/* 一覧 */}
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-4">議事録がまだありません</p>
            <a
              href="/upload"
              className="text-blue-600 hover:underline"
            >
              新しい議事録を作成する
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const statusInfo = STATUS_LABELS[item.status] || {
                label: item.status,
                color: "bg-gray-100 text-gray-800",
              };
              const icon = CATEGORY_ICONS[item.category || ""] || "📋";

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {icon} {item.title}
                      </h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                        {item.category && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                            {item.category}
                          </span>
                        )}
                        <span>{formatDate(item.createdAt)}</span>
                        {item.speakerCount != null && (
                          <span>話者{item.speakerCount}名</span>
                        )}
                        {item.user && <span>{item.user.name}</span>}
                        {item.hasMinutes && (
                          <span className="text-green-600">議事録あり</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 ml-3 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                  {item.status === "error" && item.errorMessage && (
                    <p className="text-sm text-red-500 mt-2 truncate">
                      {item.errorMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
