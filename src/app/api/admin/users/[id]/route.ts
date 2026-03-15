import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireAdmin, getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PATCH: ユーザー編集（admin専用）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { name, email, role, password } = body as {
    name?: string;
    email?: string;
    role?: string;
    password?: string;
  };

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // メールの重複チェック
  if (email && email !== existing.email) {
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup) {
      return NextResponse.json({ error: "このメールアドレスは既に使用されています" }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (role !== undefined) data.role = role === "admin" ? "admin" : "user";
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(updated);
}

// DELETE: ユーザー削除（admin専用）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  const me = getSessionUser(session);

  // 自分自身は削除不可
  if (me?.id === id) {
    return NextResponse.json({ error: "自分自身を削除することはできません" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ユーザーのtranscriptionのuserIdをnullに
  await prisma.transcription.updateMany({
    where: { userId: id },
    data: { userId: null },
  });

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
