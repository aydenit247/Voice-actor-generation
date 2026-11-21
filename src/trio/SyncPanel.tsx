// "Set up sharing" window: step-by-step token setup in plain words.
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { DEFAULT_REPO, friendlyError, saveSyncConfig, testConfig, type SyncConfig } from "./sync";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=public_repo&description=Trio%20voice%20studio%20sync";

export default function SyncPanel(props: { current: SyncConfig | null; onClose: () => void; onSaved: (c: SyncConfig | null) => void }) {
  const [name, setName] = useState(props.current?.name || "");
  const [token, setToken] = useState(props.current?.token || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setErr("Type your name first (so the other person can see who did what)."); return; }
    if (!token.trim()) { setErr("Paste your token first (step 2)."); return; }
    const cfg: SyncConfig = { ...DEFAULT_REPO, name: name.trim(), token: token.trim() };
    setBusy(true); setErr(null);
    try {
      await testConfig(cfg);
      saveSyncConfig(cfg);
      props.onSaved(cfg);
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={props.onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-stone-700 bg-stone-900 p-6 text-sm text-stone-200"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start">
          <h2 className="flex-1 text-xl font-semibold text-[#F5F2EB]">Share your work with Asar (or Ebain)</h2>
          <button onClick={props.onClose} className="text-stone-400 hover:text-white"><X size={18} /></button>
        </div>
        <p className="mb-4 text-stone-300">
          Pressing <b>Sync</b> puts your voice settings and your picked (★) takes into a shared folder on GitHub, and grabs
          whatever the other person put there. To let the app save there for you, GitHub needs a <b>token</b>: a special
          password just for this app. You only do this once.
        </p>

        <ol className="mb-4 list-decimal space-y-3 pl-5">
          <li>
            <b>Type your name.</b>
            <input className="mt-1 block w-full rounded bg-stone-950 px-2 py-1.5" placeholder="Ebain or Asar" value={name} onChange={(e) => setName(e.target.value)} />
          </li>
          <li>
            <b>Make your token.</b>{" "}
            <a className="text-sky-400 underline" href={TOKEN_URL} target="_blank" rel="noreferrer">Click here</a> (opens GitHub, sign in if it asks).
            The box <b>public_repo</b> is already ticked. Set <b>Expiration</b> to 90 days, scroll down, click the green
            <b> Generate token</b> button, then copy the long code that starts with <code>ghp_</code>.
          </li>
          <li>
            <b>Paste it here.</b>
            <input className="mt-1 block w-full rounded bg-stone-950 px-2 py-1.5 font-mono" type="password" placeholder="ghp_…"
              value={token} onChange={(e) => setToken(e.target.value)} />
          </li>
        </ol>

        <div className="mb-4 rounded bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
          Treat the token like a password: never send it to anyone or post it. It stays saved in this browser only.
          <b> Asar:</b> Ebain has to add you to the voice repo first (GitHub → the repo → Settings → Collaborators → Add people),
          and you accept the invite email.
        </div>

        {err && <p className="mb-3 rounded bg-red-950/70 px-3 py-2 text-red-200">{err}</p>}
        <div className="flex items-center gap-3">
          <button disabled={busy} onClick={save} className="flex items-center gap-2 rounded bg-sky-700 px-4 py-2 font-semibold text-white hover:bg-sky-600 disabled:opacity-60">
            {busy && <Loader2 size={14} className="animate-spin" />} Save and sync
          </button>
          {props.current && (
            <button className="text-xs text-stone-400 underline hover:text-white" onClick={() => { saveSyncConfig(null); props.onSaved(null); }}>
              Turn sharing off on this computer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
