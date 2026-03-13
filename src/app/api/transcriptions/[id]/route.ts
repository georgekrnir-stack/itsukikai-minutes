import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(transcription);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const oldMapping = transcription.speakerMapping as Record<string, string> | null;
  const newMapping = body.speakerMapping as Record<string, string> | undefined;

  const updated = await prisma.transcription.update({
    where: { id },
    data: {
      speakerMapping: newMapping ?? undefined,
    },
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
