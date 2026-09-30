/**
 * Session delete - HOST half.
 *
 * Officially the product only archives sessions ("session deletion ... are
 * separate, absent capabilities" per dsh-workspace's README); the durable log
 * under `<home>/.dsh/sessions/<project>/<session-id>/` is kept forever. This
 * plugin adds true deletion on top of the shipped building blocks, in the
 * safest order the host services allow:
 *
 * 1. Refuse while the session is LIVE in the in-memory store (`ctx.sessions`)
 *    - an open or retained session may still flush buffered events back to
 *    disk, which would resurrect a deleted log as a torn ghost.
 * 2. `workspaceRegistry.archiveSession(sessionId)` (no `stopActivity`): its
 *    `workspace/session-activity` waterfall refuses running work, the durable
 *    archive set hides the row from every grouping surface, and the
 *    ArchivedSessionGate blocks any future model step - even if a raced
 *    handle wakes up after the directory is gone.
 * 3. Remove the session's directory through the persistence backend's OWN
 *    `locate()` + `root` (never a re-derived path), after verifying the
 *    target is exactly `<root>/<project>/<session-id>` - two levels, under
 *    the root, with the backend's session-id shape. Anything else refuses.
 * 4. Detach the id from its workspace's accounting (the one-owner ledger),
 *    then emit the forwarded `api-session/removed` event so the client drops
 *    its cached summary immediately.
 *
 * Failure modes stay recoverable: a failed directory removal leaves an
 * archived (hidden, gated) session that the shipped unarchive UI can restore;
 * a failed detach leaves a stale accounting slot that the registry's own
 * header-index filtering already tolerates.
 */
import { rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Exact route the Client half calls. */
const ROUTE_PATH = '/session-delete';

/** Request-body ceiling for the route. */
const BODY_LIMIT = 16 * 1024;

/**
 * Session ids as they appear on disk: `session-` followed by the backend's
 * safe path alphabet (`encodeSegment` keeps [A-Za-z0-9._-] literal and
 * escapes everything else as `~XXXX`). The path-shape fence below is what
 * actually guards the filesystem; this pattern only rejects garbage early.
 */
const SESSION_ID_PATTERN = /^session-[A-Za-z0-9._~-]+$/;

/** A delete failure the route answers with a specific status and code. */
class DeleteRefusal extends Error {
  /**
   * @param {number} status - HTTP status for the refusal.
   * @param {string} code - stable machine-readable code for the Client half.
   * @param {string} message - human-readable (Chinese) explanation.
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Collect a request body with a hard size cap. */
async function readBody(req, limit = BODY_LIMIT) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Answer one request with JSON. */
function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export const name = 'session-delete';
export const inject = [
  'workspaceRegistry',
  'sessionPersistence',
  'sessions',
  'webServer',
  'connection',
];

export function apply(ctx) {
  /**
   * The full delete pipeline for one session; throws {@link DeleteRefusal}
   * for every refused case so the route can map it onto a status.
   */
  const performDelete = async (sessionId) => {
    // Fence 1: live in-memory session (open in a view or retained by work).
    // Its teardown drain could otherwise re-materialize the deleted log.
    if (ctx.sessions.get(sessionId) !== undefined) {
      throw new DeleteRefusal(409, 'session-live',
        '该会话正在应用中打开（或被运行中的任务持有）。请先切换到其他会话，稍后再删除。');
    }

    // Fence 2 + hide: archiveSession asks the workspace/session-activity
    // waterfall once and refuses with WorkspaceActiveSessionError while any
    // work is running; on success the durable archive set hides the row and
    // gates future steps, and the pin (if any) is dropped in the same write.
    try {
      await ctx.workspaceRegistry.archiveSession(sessionId);
    } catch (error) {
      if (error && error.name === 'WorkspaceActiveSessionError') {
        throw new DeleteRefusal(409, 'session-active',
          '该会话仍有运行中的任务。请等本轮结束后再删除。');
      }
      if (error && error.name === 'WorkspaceUnknownSessionError') {
        throw new DeleteRefusal(404, 'unknown-session', '会话不存在（可能已被删除）。');
      }
      throw error;
    }

    // Remove the durable log directory via the backend's own location view.
    // The jsonl backend exposes `root` and `locate(header)`; a backend that
    // exposes neither is refused rather than guessed at.
    const backend = ctx.sessionPersistence;
    const snapshot = await backend.stat(sessionId);
    let removed = false;
    if (snapshot !== undefined) {
      const location = typeof backend.locate === 'function' ? backend.locate(snapshot.header) : undefined;
      if (location === null || typeof location !== 'object' || typeof location.path !== 'string') {
        throw new DeleteRefusal(500, 'backend-opaque',
          '会话存储后端未暴露日志位置，为安全起见拒绝删除。');
      }
      const root = resolve(backend.root);
      const dir = dirname(resolve(location.path));
      const rel = relative(root, dir);
      if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
        throw new DeleteRefusal(500, 'outside-root', '会话目录不在存储根目录之下，拒绝删除。');
      }
      const segments = rel.split(sep);
      if (segments.length !== 2 || !SESSION_ID_PATTERN.test(segments[1])) {
        throw new DeleteRefusal(500, 'unexpected-layout',
          '会话目录形态不符合预期（' + rel + '），拒绝删除。');
      }
      // force:true makes an already-absent directory idempotent (a pending,
      // never-materialized session has no directory yet); Windows locks get
      // a bounded retry window. Real errors (EPERM/EBUSY) still reject.
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      removed = true;
    }

    // Drop the accounting slot so the workspace record stops listing the id
    // (startup would otherwise filter it with a warning). One owner max by
    // the registry's invariant; the filtered `sessionIds` getter still
    // resolves it because the in-memory header index is not refreshed yet.
    let detached = false;
    for (const workspace of ctx.workspaceRegistry.list()) {
      if (workspace.sessionIds.includes(sessionId)) {
        await workspace.detachSession(sessionId);
        detached = true;
        break;
      }
    }

    // Forwarded host event: the client sessions store drops its cached
    // summary for the id immediately (same relay session/disposed uses).
    ctx.emit('api-session/removed', sessionId);

    return { removed, detached };
  };

  /** Answer an untrusted or unauthenticated request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = ctx.connection.requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  // The Client half's action: POST { sessionId }.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return;
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method ' + req.method + ' not allowed' });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { ok: false, error: 'invalid JSON body' });
        return;
      }
      if (parsed === null || typeof parsed !== 'object'
        || typeof parsed.sessionId !== 'string' || !SESSION_ID_PATTERN.test(parsed.sessionId)) {
        sendJson(res, 400, { ok: false, error: 'sessionId (string, "session-…") is required' });
        return;
      }
      try {
        const result = await performDelete(parsed.sessionId);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        if (error instanceof DeleteRefusal) {
          sendJson(res, error.status, { ok: false, code: error.code, error: error.message });
          return;
        }
        ctx.logger.warn('session-delete: deleting "' + parsed.sessionId + '" failed: '
          + String(error && error.stack ? error.stack : error));
        sendJson(res, 500, { ok: false, error: String(error && error.message ? error.message : error) });
      }
    },
  }), 'session-delete: ' + ROUTE_PATH + ' route');
}
