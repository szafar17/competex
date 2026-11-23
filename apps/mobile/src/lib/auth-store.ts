import { create } from "zustand";
import type { PublicUser, StatVector } from "@cx/shared";
import { api, clearTokens, saveRefreshToken, setAccessToken, tryRefresh } from "./api";

export interface MeResponse {
  user: PublicUser;
  stats: StatVector;
  rating: { rating: number; wins: number; losses: number; draws: number };
  streak: { current: number; longest: number };
  body: { heightCm: number; weightKg: number; dob: string | null; sex: string | null } | null;
  avatarSvg: string | null;
}

interface AuthState {
  status: "booting" | "signed_out" | "signed_in";
  me: MeResponse | null;
  boot: () => Promise<void>;
  signIn: (phone: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "booting",
  me: null,

  boot: async () => {
    const ok = await tryRefresh();
    if (!ok) {
      set({ status: "signed_out", me: null });
      return;
    }
    await get().refreshMe();
    set({ status: "signed_in" });
  },

  signIn: async (phone) => {
    const tokens = await api<{ accessToken: string; refreshToken: string; user: PublicUser }>(
      "POST",
      "/v1/auth/phone/start",
      { phone },
    );
    setAccessToken(tokens.accessToken);
    await saveRefreshToken(tokens.refreshToken);
    await get().refreshMe();
    set({ status: "signed_in" });
  },

  refreshMe: async () => {
    const me = await api<MeResponse>("GET", "/v1/me");
    set({ me });
  },

  signOut: async () => {
    await clearTokens();
    set({ status: "signed_out", me: null });
  },
}));
