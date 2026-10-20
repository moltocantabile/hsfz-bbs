"use client";

import { useActionState } from "react";
import { adminResetPasswordAction } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function AdminResetPasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(adminResetPasswordAction, null);
  return (
    <form action={formAction} className="space-y-3 p-4">
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
        <input name="username" required className="input" placeholder="用户名" />
        <input
          name="password"
          required
          minLength={8}
          className="input"
          placeholder="临时密码（至少 8 位）"
        />
      </div>
      <p className="text-xs text-muted">
        用于同学忘记密码时人工核实后代为重置。重置后对方的所有登录会被退出，请通知对方用临时密码登录并尽快自行修改。
      </p>
      <div className="flex justify-end">
        <SubmitButton>重置密码</SubmitButton>
      </div>
    </form>
  );
}
