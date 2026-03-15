"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_CORRECTION_PROMPT, DEFAULT_MINUTES_PROMPT } from "@/lib/prompt-defaults";

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

const TABS = [
  { name: "correction", label: "清書プロンプト" },
  { name: "minutes", label: "議事録プロンプト" },
] as const;

const PLACEHOLDERS: Record<string, { variable: string; description: string }[]> = {
  correction: [
    { variable: "{{辞書セクション}}", description: "登録済み辞書エントリから自動生成される修正辞書セクション" },
    { variable: "{{utterancesテキスト}}", description: "文字起こしされた発言テキスト（バッチ分割済み）" },
  ],
  minutes: [
    { variable: "{{会議タイトル}}", description: "文字起こし登録時に設定された会議タイトル" },
    { variable: "{{参加者一覧}}", description: "話者マッピングから取得した参加者名一覧" },
    { variable: "{{会議テキスト}}", description: "タイムスタンプ・話者名付きの会議テキスト全文" },
  ],
};

const DEFAULTS: Record<string, string> = {
  correction: DEFAULT_CORRECTION_PROMPT,
  minutes: DEFAULT_MINUTES_PROMPT,
};

export default function PromptsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("correction");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchTemplates();
    }
  }, [status]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch("/api/prompts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: PromptTemplate[] = await res.json();
      setTemplates(data);
      const current = data.find((t) => t.name === activeTab);
      if (current) setEditContent(current.content);
    } catch {
      setMessage({ type: "error", text: "テンプレートの取得に失敗しました" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const current = templates.find((t) => t.name === activeTab);
    if (current) setEditContent(current.content);
  }, [activeTab, templates]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: activeTab, content: editContent }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: PromptTemplate = await res.json();
      setTemplates((prev) =>
        prev.map((t) => (t.name === updated.name ? updated : t))
      );
      setMessage({ type: "success", text: "保存しました" });
    } catch {
      setMessage({ type: "error", text: "保存に失敗しました" });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!confirm("デフォルトのプロンプトに戻しますか？")) return;
    setEditContent(DEFAULTS[activeTab]);
  }

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!session?.user) return null;

  const currentTemplate = templates.find((t) => t.name === activeTab);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">プロンプト管理</h1>

      {/* タブ */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.name
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* プレースホルダー説明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm font-medium text-blue-800 mb-2">動的変数（自動挿入されます）:</p>
        <ul className="text-sm text-blue-700 space-y-1">
          {PLACEHOLDERS[activeTab]?.map((p) => (
            <li key={p.variable}>
              <code className="bg-blue-100 px-1 rounded text-xs">{p.variable}</code>
              <span className="ml-2">{p.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* テキストエリア */}
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        rows={24}
        className="w-full border border-gray-300 rounded-lg p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
        placeholder="プロンプトテンプレートを入力..."
      />

      {/* 更新日時 */}
      {currentTemplate && (
        <p className="text-xs text-gray-400 mt-1">
          最終更新: {new Date(currentTemplate.updatedAt).toLocaleString("ja-JP")}
        </p>
      )}

      {/* メッセージ */}
      {message && (
        <div
          className={`mt-3 p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ボタン */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handleReset}
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium border border-gray-300"
        >
          デフォルトに戻す
        </button>
      </div>
    </div>
  );
}
