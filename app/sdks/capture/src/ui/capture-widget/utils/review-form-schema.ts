import {
  BUG_REPORT_VISIBILITY_OPTIONS,
  type BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import {
  PRIORITIES,
  PRIORITY_OPTIONS,
  type Priority,
} from "@crikket/shared/constants/priorities"
import type { CaptureSubmissionDraft } from "../../../types"

const priorityValues = new Set<string>(Object.values(PRIORITY_OPTIONS))
const visibilityValues = new Set<string>(
  Object.values(BUG_REPORT_VISIBILITY_OPTIONS)
)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ReviewDraftErrors = Partial<
  Record<keyof CaptureSubmissionDraft, string>
>

export const capturePriorityOptions = PRIORITIES.map((priority) => ({
  label: `${priority.label}: ${priority.description}`,
  value: priority.value,
}))

export function validateReviewDraft(
  value: CaptureSubmissionDraft
): ReviewDraftErrors | undefined {
  const errors: ReviewDraftErrors = {}

  if (value.title.trim().length === 0) {
    errors.title = "Describe the issue in a few words."
  } else if (value.title.length > 200) {
    errors.title = "Title must be at most 200 characters."
  }

  if (value.description.length > 3000) {
    errors.description = "Description must be at most 3000 characters."
  }

  const reporterName = value.reporterName?.trim() ?? ""
  if (reporterName.length === 0) {
    errors.reporterName = "Add your name so the team knows who sent this."
  } else if (reporterName.length > 100) {
    errors.reporterName = "Name must be at most 100 characters."
  }

  const reporterEmail = value.reporterEmail?.trim() ?? ""
  if (reporterEmail.length === 0) {
    errors.reporterEmail = "Add your email so the team can follow up."
  } else if (reporterEmail.length > 200 || !EMAIL_PATTERN.test(reporterEmail)) {
    errors.reporterEmail = "Enter a valid email address."
  }

  if (value.priority === "") {
    errors.priority = "Choose how urgent this is."
  } else if (!priorityValues.has(value.priority)) {
    errors.priority = "Select a valid priority."
  }

  if (
    value.visibility !== undefined &&
    !visibilityValues.has(value.visibility)
  ) {
    errors.visibility = "Select a valid visibility."
  }

  return Object.keys(errors).length > 0 ? errors : undefined
}

export function trimReviewDraftForSubmission(
  draft: CaptureSubmissionDraft
): CaptureSubmissionDraft {
  return {
    description: draft.description.trim(),
    priority: draft.priority,
    title: draft.title.trim(),
    reporterName: draft.reporterName?.trim() ?? "",
    reporterEmail: draft.reporterEmail?.trim() ?? "",
    visibility: visibilityValues.has(draft.visibility ?? "")
      ? (draft.visibility as BugReportVisibility)
      : BUG_REPORT_VISIBILITY_OPTIONS.private,
  }
}

export type CapturePriority = Priority
