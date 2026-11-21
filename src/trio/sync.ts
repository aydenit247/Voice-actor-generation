// Shared progress: saves directions + picked takes to the voice repo on GitHub (branch "studio-data") and loads
// what the other person saved. Talks to GitHub straight from the browser with the person's own access token.
//
// What's stored on the branch:
//   studio/directions.json   cast, voice variants, style, and every line's direction (newest edit of each line wins)
//   studio/takes.json        list of shared takes
//   studio/takes/<line>/<take>.wav
// Only each line's picked (★) take is shared; extra takes stay in the browser that made them.
import type { Settings, Take, LineDirection } from "./store";

export interface SyncConfig { token: string; name: string; owner: string; repo: string }
export const SYNC_KEY = "trio-voice-sync";
export const BRANCH = "studio-data";
export const DEFAULT_REPO = { owner: "aydenit247", repo: "Voice-actor-generation" };
const API = "https://api.github.com";

export function loadSyncConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
    return c && c.token ? { ...DEFAULT_REPO, ...c } : null;
  } catch { return null; }
}
export function saveSyncConfig(c: SyncConfig | null) {
  try { c ? localStorage.setItem(SYNC_KEY, JSON.stringify(c)) : localStorage.removeItem(SYNC_KEY); } catch { /* blocked */ }
}

