/**
 * Tiny typed API client. Access JWT lives in memory; the refresh token sits
 * in SecureStore. On a 401 we rotate via /v1/auth/refresh once, then retry.
 */

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const REFRESH_KEY = "cx.refreshToken";

function baseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  // In Expo Go the dev machine's LAN IP is in hostUri — reuse it for the API.
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, token);
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function rawRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (json as { message?: string })?.message ?? `HTTP ${res.status}`);
  return json as T;
}

/** Attempt one refresh-and-retry on 401. Returns true if a session exists after. */
export async function tryRefresh(): Promise<boolean> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) return false;
  try {
    const tokens = await rawRequest<{ accessToken: string; refreshToken: string }>("POST", "/v1/auth/refresh", {
      refreshToken,
    });
    accessToken = tokens.accessToken;
    await saveRefreshToken(tokens.refreshToken);
    return true;
  } catch {
    await clearTokens();
    return false;
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await rawRequest<T>(method, path, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !path.startsWith("/v1/auth")) {
      if (await tryRefresh()) return rawRequest<T>(method, path, body);
    }
    throw err;
  }
}
