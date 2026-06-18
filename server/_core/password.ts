import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;
const HASH_PREFIX = /^\$2[aby]\$/;

export function isPasswordHashed(password: string): boolean {
  return HASH_PREFIX.test(password);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export type PasswordVerifyResult = {
  valid: boolean;
  needsRehash: boolean;
};

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<PasswordVerifyResult> {
  if (isPasswordHashed(stored)) {
    const valid = await bcrypt.compare(plain, stored);
    return { valid, needsRehash: false };
  }
  const valid = plain === stored;
  return { valid, needsRehash: valid };
}

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = "weak" | "fair" | "strong";

export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return "weak";
  let score = 0;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;
  if (score >= 4) return "strong";
  if (score >= 2) return "fair";
  return "weak";
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل";
  }
  if (!/[0-9]/.test(password)) {
    return "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل";
  }
  return null;
}
