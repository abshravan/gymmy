const BASE = "/api/v1";
const ACCESS = "gymmy.access";
const REFRESH = "gymmy.refresh";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const tokens = {
  get access() {
    return read(ACCESS);
  },
  get refresh() {
    return read(REFRESH);
  },
  set(access: string, refresh: string) {
    try {
      localStorage.setItem(ACCESS, access);
      localStorage.setItem(REFRESH, refresh);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS);
      localStorage.removeItem(REFRESH);
    } catch {
      /* storage unavailable */
    }
  },
};

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((e: { loc?: unknown[]; msg?: string }) => {
          const field = e.loc?.filter((x) => x !== "body").join(".");
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .join("; ");
    }
  }
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = tokens.refresh;
  if (!rt) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const t = await r.json();
      tokens.set(t.access_token, t.refresh_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params: Query = {}): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const at = tokens.access;
  if (at) headers.Authorization = `Bearer ${at}`;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/login")) {
    if (await tryRefresh()) return api<T>(path, opts, false);
    tokens.clear();
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = "/login";
    }
  }
  if (res.status === 204) return undefined as T;
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status), body);
  return body as T;
}

export async function download(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
