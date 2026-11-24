import { useMemo } from "react";
import { useAuthStore } from "../../stores/useAuthStore";
import { useBoardStore } from "../../stores/useBoardStore";

export function Sidebar() {
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const onlineUsers = useBoardStore((s) => s.onlineUsers);
  const connectionStatus = useBoardStore((s) => s.connectionStatus);

  // 当前用户置顶，其余在线成员按昵称稳定排序
  const sortedUsers = useMemo(() => {
    if (!currentUser) return onlineUsers;
    return [...onlineUsers].sort((a, b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return a.nickname.localeCompare(b.nickname, "zh-CN");
    });
  }, [onlineUsers, currentUser]);

  return (
    <aside className="w-[60px] bg-white border-r border-slate-200/70 flex flex-col items-center py-4 shrink-0 z-20 select-none">
      {/* 顶部看板主图标，呼应原型左上角深色图标 */}
      <div
        className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs"
        title="鹰眼智能 · 实时评论墙"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3.2 3 10.6v9.9a1.5 1.5 0 0 0 1.5 1.5H10v-6.5h4V22h5.5a1.5 1.5 0 0 0 1.5-1.5v-9.9L12 3.2Z" />
        </svg>
      </div>

      <div className="mt-3 text-[10px] text-slate-400 font-medium tracking-tight">
        {sortedUsers.length} 在线
      </div>

      {/* 在线成员头像列表 */}
      <div className="mt-2.5 flex-1 w-full overflow-y-auto overflow-x-visible flex flex-col items-center gap-2.5 px-1 py-1">
        {sortedUsers.map((u) => {
          const isMe = u.id === currentUser?.id;
          return (
            <div key={u.id} className="relative group flex items-center justify-center">
              <div
                className={`w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center shadow-xs transition-transform duration-150 group-hover:scale-110 ${
                  isMe ? "ring-2 ring-offset-2 ring-slate-800" : ""
                }`}
                style={{ backgroundColor: u.avatarColor }}
                title={`${u.nickname}${isMe ? "（我）" : ""} · 在线`}
              >
                {u.nickname.slice(0, 1).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
          );
        })}
      </div>

      <div className="w-6 h-px bg-slate-200 my-2.5" />

      {/* 底部同步指示与退出按钮 */}
      <div className="flex flex-col items-center gap-2.5">
        <span
          className={`w-2 h-2 rounded-full ${
            connectionStatus === "connected"
              ? "bg-emerald-500"
              : "bg-amber-400 animate-pulse"
          }`}
          title={
            connectionStatus === "connected"
              ? "实时同步已连接"
              : "网络波动，正在自动重连..."
          }
        />

        {currentUser && (
          <button
            type="button"
            onClick={logout}
            title={`退出登录（${currentUser.nickname}）`}
            className="w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center relative group cursor-pointer shadow-xs"
            style={{ backgroundColor: currentUser.avatarColor }}
          >
            <span className="group-hover:opacity-0 transition-opacity">
              {currentUser.nickname.slice(0, 1).toUpperCase()}
            </span>
            <span className="absolute inset-0 rounded-full bg-slate-900/85 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              退出
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
