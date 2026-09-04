import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@embr/shared";
import Anthropic from "@anthropic-ai/sdk";

const { mockCreate, constructorCalls } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  constructorCalls: [] as unknown[],
}));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();

  class MockAnthropic {
    messages = { create: mockCreate };

    constructor(options: unknown) {
      constructorCalls.push(options);
    }

    static APIError = actual.APIError;
    static RateLimitError = actual.RateLimitError;
    static APIConnectionError = actual.APIConnectionError;
    static InternalServerError = actual.InternalServerError;
    static AuthenticationError = actual.AuthenticationError;
    static BadRequestError = actual.BadRequestError;
  }

  return { ...actual, default: MockAnthropic };
});

import { briefAi } from "../src/modules/briefs/brief.ai.js";

const VALID_INPUT = {
  fromDate: "2026-01-01",
  toDate: "2026-02-01",
  symptomSummary: [{ category: "HOT_FLASH", count: 3, severityBreakdown: { MODERATE: 3 } }],
  cycleSummary: { averageCycleLengthDays: 28, cycleCount: 2, periodDaysLogged: 6 },
  interpretation: { interpretationVersion: "1.0", patterns: [] },
};

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

// Discussion topics are now wire objects, {text, patternIds} — this
// builds one with no citation, the common case for every fixture in
// this file that isn't specifically testing citation behavior itself
// (that gets its own dedicated describe block below).
function dt(text: string, patternIds: string[] = []) {
  return { text, patternIds };
}

beforeEach(() => {
  mockCreate.mockReset();
  constructorCalls.length = 0;
});

