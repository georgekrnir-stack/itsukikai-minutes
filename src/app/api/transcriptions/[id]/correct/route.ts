import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { correctTranscription } from "@/lib/llm/correct";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // バックグラウンドで実行
  correctTranscription(id).catch((error) => {
    console.error(`[correct] Manual re-correction error:`, error);
  });

  return NextResponse.json({ ok: true, message: "Correction started" });
}
