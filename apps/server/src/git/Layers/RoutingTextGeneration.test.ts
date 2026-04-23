import { describe, expect, it } from "vitest";

import { normalizeTextGenerationModelSelection } from "./RoutingTextGeneration.ts";

describe("normalizeTextGenerationModelSelection", () => {
  it("falls back from Pi to the default Codex text generation model", () => {
    expect(
      normalizeTextGenerationModelSelection({
        provider: "pi",
        model: "default",
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.4-mini",
    });
  });

  it("preserves supported text generation providers", () => {
    expect(
      normalizeTextGenerationModelSelection({
        provider: "opencode",
        model: "openai/gpt-5",
      }),
    ).toEqual({
      provider: "opencode",
      model: "openai/gpt-5",
    });
  });
});
