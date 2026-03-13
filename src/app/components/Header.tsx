"use client";

import { useSession, signOut } from "next-auth/react";

export function Header() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
        <a href="/" className="text-lg font-bold text-gray-800">
          いつき会 議事録
        </a>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{session.user.name}さん</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-gray-500 hover:text-gray-700 underline"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
