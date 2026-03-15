"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { Modal, useModal } from "./components/Modal";

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

interface UserOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: "完了", color: "bg-green-100 text-green-800" },
  uploading: { label: "アップロード中", color: "bg-blue-100 text-blue-800" },
  transcribing: { label: "文字起こし中", color: "bg-blue-100 text-blue-800" },
  correcting: { label: "清書中", color: "bg-yellow-100 text-yellow-800" },
  analyzing: { label: "話者分析中", color: "bg-indigo-100 text-indigo-800" },
  error: { label: "エラー", color: "bg-red-100 text-red-800" },
};

const CATEGORY_COLORS: Record<string, string> = {
  "経営会議": "border-blue-500",
  "委員会": "border-emerald-500",
  "プロジェクト": "border-amber-500",
  "研修・教育": "border-purple-500",
  "部門会議": "border-teal-500",
  "その他": "border-gray-400",
};

const CATEGORIES = ["経営会議", "委員会", "プロジェクト", "研修・教育", "部門会議", "その他"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateForInput(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [items, setItems] = useState<TranscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const role = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const isAdmin = role === "admin";

  // 編集モーダル
  const [editItem, setEditItem] = useState<TranscriptionItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);

  const { showConfirm, modalProps } = useModal();

  const fetchList = async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (ownerFilter !== "all") params.set("owner", ownerFilter);
    const res = await fetch(`/api/transcriptions?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.transcriptions);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchList();
  }, [statusFilter, ownerFilter]);

  // admin用: ユーザー一覧取得
  useEffect(() => {
    if (isAdmin) {
      fetch("/api/admin/users")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setUserOptions(data.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
          }
        })
        .catch(() => {});
    }
  }, [isAdmin]);

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

  // 編集モーダル
  function openEdit(item: TranscriptionItem, e: React.MouseEvent) {
    e.stopPropagation();
    setEditItem(item);
    setEditTitle(item.title);
    setEditCategory(item.category || "");
    setEditDate(formatDateForInput(item.createdAt));
    setEditUserId(""); // will be determined from userOptions
  }

  async function handleEditSave() {
    if (!editItem) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: editTitle,
        category: editCategory || null,
        createdAt: editDate,
      };
      if (editUserId) body.userId = editUserId;

      const res = await fetch(`/api/transcriptions/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      setEditItem(null);
      fetchList();
    } catch {
      alert("保存に失敗しました");
    } finally {
      setEditSaving(false);
    }
  }

  // 削除
  async function handleDelete(item: TranscriptionItem, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await showConfirm(
      "アーカイブ削除",
      `「${item.title}」を完全に削除しますか？\nこの操作は取り消せません。`,
      "danger"
    );
    if (!ok) return;

    try {
      const res = await fetch(`/api/transcriptions/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      fetchList();
    } catch {
      alert("削除に失敗しました");
    }
  }

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
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-50"
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
            <option value="analyzing">話者分析中</option>
            <option value="error">エラー</option>
          </select>
          {isAdmin && (
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              <option value="all">全ユーザー</option>
              <option value="mine">自分のみ</option>
            </select>
          )}
        </div>

        {/* 一覧 */}
        {loading ? (
          <div className="py-8 flex justify-center">
            <LoadingSpinner text="読み込み中..." />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-4">議事録がまだありません</p>
            <a href="/upload" className="text-blue-600 hover:underline">
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
              const borderColor = CATEGORY_COLORS[item.category || ""] || "border-gray-300";

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className={`bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${borderColor}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                        {item.category && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{item.category}</span>
                        )}
                        <span>{formatDate(item.createdAt)}</span>
                        {item.speakerCount != null && <span>話者{item.speakerCount}名</span>}
                        {item.user && <span>{item.user.name}</span>}
                        {item.hasMinutes && <span className="text-green-600">議事録あり</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isAdmin && (
                        <>
                          <button
                            onClick={(e) => openEdit(item, e)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                            title="編集"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDelete(item, e)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="削除"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>
                  {item.status === "error" && item.errorMessage && (
                    <p className="text-sm text-red-500 mt-2 truncate">{item.errorMessage}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 編集モーダル */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditItem(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">アーカイブ編集</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">なし</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">作成者</label>
                <select
                  value={editUserId}
                  onChange={(e) => setEditUserId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                >
                  <option value="">変更しない</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditItem(null)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {editSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal {...modalProps} />
    </div>
  );
}
