import { describe, expect, it, vi, beforeEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = actual.APIError;
    static RateLimitError = actual.RateLimitError;
    static APIConnectionError = actual.APIConnectionError;
    static InternalServerError = actual.InternalServerError;
    static AuthenticationError = actual.AuthenticationError;
    static BadRequestError = actual.BadRequestError;
  }
  return { ...actual, default: MockAnthropic };
});

const { briefAi } = await import("../src/modules/briefs/brief.ai.js");

const VALID_INPUT = {
  fromDate: "2026-01-01",
  toDate: "2026-02-01",
  symptomSummary: [{ category: "HOT_FLASH", count: 3, severityBreakdown: { MODERATE: 3 } }],
  cycleSummary: { averageCycleLengthDays: 28, cycleCount: 2, periodDaysLogged: 6 },
};

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("brief.ai", () => {
  it("parses a well-formed model response", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify({ narrative: "Some narrative.", discussionTopics: ["A question?"] }),
      ),
    );

    const result = await briefAi.generate(VALID_INPUT);
    expect(result).toEqual({ narrative: "Some narrative.", discussionTopics: ["A question?"] });
  });

  it("rejects a response that isn't valid JSON", async () => {
    mockCreate.mockResolvedValue(textResponse("Sorry, here's your summary: ..."));
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("not valid JSON");
  });

  it("rejects a response missing required fields", async () => {
    mockCreate.mockResolvedValue(textResponse(JSON.stringify({ narrative: "Only a narrative." })));
    // Message deliberately no longer includes the raw Zod error detail
    // (see classifyAnthropicError's doc comment on not leaking internals) —
    // just confirms it's classified as our own bug, not a client error.
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
  });

  it("rejects an empty discussionTopics array", async () => {
    mockCreate.mockResolvedValue(
      textResponse(JSON.stringify({ narrative: "n", discussionTopics: [] })),
    );
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow();
  });

  it("rejects a response with no text content block", async () => {
    mockCreate.mockResolvedValue({ content: [] });
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("no text content");
  });

  it("sends only the structured summary, never raw notes, in the user message", async () => {
    mockCreate.mockResolvedValue(
      textResponse(JSON.stringify({ narrative: "n", discussionTopics: ["t"] })),
    );

    await briefAi.generate(VALID_INPUT);

    const call = mockCreate.mock.calls[0][0];
    const sentContent = JSON.parse(call.messages[0].content);
    expect(sentContent).toEqual({
      dateRange: { from: VALID_INPUT.fromDate, to: VALID_INPUT.toDate },
      symptomSummary: VALID_INPUT.symptomSummary,
      cycleSummary: VALID_INPUT.cycleSummary,
    });
    // No "notes" key anywhere, at any depth, in what actually gets sent.
    expect(JSON.stringify(sentContent)).not.toContain("notes");
  });

  it("system prompt forbids diagnosis/treatment suggestions and requires question-framed topics", async () => {
    mockCreate.mockResolvedValue(
      textResponse(JSON.stringify({ narrative: "n", discussionTopics: ["t"] })),
    );

    await briefAi.generate(VALID_INPUT);

    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain("Never diagnose");
    expect(call.system).toContain("recommend any treatment");
    expect(call.system).toContain("open question");
  });
});

// Anthropic.APIError and its subclasses (RateLimitError, BadRequestError,
// AuthenticationError, etc.) carry a real numeric `.status` and extend
// Error. Left uncaught, that status collides with the global error
// handler's 4xx-client-error heuristic (error-handler.ts) and would
// surface to the end user as a 400 VALIDATION_ERROR carrying Anthropic's
// raw error message -- including things that can describe our own
// credentials/config. None of these are the requesting user's fault (they
// never control what's sent to Anthropic), so none should ever reach the
// client as VALIDATION_ERROR or with the raw upstream message attached.
describe("brief.ai Anthropic error classification", () => {
  it("classifies a RateLimitError (429) as SERVICE_UNAVAILABLE, not the raw Anthropic message", async () => {
    const err = new Anthropic.RateLimitError(
      429,
      { type: "error", error: { type: "rate_limit_error", message: "secret-account-detail" } },
      "rate_limit_error",
      new Headers(),
    );
    mockCreate.mockRejectedValue(err);

    await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    try {
      await briefAi.generate(VALID_INPUT);
    } catch (thrown) {
      expect((thrown as Error).message).not.toContain("secret-account-detail");
    }
  });

  it("classifies an AuthenticationError (401 -- our own bad API key) as INTERNAL_ERROR, not VALIDATION_ERROR", async () => {
    const err = new Anthropic.AuthenticationError(
      401,
      { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
      "authentication_error",
      new Headers(),
    );
    mockCreate.mockRejectedValue(err);

    await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    try {
      await briefAi.generate(VALID_INPUT);
    } catch (thrown) {
      expect((thrown as Error).message).not.toContain("invalid x-api-key");
    }
  });

  it("classifies a BadRequestError (400 -- our own malformed request) as INTERNAL_ERROR, not VALIDATION_ERROR", async () => {
    const err = new Anthropic.BadRequestError(
      400,
      { type: "error", error: { type: "invalid_request_error", message: "bad request" } },
      "invalid_request_error",
      new Headers(),
    );
    mockCreate.mockRejectedValue(err);

    await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("classifies an APIConnectionError (network failure) as SERVICE_UNAVAILABLE", async () => {
    mockCreate.mockRejectedValue(new Anthropic.APIConnectionError({ message: "network down" }));
    await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("classifies an InternalServerError (Anthropic-side 5xx) as SERVICE_UNAVAILABLE", async () => {
    mockCreate.mockRejectedValue(
      new Anthropic.InternalServerError(
        500,
        { type: "error", error: { type: "api_error", message: "internal" } },
        "api_error",
        new Headers(),
      ),
    );
    await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
