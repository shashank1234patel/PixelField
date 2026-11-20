import { auth } from './firebase.ts';
import type { BuildPolicy, RoomSummary, RoomVisibility, UserProfile } from '../shared/protocol.ts';
import type { HatStyle } from '../shared/tiles.ts';

async function getBearerHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function getActiveFirebaseIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authHeaders = await getBearerHeader();
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  getMe: () => apiFetch<{ user: UserProfile | null }>('/api/auth/me'),

  enterAsGuest: (payload: { displayName: string; avatarColor?: string; hatStyle?: HatStyle }) =>
    apiFetch<{ user: UserProfile }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  linkGuestToGoogle: () =>
    apiFetch<{ linked: boolean }>('/api/auth/link-guest', {
      method: 'POST',
    }),

  logout: () =>
    apiFetch<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  updatePreferences: (payload: {
    displayName?: string;
    avatarColor?: string;
    hatStyle?: HatStyle;
    reducedMotion?: boolean;
  }) =>
    apiFetch<{ user: UserProfile }>('/api/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteAccount: () =>
    apiFetch<{ ok: boolean }>('/api/auth/account', {
      method: 'DELETE',
    }),

  getOpenRooms: () => apiFetch<{ rooms: RoomSummary[] }>('/api/rooms/open'),

  getRecentRooms: () => apiFetch<{ rooms: RoomSummary[] }>('/api/rooms/recent'),

  lookupRoom: (code: string) =>
    apiFetch<{ room: RoomSummary }>(`/api/rooms/lookup/${encodeURIComponent(code)}`),

  createRoom: (payload: {
    name: string;
    visibility: RoomVisibility;
    capacity: number;
    allowLateJoin: boolean;
    buildPolicy: BuildPolicy;
    password?: string;
  }) =>
    apiFetch<{ room: RoomSummary; reconnectToken: string }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  joinRoom: (payload: { identifier: string; password?: string; reconnectToken?: string }) =>
    apiFetch<{ room: RoomSummary; reconnectToken: string; role: string }>('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteRoom: (roomId: string) =>
    apiFetch<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    }),
};

// Short-lived per-room reconnect credentials stored in sessionStorage (cleared on tab close or leave)
const RECONNECT_PREFIX = 'wb_reconnect_v1_';

export function saveReconnectCredential(roomId: string, token: string) {
  try {
    sessionStorage.setItem(`${RECONNECT_PREFIX}${roomId}`, token);
    sessionStorage.setItem('wb_last_room_id', roomId);
  } catch {
    // Ignore storage quota / private browsing failures
  }
}

export function getReconnectCredential(roomId: string): string | null {
  try {
    return sessionStorage.getItem(`${RECONNECT_PREFIX}${roomId}`);
  } catch {
    return null;
  }
}

export function clearReconnectCredential(roomId: string) {
  try {
    sessionStorage.removeItem(`${RECONNECT_PREFIX}${roomId}`);
    if (sessionStorage.getItem('wb_last_room_id') === roomId) {
      sessionStorage.removeItem('wb_last_room_id');
    }
  } catch {
    // Ignore
  }
}

export function getLastRoomId(): string | null {
  try {
    return sessionStorage.getItem('wb_last_room_id');
  } catch {
    return null;
  }
}
