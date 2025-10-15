// features/UserAccountManager.tsx
"use client";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Mail, User, Lock, Check, TimerReset } from "lucide-react";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ============ 小工具 ============ */
const cx = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");
const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl
  );

/* ============ API 型別 ============ */
type ApiResp = {
  ok: boolean;
  message?: string;
  expiresAt?: string;
  ticket?: string;
  ticketExpiresAt?: string;
};

type Banner = { kind: "success" | "error" | "info"; text: string } | null;

/* ============ 解析 JSON（帶在地化錯誤） ============ */
function humanizeApiError(
  payload: any,
  opts?: { tPwdTooShort?: string; tGeneric?: string }
): string {
  const tShort = opts?.tPwdTooShort || "Password must be at least 8 characters.";
  const tGeneric = opts?.tGeneric || "Operation failed. Please try again.";
  try {
    // Zod error array
    if (Array.isArray(payload)) {
      const tooSmallPwd = payload.find(
        (e: any) =>
          e?.code === "too_small" &&
          ["password", "passwordConfirm", "newPassword", "newPasswordConfirm"].some(
            (k) => (e?.path || []).includes(k)
          )
      );
      if (tooSmallPwd) return tShort;
      if (payload[0]?.message) return String(payload[0].message);
    }
    // { message }
    if (payload && typeof payload === "object" && payload.message) {
      // 後端直接丟英/中錯誤字串時，原樣顯示
      return String(payload.message);
    }
    // string
    if (typeof payload === "string") {
      if (/too_small/i.test(payload) && /(password|newPassword)/i.test(payload))
        return tShort;
      return payload;
    }
  } catch {}
  return tGeneric;
}

async function readJsonResponse(
  r: Response,
  opts?: { tPwdTooShort?: string; tGeneric?: string }
) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let data: any = null;
    try {
      data = await r.json();
    } catch (e: any) {
      throw new Error(humanizeApiError(e?.message || "", opts));
    }
    if (!r.ok) {
      throw new Error(humanizeApiError(data, opts));
    }
    return data;
  }
  const text = await r.text();
  throw new Error(humanizeApiError(text, opts));
}

