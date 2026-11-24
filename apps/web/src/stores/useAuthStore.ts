import { create } from "zustand";
import type { LoginInput, RegisterInput, UserDTO } from "@wall/shared";
import { authApi, getStoredToken, setStoredToken } from "../lib/api";

interface AuthState {
  token: string | null;
  user: UserDTO | null;
  hydrating: boolean;
  hydrate: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getStoredToken(),
  user: null,
  hydrating: true,

  async hydrate() {
    const token = getStoredToken();
    if (!token) {
      set({ token: null, user: null, hydrating: false });
      return;
    }
    try {
      const user = await authApi.me();
      set({ token, user, hydrating: false });
    } catch {
      // 本地 token 过期或用户不存在时自动清理，退回登录页
      setStoredToken(null);
      set({ token: null, user: null, hydrating: false });
    }
  },

  async login(input) {
    const res = await authApi.login(input);
    setStoredToken(res.token);
    set({ token: res.token, user: res.user, hydrating: false });
  },

  async register(input) {
    const res = await authApi.register(input);
    setStoredToken(res.token);
    set({ token: res.token, user: res.user, hydrating: false });
  },

  logout() {
    setStoredToken(null);
    set({ token: null, user: null });
  },
}));
