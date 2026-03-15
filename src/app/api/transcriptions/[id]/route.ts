import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkTranscriptionAccess, requireAdmin, getSessionUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const { transcription, error } = await checkTranscriptionAccess(id, session);
  if (error) return error;

  return NextResponse.json(transcription);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const { transcription, error } = await checkTranscriptionAccess(id, session);
  if (error) return error;

  const body = await request.json();
  const user = getSessionUser(session);

  const oldMapping = (transcription as Record<string, unknown>).speakerMapping as Record<string, string> | null;
  const newMapping = body.speakerMapping as Record<string, string> | undefined;

  const data: Record<string, unknown> = {};
  if (newMapping !== undefined) data.speakerMapping = newMapping;

  // admin-only fields
  if (user?.role === "admin") {
    if (body.title !== undefined) data.title = body.title;
    if (body.category !== undefined) data.category = body.category;
    if (body.createdAt !== undefined) data.createdAt = new Date(body.createdAt);
    if (body.userId !== undefined) data.userId = body.userId || null;
  }

  const updated = await prisma.transcription.update({
    where: { id },
    data,
  });

  // 議事録が存在する場合、テキスト内の話者名を置換
  if (newMapping) {
    const existingMinutes = await prisma.minutes.findUnique({
      where: { transcriptionId: id },
    });

    if (existingMinutes) {
      let updatedContent = existingMinutes.content;

      for (const [speakerId, newName] of Object.entries(newMapping)) {
        const oldName = oldMapping?.[speakerId] || speakerId;
        if (oldName !== newName && newName.trim() !== "") {
          updatedContent = updatedContent.split(oldName).join(newName);
        }
      }

      if (updatedContent !== existingMinutes.content) {
        await prisma.minutes.update({
          where: { transcriptionId: id },
          data: { content: updatedContent },
        });
        console.log(`[speaker-mapping] ${id}: Minutes content updated with new speaker names`);
      }
    }
  }

  return NextResponse.json(updated);
}

// DELETE: アーカイブ削除（admin専用）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const { id } = await params;

  const transcription = await prisma.transcription.findUnique({ where: { id } });
  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Minutes → Transcription の順で削除
  await prisma.minutes.deleteMany({ where: { transcriptionId: id } });
  await prisma.transcription.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
