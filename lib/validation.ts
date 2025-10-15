// lib/validation.ts（只列出新增/變更部分）
import { z } from "zod";

/** 註冊 Step1 不變 */
export const signupInitSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  email: z.string().email().trim(),
});

/** 註冊 Step2：只驗證碼 */
export const signupVerifyOnlySchema = z.object({
  email: z.string().email().trim(),
  code: z.string().min(6).max(6),
});

/** 註冊 Step3：ticket + 密碼（含確認） */
export const signupCompleteSchema = z
  .object({
    ticket: z.string().min(10),
    password: z.string().min(8).max(200),
    passwordConfirm: z.string().min(8).max(200),
  })
  .refine((d) => d.password === d.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Passwords do not match",
  });

/** Reset — Step 1: 只收 email，先寄驗證碼 **/
export const resetInitSchema = z.object({
  email: z.string().email().trim(),
});

/** Reset — Step 2: 驗證碼 + 新密碼 + 確認新密碼 **/
export const resetVerifySchema = z
  .object({
    email: z.string().email().trim(),
    code: z.string().min(6).max(6),
    newPassword: z.string().min(8).max(200),
    newPasswordConfirm: z.string().min(8).max(200),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    path: ["newPasswordConfirm"],
    message: "Passwords do not match",
  });

// Step2：只驗證 email + code
export const resetVerifyOnlySchema = z.object({
  email: z.string().email().trim(),
  code: z.string().min(6).max(6),
});

// Step3：ticket + 新密碼（含確認）
export const resetCompleteSchema = z
  .object({
    ticket: z.string().min(10),
    newPassword: z.string().min(8).max(200),
    newPasswordConfirm: z.string().min(8).max(200),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    path: ["newPasswordConfirm"],
    message: "Passwords do not match",
  });
