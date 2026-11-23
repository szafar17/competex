// Metro inlines EXPO_PUBLIC_* env vars; declare the global without pulling in
// full node types. Lives under src/ so every tsconfig include shape sees it.
declare const process: { env: Record<string, string | undefined> };
