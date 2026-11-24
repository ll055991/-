import { useEffect } from "react";
import { LoginPage } from "./pages/LoginPage";
import { WallPage } from "./pages/WallPage";
import { useAuthStore } from "./stores/useAuthStore";

export function App() {
  const user = useAuthStore((s) => s.user);
  const hydrating = useAuthStore((s) => s.hydrating);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (hydrating) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center text-sm text-slate-500">
        正在恢复登录状态...
      </div>
    );
  }

  return user ? <WallPage /> : <LoginPage />;
}
