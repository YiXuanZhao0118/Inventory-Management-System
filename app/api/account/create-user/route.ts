// app/api/account/create-user/route.ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { hash } from "bcryptjs";

const USERS_DB = path.join(process.cwd(), "app", "data", "users.json");

interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
}

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ success: false, error: "使用者名稱與密碼為必填" }, { status: 400 });
    }

    let users: UserRecord[] = [];
    try {
      const raw = await fs.readFile(USERS_DB, "utf8");
      users = JSON.parse(raw);
    } catch {
      users = [];
    }

    if (users.find(u => u.username === username)) {
      return NextResponse.json({ success: false, error: "帳號已存在" }, { status: 409 });
    }

    const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);
    const newId = maxId + 1;

    const passwordHash = await hash(password, 10);
    const newUser: UserRecord = { id: newId, username, passwordHash };

    users.push(newUser);
    await fs.mkdir(path.dirname(USERS_DB), { recursive: true });
    await fs.writeFile(USERS_DB, JSON.stringify(users, null, 2), "utf8");

    return NextResponse.json({ success: true, id: newId });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status: 500 });
  }
}
