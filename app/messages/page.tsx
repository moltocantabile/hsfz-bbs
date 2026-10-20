import Link from "next/link";
import { db } from "@/lib/db";
import { recentNotifications, markNotificationsRead } from "@/lib/notify";
import { requireUser } from "@/lib/auth";
import { NewTicketForm } from "@/components/TicketForms";
import { timeAgo, ticketCategoryName, TICKET_STATUS } from "@/lib/format";

export const metadata = { title: "我的消息" };

export default async function MessagesPage() {
  const user = await requireUser();
  const tickets = db
    .prepare(
      `SELECT t.*,
        EXISTS (SELECT 1 FROM ticket_messages m
                WHERE m.ticket_id = t.id AND m.is_admin = 1 AND m.created_at > t.user_read_at) AS unread
       FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`
    )
    .all(user.id) as Array<{
      id: number; category: string; subject: string; status: string; unread: number; updated_at: string;
    }>;

  const notifications = recentNotifications(user.id);
  markNotificationsRead(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">通知与工单</h1>
      <p className="text-sm text-muted">
        在这里你可以给管理员提交工单：申请专属头衔、提出改进建议、举报内容或其他问题，管理员会逐条回复。
      </p>

      {notifications.length > 0 && (
        <div className="card">
          <div className="card-header">互动通知（{notifications.length}）</div>
          <ul className="divide-y divide-line">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.thread_id ? `/t/${n.thread_id}${n.reply_id ? `#reply-${n.reply_id}` : ""}` : "/"}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-soft/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.is_read === 0 ? "font-semibold text-ink" : "text-muted"}`}>
                      {n.is_read === 0 && (
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />
                      )}
                      {(n.actor_name ?? "有同学") + " " + n.content}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="card" open={tickets.length === 0}>
        <summary className="card-header cursor-pointer select-none">发起新工单</summary>
        <NewTicketForm />
      </details>

      <div className="card">
        <div className="card-header">全部工单（{tickets.length}）</div>
        {tickets.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted">还没有工单，有问题或建议就发一张吧～</p>
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => {
              const st = TICKET_STATUS[t.status] ?? TICKET_STATUS.open;
              return (
                <li key={t.id}>
                  <Link href={`/messages/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-soft/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {t.unread === 1 && (
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" title="管理员有新回复" />
                        )}
                        <span className="truncate font-medium">{t.subject}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {ticketCategoryName(t.category)} · {timeAgo(t.updated_at)}
                      </span>
                    </span>
                    <span className={`pill shrink-0 ${st.cls}`}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
