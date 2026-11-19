import { lazy } from "react"
import type { ReviewFormSection } from "./sections/review-form-section"

type ReviewFormSectionComponent = typeof ReviewFormSection

let loaded: ReviewFormSectionComponent | null = null
let loading: Promise<ReviewFormSectionComponent> | null = null

// Heard: the review screen is loaded ahead of the click that opens it. Once it's here it is
// rendered directly: React.lazy shows its fallback for a frame even when the code is already
// downloaded, and the review screen is meant to appear the instant "Take screenshot" is clicked.
export function preloadReviewFormSection(): Promise<ReviewFormSectionComponent> {
  loading ??= import("./sections/review-form-section").then((module) => {
    loaded = module.ReviewFormSection
    return loaded
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

const LazyReviewFormSection = lazy(async () => ({
  default: await preloadReviewFormSection(),
}))

export function getReviewFormSection(): ReviewFormSectionComponent {
  return loaded ?? (LazyReviewFormSection as ReviewFormSectionComponent)
}
