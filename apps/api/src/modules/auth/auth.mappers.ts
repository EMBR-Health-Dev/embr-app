import type { User } from "../generated/prisma/index.js";
import type { UserDto } from "@embr/types";

/** Never spread a Prisma User directly into a response — passwordHash
 * must always go through this mapper to be stripped. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
