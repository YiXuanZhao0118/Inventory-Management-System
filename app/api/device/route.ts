// app/api/device/route.ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DeviceItem  as DeviceRecord } from "@/lib/db"; // Adjust the import path as needed

const DATA_PATH = path.join(process.cwd(), "app", "data", "device.json");

async function readDeviceData(): Promise<DeviceRecord[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as DeviceRecord[];
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function writeDeviceData(records: DeviceRecord[]) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(records, null, 2), "utf-8");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId");
  const list = await readDeviceData();

  if (deviceId) {
    const rec = list.find(r => r.deviceId === deviceId);
    return NextResponse.json(
      { isRegistered: !!rec, ...(rec || {}) },
      { status: 200 }
    );
  }

  return NextResponse.json(list, { status: 200 });
}

export async function POST(request: Request) {
  const { deviceId, name } = await request.json();
  if (!deviceId || !name) {
    return NextResponse.json(
      { error: "deviceId and name required" },
      { status: 400 }
    );
  }

  const list = await readDeviceData();
  const exists = list.some(r => r.deviceId === deviceId);

  if (!exists) {
    list.push({
      deviceId,
      name,
      currentDate: new Date().toISOString(),
    });
    await writeDeviceData(list);
    return NextResponse.json({ status: "added" }, { status: 201 });
  }

  return NextResponse.json({ status: "exists" }, { status: 200 });
}
