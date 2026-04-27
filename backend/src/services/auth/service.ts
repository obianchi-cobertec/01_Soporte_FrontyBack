/**
 * Auth Service — OAuth 2.0 compatible (password + refresh_token grants)
 */

import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  CompanyDTO,
  TokenResponse,
  SelectCompanyResponse,
  RefreshResponse,
  AuthErrorCode,
} from '../../identity-types.js';
import { getIdentityStore } from '../identity/store.js';

// ─── Config ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'cobertec-intake-dev-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function getAccessTokenTTLSeconds(): number {
  const raw = ACCESS_TOKEN_TTL;
  const match = raw.match(/^(\d+)(m|h|s)$/);
  if (!match) return 900;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 's') return value;
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  return 900;
}

const ACCESS_TOKEN_TTL_SECONDS = getAccessTokenTTLSeconds();

if (JWT_SECRET === 'cobertec-intake-dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET no configurado para producción');
}

// ─── Errores ────────────────────────────────────────────

export class AuthServiceError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

// ─── Password ───────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT ────────────────────────────────────────────────

function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' } satisfies AccessTokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function signRefreshToken(userId: string): { token: string; hash: string; expiresAt: string } {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const token = jwt.sign(
    { sub: userId, type: 'refresh', jti } satisfies RefreshTokenPayload & { jti: string },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash, expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access') {
      throw new AuthServiceError('TOKEN_INVALID', 'Token type mismatch');
    }
    return decoded;
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthServiceError('TOKEN_EXPIRED', 'Access token expirado');
    }
    throw new AuthServiceError('TOKEN_INVALID', 'Access token inválido');
  }
}

function verifyRefreshJWT(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') {
      throw new AuthServiceError('TOKEN_INVALID', 'Token type mismatch');
    }
    return decoded;
  } catch (err) {
    if (err instanceof AuthServiceError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthServiceError('TOKEN_EXPIRED', 'Refresh token expirado');
    }
    throw new AuthServiceError('TOKEN_INVALID', 'Refresh token inválido');
  }
}

// ─── Auth operations ────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<{ tokenResponse: TokenResponse; refreshToken: string }> {
  const store = getIdentityStore();
  const userRow = store.getUserByEmail(email);

  if (!userRow) {
    throw new AuthServiceError('INVALID_CREDENTIALS', 'Credenciales no válidas');
  }

  if (!userRow.active) {
    throw new AuthServiceError('USER_INACTIVE', 'Usuario desactivado. Contacte con Cobertec.');
  }

  const valid = await verifyPassword(password, userRow.password_hash);
  if (!valid) {
    throw new AuthServiceError('INVALID_CREDENTIALS', 'Credenciales no válidas');
  }

  const mustChangePassword = store.getMustChangePassword(userRow.id);
  const companies = store.getCompaniesForUser(userRow.id);

  const accessToken = signAccessToken({
    sub: userRow.id,
    contact_id: userRow.contact_id,
    company_id: null,
    company_name: null,
    must_change_password: mustChangePassword,
  });

  const refresh = signRefreshToken(userRow.id);
  store.storeRefreshToken(refresh.hash, userRow.id, refresh.expiresAt);
  store.updateLastLogin(userRow.id);

  return {
    tokenResponse: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      companies,
      must_change_password: mustChangePassword,
    },
    refreshToken: refresh.token,
  };
}

export function selectCompany(
  currentToken: AccessTokenPayload,
  companyId: string,
): SelectCompanyResponse {
  const store = getIdentityStore();

  const company = store.getCompanyById(companyId);
  if (!company || !company.active) {
    throw new AuthServiceError('COMPANY_NOT_FOUND', 'Empresa no encontrada', 404);
  }

  if (!store.isUserInCompany(currentToken.sub, companyId)) {
    throw new AuthServiceError('COMPANY_NOT_AUTHORIZED', 'No tiene acceso a esta empresa', 403);
  }

  const accessToken = signAccessToken({
    sub: currentToken.sub,
    contact_id: currentToken.contact_id,
    company_id: company.id,
    company_name: company.name,
    must_change_password: currentToken.must_change_password,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    company: { id: company.id, name: company.name },
  };
}

export function refresh(
  refreshTokenRaw: string,
): { refreshResponse: RefreshResponse; newRefreshToken: string } {
  const store = getIdentityStore();

  const payload = verifyRefreshJWT(refreshTokenRaw);
  const oldHash = createHash('sha256').update(refreshTokenRaw).digest('hex');

  const stored = store.getRefreshToken(oldHash);
  if (!stored) {
    store.deleteRefreshTokensForUser(payload.sub);
    throw new AuthServiceError('TOKEN_INVALID', 'Refresh token revocado');
  }

  store.deleteRefreshToken(oldHash);

  const user = store.getUserById(payload.sub);
  if (!user || !user.active) {
    throw new AuthServiceError('USER_INACTIVE', 'Usuario desactivado');
  }

  const mustChangePassword = store.getMustChangePassword(user.id);

  const accessToken = signAccessToken({
    sub: user.id,
    contact_id: user.contact_id,
    company_id: null,
    company_name: null,
    must_change_password: mustChangePassword,
  });

  const newRefresh = signRefreshToken(user.id);
  store.storeRefreshToken(newRefresh.hash, user.id, newRefresh.expiresAt);

  return {
    refreshResponse: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    },
    newRefreshToken: newRefresh.token,
  };
}

export function logout(refreshTokenRaw: string | undefined): void {
  if (!refreshTokenRaw) return;
  const store = getIdentityStore();
  const hash = createHash('sha256').update(refreshTokenRaw).digest('hex');
  store.deleteRefreshToken(hash);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const store = getIdentityStore();

  const user = store.getUserById(userId);
  if (!user) {
    throw new AuthServiceError('INVALID_CREDENTIALS', 'Usuario no encontrado');
  }

  // Si must_change_password=true, no verificamos la contraseña actual
  const mustChange = store.getMustChangePassword(userId);
  if (!mustChange) {
    if (!currentPassword) {
      throw new AuthServiceError('WRONG_CURRENT_PASSWORD', 'La contraseña actual es requerida', 400);
    }
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      throw new AuthServiceError('WRONG_CURRENT_PASSWORD', 'La contraseña actual no es correcta', 400);
    }
  }

  const newHash = await hashPassword(newPassword);
  store.updateUserPassword(userId, newHash);
  store.setMustChangePassword(userId, false);
}
