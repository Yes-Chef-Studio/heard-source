// Routes heard.yeschef-dev.fyi to the containers.
//   /api/*, /rpc/*, /api-reference/*  -> App container, port 3000 (API)
//   everything else                    -> App container, port 3001 (dashboard, share pages, widget.js)
// The renderer has no public route: the API reaches it at http://renderer.internal, which the App
// container's outbound handler sends straight to the Renderer container.
import { Container, getContainer, switchPort } from "@cloudflare/containers"

// Needed for the outbound handler that routes renderer.internal to the Renderer container.
export { ContainerProxy } from "@cloudflare/containers"

interface Env {
  APP: DurableObjectNamespace<App>
  RENDERER: DurableObjectNamespace<Renderer>
  HEARD_URL: string
  STORAGE_BUCKET: string
  ALLOWED_SIGNUP_DOMAINS: string
  // Secrets (set by the deploy workflow from GitHub secrets)
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  CAPTURE_SUBMIT_TOKEN_SECRET: string
  RENDERER_SECRET: string
  STORAGE_ENDPOINT: string
  STORAGE_ACCESS_KEY_ID: string
  STORAGE_SECRET_ACCESS_KEY: string
}

type ContainerContext = ConstructorParameters<typeof Container>[0]

const API_PORT = 3000
const WEB_PORT = 3001
const API_PATH = /^\/(api|rpc|api-reference)(\/|$)/
const RENDERER_HOST = "renderer.internal"

export class App extends Container<Env> {
  defaultPort = WEB_PORT
  requiredPorts = [API_PORT, WEB_PORT]
  // Sleeps after 30 quiet minutes; the next request wakes it (a few seconds).
  sleepAfter = "30m"

  constructor(ctx: ContainerContext, env: Env) {
    super(ctx, env)
    const url = env.HEARD_URL
    this.envVars = {
      NODE_ENV: "production",
      PORT: String(API_PORT),
      DATABASE_URL: env.DATABASE_URL,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: url,
      CORS_ORIGINS: url,
      ALLOWED_SIGNUP_DOMAINS: env.ALLOWED_SIGNUP_DOMAINS,
      // Accounts are added by an admin (apps/server/scripts/users.ts); Heard sends no email.
      DISABLE_SIGNUP: "true",
      ENABLE_PAYMENTS: "false",
      CAPTURE_SUBMIT_TOKEN_SECRET: env.CAPTURE_SUBMIT_TOKEN_SECRET,
      RENDERER_URL: `http://${RENDERER_HOST}`,
      RENDERER_SECRET: env.RENDERER_SECRET,
      STORAGE_BUCKET: env.STORAGE_BUCKET,
      STORAGE_REGION: "auto",
      STORAGE_ENDPOINT: env.STORAGE_ENDPOINT,
      STORAGE_ACCESS_KEY_ID: env.STORAGE_ACCESS_KEY_ID,
      STORAGE_SECRET_ACCESS_KEY: env.STORAGE_SECRET_ACCESS_KEY,
      NEXT_PUBLIC_SITE_URL: url,
      NEXT_PUBLIC_APP_URL: url,
      NEXT_PUBLIC_SERVER_URL: url,
      NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
      // The dashboard's server-side calls go to the API inside this container.
      HEARD_INTERNAL_SERVER_URL: `http://127.0.0.1:${API_PORT}`,
    }
  }
}

// Assigned outside the class body on purpose: the library registers handlers through a static
// setter, and a `static outboundByHost = ...` field would shadow it, so nothing gets registered.
App.outboundByHost = {
  [RENDERER_HOST]: (request: Request, env: Env) =>
    getContainer(env.RENDERER).fetch(request),
}

export class Renderer extends Container<Env> {
  defaultPort = 3102
  sleepAfter = "10m"

  constructor(ctx: ContainerContext, env: Env) {
    super(ctx, env)
    this.envVars = {
      NODE_ENV: "production",
      RENDERER_HOST: "0.0.0.0",
      RENDERER_PORT: "3102",
      RENDERER_SECRET: env.RENDERER_SECRET,
    }
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    // A single App instance, created in Eastern North America next to the database.
    const app = env.APP.get(env.APP.idFromName("main"), {
      locationHint: "enam",
    })
    const port = API_PATH.test(pathname) ? API_PORT : WEB_PORT
    return app.fetch(switchPort(request, port))
  },
} satisfies ExportedHandler<Env>
