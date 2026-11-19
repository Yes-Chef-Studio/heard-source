// Shown while a video is recording: a bar at the bottom centre with the time and a clear stop
// button. It appears in the recording too, which is fine (it shows where the clip ends).
export function RecordingDock(props: {
  busy: boolean
  onStopRecording: () => void
  recordingTime: string
  zIndex: number
}): React.JSX.Element {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[var(--capture-z-index)] flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card py-2 pr-2 pl-4 text-card-foreground shadow-2xl"
      style={{ ["--capture-z-index" as string]: String(props.zIndex + 2) }}
    >
      <span aria-hidden="true" className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
      </span>
      <span className="font-medium text-sm">Recording</span>
      <span className="min-w-11 font-mono text-muted-foreground text-sm tabular-nums">
        {props.recordingTime}
      </span>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-full bg-red-600 px-4 font-semibold text-sm text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        disabled={props.busy}
        onClick={props.onStopRecording}
        type="button"
      >
        <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-white" />
        Stop recording
      </button>
    </div>
  )
}
