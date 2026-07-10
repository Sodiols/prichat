export const SYSTEM_ADMIN_EMAIL = "itssayem2023@gmail.com";

export function isSystemAdminEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === SYSTEM_ADMIN_EMAIL;
}
