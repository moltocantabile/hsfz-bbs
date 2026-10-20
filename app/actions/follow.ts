"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notify";

/** 关注 / 取消关注某位同学 */
export async function toggleFollowAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const targetId = Number(formData.get("user_id"));
  if (!targetId || targetId === user.id) return;
  if (!db.prepare("SELECT 1 AS x FROM users WHERE id = ?").get(targetId)) return;

  const existing = db
    .prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?")
    .get(user.id, targetId) as { id: number } | undefined;

  if (existing) {
    db.prepare("DELETE FROM follows WHERE id = ?").run(existing.id);
  } else {
    db.prepare(
      "INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, datetime('now','localtime'))"
    ).run(user.id, targetId);
    notify(targetId, "follow", user.id, 0, 0, "关注了你");
  }
  revalidatePath("/", "layout");
}
