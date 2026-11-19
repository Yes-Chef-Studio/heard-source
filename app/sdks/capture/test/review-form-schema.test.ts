import { describe, expect, it } from "bun:test"
import { validateReviewDraft } from "../src/ui/capture-widget/utils/review-form-schema"

const valid = {
  title: "Button overlaps text",
  description: "",
  priority: "normal" as const,
  reporterName: "Sam",
  reporterEmail: "sam@example.com",
}

describe("validateReviewDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateReviewDraft(valid)).toBeUndefined()
  })

  it("requires a title", () => {
    expect(validateReviewDraft({ ...valid, title: "   " })?.title).toBe(
      "Describe the issue in a few words."
    )
  })

  it("requires a priority to be chosen", () => {
    expect(validateReviewDraft({ ...valid, priority: "" })?.priority).toBe(
      "Choose how urgent this is."
    )
  })
})
