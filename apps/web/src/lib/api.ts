import type { ApiError, AuthResponse, LoginInput, RegisterInput, UserDTO } from "@wall/shared";

const TOKEN_STORAGE_KEY = "wall_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const err = (await res.json()) as Partial<ApiError>;
      if (err.message) message = err.message;
    } catch {
      // 非 JSON 错误体保留默认提示
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const authApi = {
  login: (input: LoginInput) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  register: (input: RegisterInput) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
  me: () => request<UserDTO>("/api/auth/me"),
};
