import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await prisma.customDictionary.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { correctTerm, incorrectTerm, category, isKeyterm } = body;

  if (!correctTerm || !incorrectTerm || !category) {
    return NextResponse.json(
      { error: "correctTerm, incorrectTerm, category are required" },
      { status: 400 }
    );
  }

  const entry = await prisma.customDictionary.create({
    data: {
      correctTerm,
      incorrectTerm,
      category,
      isKeyterm: isKeyterm ?? false,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
