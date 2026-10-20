import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";
import SiteBadge from "@/components/SiteBadge";

export const metadata = { title: "登录" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; fast?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { registered, fast } = await searchParams;

  return (
    <div className="mx-auto max-w-sm pt-8">
      <div className="mb-5 text-center">
        <SiteBadge className="h-14 w-14" />
        <h1 className="mt-2 text-lg font-semibold">登录 HSFZ BBS</h1>
        <p className="text-sm text-muted">华南师范大学附属中学校园论坛</p>
      </div>

      {registered && (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          {fast
            ? " 校友名单验证通过，账号已直接开通！现在即可登录。"
            : " 注册申请已提交！账号需要管理员审核通过后才能登录，请耐心等待。"}
        </div>
      )}

      <div className="card p-5">
        <LoginForm />
      </div>
      <p className="mt-3 text-center text-sm">
        <Link href="/forgot" className="link">
          忘记密码？
        </Link>
      </p>
    </div>
  );
}
