import { recommendationsEnabled } from "@/lib/experiments";
import { RecommendedFeed } from "@/components/recommendation/RecommendedFeed";
import { IconLink } from "@/components/IconAction";
import { ScrollRow } from "@/components/ScrollRow";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { allBoards, threadsSorted, announcementThreads, hotThreads, featuredThreads, siteStats } from "@/lib/queries";
import { ThreadList } from "@/components/ThreadList";
import { groups } from "@/lib/social";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ feed?: string; sort?: string }> }) {
  const user = await getCurrentUser();
  const { feed, sort } = await searchParams;
  const enabled = !!user && recommendationsEnabled(user.id);
  const sorts = [...(enabled ? [["recommended", "为你推荐"]] : []), ["latest", "最新讨论"], ["reply", "最多回复"], ["likes", "最多点赞"], ["views", "最多浏览"], ["hot", "大家在聊"], ["featured", "精华收藏"]];
  const requested = sort ?? feed;
  const active = sorts.some(([key]) => key === requested) ? requested! : enabled ? "recommended" : "latest";
  const threads = !user ? announcementThreads(5) : active === "hot" ? hotThreads(25) : active === "featured" ? featuredThreads(25) : threadsSorted(active, 25);
  const boards = allBoards();
  const stats = siteStats();
  const groupList = user ? groups(user.id).slice(0, 3) : [];
  const popularBoards = [...boards].sort((a, b) => b.thread_count - a.thread_count).slice(0, 5);
  return <div>
    <div className="page-heading"><div><h1>校园讨论</h1><p>从一道题，到一整个青春。</p></div><IconLink href={user ? "/new" : "/login"} className="btn-primary" icon="compose" label="发布帖子" /></div>
    <div className="campus-note"><span className="notice-dot" /><p>这里是华附人的公共客厅。分享、提问，或找到同路的朋友。</p><Link href="/b/announcements">社区公约 ↗</Link></div>
    {/* Canvas = flexible discussion column + 280px rail + one 24px gutter. */}
    <div className="forum-grid">
      <section className="discussion-column" aria-label="校园帖子">
        <div className="feed-toolbar">{user ? <ScrollRow as="nav" className="feed-tabs" aria-label="帖子排序">{sorts.map(([key, label]) => <Link key={key} href={key === (enabled ? "recommended" : "latest") ? "/" : `/?sort=${key}`} aria-current={active === key ? "page" : undefined} className={active === key ? "selected" : ""}>{label}</Link>)}</ScrollRow> : <h2 className="font-semibold">站务公告</h2>}<span className="text-xs text-muted">{threads.length} 个主题</span></div>
        {!user && <div className="card mb-4 p-5"><p className="text-sm text-muted">论坛内容仅对注册同学开放。登录后可浏览全部帖子与回复。</p><div className="mt-4 flex gap-2"><IconLink href="/login" className="btn-primary" icon="login" label="登录" /><IconLink href="/register" className="btn" icon="user-plus" label="注册" /></div></div>}
        <div className="thread-sheet">{user && active === "recommended" ? <RecommendedFeed userId={user.id} boards={boards.map(({id,name})=>({id,name}))} fallback={<ThreadList threads={threads} />} /> : <ThreadList threads={threads} />}</div>
        <p className="feed-end">更多故事，正在各个板块发生。<Link href="/boards">去逛逛 ↗</Link></p>
      </section>
      <aside className="community-rail">
        <section className="rail-section"><div className="rail-heading"><h2>校园一角</h2><span>HSFZ</span></div><dl className="community-stats"><div><dt>同学</dt><dd>{stats.users.toLocaleString()}</dd></div><div><dt>主题</dt><dd>{stats.threads.toLocaleString()}</dd></div><div><dt>回复</dt><dd>{stats.replies.toLocaleString()}</dd></div></dl><p className="text-xs text-muted mt-4">过去 24 小时，新增 {stats.recent} 个话题。</p></section>
        <section className="rail-section"><div className="rail-heading"><h2>常逛的板块</h2><Link href="/boards">全部 ↗</Link></div><div className="rail-boards">{popularBoards.map(b => <Link key={b.id} href={`/b/${b.slug}`}><span>{b.name}<small>{b.category}</small></span><span className="tabular-nums">{b.thread_count}</span></Link>)}</div></section>
        <section className="rail-section"><div className="rail-heading"><h2>找到你的同路人</h2><Link href="/groups">小组 ↗</Link></div>{groupList.length ? groupList.map(g => <Link className="rail-group" key={g.id} href={`/groups/${g.id}`}><b>{g.name}</b><small>{g.member_count} 位成员 · {g.message_count} 条讨论</small></Link>) : <><p className="text-sm text-muted leading-6">约一场球，一起解一道题，或聊聊共同喜欢的事。</p><Link href="/groups/new" className="rail-create">创建第一个兴趣小组 ↗</Link></>}</section>
        <div className="school-motto"><p>进德修业<br />格物致知</p><small>华南师范大学附属中学</small></div>
      </aside>
    </div>
  </div>;
}
