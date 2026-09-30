import type { User } from "../../generated/prisma/index.js";
import type { ConsentState, ConsentType, UserDto } from "@embr/types";

/** Never spread a Prisma User directly into a response — passwordHash
 * must always go through this mapper to be stripped.
 *
 * onboardingCompletedAt defaults to null rather than being required —
 * callers that don't care about onboarding routing (admin's user
 * listing, most notably) don't need to fetch the OnboardingProfile
 * relation just to satisfy this mapper's signature. Callers that do
 * care (login, refresh, /auth/me) pass the real value explicitly.
 *
 * `consents` is required, unlike onboarding: defaulting it would report
 * a person as never having accepted anything, which is exactly the kind
 * of silent wrong answer this field exists to prevent. */
export function toUserDto(
  user: User,
  onboardingCompletedAt: Date | null,
  consents: Record<ConsentType, ConsentState>,
): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
    onboardingCompletedAt: onboardingCompletedAt ? onboardingCompletedAt.toISOString() : null,
    consents,
  };
}
