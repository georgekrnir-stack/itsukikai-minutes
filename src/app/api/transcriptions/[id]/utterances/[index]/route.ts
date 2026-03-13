import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface CorrectedUtterance {
  index: number;
  original_text: string;
  corrected_text: string;
  changes: { original: string; corrected: string; reason: string }[];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, index: indexStr } = await params;
  const utteranceIndex = parseInt(indexStr, 10);
  const body = await request.json();
  const { corrected_text } = body;

  if (typeof corrected_text !== "string") {
    return NextResponse.json({ error: "corrected_text is required" }, { status: 400 });
  }

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const correctedUtterances = transcription.correctedUtterances as unknown as CorrectedUtterance[] | null;
  if (!correctedUtterances || !correctedUtterances[utteranceIndex]) {
    return NextResponse.json({ error: "Utterance not found" }, { status: 404 });
  }

  // 該当indexのcorrected_textを更新、changesを空にする
  correctedUtterances[utteranceIndex].corrected_text = corrected_text;
  correctedUtterances[utteranceIndex].changes = [];

  await prisma.transcription.update({
    where: { id },
    data: {
      correctedUtterances: JSON.parse(JSON.stringify(correctedUtterances)),
    },
  });

  return NextResponse.json({ ok: true });
}
