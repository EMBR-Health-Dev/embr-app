import type { User } from "../../generated/prisma/index.js";
import type { UserDto } from "@embr/types";

/** Never spread a Prisma User directly into a response — passwordHash
 * must always go through this mapper to be stripped.
 *
 * onboardingCompletedAt defaults to null rather than being required —
 * callers that don't care about onboarding routing (admin's user
 * listing, most notably) don't need to fetch the OnboardingProfile
 * relation just to satisfy this mapper's signature. Callers that do
 * care (login, refresh, /auth/me) pass the real value explicitly. */
export function toUserDto(user: User, onboardingCompletedAt: Date | null = null): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
    onboardingCompletedAt: onboardingCompletedAt ? onboardingCompletedAt.toISOString() : null,
  };
}
