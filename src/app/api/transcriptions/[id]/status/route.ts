import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const transcription = await prisma.transcription.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      title: true,
      errorMessage: true,
    },
  });

  if (!transcription) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(transcription);
}
