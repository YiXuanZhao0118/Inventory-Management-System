import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const USERS_DB = path.join(process.cwd(), "app/data/users.json");

export async function GET() {
  try {
    const users = JSON.parse(await fs.readFile(USERS_DB, "utf-8"));
    if (users.length > 0) {
      const user = users[0];
      return NextResponse.json({ id: user.id?.toString() ?? "user-123", username: user.username }, { status: 200 });
    } else {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
