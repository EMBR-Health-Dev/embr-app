// A stand-in for the Anthropic Messages API, for the local integrity
// check only. It returns fixed, valid narrative text (in English,
// Japanese or French, matching the system prompt) so that BRIEF
// generation can run without network access or an API key. It proves
// nothing about the quality or safety of real AI-generated narrative.
// Start the API with ANTHROPIC_BASE_URL=http://127.0.0.1:4555 to use it.
import http from "node:http";
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const sys = JSON.stringify(JSON.parse(body || "{}").system ?? "");
      const ja = sys.includes("日本語"),
        fr = sys.includes("français");
      const out = {
        narrative: ja
          ? "この期間の記録をまとめました。"
          : fr
            ? "Synthèse des saisies de la période."
            : "A summary of the period's entries.",
        discussionTopics: [
          {
            text: ja
              ? "この変化はよくあることですか？"
              : fr
                ? "Ce changement est-il fréquent ?"
                : "Is this change common?",
            patternIds: [],
          },
        ],
        patterns: [],
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_stub",
          type: "message",
          role: "assistant",
          model: "stub",
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: "text", text: JSON.stringify(out) }],
        }),
      );
    });
  })
  .listen(Number(process.env.AI_STUB_PORT ?? 4555), "127.0.0.1");
