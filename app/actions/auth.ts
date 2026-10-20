"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db, GRADES } from "@/lib/db";
import { createSession, destroyCurrentSession } from "@/lib/auth";

export type ActionState = { message: string; ok: boolean } | null;

const fail = (message: string): ActionState => ({ message, ok: false });
const okMsg = (message: string): ActionState => ({ message, ok: true });

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");
  if (!username || !phone) return fail("请填写用户名和注册时的手机号");
  if (password.length < 6) return fail("新密码至少 6 位");
  if (password !== password2) return fail("两次输入的新密码不一致");
  const row = db
    .prepare("SELECT id, phone FROM users WHERE username = ?")
    .get(username) as { id: number; phone: string } | undefined;
  if (!row) return fail("用户不存在");
  if (!row.phone) return fail("该账号未登记手机号，请联系管理员重置密码");
  if (row.phone !== phone) return fail("手机号与注册信息不一致");
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(password, 10),
    row.id
  );
  return okMsg("密码已重置，请使用新密码登录");
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const realName = String(formData.get("real_name") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");

  if (!/^[a-z0-9_]{3,20}$/.test(username))
    return fail("用户名只能包含小写字母、数字、下划线，长度 3-20 位");
  if (realName.length < 2 || realName.length > 20) return fail("请填写真实姓名（2-20 字）");
  if (!studentId || studentId.length > 20) return fail("请填写学号");
  if (![...GRADES, ""].includes(grade)) return fail("请选择正确的年级");
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail("请填写正确的 11 位手机号（用于找回密码）");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("邮箱格式不正确");
  if (password.length < 6) return fail("密码至少 6 位");
  if (password !== password2) return fail("两次输入的密码不一致");
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username))
    return fail("该用户名已被注册");

  // 实名注册：姓名 + 学号与名单匹配的直接开通，否则进入人工审核
  const wlEntry =
    (db
      .prepare("SELECT id, grade FROM whitelist WHERE real_name = ? AND student_id = ? AND used_by = 0")
      .get(realName, studentId) as { id: number; grade: string } | undefined) ?? null;

  const status = wlEntry ? "approved" : "pending";
  const finalGrade = wlEntry ? wlEntry.grade || grade : grade;
  // 昵称默认使用真实姓名，登录后可在「账号设置」中修改
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, nickname, grade, phone, email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
    )
    .run(username, bcrypt.hashSync(password, 10), realName, finalGrade, phone, email, status);

  if (wlEntry) {
    db.prepare("UPDATE whitelist SET used_by = ? WHERE id = ?").run(
      Number(info.lastInsertRowid),
      wlEntry.id
    );
  }

  redirect(wlEntry ? "/login?registered=1&fast=1" : "/login?registered=1");
}

const loginFails = new Map<string, { n: number; until: number }>();

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const lock = loginFails.get(username);
  if (lock && lock.until > Date.now())
    return fail(`登录失败次数过多，请 ${Math.ceil((lock.until - Date.now()) / 60000)} 分钟后再试`);

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | (import("@/lib/db").UserRow & { id: number })
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const rec = loginFails.get(username) ?? { n: 0, until: 0 };
    rec.n += 1;
    if (rec.n >= 5) {
      rec.n = 0;
      rec.until = Date.now() + 15 * 60_000;
    }
    loginFails.set(username, rec);
    return fail("用户名或密码错误");
  }
  loginFails.delete(username);
  if (user.banned) return fail("该账号已被封禁，如有疑问请联系管理员");
  if (user.status === "pending") return fail("账号正在审核中，请等待管理员批准后再登录");
  if (user.status === "rejected")
    return fail(`注册申请未通过${user.reject_reason ? `：${user.reject_reason}` : ""}`);

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/");
}
