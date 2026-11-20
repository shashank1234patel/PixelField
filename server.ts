import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  type AuthRequest,
  GUEST_COOKIE_NAME,
  attachUser,
  clearGuestCookie,
  createGuestSession,
  deleteUserAccount,
  linkGuestDataToGoogle,
  requireSession,
  resolveGuestFromCookie,
  setGuestCookie,
  updateUserPreferences,
} from './src/server/authService.ts';
import { parseCookies } from './src/server/crypto.ts';
import { roomManager } from './src/server/realtimeManager.ts';
import {
  authorizeRoomJoin,
  createRoomWithWorld,
  deleteRoomOwnedBy,
  formatRoomSummary,
  getRoomByIdOrCode,
  listOpenRooms,
  listRecentRoomsForUser,
} from './src/server/worldPersistence.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lightweight in-memory rate limiter for short-code lookups & joins
const joinRateMap = new Map<string, number[]>();
function isJoinRateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (joinRateMap.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 25) return true;
  list.push(now);
  joinRateMap.set(ip, list);
  return false;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));
  app.use(attachUser);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Identity & Session routes
  app.get('/api/auth/me', (req: AuthRequest, res) => {
    res.json({ user: req.currentUser ?? null });
  });

  app.post('/api/auth/guest', async (req: AuthRequest, res) => {
    try {
      const { displayName, avatarColor, hatStyle } = req.body ?? {};
      const { user, cookieValue } = await createGuestSession(displayName, avatarColor, hatStyle);
      setGuestCookie(req, res, cookieValue);
      res.status(201).json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start guest session.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/link-guest', requireSession, async (req: AuthRequest, res) => {
    try {
      const user = req.currentUser!;
      if (user.authType !== 'google') {
        return res.status(400).json({ error: 'Sign in with Google first to link your guest progress.' });
      }
      const cookies = parseCookies(req.headers.cookie);
      const guestUser = await resolveGuestFromCookie(cookies[GUEST_COOKIE_NAME]);
      if (guestUser && guestUser.uid.startsWith('guest_')) {
        await linkGuestDataToGoogle(guestUser.uid, user.uid);
        clearGuestCookie(req, res);
        return res.json({ linked: true });
      }
      return res.json({ linked: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not link guest account.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearGuestCookie(req, res);
    res.json({ ok: true });
  });

  app.patch('/api/auth/preferences', requireSession, async (req: AuthRequest, res) => {
    try {
      const { displayName, avatarColor, hatStyle, reducedMotion } = req.body ?? {};
      const updated = await updateUserPreferences(req.currentUser!.uid, {
        displayName,
        avatarColor,
        hatStyle,
        reducedMotion,
      });
      roomManager.updateUserProfileLive(updated);
      res.json({ user: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update preferences.';
      res.status(400).json({ error: message });
    }
  });

  app.delete('/api/auth/account', requireSession, async (req: AuthRequest, res) => {
    try {
      await deleteUserAccount(req.currentUser!.uid);
      clearGuestCookie(req, res);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete account.';
      res.status(500).json({ error: message });
    }
  });

  // Rooms & World discovery / lifecycle
  app.get('/api/rooms/open', async (_req, res) => {
    try {
      const openRooms = await listOpenRooms((id) => roomManager.getOnlineCount(id));
      res.json({ rooms: openRooms });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch open rooms.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/rooms/recent', requireSession, async (req: AuthRequest, res) => {
    try {
      const recentRooms = await listRecentRoomsForUser(req.currentUser!.uid, (id) =>
        roomManager.getOnlineCount(id)
      );
      res.json({ rooms: recentRooms });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not fetch recent worlds.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/rooms/lookup/:code', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (isJoinRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many room lookups. Please wait a minute.' });
    }
    try {
      const room = await getRoomByIdOrCode(req.params.code);
      if (!room || room.status === 'closed') {
        return res.status(404).json({ error: 'No active village found with that code.' });
      }
      res.json({
        room: formatRoomSummary(room, roomManager.getOnlineCount(room.id)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not look up room.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/rooms', requireSession, async (req: AuthRequest, res) => {
    try {
      const { name, visibility, capacity, allowLateJoin, buildPolicy, password } = req.body ?? {};
      const created = await createRoomWithWorld({
        ownerUid: req.currentUser!.uid,
        name,
        visibility,
        capacity,
        allowLateJoin,
        buildPolicy,
        password,
      });
      res.status(201).json(created);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create village world.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/rooms/join', requireSession, async (req: AuthRequest, res) => {
    const ip = req.ip || 'unknown';
    if (isJoinRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many join attempts. Please pause briefly.' });
    }
    try {
      const { identifier, password, reconnectToken } = req.body ?? {};
      if (!identifier || typeof identifier !== 'string') {
        return res.status(400).json({ error: 'Enter a room code or invite link.' });
      }
      const room = await getRoomByIdOrCode(identifier);
      if (!room) {
        return res.status(404).json({ error: 'No village found with that code. Check for typos and try again.' });
      }
      const seatedUids = roomManager.getSeatedUids(room.id);
      const auth = await authorizeRoomJoin({
        room,
        userUid: req.currentUser!.uid,
        password,
        reconnectToken,
        activePlayerUids: seatedUids,
      });
      res.json({
        room: formatRoomSummary(room, roomManager.getOnlineCount(room.id)),
        reconnectToken: auth.reconnectToken,
        role: auth.role,
      });
    } catch (error) {
      const err = error as Error & { code?: string };
      const status = err.code === 'PASSWORD_REQUIRED' ? 403 : 400;
      res.status(status).json({ error: err.message || 'Could not join room.', code: err.code });
    }
  });

  app.delete('/api/rooms/:roomId', requireSession, async (req: AuthRequest, res) => {
    try {
      const ok = await deleteRoomOwnedBy(req.params.roomId, req.currentUser!.uid);
      if (!ok) {
        return res.status(404).json({ error: 'Room not found or you are not the host.' });
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete village.';
      res.status(500).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);
  roomManager.attach(httpServer);

  // Mount Vite dev middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Pixelfield server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    await roomManager.shutdown();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
