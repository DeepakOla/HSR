/// <reference path="../.astro/types.d.ts" />

interface Env {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  ACCESS_AUDIENCE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  APP_BASE_URL?: string;
  DEV_AUTH_SECRET?: string;
  R2_MAX_EVIDENCE_BYTES?: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: Env;
      cf: Request['cf'];
    };
  }
}
