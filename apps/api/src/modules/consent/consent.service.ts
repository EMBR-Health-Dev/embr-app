import { AppError } from "@embr/shared";
import type { ConsentRecordDto, ConsentState, ConsentStatusDto, ConsentType } from "@embr/types";
import {
  CONSENT_TYPES,
  LEGAL_DOCUMENT_VERSIONS,
  STILL_ACCEPTED_VERSIONS,
  type ConsentAcceptance,
} from "@embr/validation";
import type { ConsentRecord } from "../../generated/prisma/index.js";
import { env } from "../../config/env.js";
import { consentRepository, type NewConsentRecord } from "./consent.repository.js";

type ConsentStates = Record<ConsentType, ConsentState>;
type Locale = "en" | "ja";
type Source = NewConsentRecord["source"];

function stateFor(type: ConsentType, latest: ConsentRecord | undefined): ConsentState {
  if (!latest) return "MISSING";
  if (latest.action === "WITHDRAWN") return "WITHDRAWN";
  return latest.version === LEGAL_DOCUMENT_VERSIONS[type] ||
    STILL_ACCEPTED_VERSIONS[type].includes(latest.version)
    ? "CURRENT"
    : "OUTDATED";
}

function statesFromLatest(records: ConsentRecord[]): ConsentStates {
  const byType = new Map(records.map((r) => [r.type as ConsentType, r]));
  return Object.fromEntries(
    CONSENT_TYPES.map((type) => [type, stateFor(type, byType.get(type))]),
  ) as ConsentStates;
}

function toRecordDto(r: ConsentRecord): ConsentRecordDto {
  return {
    id: r.id,
    type: r.type as ConsentType,
    version: r.version,
    locale: r.locale,
    action: r.action,
    source: r.source,
    client: r.client,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Rejects any acceptance whose displayed version isn't the current one.
 * The server decides what's current; a stale page or old app build
 * must not record agreement to wording the person never saw.
 */
function assertCurrentVersions(acceptances: ConsentAcceptance[]) {
  for (const a of acceptances) {
    if (a.version !== LEGAL_DOCUMENT_VERSIONS[a.type]) {
      throw AppError.consentVersionOutdated();
    }
  }
}

export const consentService = {
  async statesFor(userId: string): Promise<ConsentStates> {
    return statesFromLatest(await consentRepository.latestPerType([userId]));
  },

  /** Batch version of statesFor, for lists (e.g. the admin user list). */
  async statesForMany(userIds: string[]): Promise<Map<string, ConsentStates>> {
    const latest = await consentRepository.latestPerType(userIds);
    return new Map(
      userIds.map((id) => [id, statesFromLatest(latest.filter((r) => r.userId === id))]),
    );
  },

  isFullyCurrent(states: ConsentStates): boolean {
    return CONSENT_TYPES.every((type) => states[type] === "CURRENT");
  },

  /**
   * Validates registration acceptances. TERMS and PRIVACY are always
   * required; HEALTH_PROCESSING only when
   * CONSENT_HEALTH_REQUIRED_AT_REGISTRATION is on (a counsel decision).
   * Runs before the account is created, so nothing is written on failure.
   */
  validateRegistration(acceptances: ConsentAcceptance[]) {
    const given = new Set(acceptances.map((a) => a.type));
    const required: ConsentType[] = ["TERMS", "PRIVACY"];
    if (env.CONSENT_HEALTH_REQUIRED_AT_REGISTRATION) required.push("HEALTH_PROCESSING");
    const missing = required.filter((type) => !given.has(type));
    if (missing.length > 0) {
      throw AppError.validation(
        "Please review and accept the required items to create an account",
        missing.map((type) => ({ field: `consents.${type}`, message: "Required" })),
      );
    }
    assertCurrentVersions(acceptances);
  },

  /** Creates the account and its registration consent records atomically. */
  createUserWithRegistrationConsents(
    user: { email: string; passwordHash: string },
    acceptances: ConsentAcceptance[],
    locale: Locale,
    client?: string,
  ) {
    return consentRepository.createUserWithConsents(
      user,
      acceptances.map((a) => ({
        type: a.type,
        version: a.version,
        locale,
        action: "GRANTED" as const,
        source: "REGISTRATION" as const,
        client: client ?? null,
      })),
    );
  },

  async grant(
    userId: string,
    acceptances: ConsentAcceptance[],
    locale: Locale,
    source: Source,
    client?: string,
  ): Promise<ConsentStates> {
    assertCurrentVersions(acceptances);
    await consentRepository.insertMany(
      acceptances.map((a) => ({
        userId,
        type: a.type,
        version: a.version,
        locale,
        action: "GRANTED" as const,
        source,
        client: client ?? null,
      })),
    );
    return this.statesFor(userId);
  },

  /**
   * Withdraws health processing while keeping the account: health
   * features stop (requireCurrentConsent), while export, settings,
   * consent management and account deletion stay available. What then
   * happens to already-recorded data is for counsel (decision sheet,
   * question 3); nothing is deleted here.
   */
  async withdrawHealthProcessing(userId: string, client?: string): Promise<ConsentStates> {
    const states = await this.statesFor(userId);
    if (states.HEALTH_PROCESSING === "MISSING" || states.HEALTH_PROCESSING === "WITHDRAWN") {
      return states;
    }
    const latest = await consentRepository.latestPerType([userId]);
    const current = latest.find((r) => r.type === "HEALTH_PROCESSING");
    await consentRepository.insertMany([
      {
        userId,
        type: "HEALTH_PROCESSING",
        version: current?.version ?? LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING,
        locale: (current?.locale as Locale | undefined) ?? "en",
        action: "WITHDRAWN",
        source: "SETTINGS",
        client: client ?? null,
      },
    ]);
    return this.statesFor(userId);
  },

  async status(userId: string): Promise<ConsentStatusDto> {
    const [latest, history] = await Promise.all([
      consentRepository.latestPerType([userId]),
      consentRepository.history(userId),
    ]);
    const byType = new Map(latest.map((r) => [r.type as ConsentType, r]));
    return {
      items: CONSENT_TYPES.map((type) => {
        const record = byType.get(type);
        return {
          type,
          state: stateFor(type, record),
          currentVersion: LEGAL_DOCUMENT_VERSIONS[type],
          acceptedVersion: record && record.action === "GRANTED" ? record.version : null,
        };
      }),
      history: history.map(toRecordDto),
    };
  },

  /**
   * Of the given users, those whose health-processing item is current.
   * Used to exclude everyone else from organization aggregates before
   * any minimum-cohort threshold is applied.
   */
  async usersWithCurrentHealthProcessing(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const latest = await consentRepository.latestOfTypeForUsers(userIds, "HEALTH_PROCESSING");
    return new Set(
      latest.filter((r) => stateFor("HEALTH_PROCESSING", r) === "CURRENT").map((r) => r.userId),
    );
  },
};
