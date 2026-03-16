import crypto from 'crypto';

/** Cryptographically-secure 6-digit OTP */
export const genOtp = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

/** Valid 10-digit Indian mobile number */
export const PHONE_RE = /^[6-9]\d{9}$/;
