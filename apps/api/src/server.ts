/** Fastify API gateway. Public: /v1/health, /v1/auth/*, /docs. Everything else needs a verified JWT. */

import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { createDb, type Db } from "./db.js";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { workoutRoutes } from "./routes/workouts.js";
import { statsRoutes } from "./routes/stats.js";
import { battleRoutes } from "./routes/battle.js";
import { feedRoutes } from "./routes/feed.js";
import { ranksRoutes } from "./routes/ranks.js";
import { tribesRoutes } from "./routes/tribes.js";

const PUBLIC_PREFIXES = ["/v1/health", "/v1/auth", "/docs"];

export async function buildServer(opts: { db?: Db } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isDev
      ? { level: "info", transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
      : { level: "info" },
  });

  app.decorate("db", opts.db ?? (await createDb()));
  app.addHook("onClose", async () => {
    await app.db.close();
  });

  await app.register(helmet);
  // The mobile app doesn't need CORS; only listed web origins get it in production.
  await app.register(cors, { origin: env.isDev ? true : env.corsOrigins });
  await app.register(sensible);
  await app.register(rateLimit, { max: 200, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.jwtSecret, sign: { expiresIn: env.accessTokenTtl } });

  await app.register(swagger, {
    openapi: {
      info: { title: "CompeteX API", version: "3.0.0", description: "Train in real life. Fight with your stats." },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.addHook("onRequest", async (req, reply) => {
    const url = req.raw.url ?? "";
    if (PUBLIC_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`))) return;
    try {
      await req.jwtVerify();
    } catch {
      return reply.unauthorized("missing or invalid access token");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
    }
    req.log.error(err);
    const e = err as { statusCode?: number; name?: string; message?: string };
    const status = e.statusCode ?? 500;
    return reply.status(status).send({
      statusCode: status,
      error: e.name ?? "Error",
      message: status >= 500 && !env.isDev ? "internal error" : e.message ?? "error",
    });
  });

  app.get("/v1/health", async () => {
    await app.db.query("SELECT 1");
    return { ok: true, version: "3.0.0" };
  });

  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(meRoutes, { prefix: "/v1/me" });
  await app.register(workoutRoutes, { prefix: "/v1/workouts" });
  await app.register(statsRoutes, { prefix: "/v1/stats" });
  await app.register(battleRoutes, { prefix: "/v1/battle" });
  await app.register(feedRoutes, { prefix: "/v1/feed" });
  await app.register(ranksRoutes, { prefix: "/v1/ranks" });
  await app.register(tribesRoutes, { prefix: "/v1/tribes" });

  return app;
}
