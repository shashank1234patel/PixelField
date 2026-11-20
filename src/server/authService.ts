import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { roomMemberships, rooms, users, worldEdits } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { UserProfile } from '../shared/protocol.ts';
import { AVATAR_COLORS, HAT_STYLES, type HatStyle } from '../shared/tiles.ts';
import {
  buildSessionCookie,
  generateSecureId,
  hashToken,
  parseCookies,
  safeCompareHex,
  sanitizePlainText,
} from './crypto.ts';

export const GUEST_COOKIE_NAME = 'wb_guest_session';
const VALID_COLORS = new Set(AVATAR_COLORS.map((c) => c.hex));
const VALID_HATS = new Set<string>(HAT_STYLES.map((h) => h.id));

export interface AuthRequest extends Request {
  currentUser?: UserProfile;
}

function mapUserRow(row: typeof users.$inferSelect): UserProfile {
  return {
    uid: row.uid,
    authType: row.authType === 'google' ? 'google' : 'guest',
    email: row.email ?? null,
    displayName: row.displayName,
    avatarColor: row.avatarColor,
    hatStyle: (VALID_HATS.has(row.hatStyle) ? row.hatStyle : 'none') as HatStyle,
    reducedMotion: row.reducedMotion,
  };
}

export function isRequestHttps(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export async function getOrCreateGoogleUser(
  uid: string,
  email: string | null,
  fallbackName: string
): Promise<UserProfile> {
  try {
    const cleanName = sanitizePlainText(fallbackName || (email ? email.split('@')[0] : 'Villager'), 24) || 'Villager';
    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          authType: 'google',
          email: email ?? existing[0].email,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return mapUserRow(updated[0]);
    }
    const inserted = await db
      .insert(users)
      .values({
        uid,
        authType: 'google',
        email,
        displayName: cleanName,
        avatarColor: AVATAR_COLORS[0].hex,
        hatStyle: 'none',
        reducedMotion: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          authType: 'google',
          email,
          updatedAt: new Date(),
        },
      })
      .returning();
    return mapUserRow(inserted[0]);
  } catch (error) {
    console.error('Failed to upsert Google user:', error);
    throw new Error('Could not load user profile. Please try again.', { cause: error });
  }
}

export async function createGuestSession(
  displayName: string,
  avatarColor?: string,
  hatStyle?: string
): Promise<{ user: UserProfile; cookieValue: string }> {
  const cleanName = sanitizePlainText(displayName, 24);
  if (cleanName.length < 2) {
    throw new Error('Display name must be at least 2 characters.');
  }
  const safeColor = avatarColor && VALID_COLORS.has(avatarColor) ? avatarColor : AVATAR_COLORS[0].hex;
  const safeHat = hatStyle && VALID_HATS.has(hatStyle) ? hatStyle : 'none';
  const uid = `guest_${generateSecureId(12)}`;
  const rawToken = generateSecureId(24);
  const tokenHash = hashToken(rawToken);

  try {
    const inserted = await db
      .insert(users)
      .values({
        uid,
        authType: 'guest',
        email: null,
        displayName: cleanName,
        avatarColor: safeColor,
        hatStyle: safeHat,
        reducedMotion: false,
        sessionTokenHash: tokenHash,
      })
      .returning();
    return {
      user: mapUserRow(inserted[0]),
      cookieValue: `${uid}.${rawToken}`,
    };
  } catch (error) {
    console.error('Failed to create guest session:', error);
    throw new Error('Unable to start guest session right now.', { cause: error });
  }
}

export async function resolveGuestFromCookie(cookieValue: string | undefined): Promise<UserProfile | null> {
  if (!cookieValue) return null;
  const dotIdx = cookieValue.indexOf('.');
  if (dotIdx <= 0) return null;
  const uid = cookieValue.slice(0, dotIdx);
  const rawToken = cookieValue.slice(dotIdx + 1);
  if (!uid.startsWith('guest_') || rawToken.length < 16) return null;

  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!row.sessionTokenHash) return null;
    if (!safeCompareHex(hashToken(rawToken), row.sessionTokenHash)) return null;
    return mapUserRow(row);
  } catch (error) {
    console.error('Failed to resolve guest session:', error);
    return null;
  }
}

