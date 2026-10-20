"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

function Alert({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        state.ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
    >
      {state.message}
    </div>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(resetPasswordAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <Alert state={state} />
      <div>
        <label className="mb-1 block text-sm font-medium">用户名</label>
        <input name="username" required className="input" placeholder="你的用户名" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">注册时的手机号</label>
        <input name="phone" required maxLength={11} className="input" placeholder="11 位手机号" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">新密码</label>
        <input name="password" type="password" required minLength={6} className="input" placeholder="至少 6 位" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">确认新密码</label>
        <input name="password2" type="password" required minLength={6} className="input" placeholder="再输入一次" />
      </div>
      <div className="flex justify-end"><SubmitButton className="btn-primary" icon="key" pendingText="提交中…">
        重置密码
      </SubmitButton></div>
    </form>
  );
}
