// app/api/account/change-password/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { compare, hash } from 'bcryptjs';

const MIN_LEN = 8;

export async function POST(request: Request) {
  try {
    const { username, currentPassword, newPassword, confirmPassword } = await request.json();

    const filePath = path.join(process.cwd(), 'app', 'data', 'users.json');
    const users = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Array<{
      id: number;
      username: string;
      passwordHash: string;
    }>;

    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const user = users[idx];
    const ok = await compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // 僅驗證階段（第一步）
    const verifyOnly = !newPassword && !confirmPassword;
    if (verifyOnly) {
      return NextResponse.json({ success: true, verify: true });
    }

    if (typeof newPassword !== 'string' || newPassword.length < MIN_LEN) {
      return NextResponse.json({ success: false, error: `Password too short (>=${MIN_LEN})` }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, error: 'New passwords do not match' }, { status: 400 });
    }

    users[idx].passwordHash = await hash(newPassword, 10);
    await fs.writeFile(filePath, JSON.stringify(users, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Change password error:', err);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
