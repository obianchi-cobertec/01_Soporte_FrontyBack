/**
 * Review Tokens — JWT para revisión humana de tickets
 *
 * Los tokens de revisión tienen audience 'review' y llevan el JTI embebido.
 * El JTI se guarda en BD (pending_reviews.current_token_jti) para invalidación.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

export interface ReviewTokenPayload {
  jti: string;
  pending_review_id: string;
  aud: 'review';
}

export function signReviewToken(pendingReviewId: string, jti: string, ttlDays: number): string {
  return jwt.sign(
    { pending_review_id: pendingReviewId },
    JWT_SECRET,
    { expiresIn: `${ttlDays}d`, audience: 'review', jwtid: jti },
  );
}

export function verifyReviewToken(raw: string): ReviewTokenPayload {
  const payload = jwt.verify(raw, JWT_SECRET, { audience: 'review' });
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('jti' in payload) ||
    !('pending_review_id' in payload)
  ) {
    throw new Error('TOKEN_INVALID');
  }
  return payload as unknown as ReviewTokenPayload;
}
