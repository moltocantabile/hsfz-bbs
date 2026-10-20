"use client";

import { useActionState } from "react";
import { submitGuestRequestAction, type GuestRequestState } from "@/app/actions/guest";
import { SubmitButton } from "./SubmitButton";

export function GuestRequestForm() {
  const [state, formAction] = useActionState<GuestRequestState, FormData>(
    submitGuestRequestAction,
    null
  );
  return (
    <form action={formAction} className="space-y-2.5">
      {state && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {state.message}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="username" maxLength={30} className="input" placeholder="你的用户名（选填）" />
        <input name="contact" required maxLength={60} className="input" placeholder="联系方式：QQ / 微信号 *" />
      </div>
      <textarea
        name="detail"
        required
        maxLength={300}
        rows={3}
        className="input resize-y"
        placeholder="遇到了什么问题？例如：忘记密码、无法登录、注册未通过…"
      />
      <div className="flex justify-end">
        <SubmitButton className="btn-primary !px-4 !py-1.5 text-sm">提交求助</SubmitButton>
      </div>
    </form>
  );
}
