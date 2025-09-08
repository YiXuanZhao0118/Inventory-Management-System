// app/api/analyze_product_info/route.ts
import { spawn } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";        // 需要 child_process
export const dynamic = "force-dynamic"; // 避免被靜態化或快取

const PYTHON_BIN =
  process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const url: unknown = (body as any)?.url;

    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
    }

    // Python script 路徑（依你的專案結構調整）
    const scriptPath = path.resolve(process.cwd(), "ProductInformation", "analyze_cli.py");

    // 以 Promise<Response> 形式包裝 spawn
    return new Promise<Response>((resolve) => {
      const py = spawn(PYTHON_BIN, [scriptPath, url.trim()], {
        cwd: path.dirname(scriptPath),
        env: { ...process.env, PYTHONUTF8: "1" },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      const timeoutMs = 30_000;
      const killer = setTimeout(() => {
        try { py.kill("SIGKILL"); } catch {}
        resolve(
          NextResponse.json({ error: "Analyzer timed out" }, { status: 504 })
        );
      }, timeoutMs);

      py.stdout.on("data", (d) => (stdout += d.toString()));
      py.stderr.on("data", (d) => (stderr += d.toString()));

      py.on("error", (err) => {
        clearTimeout(killer);
        resolve(
          NextResponse.json(
            { error: "Failed to spawn Python", details: String(err) },
            { status: 500 }
          )
        );
      });

      py.on("close", (code) => {
        clearTimeout(killer);
        if (code !== 0) {
          return resolve(
            NextResponse.json(
              {
                error: `Python script exited with code ${code}`,
                details: stderr || stdout || null,
              },
              { status: 500 }
            )
          );
        }
        try {
          const parsed = JSON.parse(stdout);
          return resolve(NextResponse.json(parsed, { status: 200 }));
        } catch {
          return resolve(
            NextResponse.json(
              { error: "Failed to parse Python output", raw: stdout },
              { status: 502 }
            )
          );
        }
      });
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}
