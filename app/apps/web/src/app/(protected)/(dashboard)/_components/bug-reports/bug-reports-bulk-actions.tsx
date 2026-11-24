"use client"

import type {
  BugReportStatus,
  BugReportVisibility,
} from "@crikket/shared/constants/bug-report"
import {
  CATEGORIES,
  type Category,
  NO_CATEGORY_LABEL,
} from "@crikket/shared/constants/categories"
import type { Priority } from "@crikket/shared/constants/priorities"
import { Button } from "@crikket/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crikket/ui/components/ui/dialog"
import { Input } from "@crikket/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crikket/ui/components/ui/select"
import { SlidersHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"

import { ColorLabel } from "@/components/bug-reports/category-picker"

import {
  formatCategoryLabel,
  formatPriorityLabel,
  formatStatusLabel,
  formatVisibilityLabel,
  PRIORITY_FILTER_OPTIONS,
  STATUS_OPTIONS,
  VISIBILITY_OPTIONS,
} from "./filters"

interface BugReportsBulkActionsProps {
  bulkStatus: BugReportStatus | ""
  bulkPriority: Priority | ""
  // "none" clears the category on the selected reports.
  bulkCategory: Category | "none" | ""
  bulkVisibility: BugReportVisibility | ""
  bulkTagsInput: string
  isMutating: boolean
  onBulkStatusChange: (value: BugReportStatus | "") => void
  onBulkPriorityChange: (value: Priority | "") => void
  onBulkCategoryChange: (value: Category | "none" | "") => void
  onBulkVisibilityChange: (value: BugReportVisibility | "") => void
  onBulkTagsChange: (value: string) => void
  onApplyUpdates: () => Promise<void>
  onRequestBulkDelete: () => void
}

export function BugReportsBulkActions({
  bulkStatus,
  bulkPriority,
  bulkCategory,
  bulkVisibility,
  bulkTagsInput,
  isMutating,
  onBulkStatusChange,
  onBulkPriorityChange,
  onBulkCategoryChange,
  onBulkVisibilityChange,
  onBulkTagsChange,
  onApplyUpdates,
  onRequestBulkDelete,
}: BugReportsBulkActionsProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const statusLabel = bulkStatus ? formatStatusLabel(bulkStatus) : "Status"
  const priorityLabel = bulkPriority
    ? formatPriorityLabel(bulkPriority)
    : "Priority"
  const categoryLabel = bulkCategory
    ? formatCategoryLabel(bulkCategory)
    : "Category"
  const visibilityLabel = bulkVisibility
    ? formatVisibilityLabel(bulkVisibility)
    : "Visibility"

  const hasPendingChanges =
    Boolean(bulkStatus) ||
    Boolean(bulkPriority) ||
    Boolean(bulkCategory) ||
    Boolean(bulkVisibility) ||
    bulkTagsInput.trim().length > 0

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Dialog onOpenChange={setIsEditorOpen} open={isEditorOpen}>
        <DialogTrigger
          render={
            <Button
              className="flex-1 sm:flex-none"
              size="sm"
              variant={hasPendingChanges ? "default" : "outline"}
            />
          }
        >
          <SlidersHorizontal className="size-4" />
          Bulk edit
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk edit selected reports</DialogTitle>
            <DialogDescription>
              Choose one or more fields. Only selected fields will be updated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              onValueChange={(value) =>
                onBulkStatusChange(value as BugReportStatus)
              }
              value={bulkStatus}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{statusLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) => onBulkPriorityChange(value as Priority)}
              value={bulkPriority}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{priorityLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <ColorLabel color={option.color} label={option.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) =>
                onBulkCategoryChange(value as Category | "none")
              }
              value={bulkCategory}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{categoryLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <ColorLabel color={option.color} label={option.label} />
                  </SelectItem>
                ))}
                <SelectItem value="none">{NO_CATEGORY_LABEL}</SelectItem>
              </SelectContent>
            </Select>

            <Select
              onValueChange={(value) =>
                onBulkVisibilityChange(value as BugReportVisibility)
              }
              value={bulkVisibility}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{visibilityLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="sm:col-span-2"
              onChange={(event) => onBulkTagsChange(event.target.value)}
              placeholder="Tags (comma-separated)"
              value={bulkTagsInput}
            />
          </div>

          <DialogFooter>
            <Button
              disabled={isMutating}
              onClick={async () => {
                try {
                  await onApplyUpdates()
                  setIsEditorOpen(false)
                } catch {
                  // Errors are handled by parent toasts.
                }
              }}
              size="sm"
              variant="default"
            >
              Apply updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 gap-2 sm:flex-none">
        <Button
          className="flex-1 sm:flex-none"
          disabled={isMutating}
          onClick={onRequestBulkDelete}
          size="sm"
          variant="destructive"
        >
          <Trash2 className="size-4" />
          Delete selected
        </Button>
      </div>
    </div>
  )
}
