// app/api/devices/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = (searchParams.get("deviceId") || "").trim();
    if (!deviceId) {
      return NextResponse.json({ exists: false, error: "deviceId is required" }, { status: 400 });
    }
    const dev = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev) return NextResponse.json({ exists: false }, { status: 200 });
    return NextResponse.json({ exists: true, device: { id: dev.id, name: dev.name } });
  } catch (e: any) {
    return NextResponse.json({ exists: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
