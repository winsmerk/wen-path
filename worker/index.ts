/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { dispatchDueMemos, ensureMemoSchema } from "../lib/memos";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  WECOM_CORP_ID?: string;
  WECOM_AGENT_ID?: string;
  WECOM_SECRET?: string;
  WECOM_USER_ID?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: { scheduledTime: number; cron: string }, env: Env, ctx: ExecutionContext) {
    const config = env.WECOM_CORP_ID && env.WECOM_AGENT_ID && env.WECOM_SECRET && env.WECOM_USER_ID
      ? { corpId: env.WECOM_CORP_ID, agentId: env.WECOM_AGENT_ID, secret: env.WECOM_SECRET, userId: env.WECOM_USER_ID }
      : undefined;
    ctx.waitUntil(ensureMemoSchema(env.DB).then(() => dispatchDueMemos(env.DB, config)));
  },
};

export default worker;
