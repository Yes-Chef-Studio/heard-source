import type {
  CaptureInitOptions,
  CaptureRuntimeConfig,
  CaptureRuntimeController,
  CaptureSubmissionDraft,
  CaptureSubmitResult,
  CaptureSubmitTransport,
} from "../types"
import { mountCaptureLauncher } from "../ui/mount-capture-launcher"
import {
  normalizeHost,
  normalizeKey,
  normalizeSubmitPath,
  normalizeZIndex,
} from "../utils"
import { CaptureSdkRuntime } from "./capture-runtime"
import { prefetchCaptureCode } from "./prefetch-capture-code"
import { getSiteColor, isSiteAllowed, warmRenderer } from "./site-check"
import { afterPressReleased, SpeculativeCapture } from "./speculative-capture"

type MountedCaptureLauncher = ReturnType<typeof mountCaptureLauncher>

export class LazyCaptureSdkRuntime implements CaptureRuntimeController {
  private runtimeConfig: CaptureRuntimeConfig | null = null
  private initOptions: CaptureInitOptions | null = null
  private submitTransport: CaptureSubmitTransport | undefined
  private mountedTarget: HTMLElement | null = null
  private mountedLauncher: MountedCaptureLauncher | null = null
  private eagerRuntime: CaptureSdkRuntime | null = null
  private eagerRuntimePromise: Promise<CaptureSdkRuntime> | null = null
  private lifecycleVersion = 0
  // Heard: a screenshot started when the launcher was pressed, before the full runtime exists.
  // Handed to the full runtime when the click that follows opens it.
  private speculation: SpeculativeCapture | null = null

  init(options: CaptureInitOptions): CaptureRuntimeController {
    const runtimeConfig: CaptureRuntimeConfig = {
      key: normalizeKey(options.key),
      host: normalizeHost(options.host),
      submitPath: normalizeSubmitPath(options.submitPath),
      zIndex: normalizeZIndex(options.zIndex),
    }

    this.runtimeConfig = runtimeConfig
    this.submitTransport = options.submitTransport
    this.initOptions = {
      ...options,
      host: runtimeConfig.host,
      key: runtimeConfig.key,
      submitPath: runtimeConfig.submitPath,
      zIndex: runtimeConfig.zIndex,
      submitTransport: this.submitTransport,
    }

    if (options.autoMount ?? true) {
      // Heard: only show the launcher on sites listed for this key (see site-check.ts).
      isSiteAllowed(runtimeConfig).then((allowed) => {
        if (allowed && this.runtimeConfig === runtimeConfig) {
          this.mount(options.mountTarget)
          warmRenderer(runtimeConfig)
        }
      })
    }

    return this
  }

  isInitialized(): boolean {
    return this.runtimeConfig !== null
  }

  getConfig(): CaptureRuntimeConfig | null {
    return this.runtimeConfig
  }

  mount(target?: HTMLElement): void {
    this.ensureBrowserContext()

    if (this.eagerRuntime) {
      this.eagerRuntime.mount(target)
      return
    }

    const mountTarget = target ?? document.body
    this.mountedTarget = mountTarget

    if (this.mountedLauncher) {
      return
    }

    const runtimeConfig = this.getRuntimeConfig()
    this.mountedLauncher = mountCaptureLauncher(mountTarget, {
      onOpen: () => {
        this.open()
      },
      onPrefetch: () => {
        warmRenderer(runtimeConfig)
        prefetchCaptureCode()
        this.prefetchRuntime().catch(() => undefined)
      },
      onPress: () => {
        this.beginSpeculativeCapture(runtimeConfig)
      },
      zIndex: runtimeConfig.zIndex,
      color: getSiteColor(runtimeConfig),
    })
  }

  unmount(): void {
    this.mountedLauncher?.unmount()
    this.mountedLauncher = null
    this.mountedTarget = null
    this.eagerRuntime?.unmount()
  }

  open(): void {
    this.loadEagerRuntime(true).catch(() => undefined)
  }

  // Heard: the launcher has been pressed, so a click is on its way. Copy the page and start the
  // render now (see speculative-capture.ts). The launcher itself must stay as it is until the
  // click lands, so the full runtime, which replaces it, is not created here.
  private beginSpeculativeCapture(config: CaptureRuntimeConfig): void {
    if (this.eagerRuntime || this.speculation?.isUsable()) return
    this.discardSpeculation()
    try {
      this.speculation = new SpeculativeCapture(config)
    } catch {
      return
    }
    const pressed = this.speculation
    afterPressReleased(() => {
      if (this.speculation === pressed) this.discardSpeculation()
    })
  }

