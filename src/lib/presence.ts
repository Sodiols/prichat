const ONLINE_WINDOW_MS = 75_000;

export function isProfileOnline(profile: { lastSeen?: Date | string | null } | null | undefined) {
  if (!profile?.lastSeen) return false;
  const lastSeen =
    profile.lastSeen instanceof Date ? profile.lastSeen : new Date(profile.lastSeen);
  return !Number.isNaN(lastSeen.getTime()) && Date.now() - lastSeen.getTime() <= ONLINE_WINDOW_MS;
}

export function onlineProfiles<T extends { lastSeen?: Date | string | null }>(profiles: T[]) {
  return profiles.filter(isProfileOnline);
}
