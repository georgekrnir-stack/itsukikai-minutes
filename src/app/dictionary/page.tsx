"use client";

import { useEffect, useState } from "react";
import { Modal, useModal } from "../components/Modal";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface DictionaryEntry {
  id: string;
  correctTerm: string;
  incorrectTerm: string;
  category: string;
  isKeyterm: boolean;
}

const CATEGORIES = ["施設名", "人名", "医療用語"];
const CATEGORY_COLORS: Record<string, string> = {
  施設名: "bg-blue-100 text-blue-800",
  人名: "bg-green-100 text-green-800",
  医療用語: "bg-purple-100 text-purple-800",
};

export default function DictionaryPage() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [newCorrect, setNewCorrect] = useState("");
  const [newIncorrect, setNewIncorrect] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newKeyterm, setNewKeyterm] = useState(false);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCorrect, setEditCorrect] = useState("");
  const [editIncorrect, setEditIncorrect] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editKeyterm, setEditKeyterm] = useState(false);

  const { showConfirm, modalProps } = useModal();

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    const res = await fetch("/api/dictionary");
    const data = await res.json();
    setEntries(data);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newCorrect || !newIncorrect) return;
    setAdding(true);
    const res = await fetch("/api/dictionary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correctTerm: newCorrect,
        incorrectTerm: newIncorrect,
        category: newCategory,
        isKeyterm: newKeyterm,
      }),
    });
    if (res.ok) {
      setNewCorrect("");
      setNewIncorrect("");
      setNewKeyterm(false);
      await fetchEntries();
    }
    setAdding(false);
  };

  const handleEdit = (entry: DictionaryEntry) => {
    setEditingId(entry.id);
    setEditCorrect(entry.correctTerm);
    setEditIncorrect(entry.incorrectTerm);
    setEditCategory(entry.category);
    setEditKeyterm(entry.isKeyterm);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const res = await fetch(`/api/dictionary/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correctTerm: editCorrect,
        incorrectTerm: editIncorrect,
        category: editCategory,
        isKeyterm: editKeyterm,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await fetchEntries();
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await showConfirm("削除確認", "本当に削除しますか？", "danger");
    if (!ok) return;
    const res = await fetch(`/api/dictionary/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchEntries();
    }
  };

  const handleToggleKeyterm = async (entry: DictionaryEntry) => {
    const res = await fetch(`/api/dictionary/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isKeyterm: !entry.isKeyterm }),
    });
    if (res.ok) {
      await fetchEntries();
    }
  };

  if (loading) {
    return <LoadingSpinner fullPage text="読み込み中..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">辞書管理</h1>

        {/* 新規追加フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新規追加</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={newCorrect}
              onChange={(e) => setNewCorrect(e.target.value)}
              placeholder="正しい表記（例: 守山いつき病院）"
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={newIncorrect}
              onChange={(e) => setNewIncorrect(e.target.value)}
              placeholder="誤認識パターン（例: 森山樹病院）"
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-4 mb-3">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newKeyterm}
                onChange={(e) => setNewKeyterm(e.target.checked)}
                className="w-4 h-4"
              />
              Keyterm送信
            </label>
            <button
              onClick={handleAdd}
              disabled={!newCorrect || !newIncorrect || adding}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              追加
            </button>
          </div>

          <div className="text-xs text-gray-500 space-y-1 mt-4 border-t pt-3">
            <p>
              Keyterm（ElevenLabsに送信）: 音声認識の段階で正しく拾いたい語句に有効にします。 例:
              「守山いつき病院」「いつき会」など ※ Keytermを有効にすると文字起こしコストが20%増加します
            </p>
            <p>
              LLM清書用: Keytermで拾えなかった場合に、議事録生成時にLLMが自動補正します。
              誤認識パターンに複数のパターンがある場合は、それぞれ別の行として登録してください。
            </p>
          </div>
        </div>

        {/* 一覧テーブル */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">正しい表記</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">誤認識パターン</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">カテゴリ</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Keyterm</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    辞書が空です。上のフォームから追加してください。
                  </td>
                </tr>
              )}
              {entries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-b bg-yellow-50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editCorrect}
                        onChange={(e) => setEditCorrect(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editIncorrect}
                        onChange={(e) => setEditIncorrect(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 w-full text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={editKeyterm}
                        onChange={(e) => setEditKeyterm(e.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button onClick={handleSaveEdit} className="text-blue-600 hover:underline text-sm">
                        保存
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 hover:underline text-sm">
                        キャンセル
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{entry.correctTerm}</td>
                    <td className="px-4 py-3 text-gray-600">{entry.incorrectTerm}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          CATEGORY_COLORS[entry.category] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleKeyterm(entry)}
                        className={`inline-block w-10 h-5 rounded-full relative cursor-pointer transition-colors ${
                          entry.isKeyterm ? "bg-blue-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            entry.isKeyterm ? "left-5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button onClick={() => handleEdit(entry)} className="text-blue-600 hover:underline text-sm">
                        編集
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="text-red-600 hover:underline text-sm">
                        削除
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal {...modalProps} />
    </div>
  );
}
