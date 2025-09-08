// app/api/login/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';  // or 'bcrypt'

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    console.log('[Login API] Received login request, credentials:', { username, password });

    const filePath = path.join(process.cwd(), 'app', 'data', 'users.json'); // adjust to your actual path
    const users = JSON.parse(await fs.readFile(filePath, 'utf-8')) as {
      id: number;
      username: string;
      passwordHash: string;
    }[];

    const user = users.find(u => u.username === username);
    console.log('[Login API] User object found:', user);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('[Login API] bcrypt.compare returned:', isValid);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, userId: user.id });
  } catch (err) {
    console.error('[Login API] Error:', err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