export async function resolveUserFromHeaders(
  authHeader: string | undefined,
  cookieHeader: string | undefined
): Promise<UserProfile | null> {
  // 1. Prefer verified Firebase ID token if provided
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice('Bearer '.length).trim();
    if (idToken.length > 20) {
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        return await getOrCreateGoogleUser(
          decoded.uid,
          decoded.email ?? null,
          decoded.name ?? decoded.email?.split('@')[0] ?? 'Villager'
        );
      } catch (err) {
        console.warn('Invalid Firebase ID token presented:', (err as Error).message);
      }
    }
  }

  // 2. Fallback to HttpOnly guest session cookie
  const cookies = parseCookies(cookieHeader);
  return await resolveGuestFromCookie(cookies[GUEST_COOKIE_NAME]);
}

export async function linkGuestDataToGoogle(guestUid: string, googleUid: string): Promise<void> {
  if (!guestUid.startsWith('guest_') || guestUid === googleUid) return;
  try {
    const guestRows = await db.select().from(users).where(eq(users.uid, guestUid)).limit(1);
    if (guestRows.length === 0) return;

    // Transfer owned rooms
    await db.update(rooms).set({ ownerUid: googleUid }).where(eq(rooms.ownerUid, guestUid));

    // Transfer edit history attribution
    await db.update(worldEdits).set({ actorUid: googleUid }).where(eq(worldEdits.actorUid, guestUid));

    // Migrate memberships carefully avoiding unique conflicts
    const guestMemberships = await db
      .select()
      .from(roomMemberships)
      .where(eq(roomMemberships.userUid, guestUid));

    for (const mem of guestMemberships) {
      await db
        .insert(roomMemberships)
        .values({
          roomId: mem.roomId,
          userUid: googleUid,
          role: mem.role,
          joinState: mem.joinState,
          lastX: mem.lastX,
          lastY: mem.lastY,
          lastVisitedAt: mem.lastVisitedAt,
        })
        .onConflictDoNothing();
    }

    // Carry over avatar preference if guest customized it
    await db
      .update(users)
      .set({
        avatarColor: guestRows[0].avatarColor,
        hatStyle: guestRows[0].hatStyle,
        reducedMotion: guestRows[0].reducedMotion,
        updatedAt: new Date(),
      })
      .where(eq(users.uid, googleUid));

    // Remove temporary guest profile
    await db.delete(users).where(eq(users.uid, guestUid));
  } catch (error) {
    console.error('Failed to link guest account:', error);
    throw new Error('Could not link guest progress to your Google account.', { cause: error });
  }
}

export async function updateUserPreferences(
  uid: string,
  prefs: {
    displayName?: string;
    avatarColor?: string;
    hatStyle?: string;
    reducedMotion?: boolean;
  }
): Promise<UserProfile> {
  const patch: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (prefs.displayName !== undefined) {
    const clean = sanitizePlainText(prefs.displayName, 24);
    if (clean.length < 2) {
      throw new Error('Display name must be between 2 and 24 characters.');
    }
    patch.displayName = clean;
  }
  if (prefs.avatarColor !== undefined && VALID_COLORS.has(prefs.avatarColor)) {
    patch.avatarColor = prefs.avatarColor;
  }
  if (prefs.hatStyle !== undefined && VALID_HATS.has(prefs.hatStyle)) {
    patch.hatStyle = prefs.hatStyle;
  }
  if (typeof prefs.reducedMotion === 'boolean') {
    patch.reducedMotion = prefs.reducedMotion;
  }

  try {
    const rows = await db.update(users).set(patch).where(eq(users.uid, uid)).returning();
    if (rows.length === 0) {
      throw new Error('Account not found.');
    }
    return mapUserRow(rows[0]);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Display name')) throw error;
    console.error('Failed to update preferences:', error);
    throw new Error('Could not save preferences right now.', { cause: error });
  }
}

export async function deleteUserAccount(uid: string): Promise<void> {
  try {
    await db.delete(users).where(eq(users.uid, uid));
  } catch (error) {
    console.error('Failed to delete account:', error);
    throw new Error('Could not delete account right now.', { cause: error });
  }
}

export function clearGuestCookie(req: Request, res: Response) {
  res.setHeader('Set-Cookie', buildSessionCookie(GUEST_COOKIE_NAME, '', 0, isRequestHttps(req)));
}

export function setGuestCookie(req: Request, res: Response, cookieValue: string) {
  // 14-day guest cookie
  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(GUEST_COOKIE_NAME, cookieValue, 60 * 60 * 24 * 14, isRequestHttps(req))
  );
}

export const attachUser = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const user = await resolveUserFromHeaders(req.headers.authorization, req.headers.cookie);
    if (user) {
      req.currentUser = user;
    }
    next();
  } catch (error) {
    console.error('Auth resolution error:', error);
    next();
  }
};

export const requireSession = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: 'Please sign in or enter as a guest first.' });
  }
  next();
};