class GhError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function gh<T = any>(c: SyncConfig, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(`${API}/repos/${c.owner}/${c.repo}${path}`, {
    method: init?.method || "GET",
    headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new GhError(r.status, j.message || r.statusText);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

export function friendlyError(e: unknown) {
  if (e instanceof GhError) {
    if (e.status === 401) return "GitHub didn't accept your token. It may be mistyped or expired. Make a new one in Sync settings.";
    if (e.status === 403 || e.status === 404)
      return "Your token can't save to the voice repo. Check it has the \"public_repo\" box ticked, and (for Asar) that Ebain added you as a collaborator.";
    return `GitHub said: ${e.message}`;
  }
  return e instanceof Error ? e.message : "Sync failed.";
}

// Check a token works before saving it
export async function testConfig(c: SyncConfig) {
  const repo = await gh<{ permissions?: { push?: boolean } }>(c, "");
  if (!repo.permissions?.push) throw new Error("That token works, but it can't save to the voice repo. If you're Asar, Ebain needs to add you as a collaborator first.");
}

const b64ToUtf8 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

type Meta = Pick<Settings, "cast" | "variants" | "houseStyle" | "metaUpdatedAt">;
interface SharedDirections extends Meta { lines: Record<string, LineDirection>; savedAt: number; savedBy: string }
type SharedTake = Omit<Take, "audioBase64"> & { path: string };

async function ensureBranch(c: SyncConfig): Promise<string> {
  try {
    return (await gh(c, `/git/ref/heads/${BRANCH}`)).object.sha;
  } catch (e) {
    if (!(e instanceof GhError) || e.status !== 404) throw e;
    const repo = await gh(c, "");
    const base = (await gh(c, `/git/ref/heads/${repo.default_branch}`)).object.sha;
    await gh(c, "/git/refs", { method: "POST", body: { ref: `refs/heads/${BRANCH}`, sha: base } });
    return base;
  }
}

function mergeLines(local: Record<string, LineDirection>, remote: Record<string, LineDirection>) {
  const out: Record<string, LineDirection> = { ...remote };
  for (const [id, d] of Object.entries(local)) {
    const r = remote[id];
    if (!r || (d.updatedAt || 0) > (r.updatedAt || 0)) out[id] = d;
  }
  return out;
}

// Combine what a finished sync returned with edits made while it was running (newest edit of each line wins)
export function mergeSettings(cur: Settings, incoming: Settings): Settings {
  const lines = mergeLines(cur.lines, incoming.lines);
  const curMetaNewer = (cur.metaUpdatedAt || 0) > (incoming.metaUpdatedAt || 0);
  return curMetaNewer ? { ...incoming, lines, cast: cur.cast, variants: cur.variants, houseStyle: cur.houseStyle, metaUpdatedAt: cur.metaUpdatedAt }
    : { ...incoming, lines };
}

export interface SyncResult { settings: Settings; downloaded: Take[]; uploaded: number; changedLines: number; saved: boolean }

export async function syncNow(c: SyncConfig, settings: Settings, takes: Take[], progress: (m: string) => void, attempt = 0): Promise<SyncResult> {
  progress("Connecting to GitHub…");
  const head = await ensureBranch(c);
  const commit = await gh(c, `/git/commits/${head}`);
  const tree = await gh(c, `/git/trees/${commit.tree.sha}?recursive=1`);
  const files: Record<string, string> = {};
  for (const t of tree.tree as { path: string; sha: string; type: string }[]) if (t.type === "blob") files[t.path] = t.sha;
  const blob = async (sha: string) => (await gh(c, `/git/blobs/${sha}`)).content as string;

  const remote: SharedDirections | null = files["studio/directions.json"] ? JSON.parse(b64ToUtf8(await blob(files["studio/directions.json"]))) : null;
  const remoteTakes: SharedTake[] = files["studio/takes.json"] ? JSON.parse(b64ToUtf8(await blob(files["studio/takes.json"]))) : [];

  // Merge: each line keeps its newest edit; the cast/style keeps whichever side changed it last
  const lines = mergeLines(settings.lines, remote?.lines || {});
  const remoteMetaNewer = remote && (remote.metaUpdatedAt || 0) > (settings.metaUpdatedAt || 0);
  const merged: Settings = remoteMetaNewer
    ? { ...settings, lines, cast: remote!.cast || {}, variants: remote!.variants || {}, houseStyle: remote!.houseStyle, metaUpdatedAt: remote!.metaUpdatedAt }
    : { ...settings, lines };
  const changedLines = Object.keys(lines).filter((id) => JSON.stringify(lines[id]) !== JSON.stringify(settings.lines[id])).length;

  // Download takes the other person shared that this browser doesn't have
  const have = new Set(takes.map((t) => t.id));
  const toGet = remoteTakes.filter((t) => !have.has(t.id) && files[t.path]);
  const downloaded: Take[] = [];
  for (let i = 0; i < toGet.length; i++) {
    progress(`Downloading takes ${i + 1}/${toGet.length}…`);
    const { path, ...meta } = toGet[i];
    downloaded.push({ ...meta, audioBase64: (await blob(files[path])).replace(/\n/g, "") });
  }

  // Upload this browser's picked takes that aren't shared yet
  const shared = new Set(remoteTakes.map((t) => t.id));
  const picked = new Set(Object.values(lines).map((d) => d.chosenTake).filter(Boolean) as string[]);
  const toPut = takes.filter((t) => picked.has(t.id) && !shared.has(t.id));
  const entries: { path: string; mode: string; type: string; sha?: string; content?: string }[] = [];
  const newIndex = [...remoteTakes];
  for (let i = 0; i < toPut.length; i++) {
    progress(`Uploading takes ${i + 1}/${toPut.length}…`);
    const t = toPut[i];
    const path = `studio/takes/${t.lineId}/${t.id}.wav`;
    const b = await gh(c, "/git/blobs", { method: "POST", body: { content: t.audioBase64, encoding: "base64" } });
    entries.push({ path, mode: "100644", type: "blob", sha: b.sha });
    const { audioBase64: _a, ...meta } = t;
    newIndex.push({ ...meta, by: t.by || c.name, path });
  }

  const shared_dirs: SharedDirections = {
    cast: merged.cast, variants: merged.variants, houseStyle: merged.houseStyle, metaUpdatedAt: merged.metaUpdatedAt,
    lines, savedAt: Date.now(), savedBy: c.name,
  };
  const dirsChanged = !remote || JSON.stringify({ ...remote, savedAt: 0, savedBy: "" }) !== JSON.stringify({ ...shared_dirs, savedAt: 0, savedBy: "" });
  if (dirsChanged || toPut.length) {
    progress("Saving to GitHub…");
    entries.push({ path: "studio/directions.json", mode: "100644", type: "blob", content: JSON.stringify(shared_dirs, null, 1) });
    if (toPut.length) entries.push({ path: "studio/takes.json", mode: "100644", type: "blob", content: JSON.stringify(newIndex, null, 1) });
    const newTree = await gh(c, "/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: entries } });
    const newCommit = await gh(c, "/git/commits", {
      method: "POST",
      body: { message: `Voice studio sync from ${c.name}: ${toPut.length} take(s), ${changedLines} line edit(s)`, tree: newTree.sha, parents: [head] },
    });
    try {
      await gh(c, `/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: newCommit.sha, force: false } });
    } catch (e) {
      // The other person synced at the same moment: start over on top of their save
      if (e instanceof GhError && e.status === 422 && attempt < 2) {
        const again = await syncNow(c, merged, [...takes, ...downloaded], progress, attempt + 1);
        return { ...again, downloaded: [...downloaded, ...again.downloaded] };
      }
      throw e;
    }
  }
  return { settings: merged, downloaded, uploaded: toPut.length, changedLines, saved: dirsChanged || toPut.length > 0 };
}

