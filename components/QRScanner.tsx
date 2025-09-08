//components\QRScanner.tsx
"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";

declare global {
  interface MediaTrackConstraintSet { torch?: boolean; }
  interface MediaTrackCapabilities { torch?: boolean; }
}

type FacingMode = "environment" | "user";

interface QRScannerProps {
  onScan: (data: string) => void;
  onError?: (error: Error) => void;
  onStatus?: (msg: string) => void;
  className?: string;
  style?: React.CSSProperties;
  active?: boolean;
  facingMode?: FacingMode;
  scanInterval?: number;
  area?: number;
  once?: boolean;
  drawBox?: boolean;
  dedupeWindowMs?: number;
  enableTorchButton?: boolean;
  enableSwitchCamera?: boolean;
  beepOnSuccess?: boolean;
  deviceId?: string;

  /** 新增：預熱毫秒數（啟動後先不判定），預設 600ms */
  warmupMs?: number;
  /** 新增：需要連續 N 次讀到相同內容才視為有效，預設 2 */
  confirmFrames?: number;
  /** 新增：只有符合此正規表示式的結果才觸發 onScan，例如 /^(stock:)?[a-f0-9-]{36}$/i */
  regexFilter?: RegExp;
}

const QRScanner: React.FC<QRScannerProps> = ({
  onScan,
  onError,
  onStatus,
  className = "",
  style = {},
  active = true,
  facingMode = "environment",
  scanInterval = 120,
  area = 0.6,
  once = true,
  drawBox = true,
  dedupeWindowMs = 1500,
  enableTorchButton = true,
  enableSwitchCamera = true,
  beepOnSuccess = false,
  deviceId,
  warmupMs = 600,
  confirmFrames = 2,
  regexFilter,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef<boolean>(false);
  const [status, setStatus] = useState("初始化中…");
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [currentFacing, setCurrentFacing] = useState<FacingMode>(facingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const startTsRef = useRef<number>(0);
  const lastResultRef = useRef<{ data: string; ts: number } | null>(null);
  const candidateRef = useRef<{ data: string; count: number } | null>(null);

  const setStatusSafe = useCallback((msg: string) => {
    setStatus(msg);
    onStatus?.(msg);
  }, [onStatus]);

  const stopStream = useCallback(() => {
    runningRef.current = false;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const v = videoRef.current;
    if (v && v.srcObject instanceof MediaStream) {
      (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const beep = useCallback(async () => {
    if (!beepOnSuccess) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      o.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 300);
    } catch {}
  }, [beepOnSuccess]);

  const trySetTorch = useCallback(async (on: boolean) => {
    try {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track || !track.getCapabilities) return false;
      const caps = track.getCapabilities() as MediaTrackCapabilities;
      if (!caps || !caps.torch) return false;
      await track.applyConstraints({ advanced: [{ torch: on }] });
      setTorchOn(on);
      return true;
    } catch {
      return false;
    }
  }, []);

  const enumerateCameras = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setHasMultipleCameras(devs.filter(d => d.kind === "videoinput").length > 1);
    } catch {
      setHasMultipleCameras(false);
    }
  }, []);

  const start = useCallback(async () => {
    stopStream();
    candidateRef.current = null;
    lastResultRef.current = null;

    if (!active) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error("此瀏覽器不支援相機");
      setStatusSafe("不支援相機功能");
      onError?.(err);
      return;
    }

    setStatusSafe("請允許相機權限…");
    let stream: MediaStream | null = null;
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: currentFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      await enumerateCameras();

      try {
        const caps = stream.getVideoTracks?.()[0]?.getCapabilities?.() as any;
        setCanTorch(!!(caps && caps.torch));
      } catch {
        setCanTorch(false);
      }

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      await new Promise<void>((resolve) => {
        if (video.videoWidth && video.videoHeight) return resolve();
        video.onloadedmetadata = () => resolve();
      });

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      setVideoRatio(vw / vh);

      const canvas = canvasRef.current!;
      canvas.width = vw;
      canvas.height = vh;

      runningRef.current = true;
      startTsRef.current = Date.now();
      setStatusSafe("相機啟動，掃描中…");

      intervalRef.current = window.setInterval(() => {
        if (!runningRef.current) return;

        const now = Date.now();
        if (now - startTsRef.current < warmupMs) {
          // 預熱期間不要判定，避免一開相機就誤判
          return;
        }

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, vw, vh);

        // 中央 ROI
        const size = Math.floor(Math.min(vw, vh) * Math.max(0.2, Math.min(1, area)));
        const sx = Math.floor((vw - size) / 2);
        const sy = Math.floor((vh - size) / 2);

        const img = ctx.getImageData(sx, sy, size, size);
        const res = jsQR(img.data, img.width, img.height);

        if (drawBox) {
          ctx.save();
          ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
          ctx.lineWidth = 3;
          ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);
          ctx.restore();
        }

        if (res?.data) {
          const data = res.data.trim();

          // 先做格式過濾（若有設定）
          if (regexFilter && !regexFilter.test(data)) {
            // 不符合格式，不當作有效
            return;
          }

          // 確認連續 N 次一致
          if (!candidateRef.current || candidateRef.current.data !== data) {
            candidateRef.current = { data, count: 1 };
          } else {
            candidateRef.current.count += 1;
          }

          if (candidateRef.current.count >= Math.max(1, confirmFrames)) {
            // 再做重複碼時間節流
            const last = lastResultRef.current;
            if (!last || last.data !== data || now - last.ts > dedupeWindowMs) {
              lastResultRef.current = { data, ts: now };

              // 高亮偵測框
              if (drawBox && res.location) {
                const { topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner } = res.location;
                const tx = (p: { x: number; y: number }) => ({ x: p.x + sx, y: p.y + sy });
                const a = tx(topLeftCorner), b = tx(topRightCorner), c = tx(bottomRightCorner), d = tx(bottomLeftCorner);
                ctx.save();
                ctx.strokeStyle = "rgba(0, 255, 0, 0.9)";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.lineTo(c.x, c.y);
                ctx.lineTo(d.x, d.y);
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
              }

              try { navigator.vibrate?.(120); } catch {}
              (async () => beep())();

              setStatusSafe(`偵測到 QR: ${data}`);
              onScan(data);
              candidateRef.current = null;

              if (once) {
                stopStream();
                setStatusSafe("掃描完成，已停止相機");
              }
            }
          }
        }
      }, Math.max(60, scanInterval));
    } catch (err: any) {
        const name = err?.name || "";
  const msg = String(err?.message || err || "");

      // 這類錯誤常見於剛授權或裝置切換時，做一次快速重試
      if (name === "AbortError" || /operation was aborted/i.test(msg)) {
        setStatusSafe("相機啟動中斷，正在重試…");
        // 保留目前 modal，不要關閉
        setTimeout(() => {
          start();  // 重新啟動一次
        }, 400);
        return;
      }

      setStatusSafe(err?.name === "NotAllowedError" ? "使用者拒絕相機權限" : "啟動相機失敗");
      onError?.(err instanceof Error ? err : new Error(String(err)));
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
  }, [
    active, currentFacing, deviceId, area, drawBox, scanInterval, once,
    dedupeWindowMs, warmupMs, confirmFrames, regexFilter,
    onError, onScan, setStatusSafe, stopStream, beep, enumerateCameras
  ]);

  useEffect(() => {
    if (active) start();
    return () => stopStream();
  }, [active, start, stopStream]);

  useEffect(() => { setCurrentFacing(facingMode); }, [facingMode]);

  const toggleFacing = async () => {
    setCurrentFacing((p) => (p === "environment" ? "user" : "environment"));
    await start();
  };

  const toggleTorch = async () => {
    const ok = await trySetTorch(!torchOn);
    if (!ok) setStatusSafe("此裝置不支援手電筒");
  };

  const aspect = videoRatio ? `${videoRatio}` : "1";

  return (
    <div className={className} style={{ position: "relative", width: "100%", aspectRatio: aspect, backgroundColor: "#000", ...style }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: active ? "block" : "none" }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />

      <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", background: "rgba(0,0,0,0.5)", color: "#fff", padding: 6, fontSize: 12, textAlign: "center" }}>
        {status}
      </div>
    </div>
  );
};

export default QRScanner;
