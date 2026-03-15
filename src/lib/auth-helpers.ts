import { NextResponse } from "next/server";
import { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

export function getSessionUser(session: Session | null) {
  if (!session?.user) return null;
  return {
    id: session.user.id as string,
    role: (session.user.role as string) || "user",
    name: session.user.name,
    email: session.user.email,
  };
}

export function requireAdmin(session: Session | null): NextResponse | null {
  const user = getSessionUser(session);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function checkTranscriptionAccess(
  transcriptionId: string,
  session: Session | null
): Promise<{ transcription: Record<string, unknown> | null; error: NextResponse | null }> {
  const user = getSessionUser(session);
  if (!user) {
    return { transcription: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const transcription = await prisma.transcription.findUnique({
    where: { id: transcriptionId },
  });

  if (!transcription) {
    return { transcription: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  // admin can access all; user can only access their own
  if (user.role !== "admin" && transcription.userId !== user.id) {
    return { transcription: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { transcription: transcription as unknown as Record<string, unknown>, error: null };
}