/* ============ 主元件 ============ */
export default function UserAccountManager() {
  // i18n dicts
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,
    zh: zhTW,
    en: enUS,
    hi: hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const t = dict?.UserAccounts ?? {};

  // ---- tabs / timer ----
  const [tab, setTab] = useState<"create" | "reset">("create");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) return setSecondsLeft(0);
    const id = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(ms > 0 ? Math.ceil(ms / 1000) : 0);
    }, 250);
    return () => clearInterval(id);
  }, [expiresAt]);

  const [loading, setLoading] = useState(false);

  /* =====================
   * Create（註冊流程）
   * ===================== */
  const [cStep, setCStep] = useState<1 | 2 | 3>(1);
  const [cBanner, setCBanner] = useState<Banner>(null);

  const [cUsername, setCUsername] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCode, setCCode] = useState("");

  const [cTicket, setCTicket] = useState<string | null>(null);
  const [cPassword, setCPassword] = useState("");
  const [cPassword2, setCPassword2] = useState("");
  const cPwdMismatch =
    cPassword.length > 0 &&
    cPassword2.length > 0 &&
    cPassword !== cPassword2;

  const cCodeRef = useRef<SixDigitHandle>(null);

  async function createInit() {
    setLoading(true);
    setCBanner(null);
    try {
      const r = await fetch("/api/users/register/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cUsername.trim(),
          email: cEmail.trim(),
        }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setExpiresAt(j.expiresAt ?? null);
      setCStep(2);
    } catch (e: any) {
      setCBanner({
        kind: "error",
        text: e.message || t.errors?.send_code_failed || "Failed to send code",
      });
    } finally {
      setLoading(false);
    }
  }

  async function createResend() {
    await createInit();
    setCBanner({
      kind: "success",
      text:
        t.info?.code_resent || "Verification code resent. Timer restarted.",
    });
  }

  async function createVerifyOnly() {
    setLoading(true);
    setCBanner(null);
    try {
      const r = await fetch("/api/users/register/verify-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cEmail.trim(), code: cCode.trim() }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setCTicket(j.ticket || null);
      setCStep(3);
      setExpiresAt(null);
    } catch (e: any) {
      setCBanner({
        kind: "error",
        text: e.message || t.errors?.verify_failed || "Verification failed",
      });
      setCCode("");
      setExpiresAt(null);
      cCodeRef.current?.focusFirst();
    } finally {
      setLoading(false);
    }
  }

  async function createComplete() {
    if (!cTicket) return;
    setLoading(true);
    setCBanner(null);
    try {
      const r = await fetch("/api/users/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: cTicket,
          password: cPassword,
          passwordConfirm: cPassword2,
        }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setCBanner({
        kind: "success",
        text: t.success?.registered || "Account created. You can sign in now.",
      });
      // reset
      setCTicket(null);
      setCStep(1);
      setCUsername("");
      setCEmail("");
      setCCode("");
      setCPassword("");
      setCPassword2("");
    } catch (e: any) {
      setCBanner({
        kind: "error",
        text: e.message || t.errors?.create_failed || "Create failed",
      });
    } finally {
      setLoading(false);
    }
  }

  /* =====================
   * Reset（忘記密碼）
   * ===================== */
  const [rStep, setRStep] = useState<1 | 2 | 3>(1);
  const [rBanner, setRBanner] = useState<Banner>(null);

  const [rEmail, setREmail] = useState("");
  const [rCode, setRCode] = useState("");

  const [rTicket, setRTicket] = useState<string | null>(null);
  const [rNewPassword, setRNewPassword] = useState("");
  const [rNewPassword2, setRNewPassword2] = useState("");
  const rPwdMismatch =
    rNewPassword.length > 0 &&
    rNewPassword2.length > 0 &&
    rNewPassword !== rNewPassword2;

  const rCodeRef = useRef<SixDigitHandle>(null);

  async function resetInit() {
    setLoading(true);
    setRBanner(null);
    try {
      const r = await fetch("/api/users/reset/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rEmail.trim() }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setExpiresAt(j.expiresAt ?? null);
      setRStep(2);
    } catch (e: any) {
      setRBanner({
        kind: "error",
        text: e.message || t.errors?.send_code_failed || "Failed to send code",
      });
    } finally {
      setLoading(false);
    }
  }

  async function resetResend() {
    await resetInit();
    setRBanner({
      kind: "success",
      text:
        t.info?.code_resent || "Verification code resent. Timer restarted.",
    });
  }

  async function resetVerifyOnly() {
    setLoading(true);
    setRBanner(null);
    try {
      const r = await fetch("/api/users/reset/verify-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rEmail.trim(), code: rCode.trim() }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setRTicket(j.ticket || null);
      setRStep(3);
      setExpiresAt(null);
    } catch (e: any) {
      setRBanner({
        kind: "error",
        text: e.message || t.errors?.verify_failed || "Verification failed",
      });
      setRCode("");
      setExpiresAt(null);
      rCodeRef.current?.focusFirst();
    } finally {
      setLoading(false);
    }
  }

  async function resetComplete() {
    if (!rTicket) return;
    setLoading(true);
    setRBanner(null);
    try {
      const r = await fetch("/api/users/reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: rTicket,
          newPassword: rNewPassword,
          newPasswordConfirm: rNewPassword2,
        }),
      });
      const j: ApiResp = await readJsonResponse(r, {
        tPwdTooShort: t.errors?.pwd_too_short,
        tGeneric: t.errors?.generic,
      });
      if (!j.ok) throw new Error(j.message || `${r.status} ${r.statusText}`);
      setRBanner({
        kind: "success",
        text: t.success?.password_updated || "Password updated.",
      });
      // reset
      setRTicket(null);
      setRStep(1);
      setREmail("");
      setRCode("");
      setRNewPassword("");
      setRNewPassword2("");
    } catch (e: any) {
      setRBanner({
        kind: "error",
        text: e.message || t.errors?.reset_failed || "Reset failed",
      });
    } finally {
      setLoading(false);
    }
  }

  // 切分頁時重置
  useEffect(() => {
    setExpiresAt(null);
    setSecondsLeft(0);

    setCStep(1);
    setRStep(1);
    setCBanner(null);
    setRBanner(null);

    setCUsername("");
    setCEmail("");
    setCCode("");
    setCTicket(null);
    setRTicket(null);

    setCPassword("");
    setCPassword2("");
    setRNewPassword("");
    setRNewPassword2("");
  }, [tab]);

  /* ============ Render ============ */
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <User className="h-7 w-7" aria-hidden="true" />
        <span>{t.title || "User Accounts"}</span>
      </h1>

      {/* Tabs + Timer */}
      <div className="flex gap-2 mb-6 items-center">
        <button
          className={cx(
            "px-3 py-2 rounded-xl border",
            tab === "create"
              ? "bg-blue-600 text-white"
              : "bg-transparent text-gray-700 dark:text-gray-200"
          )}
          onClick={() => setTab("create")}
          disabled={loading}
        >
          {t.tabs?.create || "Create"}
        </button>
        <button
          className={cx(
            "px-3 py-2 rounded-xl border",
            tab === "reset"
              ? "bg-blue-600 text-white"
              : "bg-transparent text-gray-700 dark:text-gray-200"
          )}
          onClick={() => setTab("reset")}
          disabled={loading}
        >
          {t.tabs?.reset || "Forgot password"}
        </button>

        {secondsLeft > 0 && (
          <span className="ml-auto inline-flex items-center gap-2 text-sm text-gray-500">
            <TimerReset size={16} />
            {fmt(t.timer?.secondsTpl || "{s}s", { s: secondsLeft })}
          </span>
        )}
      </div>

      {tab === "create" ? (
        <section className="space-y-4">
          {cBanner && <Banner tone={cBanner.kind} text={cBanner.text} />}

          {/* Step 1 */}
          {cStep === 1 && (
            <>
              <Field label={t.fields?.username || "Username"} icon={<User size={16} />}>
                <input
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={cUsername}
                  onChange={(e) => setCUsername(e.target.value)}
                />
              </Field>
              <Field label={t.fields?.email || "Email"} icon={<Mail size={16} />}>
                <input
                  type="email"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                />
              </Field>
              <div className="flex justify-end">
                <button
                  onClick={createInit}
                  disabled={loading || !cUsername || !cEmail}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.send_code || "Send code"}
                </button>
              </div>
            </>
          )}

          {/* Step 2 */}
          {cStep === 2 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {fmt(
                  t.info?.code_sent_to || "A 6-digit code was sent to {email}.",
                  { email: cEmail }
                )}
              </p>
              <Field
                label={t.fields?.verification_code || "Verification code"}
                icon={<Check size={16} />}
              >
                <SixDigitCode
                  ref={cCodeRef}
                  value={cCode}
                  onChange={setCCode}
                  disabled={loading}
                />
              </Field>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={createVerifyOnly}
                  disabled={loading || cCode.length !== 6}
                  className="px-4 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.verify_email || "Verify email"}
                </button>
                <button
                  onClick={createResend}
                  disabled={loading || secondsLeft > 0}
                  className="px-4 py-2 rounded-xl border"
                >
                  {t.buttons?.resend || "Resend"}
                </button>
              </div>
            </>
          )}

          {/* Step 3 */}
          {cStep === 3 && (
            <>
              <Field label={t.fields?.password || "Password"} icon={<Lock size={16} />}>
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                />
              </Field>
              <Field
                label={t.fields?.confirm_password || "Confirm password"}
                icon={<Lock size={16} />}
              >
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={cPassword2}
                  onChange={(e) => setCPassword2(e.target.value)}
                />
              </Field>
              {cPwdMismatch && (
                <p className="text-sm text-red-600">
                  {t.errors?.pwd_mismatch || "Passwords do not match."}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={createComplete}
                  disabled={loading || !cPassword || cPwdMismatch}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.set_password_create || "Set password & Create"}
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        /* ===== Reset tab ===== */
        <section className="space-y-4">
          {rBanner && <Banner tone={rBanner.kind} text={rBanner.text} />}

          {/* Step 1 */}
          {rStep === 1 && (
            <>
              <Field label={t.fields?.email || "Email"} icon={<Mail size={16} />}>
                <input
                  type="email"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={rEmail}
                  onChange={(e) => setREmail(e.target.value)}
                />
              </Field>
              <div className="flex justify-end">
                <button
                  onClick={resetInit}
                  disabled={loading || !rEmail}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.send_code || "Send code"}
                </button>
              </div>
            </>
          )}

          {/* Step 2 */}
          {rStep === 2 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {fmt(
                  t.info?.code_sent_to || "A 6-digit code was sent to {email}.",
                  { email: rEmail }
                )}
              </p>
              <Field
                label={t.fields?.verification_code || "Verification code"}
                icon={<Check size={16} />}
              >
                <SixDigitCode
                  ref={rCodeRef}
                  value={rCode}
                  onChange={setRCode}
                  disabled={loading}
                />
              </Field>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetVerifyOnly}
                  disabled={loading || rCode.length !== 6}
                  className="px-4 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.verify_email || "Verify email"}
                </button>
                <button
                  onClick={resetResend}
                  disabled={loading || secondsLeft > 0}
                  className="px-4 py-2 rounded-xl border"
                >
                  {t.buttons?.resend || "Resend"}
                </button>
              </div>
            </>
          )}

          {/* Step 3 */}
          {rStep === 3 && (
            <>
              <Field
                label={t.fields?.new_password || "New password"}
                icon={<Lock size={16} />}
              >
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={rNewPassword}
                  onChange={(e) => setRNewPassword(e.target.value)}
                />
              </Field>
              <Field
                label={t.fields?.confirm_new_password || "Confirm new password"}
                icon={<Lock size={16} />}
              >
                <input
                  type="password"
                  className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800"
                  value={rNewPassword2}
                  onChange={(e) => setRNewPassword2(e.target.value)}
                />
              </Field>
              {rPwdMismatch && (
                <p className="text-sm text-red-600">
                  {t.errors?.pwd_mismatch || "Passwords do not match."}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetComplete}
                  disabled={loading || !rNewPassword || rPwdMismatch}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
                >
                  {t.buttons?.set_new_password || "Set new password"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/* ============ Reusable UI ============ */
function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block mb-1 text-sm text-gray-700 dark:text-gray-300 inline-flex items-center gap-2">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function Banner({
  tone,
  text,
}: {
  tone: "success" | "error" | "info";
  text: string;
}) {
  const toneClass = useMemo(() => {
    switch (tone) {
      case "success":
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800";
      case "error":
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800";
      default:
        return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800";
    }
  }, [tone]);
  return (
    <div className={cx("rounded-xl border px-3 py-2 text-sm", toneClass)}>
      {text}
    </div>
  );
}

/* ============ SixDigitCode ============ */
type SixDigitHandle = { focusFirst: () => void };

const SixDigitCode = forwardRef<
  SixDigitHandle,
  { value: string; onChange: (v: string) => void; disabled?: boolean }
>(({ value, onChange, disabled }, ref) => {
  const digits = (value || "").replace(/[^0-9]/g, "").slice(0, 6).split("");
  const refs = useRef<HTMLInputElement[]>([]);

  function setRef(el: HTMLInputElement | null, i: number) {
    if (!el) return;
    refs.current[i] = el;
  }
  function focusAt(i: number) {
    const el = refs.current[i];
    if (el) el.focus();
  }
  useImperativeHandle(ref, () => ({
    focusFirst: () => focusAt(0),
  }));

  function setAt(i: number, ch: string) {
    const arr = Array.from({ length: 6 }, (_, idx) =>
      idx === i ? ch : digits[idx] || ""
    );
    const joined = arr.join("").replace(/[^0-9]/g, "").slice(0, 6);
    onChange(joined);
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => setRef(el, i)}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={digits[i] || ""}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "").slice(-1);
            setAt(i, v);
            if (v && i < 5) focusAt(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              if (!digits[i] && i > 0) {
                focusAt(i - 1);
                const arr = digits.slice();
                arr[i - 1] = "";
                onChange(arr.join(""));
                e.preventDefault();
              }
            } else if (e.key === "ArrowLeft" && i > 0) {
              focusAt(i - 1);
              e.preventDefault();
            } else if (e.key === "ArrowRight" && i < 5) {
              focusAt(i + 1);
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            const only = (text || "").replace(/[^0-9]/g, "").slice(0, 6);
            if (only.length) {
              onChange(only);
              const nextIndex = Math.min(5, only.length - 1);
              requestAnimationFrame(() => focusAt(nextIndex));
              e.preventDefault();
            }
          }}
          className="w-10 h-12 text-center text-lg tracking-widest border rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`digit-${i + 1}`}
        />
      ))}
    </div>
  );
});
SixDigitCode.displayName = "SixDigitCode";
