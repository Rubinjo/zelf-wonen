type AdminUser = { id: string; email?: string; emailVerified: boolean };

// An explicit account ID takes precedence; email setup requires verified ownership.
export function isAdminUser(
    user: AdminUser,
    ownerId = process.env.ADMIN_USER_ID,
    ownerEmail = process.env.ADMIN_EMAIL,
): boolean {
    if (!user.emailVerified) return false;
    if (ownerId?.trim()) return user.id === ownerId.trim();
    const email = ownerEmail?.trim().toLowerCase();
    return Boolean(email) && user.email?.trim().toLowerCase() === email;
}
