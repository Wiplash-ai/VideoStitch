import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const cuts = [
  { label: "Cold open", start: "00:00", width: "18%", tone: "coral" },
  { label: "Product proof", start: "00:08", width: "31%", tone: "violet" },
  { label: "Conversation", start: "00:26", width: "38%", tone: "mint" },
];

function App() {
  return <main>
    <nav><a className="brand" href="#top"><span className="mark"><i/><i/><i/></span>VideoStitch</a><div className="nav-links"><a href="#workflow">Workflow</a><a href="https://github.com/Wiplash-ai/VideoStitch">GitHub</a><button>Open editor ↗</button></div></nav>
    <section className="hero" id="top">
      <div className="eyebrow"><span/> Local-first video editing</div>
      <h1>AI edits you<br/><em>can actually see.</em></h1>
      <p className="lede">Cut podcasts, shape ads, and build social clips with an AI collaborator that proposes every edit before it touches your timeline.</p>
      <div className="actions"><button className="primary">Start a local project →</button><a href="#workflow">See how it works ↓</a></div>
      <div className="editor" aria-label="VideoStitch editor concept">
        <header><div className="traffic"><span/><span/><span/></div><strong>launch-cut.vstitch</strong><div className="status"><span/> Media stays local</div></header>
        <div className="workspace">
          <aside><small>PROJECT</small><button className="active">◫ Timeline</button><button>▧ Media</button><button>T Captions</button><small>AI ASSISTANT</small><button>✦ Edit plans <b>3</b></button><button>⌁ Privacy scan</button></aside>
          <section className="stage"><div className="preview"><div className="frame-copy"><small>WIPLASH LABS</small><strong>Build the cut.<br/>Keep control.</strong><span>01:24 / 04:18</span></div><button aria-label="Play preview">▶</button></div>
            <div className="timeline"><div className="ruler"><span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span></div><div className="playhead"/><label>V1</label><div className="track">{cuts.map(cut => <div className={`clip ${cut.tone}`} style={{width:cut.width}} key={cut.label}><b>{cut.label}</b><small>{cut.start}</small></div>)}</div><label>A1</label><div className="wave">▂▅▃▆▂▇▅▃▆▇▃▅▂▆▃▇▅▃▆▂▅▇▃▅▆▂▇▃▅▆</div></div>
          </section>
          <aside className="proposal"><div className="proposal-title"><span>✦</span><div><strong>AI edit proposal</strong><small>3 changes · not applied</small></div></div><article><span className="remove">−</span><div><strong>Remove setup chatter</strong><small>00:00–00:08 · Low confidence</small></div></article><article><span className="keep">+</span><div><strong>Tighten product proof</strong><small>Remove 2.4s dead air</small></div></article><article><span className="keep">+</span><div><strong>Add vertical variant</strong><small>9:16 · speaker-aware crop</small></div></article><p>Nothing changes until you approve it.</p><button>Review on timeline</button></aside>
        </div>
      </div>
    </section>
    <section className="principles" id="workflow"><article><span>01</span><h2>Your footage stays yours.</h2><p>Import, preview, and render compatible projects in your browser. Upload only when you explicitly choose a backend feature.</p></article><article><span>02</span><h2>AI proposes. You decide.</h2><p>Every cut comes with timestamps, rationale, and a visible diff. Accept one change, all of them, or none.</p></article><article><span>03</span><h2>One project, any workflow.</h2><p>Edit manually or connect a capable agent through public, versioned contracts. Your project remains usable without AI.</p></article></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
