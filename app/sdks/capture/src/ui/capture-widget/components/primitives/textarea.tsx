import { cn } from "./cn"

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
): React.JSX.Element {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-field px-3 py-2 text-foreground text-sm shadow-none outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-foreground/40 focus-visible:border-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  )
}
