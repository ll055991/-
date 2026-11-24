import { useEffect } from "react";
import { Canvas } from "../components/canvas/Canvas";
import { Toolbar } from "../components/canvas/Toolbar";
import { Sidebar } from "../components/sidebar/Sidebar";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { useAuthStore } from "../stores/useAuthStore";
import { useBoardStore } from "../stores/useBoardStore";

export function WallPage() {
  const token = useAuthStore((s) => s.token);
  const toast = useBoardStore((s) => s.toast);

  useEffect(() => {
    if (!token) return;
    connectSocket(token);
    return () => {
      disconnectSocket();
    };
  }, [token]);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#f7f8fa]">
      <Sidebar />
      <Canvas />
      <Toolbar />

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
