"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const fail = (message: string): { ok: boolean; message: string } => ({ message, ok: false });
const okMsg = (message: string): { ok: boolean; message: string } => ({ message, ok: true });

export type GuestRequestState = { ok: boolean; message: string } | null;

/** 游客提交登录求助（无需登录；仅管理员在后台可见） */
export async function submitGuestRequestAction(
  _prev: GuestRequestState,
  formData: FormData
): Promise<GuestRequestState> {
  const username = String(formData.get("username") ?? "").trim().slice(0, 30);
  const contact = String(formData.get("contact") ?? "").trim().slice(0, 60);
  const detail = String(formData.get("detail") ?? "").trim().slice(0, 300);
  if (!contact) return fail("请留下联系方式（QQ / 微信号），方便管理员联系你");
  if (!detail) return fail("请简单描述你遇到的问题");
  db.prepare(
    "INSERT INTO guest_requests (username, contact, detail, created_at) VALUES (?, ?, ?, datetime('now','localtime'))"
  ).run(username, contact, detail);
  revalidatePath("/admin");
  return okMsg("已提交！管理员会尽快通过你留下的方式联系你，请留意消息。");
}

/** 管理员删除一条已处理的求助 */
export async function deleteGuestRequestAction(formData: FormData): Promise<void> {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return;
  const id = Number(formData.get("id"));
  if (!id) return;
  db.prepare("DELETE FROM guest_requests WHERE id = ?").run(id);
  revalidatePath("/admin");
}
