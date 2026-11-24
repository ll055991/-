import { useState, type FormEvent } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@wall/shared";
import { useAuthStore } from "../stores/useAuthStore";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === "login") {
        await login({ username, password });
      } else {
        await register({
          username,
          password,
          nickname: nickname.trim() || undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin(demoUsername: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login({ username: demoUsername, password: DEMO_PASSWORD });
    } catch (err) {
      setError(err instanceof Error ? err.message : "演示账号登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white font-semibold text-lg mb-3">
            墙
          </div>
          <h1 className="text-xl font-semibold text-slate-900">鹰眼智能 · 实时评论墙</h1>
          <p className="text-sm text-slate-500 mt-1">登录后即可在画布任意位置留下你的建议</p>
        </div>

        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl mb-5 text-sm">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setError(null);
            }}
            className={`py-2 rounded-lg font-medium transition ${
              tab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            账号登录
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setError(null);
            }}
            className={`py-2 rounded-lg font-medium transition ${
              tab === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            注册新账号
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-20 位字母、数字、下划线或中文"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
            />
          </div>

          {tab === "register" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                显示昵称（选填）
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="默认使用用户名"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            {submitting ? "提交中..." : tab === "login" ? "登录进入评论墙" : "注册并进入"}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="text-xs text-slate-400 text-center mb-3">
            一键切换演示账号（支持开多个窗口测试实时同步）
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                disabled={submitting}
                onClick={() => void handleDemoLogin(acc.username)}
                className="flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition text-xs font-medium text-slate-700 cursor-pointer disabled:opacity-50"
              >
                <span
                  className="w-5 h-5 rounded-full text-white text-[11px] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: acc.avatarColor }}
                >
                  {acc.nickname[0]}
                </span>
                {acc.nickname}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
