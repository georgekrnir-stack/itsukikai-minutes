import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkTranscriptionAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { correctTranscription } from "@/lib/llm/correct";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const { error } = await checkTranscriptionAccess(id, session);
  if (error) return error;

  // ステータスを先にcorrectingに変更（ポーリングが正しく動くように）
  await prisma.transcription.update({
    where: { id },
    data: { status: "correcting" },
  });

  // バックグラウンドで実行
  correctTranscription(id).catch((err) => {
    console.error(`[correct] Manual re-correction error:`, err);
  });

  return NextResponse.json({ ok: true, message: "Correction started" });
}
