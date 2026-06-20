export const SYSTEM_ADMIN_EMAIL = "itssayem2023@gmail.com";

export function isSystemAdminEmail(email) {
  return email?.toLowerCase() === SYSTEM_ADMIN_EMAIL;
}
