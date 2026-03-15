import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkTranscriptionAccess } from "@/lib/auth-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const { transcription, error } = await checkTranscriptionAccess(id, session);
  if (error) return error;

  const t = transcription as Record<string, unknown>;
  return NextResponse.json({
    id: t.id,
    status: t.status,
    title: t.title,
    fileSize: t.fileSize,
    errorMessage: t.errorMessage,
  });
}
