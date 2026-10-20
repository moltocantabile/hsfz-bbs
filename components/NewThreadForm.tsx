"use client";

import { useActionState, useRef, useState } from "react";
import { createThreadAction } from "@/app/actions/forum";
import type { ActionState } from "@/app/actions/auth";
import type { BoardRow } from "@/lib/queries";
import { MarkdownEditor } from "./MarkdownEditor";
import { ImagePicker } from "./ImagePicker";
import { SubmitButton } from "./SubmitButton";

const CAT_ORDER = ["学习成长", "年级群", "生活娱乐", "球友", "游戏", "交易互助", "情感联结", "官方"];

export function NewThreadForm({
  boards,
  defaultBoardId,
  isAdmin,
  recommendationEnabled,
}: {
  boards: BoardRow[];
  defaultBoardId?: number;
  isAdmin: boolean;
  recommendationEnabled: boolean;
}) {
  const [preparing, setPreparing] = useState(false);
  const [encodingNotice, setEncodingNotice] = useState("");
  const cachedVector = useRef<{text:string;encoded:string;version:string} | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (previous, form) => {
    const title = String(form.get("title") ?? ""), body = String(form.get("content") ?? "");
    // Server validation remains authoritative; do not download a model for an empty draft.
    if (recommendationEnabled && title.trim().length>=2 && body.trim().length>=2) {
      setPreparing(true);setEncodingNotice("");
      try {
        const text = `${title.trim()}\n${body.trim()}`;
        if (cachedVector.current?.text !== text) {
          const { encodePost } = await import("@/lib/recommendation/encoder");
          cachedVector.current = {text,...await encodePost(title,body)};
        }
        form.set("post_vec",cachedVector.current.encoded);
        form.set("vec_model_version",cachedVector.current.version);
      } catch { setEncodingNotice("推荐准备暂不可用，帖子仍会正常发布。"); }
      finally { setPreparing(false); }
    }
    return createThreadAction(previous,form);
  }, null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const visible = isAdmin ? boards : boards.filter((b) => b.slug !== "announcements");

  // 两级选择：先大类，再板块
  const defaultBoard = visible.find((b) => b.id === defaultBoardId);
  const [cat, setCat] = useState<string>(defaultBoard?.category ?? "");
  const [boardId, setBoardId] = useState<string>(defaultBoard ? String(defaultBoard.id) : "");
  const cats = CAT_ORDER.filter((c) => visible.some((b) => b.category === c));
  const catBoards = visible.filter((b) => b.category === cat);
  const isConfession = boardId === String(visible.find((b) => b.slug === "confession")?.id);

  function changeCat(c: string) {
    setCat(c);
    const first = visible.find((b) => b.category === c);
    if (first) setBoardId(String(first.id));
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      {(preparing || encodingNotice) && <p className="text-sm text-muted" role="status">{preparing ? "正在准备发布，首次使用需要下载推荐组件…" : encodingNotice}</p>}
      {state && !state.ok && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">选择大类</label>
          <select
            value={cat}
            disabled={pending}
            required
            className="input"
            onChange={(e) => changeCat(e.target.value)}
          >
            <option value="" disabled>
              请选择大类…
            </option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">选择板块</label>
          <select
            name="board_id"
            value={boardId}
            required
            disabled={!cat || pending}
            className="input disabled:opacity-50"
            onChange={(e) => setBoardId(e.target.value)}
          >
            {!cat ? (
              <option value="">先选择大类…</option>
            ) : (
              catBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.grade_lock ? `（仅限${b.grade_lock}）` : ""}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">标题</label>
        <input
          name="title"
          disabled={pending}
          value={title}
          onChange={event => setTitle(event.target.value)}
          required
          minLength={2}
          maxLength={60}
          className="input"
          placeholder="一句话说清你的主题（2-60 字）"
        />
      </div>
      <div>
        <label htmlFor="thread-content" className="mb-1 block text-sm font-medium">正文</label>
        <MarkdownEditor id="thread-content" value={content} onChange={setContent} required minLength={2} rows={9} disabled={pending} onAttach={() => imageRef.current?.click()} attachmentLabel="上传图片（最多 4 张）" />
        <p className="mt-1.5 text-xs text-muted">支持 @用户名 提及。请友善发言，遵守社区公约。</p>
      </div>
      {isConfession && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-soft/60 px-3 py-2.5 text-sm">
          <input type="checkbox" name="anonymous" disabled={pending} className="h-4 w-4 accent-[#0e7490]" />
          <span>
            匿名发表
            <span className="ml-1 text-xs text-muted">（展示为「匿名同学」；管理员仍可查看作者以维护秩序）</span>
          </span>
        </label>
      )}
      <div>
        <ImagePicker max={4} externalInputRef={imageRef} hideTrigger disabled={pending} />
        <p className="mt-1.5 text-xs text-muted">
          点击工具栏的附件图标添加图片，支持 JPG / PNG / WEBP / GIF，最多 4 张，自动压缩。
        </p>
      </div>
      <div className="flex justify-end">
        <SubmitButton icon="send" pendingText="发布中…">发布帖子</SubmitButton>
      </div>
    </form>
  );
}
