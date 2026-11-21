import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ScriptStudio from "./trio/ScriptStudio.tsx";
import "./index.css";

// Two tools: the Trio Adventures script studio (default) and the original free-form Emberstage studio.
function Root() {
  const [tab, setTab] = useState<"trio" | "free">(() => (location.hash === "#free" ? "free" : "trio"));
  const go = (t: "trio" | "free") => { setTab(t); history.replaceState(null, "", t === "free" ? "#free" : "#"); };
  return (
    <>
      <nav className="flex gap-1 border-b border-stone-800 bg-black/40 px-4 pt-2 text-sm">
        {([["trio", "Trio Adventures script"], ["free", "Free studio"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => go(k)}
            className={`rounded-t px-4 py-2 font-semibold ${tab === k ? "bg-[#0B0A09] text-[#ffb27a]" : "text-stone-400 hover:text-stone-200"}`}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "trio" ? <ScriptStudio /> : <App />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
