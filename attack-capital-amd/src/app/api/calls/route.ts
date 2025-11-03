import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/better-auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const strategy = searchParams.get("strategy");

  const where: any = { userId: session.user.id };
  if (strategy) {
    where.amdStrategy = strategy;
  }

  const calls = await prisma.call.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return NextResponse.json({ calls });
}
