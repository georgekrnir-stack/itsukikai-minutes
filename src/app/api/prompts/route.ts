import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CORRECTION_PROMPT, DEFAULT_MINUTES_PROMPT } from "@/lib/prompt-defaults";

const DEFAULTS: Record<string, string> = {
  correction: DEFAULT_CORRECTION_PROMPT,
  minutes: DEFAULT_MINUTES_PROMPT,
};

async function ensureDefaults() {
  for (const [name, content] of Object.entries(DEFAULTS)) {
    await prisma.promptTemplate.upsert({
      where: { name },
      create: { name, content },
      update: {},
    });
  }
}

// GET: 全テンプレート取得（なければデフォルトを作成）
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaults();

  const templates = await prisma.promptTemplate.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}

// PATCH: テンプレート更新（name指定）
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, content } = body as { name: string; content: string };

  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }

  if (!DEFAULTS[name]) {
    return NextResponse.json({ error: "Invalid template name" }, { status: 400 });
  }

  const updated = await prisma.promptTemplate.upsert({
    where: { name },
    update: { content },
    create: { name, content },
  });

  return NextResponse.json(updated);
}
