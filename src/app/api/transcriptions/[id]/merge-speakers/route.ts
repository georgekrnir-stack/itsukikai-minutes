import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Utterance {
  speaker_id: string | null;
  start: number;
  end: number;
  text: string;
  type?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { targetSpeakerId, mergeSpeakerIds } = body as {
    targetSpeakerId: string;
    mergeSpeakerIds: string[];
  };

  if (!targetSpeakerId || !mergeSpeakerIds || mergeSpeakerIds.length === 0) {
    return NextResponse.json(
      { error: "targetSpeakerId and mergeSpeakerIds are required" },
      { status: 400 }
    );
  }

  const transcription = await prisma.transcription.findUnique({
    where: { id },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const utterances = (transcription.utterances as Utterance[] | null) || [];
  const speakers = (transcription.speakers as string[] | null) || [];
  const speakerMapping = (transcription.speakerMapping as Record<string, string> | null) || {};

  // Validate that target and merge IDs exist in speakers
  const mergeSet = new Set(mergeSpeakerIds);
  if (!speakers.includes(targetSpeakerId)) {
    return NextResponse.json(
      { error: `Target speaker "${targetSpeakerId}" not found` },
      { status: 400 }
    );
  }

  // Rewrite speaker_id in utterances
  const updatedUtterances = utterances.map((u) => {
    if (u.speaker_id && mergeSet.has(u.speaker_id)) {
      return { ...u, speaker_id: targetSpeakerId };
    }
    return u;
  });

  // Remove merged IDs from speakers array
  const updatedSpeakers = speakers.filter((s) => !mergeSet.has(s));

  // Remove merged IDs from speakerMapping
  const updatedMapping = { ...speakerMapping };
  for (const mid of mergeSpeakerIds) {
    delete updatedMapping[mid];
  }

  const updated = await prisma.transcription.update({
    where: { id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utterances: updatedUtterances as any,
      speakers: updatedSpeakers as any,
      speakerMapping: updatedMapping as any,
      speakerCount: updatedSpeakers.length,
    },
  });

  return NextResponse.json(updated);
}
