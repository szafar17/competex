import type { FastifyInstance } from "fastify";
import { CreateTribeRequest } from "@cx/shared";
import { iso } from "../db.js";

export async function tribesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", async (req, reply) => {
    const userId = req.user.sub;
    const { name, motto } = CreateTribeRequest.parse(req.body);
    const clash = await app.db.query(`SELECT id FROM tribes WHERE lower(name) = lower($1)`, [name]);
    if (clash.rows[0]) return reply.conflict("tribe name taken");
    const { rows } = await app.db.query(
      `INSERT INTO tribes (name, motto, created_by) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [name, motto ?? null, userId],
    );
    const tribe = rows[0]!;
    await app.db.query(
      `INSERT INTO tribe_members (tribe_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [tribe.id, userId],
    );
    return { id: tribe.id, name, motto: motto ?? null, memberCount: 1, createdAt: iso(tribe.created_at) };
  });

  app.get("/", async () => {
    const { rows } = await app.db.query(
      `SELECT t.id, t.name, t.motto, t.created_at,
              (SELECT count(*) FROM tribe_members tm WHERE tm.tribe_id = t.id) AS member_count
         FROM tribes t ORDER BY member_count DESC, t.created_at ASC LIMIT 50`,
    );
    return {
      tribes: rows.map((t) => ({
        id: t.id,
        name: t.name,
        motto: t.motto ?? null,
        memberCount: Number(t.member_count),
        createdAt: iso(t.created_at),
      })),
    };
  });

  app.post("/:id/join", async (req, reply) => {
    const userId = req.user.sub;
    const { id } = req.params as { id: string };
    const tribe = await app.db.query(`SELECT id FROM tribes WHERE id = $1`, [id]);
    if (!tribe.rows[0]) return reply.notFound("tribe not found");
    await app.db.query(
      `INSERT INTO tribe_members (tribe_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, userId],
    );
    return { ok: true, tribeId: id };
  });
}