describe("brief.ai", () => {
  it("parses a well-formed model response", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify({
          narrative: "Some narrative.",
          discussionTopics: [dt("A question?")],
          patterns: [],
        }),
      ),
    );

    const result = await briefAi.generate(VALID_INPUT);
    expect(result).toEqual({
      narrative: "Some narrative.",
      discussionTopics: ["A question?"],
      patterns: [],
    });
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
      textResponse(JSON.stringify({ narrative: "n", discussionTopics: [], patterns: [] })),
    );
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow();
  });

  it("rejects a response with no text content block", async () => {
    mockCreate.mockResolvedValue({ content: [] });
    await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("no text content");
  });

  it("sends only the structured summary, never raw notes, in the user message", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify({
          narrative: "n",
          discussionTopics: [dt("Ask your GP about this?")],
          patterns: [],
        }),
      ),
    );

    await briefAi.generate(VALID_INPUT);

    const call = mockCreate.mock.calls[0][0];
    const sentContent = JSON.parse(call.messages[0].content);
    expect(sentContent).toEqual({
      dateRange: { from: VALID_INPUT.fromDate, to: VALID_INPUT.toDate },
      symptomSummary: VALID_INPUT.symptomSummary,
      cycleSummary: VALID_INPUT.cycleSummary,
      interpretation: VALID_INPUT.interpretation,
    });
    // No "notes" key anywhere, at any depth, in what actually gets sent.
    expect(JSON.stringify(sentContent)).not.toContain("notes");
  });

  it("system prompt forbids diagnosis/treatment suggestions and requires question-framed topics", async () => {
    mockCreate.mockResolvedValue(
      textResponse(
        JSON.stringify({
          narrative: "n",
          discussionTopics: [dt("Ask your GP about this?")],
          patterns: [],
        }),
      ),
    );

    await briefAi.generate(VALID_INPUT);

    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain("Never diagnose");
    expect(call.system).toContain("recommend any treatment");
    expect(call.system).toContain("open question");
  });

  describe("operational hardening", () => {
    it("sets an explicit timeout and retry count, not the SDK's own defaults", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({ narrative: "n", discussionTopics: [dt("Question?")], patterns: [] }),
        ),
      );

      await briefAi.generate(VALID_INPUT);

      expect(constructorCalls).toHaveLength(1);
      const options = constructorCalls[0] as { timeout?: number; maxRetries?: number };
      expect(options.timeout).toBeTypeOf("number");
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.maxRetries).toBeTypeOf("number");
    });

    it("wraps an Anthropic SDK error as a safe, generic AppError — never leaks the raw upstream message", async () => {
      // Mirrors the real shape of Anthropic.APIError and its
      // subclasses (AuthenticationError, RateLimitError, ...): a plain
      // Error with a real `.status` property in the same 4xx/5xx range
      // this API's own client-facing errors use. Without brief.ai.ts's
      // wrapping, the global error handler's hasClientErrorStatus()
      // duck-typing would misclassify this as the *user's* bad
      // request.
      const upstreamError = Object.assign(new Error("Invalid API key provided"), { status: 401 });
      mockCreate.mockRejectedValue(upstreamError);

      const promise = briefAi.generate(VALID_INPUT);
      await expect(promise).rejects.toBeInstanceOf(AppError);

      const thrown = await promise.catch((e: unknown) => e as AppError);
      expect(thrown.statusCode).toBe(500);
      // The client-facing message must never be Anthropic's raw text.
      expect(thrown.message).not.toContain("Invalid API key");
      // The original error is preserved for our own logs/Sentry, just
      // never sent over the wire.
      expect(thrown.cause).toBe(upstreamError);
    });

    it("wraps a network/connection failure the same safe way", async () => {
      mockCreate.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await expect(briefAi.generate(VALID_INPUT)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe("output content safety (defense-in-depth)", () => {
    it("rejects a discussion topic not phrased as a question", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("This is an assertion.")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("not phrased as a question");
    });

    it("rejects output containing the word 'diagnos-' in any form", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "This pattern may indicate a diagnosis of something.",
            discussionTopics: [dt("Question?")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("prohibited pattern");
    });

    it("rejects output recommending a specific action ('you should take/start/stop/try')", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("You should try magnesium supplements?")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("prohibited pattern");
    });

    it("rejects output containing 'I recommend'", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "I recommend seeing a specialist.",
            discussionTopics: [dt("Q?")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("prohibited pattern");
    });

    it("rejects output containing a dosage-shaped figure", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "The pattern involved 50mg of something.",
            discussionTopics: [dt("Question?")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("prohibited pattern");
    });

    it("does not false-positive on ordinary, compliant output", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "Hot flashes were logged on 3 of the 30 days in this range.",
            discussionTopics: [
              dt("Ask whether the frequency of hot flashes is typical at this stage?"),
            ],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).resolves.toBeDefined();
    });

    it("no ClinicalBrief-relevant data escapes when the safety check fails — the promise rejects, nothing is returned", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "I recommend rest.",
            discussionTopics: [dt("Q?")],
            patterns: [],
          }),
        ),
      );
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow();
    });
  });

  // Structural validation only — this establishes that a well-formed
  // Stage 4 pattern can pass through the response contract at all.
  // Whether a given pattern actually corresponds to real supplied
  // evidence (as opposed to one the model invented) is a separate,
  // later concern (structural citation validation) — not tested here.
  describe("Stage 4 pattern contract", () => {
    const VALID_PATTERN = {
      id: "frequency_increased:HOT_FLASH",
      type: "frequency_increased",
      observation: "Hot flash frequency increased during the selected period.",
      interpretation: "The available symptom data shows an increase in logged hot flashes.",
      caveat: "This is a descriptive pattern in the logged data and does not establish a cause.",
      confidence: "descriptive",
      evidenceRef: { category: "HOT_FLASH" },
    };

    it("accepts a structurally valid Stage 4 pattern", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [VALID_PATTERN],
          }),
        ),
      );

      const result = await briefAi.generate(VALID_INPUT);
      expect(result.patterns).toEqual([VALID_PATTERN]);
    });

    it("accepts an empty patterns array", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({ narrative: "n", discussionTopics: [dt("Question?")], patterns: [] }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).resolves.toMatchObject({ patterns: [] });
    });

    it("rejects a pattern with an invalid confidence value", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [{ ...VALID_PATTERN, confidence: "high" }],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    it("rejects a pattern whose evidenceRef doesn't match any of the three known shapes", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [{ ...VALID_PATTERN, evidenceRef: { somethingElse: "x" } }],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    // PR #105 hardening. Distinct from the "doesn't match any of the
    // three known shapes" case above — this is a *valid* discriminant
    // key (category) with a *valid* value, plus one extra field
    // alongside it. Confirms evidenceRefSchema's .strict() modifier
    // (see brief.ai.ts's own doc comment on why it's there — "rejects
    // extra/misplaced keys rather than silently accepting them")
    // actually does what its comment says, rather than trusting the
    // comment alone.
    it("rejects a pattern whose evidenceRef has a valid shape plus an extra, unexpected field", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [
              { ...VALID_PATTERN, evidenceRef: { category: "HOT_FLASH", confidence: "high" } },
            ],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    it("rejects a pattern whose evidenceRef is null rather than omitted or a valid object", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [{ ...VALID_PATTERN, evidenceRef: null }],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    it("rejects a response where patterns is null rather than an array", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({ narrative: "n", discussionTopics: [dt("Question?")], patterns: null }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    it("rejects a pattern whose evidenceRef category isn't a real SymptomCategory", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [{ ...VALID_PATTERN, evidenceRef: { category: "NOT_A_REAL_CATEGORY" } }],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("unexpected response shape");
    });

    it("rejects pattern text containing an existing prohibited safety pattern — exercised through generate(), not by exporting failsContentSafety", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("Question?")],
            patterns: [
              { ...VALID_PATTERN, interpretation: "This may indicate a diagnosis of something." },
            ],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow("prohibited pattern");
    });
  });

  // The core invariant this milestone adds: a discussion topic that
  // cites a specific finding must cite one the model also echoed in
  // `patterns` for the same response — closing the one gap the
  // `patterns` array's own provenance validation didn't cover on its
  // own (see discussionTopicSchema's doc comment in brief.ai.ts for
  // the full reasoning). Whether a *cited* id also traces back to real
  // canonical Stage 4 evidence is stage4-validation.ts's job,
  // downstream in brief.service.ts — not tested here; this only
  // proves the response-level self-consistency check this file itself
  // is responsible for.
  describe("discussion topic citations", () => {
    it("accepts a topic with no citation — patternIds may be empty", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [dt("A general question with no specific finding?", [])],
            patterns: [],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).resolves.toMatchObject({
        discussionTopics: ["A general question with no specific finding?"],
      });
    });

    it("accepts a topic citing a pattern id present in this same response's patterns array", async () => {
      const pattern = {
        id: "frequency_increased:HOT_FLASH",
        type: "frequency_increased",
        observation: "Hot flash frequency increased during the selected period.",
        interpretation: "The available symptom data shows an increase in logged hot flashes.",
        caveat: "This is a descriptive pattern in the logged data and does not establish a cause.",
        confidence: "descriptive",
        evidenceRef: { category: "HOT_FLASH" },
      };
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [
              dt("Ask whether the increase in hot flashes is typical?", [
                "frequency_increased:HOT_FLASH",
              ]),
            ],
            patterns: [pattern],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).resolves.toMatchObject({
        discussionTopics: ["Ask whether the increase in hot flashes is typical?"],
        patterns: [pattern],
      });
    });

    // PR #105 hardening. A duplicate id within one topic's own
    // patternIds has no real effect either way — patternIds only ever
    // exists to be validated, then discarded (see the "strips
    // patternIds before returning" test below) — but this confirms
    // that explicitly, rather than leaving it unproven that a
    // duplicate doesn't accidentally trip a false rejection.
    it("accepts a duplicate pattern id within one topic's own patternIds", async () => {
      const pattern = {
        id: "frequency_increased:HOT_FLASH",
        type: "frequency_increased",
        observation: "Hot flash frequency increased during the selected period.",
        interpretation: "The available symptom data shows an increase in logged hot flashes.",
        caveat: "This is a descriptive pattern in the logged data and does not establish a cause.",
        confidence: "descriptive",
        evidenceRef: { category: "HOT_FLASH" },
      };
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [
              dt("Ask about this twice-cited finding?", [
                "frequency_increased:HOT_FLASH",
                "frequency_increased:HOT_FLASH",
              ]),
            ],
            patterns: [pattern],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).resolves.toMatchObject({
        discussionTopics: ["Ask about this twice-cited finding?"],
      });
    });

    it("fails closed when a topic cites a pattern id absent from this response's own patterns array", async () => {
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            // Cites an id but never includes the corresponding pattern
            // in `patterns` — exactly the gap this milestone closes:
            // previously nothing would have caught this at all.
            discussionTopics: [
              dt("Ask whether X and Y are related?", ["co_occurrence_detected:X:Y"]),
            ],
            patterns: [],
          }),
        ),
      );

      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow(
        "discussion topic cited a pattern id not present in patterns",
      );
    });

    it("fails closed for the whole response when only one of several topics has an invalid citation", async () => {
      const pattern = {
        id: "frequency_increased:HOT_FLASH",
        type: "frequency_increased",
        observation: "Hot flash frequency increased during the selected period.",
        interpretation: "The available symptom data shows an increase in logged hot flashes.",
        caveat: "This is a descriptive pattern in the logged data and does not establish a cause.",
        confidence: "descriptive",
        evidenceRef: { category: "HOT_FLASH" },
      };
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [
              dt("Ask about the hot flash increase?", ["frequency_increased:HOT_FLASH"]),
              dt("Ask whether X and Y are related?", ["co_occurrence_detected:X:Y"]),
            ],
            patterns: [pattern],
          }),
        ),
      );

      // Not a partial success dropping only the bad topic — the entire
      // generation attempt fails, same as every other validation
      // failure in this file.
      await expect(briefAi.generate(VALID_INPUT)).rejects.toThrow(
        "discussion topic cited a pattern id not present in patterns",
      );
    });

    it("strips patternIds before returning — BriefContent.discussionTopics is plain string[]", async () => {
      const pattern = {
        id: "frequency_increased:HOT_FLASH",
        type: "frequency_increased",
        observation: "Hot flash frequency increased during the selected period.",
        interpretation: "The available symptom data shows an increase in logged hot flashes.",
        caveat: "This is a descriptive pattern in the logged data and does not establish a cause.",
        confidence: "descriptive",
        evidenceRef: { category: "HOT_FLASH" },
      };
      mockCreate.mockResolvedValue(
        textResponse(
          JSON.stringify({
            narrative: "n",
            discussionTopics: [
              dt("Ask about the hot flash increase?", ["frequency_increased:HOT_FLASH"]),
            ],
            patterns: [pattern],
          }),
        ),
      );

      const result = await briefAi.generate(VALID_INPUT);
      expect(result.discussionTopics).toEqual(["Ask about the hot flash increase?"]);
      // Not an array of objects — a real string, not something that
      // merely looks like one when logged.
      expect(typeof result.discussionTopics[0]).toBe("string");
    });
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
