import { IconButton, IconLink } from "./IconAction";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { unreadTicketCount, openTicketCount, unreadNotificationCount } from "@/lib/queries";
import { unreadDirectCount } from "@/lib/social";
import { SidebarNav, MobileMenu } from "./SidebarNav";
import { Avatar } from "./Avatar";
import SiteBadge from "./SiteBadge";
import ThemeToggle from "./ThemeToggle";
import { logoutAction } from "@/app/actions/auth";

export default async function Header() {
  const user = await getCurrentUser();
  const unread = user ? unreadTicketCount(user.id) + unreadNotificationCount(user.id) : 0;
  const openTickets = user?.role === "admin" ? openTicketCount() : 0;
  const directUnread = user ? unreadDirectCount(user.id) : 0;
  const links = [
    { href: "/", label: "校园讨论", icon: "M4 4h16v12H9l-5 4V4Z" },
    { href: "/boards", label: "全部板块", icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" },
    { href: "/groups", label: "兴趣小组", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8" },
    { href: "/inbox", label: "私信", count: directUnread, icon: "M3 5h18v14H3z M3 5l9 7 9-7" },
    { href: "/messages", label: "通知与工单", count: unread, icon: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4" },
    ...(user ? [{ href: "/experimental", label: "实验功能", icon: "M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8" }] : []),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "管理后台", count: openTickets, icon: "M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z" }] : []),
  ];

  return <>
    <header className="mobile-header">
      <Link href="/" className="brand-lockup"><SiteBadge className="h-8 w-8" /><b>HSFZ BBS</b></Link>
      <MobileMenu><SidebarNav links={links} /><Link className="nav-item" href="/search">搜索帖子</Link>{user && <Link className="nav-item" href={`/u/${user.username}`}>{user.nickname} · 个人主页</Link>}<Link className="nav-item" href={user ? "/settings" : "/login"}>{user ? "账号设置" : "登录 / 注册"}</Link>{user && <form action={logoutAction}><IconButton type="submit" icon="logout" label="退出登录" /></form>}<ThemeToggle /></MobileMenu>
    </header>
    <aside className="app-sidebar">
      <Link href="/" className="brand-lockup"><SiteBadge className="h-9 w-9" /><span><b>HSFZ BBS</b><small>华南师大附中 · 校园社区</small></span></Link>
      <form action="/search" className="sidebar-search"><label htmlFor="sidebar-search" className="sr-only">搜索帖子</label><input id="sidebar-search" name="q" placeholder="搜索校园里的事" /><IconButton icon="search" label="搜索" type="submit" className="" /></form>
      <SidebarNav links={links} />
      <div className="sidebar-caption">进德修业，格物致知。</div>
      <div className="sidebar-bottom">
        <div className="flex items-center justify-between mb-4"><Link href="/b/announcements" className="text-xs text-muted">社区公约</Link><ThemeToggle /></div>
        {user ? <><Link className="sidebar-user" href={`/u/${user.username}`}><Avatar user={user} size={36} /><span><b>{user.nickname}</b><small>@{user.username}</small></span></Link><div className="flex justify-between mt-4 text-xs"><Link href="/settings">账号设置</Link><form action={logoutAction}><IconButton type="submit" icon="logout" label="退出登录" /></form></div></> : <div className="flex gap-2"><IconLink href="/login" className="btn-primary" icon="login" label="登录" /><IconLink href="/register" icon="user-plus" label="注册" /></div>}
      </div>
    </aside>
  </>;
}
