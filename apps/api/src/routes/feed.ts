import type { FastifyInstance } from "fastify";
import { CommentRequest, CreatePostRequest, ReactRequest } from "@cx/shared";
import { iso, jsonb } from "../db.js";

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (req) => {
    const userId = req.user.sub;
    // Your posts + people you follow; falls back to the global firehose when
    // your graph is empty so a fresh account never stares at a blank feed.
    const select = `
      SELECT p.id, p.author_id, u.handle AS author_handle, p.kind, p.body, p.ref_id, p.reactions, p.created_at,
             (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
        FROM posts p JOIN users u ON u.id = p.author_id`;
    let { rows } = await app.db.query(
      `${select}
        WHERE p.author_id = $1
           OR p.author_id IN (SELECT followee_id FROM friendships WHERE follower_id = $1)
        ORDER BY p.created_at DESC LIMIT 50`,
      [userId],
    );
    if (rows.length === 0) {
      rows = (await app.db.query(`${select} ORDER BY p.created_at DESC LIMIT 50`)).rows;
    }
    return {
      posts: rows.map((p) => ({
        id: p.id,
        authorId: p.author_id,
        authorHandle: p.author_handle ?? null,
        kind: p.kind,
        body: p.body,
        refId: p.ref_id ?? null,
        reactions: jsonb(p.reactions),
        commentCount: Number(p.comment_count),
        createdAt: iso(p.created_at),
      })),
    };
  });

  app.post("/", async (req) => {
    const userId = req.user.sub;
    const post = CreatePostRequest.parse(req.body);
    const { rows } = await app.db.query(
      `INSERT INTO posts (author_id, kind, body, ref_id) VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [userId, post.kind, post.body, post.refId ?? null],
    );
    return { id: rows[0]!.id, createdAt: iso(rows[0]!.created_at) };
  });

  app.post("/:id/react", async (req, reply) => {
    const { emoji } = ReactRequest.parse(req.body);
    const { id } = req.params as { id: string };
    const { rows } = await app.db.query(
      `UPDATE posts
          SET reactions = jsonb_set(reactions, ARRAY[$2], (COALESCE((reactions->>$2)::int, 0) + 1)::text::jsonb)
        WHERE id = $1
        RETURNING reactions`,
      [id, emoji],
    );
    if (!rows[0]) return reply.notFound("post not found");
    return { reactions: jsonb(rows[0].reactions) };
  });

  app.post("/:id/comment", async (req, reply) => {
    const userId = req.user.sub;
    const { body } = CommentRequest.parse(req.body);
    const { id } = req.params as { id: string };
    const post = await app.db.query(`SELECT id FROM posts WHERE id = $1`, [id]);
    if (!post.rows[0]) return reply.notFound("post not found");
    const { rows } = await app.db.query(
      `INSERT INTO comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [id, userId, body],
    );
    return { id: rows[0]!.id, createdAt: iso(rows[0]!.created_at) };
  });

  app.post("/follow/:userId", async (req, reply) => {
    const me = req.user.sub;
    const { userId } = req.params as { userId: string };
    if (me === userId) return reply.badRequest("cannot follow yourself");
    const target = await app.db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!target.rows[0]) return reply.notFound("user not found");
    await app.db.query(
      `INSERT INTO friendships (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [me, userId],
    );
    return { ok: true, following: userId };
  });
}
