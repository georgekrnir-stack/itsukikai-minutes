"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session?.user) return null;

  const navItems = [
    { href: "/", label: "ダッシュボード" },
    { href: "/upload", label: "新規作成" },
    { href: "/dictionary", label: "辞書管理" },
  ];

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/" className="text-lg font-bold text-gray-800">
            いつき会 議事録 <span className="text-xs text-gray-400 font-normal">v6.1</span>
          </a>
          <nav className="flex gap-4 text-sm">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={
                  pathname === item.href
                    ? "text-blue-600 font-medium"
                    : "text-gray-600 hover:text-gray-800"
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
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
