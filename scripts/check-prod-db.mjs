#!/usr/bin/env node
/**
 * Pre-start guard for production / Render.
 * Prevents booting with silent ephemeral SQLite when DATABASE_URL is missing.
 */
const isRender =
  process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
const isProd = process.env.NODE_ENV === "production";

if ((isRender || isProd) && !process.env.DATABASE_URL?.trim()) {
  console.error(
    "[check-prod-db] DATABASE_URL is required in production. Create a Render PostgreSQL database and link it to this web service."
  );
  process.exit(1);
}

console.log(
  `[check-prod-db] ok backend=${process.env.DATABASE_URL ? "postgres" : "sqlite"}`
);