  private discardSpeculation(): void {
    this.speculation?.discard()
    this.speculation = null
  }

  close(): void {
    this.eagerRuntime?.close()
  }

  destroy(): void {
    this.lifecycleVersion += 1
    this.discardSpeculation()
    this.mountedLauncher?.unmount()
    this.mountedLauncher = null
    this.mountedTarget = null
    this.eagerRuntimePromise = null
    this.eagerRuntime?.destroy()
    this.eagerRuntime = null
    this.runtimeConfig = null
    this.initOptions = null
    this.submitTransport = undefined
  }

  async startRecording(): Promise<{ startedAt: number }> {
    const runtime = await this.loadEagerRuntime(false)
    return runtime.startRecording()
  }

  async stopRecording(): Promise<Blob | null> {
    if (this.eagerRuntime) {
      return this.eagerRuntime.stopRecording()
    }

    const runtime = await this.loadEagerRuntime(false)
    return runtime.stopRecording()
  }

  async takeScreenshot(): Promise<Blob | null> {
    const runtime = await this.loadEagerRuntime(false)
    return runtime.takeScreenshot()
  }

  async submit(draft: CaptureSubmissionDraft): Promise<CaptureSubmitResult> {
    const runtime = await this.loadEagerRuntime(false)
    return runtime.submit(draft)
  }

  reset(): void {
    this.eagerRuntime?.reset()
  }

  private async prefetchRuntime(): Promise<void> {
    await this.loadEagerRuntimeModule().catch(() => undefined)
  }

  private async loadEagerRuntime(
    openAfterLoad: boolean
  ): Promise<CaptureSdkRuntime> {
    const runtime = await this.getOrCreateEagerRuntime()
    const speculation = this.speculation
    this.speculation = null
    if (openAfterLoad) {
      if (speculation) runtime.adoptSpeculativeCapture(speculation)
      runtime.open()
    } else {
      speculation?.discard()
    }

    return runtime
  }

  private getOrCreateEagerRuntime(): Promise<CaptureSdkRuntime> {
    if (this.eagerRuntime) {
      return Promise.resolve(this.eagerRuntime)
    }

    if (this.eagerRuntimePromise) {
      return this.eagerRuntimePromise
    }

    const initOptions = this.getInitOptions()
    const lifecycleVersion = this.lifecycleVersion
    this.mountedLauncher?.setLoading(true)

    const runtimePromise = this.loadEagerRuntimeModule()
      .then(({ CaptureSdkRuntime }) => {
        if (lifecycleVersion !== this.lifecycleVersion) {
          throw new Error("Capture SDK runtime load was cancelled.")
        }

        const runtime = new CaptureSdkRuntime()
        runtime.init({
          ...initOptions,
          autoMount: true,
          mountTarget: this.mountedTarget ?? initOptions.mountTarget,
        })
        this.eagerRuntime = runtime
        this.mountedLauncher?.unmount()
        this.mountedLauncher = null
        return runtime
      })
      .finally(() => {
        if (this.eagerRuntimePromise === runtimePromise) {
          this.eagerRuntimePromise = null
        }

        this.mountedLauncher?.setLoading(false)
      })

    this.eagerRuntimePromise = runtimePromise
    return runtimePromise
  }

  private loadEagerRuntimeModule(): Promise<{
    CaptureSdkRuntime: typeof CaptureSdkRuntime
  }> {
    return Promise.resolve({
      CaptureSdkRuntime,
    })
  }

  private getInitOptions(): CaptureInitOptions {
    if (!this.initOptions) {
      throw new Error(
        "Capture SDK is not initialized. Call capture.init({ key }) first."
      )
    }

    return this.initOptions
  }

  private getRuntimeConfig(): CaptureRuntimeConfig {
    if (!this.runtimeConfig) {
      throw new Error(
        "Capture SDK is not initialized. Call capture.init({ key }) first."
      )
    }

    return this.runtimeConfig
  }

  private ensureBrowserContext(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error("Capture SDK can only run in a browser environment.")
    }
  }
}
