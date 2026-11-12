import { env as workerEnv } from 'cloudflare:workers';

export function getRuntimeEnv(locals?: App.Locals): Env {
  try {
    const fromLocals = locals?.runtime?.env;
    if (fromLocals) return fromLocals;
  } catch {
    // Astro v6+ Cloudflare removes direct locals runtime env access.
  }
  return workerEnv as Env;
}
