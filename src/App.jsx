import { useState, useEffect } from "react";
import { db, ref, set, get, onValue } from "./firebase";

// ─── Team & bracket data ────────────────────────────────────────────────
const TEAMS = {
  OKC: { name: "Thunder", city: "OKC", seed: 1, conf: "WEST", color: "#007AC1", bg: "#002D62" },
  SAS: { name: "Spurs", city: "SAN", seed: 2, conf: "WEST", color: "#C4CED4", bg: "#000000" },
  DEN: { name: "Nuggets", city: "DEN", seed: 3, conf: "WEST", color: "#FEC524", bg: "#0E2240" },
  LAL: { name: "Lakers", city: "LAL", seed: 4, conf: "WEST", color: "#FDB927", bg: "#552583" },
  HOU: { name: "Rockets", city: "HOU", seed: 5, conf: "WEST", color: "#CE1141", bg: "#000000" },
  MIN: { name: "Wolves", city: "MIN", seed: 6, conf: "WEST", color: "#78BE20", bg: "#0C2340" },
  PHX: { name: "Suns", city: "PHX", seed: 7, conf: "WEST", color: "#E56020", bg: "#1D1160" },
  POR: { name: "Blazers", city: "POR", seed: 8, conf: "WEST", color: "#E03A3E", bg: "#000000" },
  DET: { name: "Pistons", city: "DET", seed: 1, conf: "EAST", color: "#1D42BA", bg: "#C8102E" },
  NYK: { name: "Knicks", city: "NYK", seed: 2, conf: "EAST", color: "#F58426", bg: "#006BB6" },
  CLE: { name: "Cavs", city: "CLE", seed: 3, conf: "EAST", color: "#FDBB30", bg: "#860038" },
  BOS: { name: "Celtics", city: "BOS", seed: 4, conf: "EAST", color: "#BA9653", bg: "#007A33" },
  ATL: { name: "Hawks", city: "ATL", seed: 5, conf: "EAST", color: "#E03A3E", bg: "#C1D32F" },
  TOR: { name: "Raptors", city: "TOR", seed: 6, conf: "EAST", color: "#CE1141", bg: "#000000" },
  PHI: { name: "76ers", city: "PHI", seed: 7, conf: "EAST", color: "#ED174C", bg: "#006BB6" },
  ORL: { name: "Magic", city: "ORL", seed: 8, conf: "EAST", color: "#0077C0", bg: "#000000" },
};

const FIRST_ROUND = {
  west: [
    { id: "W1", teams: ["OKC", "POR"] },
    { id: "W2", teams: ["LAL", "HOU"] },
    { id: "W3", teams: ["DEN", "MIN"] },
    { id: "W4", teams: ["SAS", "PHX"] },
  ],
  east: [
    { id: "E1", teams: ["DET", "ORL"] },
    { id: "E2", teams: ["BOS", "ATL"] },
    { id: "E3", teams: ["CLE", "TOR"] },
    { id: "E4", teams: ["NYK", "PHI"] },
  ],
};

const BRACKET_TREE = {
  W5: { parents: ["W1", "W2"], round: 2 },
  W6: { parents: ["W3", "W4"], round: 2 },
  W7: { parents: ["W5", "W6"], round: 3 },
  E5: { parents: ["E1", "E2"], round: 2 },
  E6: { parents: ["E3", "E4"], round: 2 },
  E7: { parents: ["E5", "E6"], round: 3 },
  F:  { parents: ["W7", "E7"], round: 4 },
};

const ROUND_POINTS = { 1: 10, 2: 20, 3: 40, 4: 80 };
const ROUND_NAMES = { 1: "First Round", 2: "Conf. Semis", 3: "Conf. Finals", 4: "NBA Finals" };
const LOCK_DATE = new Date("2026-04-18T16:00:00Z");
const MAX_PLAYERS = 6;

// ─── Bracket logic ──────────────────────────────────────────────────────
function getMatchupTeams(matchupId, picks) {
  if (["W1","W2","W3","W4","E1","E2","E3","E4"].includes(matchupId)) {
    const conf = matchupId[0] === "W" ? "west" : "east";
    const m = FIRST_ROUND[conf].find((x) => x.id === matchupId);
    return m ? m.teams : [null, null];
  }
  const node = BRACKET_TREE[matchupId];
  if (!node) return [null, null];
  return node.parents.map((p) => picks[p] || null);
}

function getMatchupRound(mid) {
  if (["W1","W2","W3","W4","E1","E2","E3","E4"].includes(mid)) return 1;
  return BRACKET_TREE[mid]?.round || 4;
}

function getDescendants(mid) {
  const desc = [];
  for (const [key, val] of Object.entries(BRACKET_TREE)) {
    if (val.parents.includes(mid)) { desc.push(key); desc.push(...getDescendants(key)); }
  }
  return desc;
}

function calcScore(picks, results) {
  let total = 0;
  const all = [...FIRST_ROUND.west, ...FIRST_ROUND.east].map(m => m.id).concat(Object.keys(BRACKET_TREE));
  for (const mid of all) {
    if (picks[mid] && results[mid] && picks[mid] === results[mid]) total += ROUND_POINTS[getMatchupRound(mid)];
  }
  return total;
}

function getRoundBreakdown(picks, results) {
  const bd = { 1: { c: 0, t: 0 }, 2: { c: 0, t: 0 }, 3: { c: 0, t: 0 }, 4: { c: 0, t: 0 } };
  const all = [...FIRST_ROUND.west, ...FIRST_ROUND.east].map(m => m.id).concat(Object.keys(BRACKET_TREE));
  for (const mid of all) {
    const r = getMatchupRound(mid);
    if (results[mid]) { bd[r].t++; if (picks[mid] === results[mid]) bd[r].c++; }
  }
  return bd;
}

// ─── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [currentPlayer, setCurrentPlayer] = useState(() => localStorage.getItem("nba26_me") || null);
  const [players, setPlayers] = useState([]);
  const [allBrackets, setAllBrackets] = useState({});
  const [results, setResults] = useState({});
  const [tab, setTab] = useState("bracket");
  const [viewingPlayer, setViewingPlayer] = useState(null);
  const [adminMode, setAdminMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [now] = useState(new Date());
  const isLocked = now >= LOCK_DATE;

  // Subscribe to all Firebase data in real time
  useEffect(() => {
    const unsubs = [];

    // Players list
    unsubs.push(onValue(ref(db, "players"), (snap) => {
      const val = snap.val();
      const list = val ? Object.keys(val) : [];
      setPlayers(list);
      // If we had a saved player who is in the list, restore viewingPlayer
      const me = localStorage.getItem("nba26_me");
      if (me && list.includes(me)) setViewingPlayer((prev) => prev || me);
      setLoading(false);
    }));

    // Results
    unsubs.push(onValue(ref(db, "results"), (snap) => {
      setResults(snap.val() || {});
    }));

    // All brackets
    unsubs.push(onValue(ref(db, "brackets"), (snap) => {
      setAllBrackets(snap.val() || {});
    }));

    return () => unsubs.forEach((fn) => fn());
  }, []);

  async function joinGame(name) {
    const trimmed = name.trim();
    if (!trimmed || players.includes(trimmed) || players.length >= MAX_PLAYERS) return;
    await set(ref(db, `players/${trimmed}`), true);
    localStorage.setItem("nba26_me", trimmed);
    setCurrentPlayer(trimmed);
    setViewingPlayer(trimmed);
  }

  function selectPlayer(name) {
    localStorage.setItem("nba26_me", name);
    setCurrentPlayer(name);
    setViewingPlayer(name);
  }

  async function makePick(matchupId, team) {
    if (isLocked || viewingPlayer !== currentPlayer) return;
    const bracket = { ...(allBrackets[currentPlayer] || {}) };
    bracket[matchupId] = team;
    for (const d of getDescendants(matchupId)) {
      const dTeams = getMatchupTeams(d, bracket);
      if (bracket[d] && !dTeams.includes(bracket[d])) delete bracket[d];
    }
    await set(ref(db, `brackets/${currentPlayer}`), bracket);
  }

  async function setResult(matchupId, team) {
    const r = { ...results, [matchupId]: team };
    for (const d of getDescendants(matchupId)) {
      const dTeams = getMatchupTeams(d, r);
      if (r[d] && !dTeams.includes(r[d])) delete r[d];
    }
    await set(ref(db, "results"), r);
  }

  if (loading) {
    return (
      <div style={st.loadWrap}>
        <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
        <div style={st.spinner} />
        <p style={{ color: "#666", marginTop: 16, fontFamily: "'Oswald', sans-serif" }}>Connecting...</p>
      </div>
    );
  }

  if (!currentPlayer || !players.includes(currentPlayer)) {
    return (
      <LoginScreen players={players} onJoin={joinGame} onSelect={selectPlayer}
        newName={newName} setNewName={setNewName} isLocked={isLocked} />
    );
  }

  const activePicks = adminMode ? results : (allBrackets[viewingPlayer] || {});
  const isOwnBracket = viewingPlayer === currentPlayer;
  const canEdit = isOwnBracket && !isLocked;

  return (
    <div style={st.app}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
      <Header player={currentPlayer} onLogout={() => { localStorage.removeItem("nba26_me"); setCurrentPlayer(null); setViewingPlayer(null); }} locked={isLocked} />
      <TabBar tab={tab} setTab={setTab} />
      {tab === "bracket" ? (
        <BracketTab
          players={players} viewingPlayer={viewingPlayer} setViewingPlayer={setViewingPlayer}
          picks={activePicks} results={results} canEdit={canEdit} isOwn={isOwnBracket}
          onPick={makePick} onResult={setResult} adminMode={adminMode}
          setAdminMode={setAdminMode} locked={isLocked}
        />
      ) : (
        <ScoreboardTab players={players} brackets={allBrackets} results={results} me={currentPlayer} />
      )}
    </div>
  );
}

// ─── Login ──────────────────────────────────────────────────────────────
function LoginScreen({ players, onJoin, onSelect, newName, setNewName, isLocked }) {
  return (
    <div style={st.loginWrap}>
      <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet" />
      <div style={st.loginCard}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="#E56020" strokeWidth="3" fill="none" />
            <path d="M12 24 C12 24 18 14 24 14 C30 14 36 24 36 24 C36 24 30 34 24 34 C18 34 12 24 12 24Z" stroke="#E56020" strokeWidth="2" fill="none" />
            <line x1="2" y1="24" x2="46" y2="24" stroke="#E56020" strokeWidth="1.5" />
          </svg>
        </div>
        <h1 style={st.loginTitle}>NBA PLAYOFF</h1>
        <h2 style={st.loginSub}>BRACKET CHALLENGE</h2>
        <p style={st.loginSeason}>2025–26 SEASON</p>

        {players.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={st.label}>SELECT YOUR NAME</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {players.map((p) => (
                <button key={p} onClick={() => onSelect(p)} style={st.playerBtn}>
                  <span style={st.avatar}>{p[0].toUpperCase()}</span>
                  <span style={{ fontWeight: 500 }}>{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isLocked && players.length < MAX_PLAYERS && (
          <div>
            <p style={st.label}>NEW PLAYER ({MAX_PLAYERS - players.length} spots left)</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={st.input} placeholder="Enter your name" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onJoin(newName); setNewName(""); } }}
                maxLength={16} />
              <button style={st.joinBtn} onClick={() => { onJoin(newName); setNewName(""); }}
                disabled={!newName.trim() || players.includes(newName.trim())}>JOIN</button>
            </div>
          </div>
        )}

        {isLocked && players.length < MAX_PLAYERS && (
          <p style={{ color: "#E56020", fontSize: 13, textAlign: "center", marginTop: 12, fontFamily: "'Source Sans 3'" }}>
            Brackets are locked — no new players can join.
          </p>
        )}

        <div style={st.lockNotice}>
          {isLocked ? <span style={{ color: "#E56020" }}>BRACKETS LOCKED</span> : <span>Brackets lock Apr 18 at noon ET</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Header / Tabs ──────────────────────────────────────────────────────
function Header({ player, onLogout, locked }) {
  return (
    <div style={st.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={st.logo}>NBA</span>
        <span style={st.headerSub}>BRACKET CHALLENGE</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {locked && <span style={st.lockedBadge}>LOCKED</span>}
        <span style={st.headerPlayer}>{player}</span>
        <button onClick={onLogout} style={st.logoutBtn}>Exit</button>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div style={st.tabBar}>
      {["bracket", "scoreboard"].map((t) => (
        <button key={t} onClick={() => setTab(t)}
          style={{ ...st.tabBtn, ...(tab === t ? { color: "#E56020", borderBottomColor: "#E56020" } : {}) }}>
          {t.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ─── Bracket Tab ────────────────────────────────────────────────────────
function BracketTab({ players, viewingPlayer, setViewingPlayer, picks, results, canEdit, isOwn, onPick, onResult, adminMode, setAdminMode, locked }) {
  const handler = adminMode ? onResult : canEdit ? onPick : null;

  return (
    <div style={st.bracketWrap}>
      <div style={st.controls}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={st.ctrlLabel}>VIEWING:</label>
          <select value={adminMode ? "__results__" : viewingPlayer || ""}
            onChange={(e) => {
              if (e.target.value === "__results__") { setAdminMode(true); }
              else { setAdminMode(false); setViewingPlayer(e.target.value); }
            }} style={st.dropdown}>
            {players.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__results__">Actual Results (Admin)</option>
          </select>
        </div>
        {!adminMode && !isOwn && <div style={st.roBadge}>READ ONLY</div>}
        {!adminMode && canEdit && <div style={st.editBadge}>EDITING</div>}
        {adminMode && <div style={st.adminBadge}>ADMIN MODE</div>}
      </div>

      <ConfBracket conf="WEST" label="WESTERN CONFERENCE" picks={picks} onPick={handler} results={results} showRes={!adminMode} />
      <ConfBracket conf="EAST" label="EASTERN CONFERENCE" picks={picks} onPick={handler} results={results} showRes={!adminMode} />
      <Finals picks={picks} onPick={handler} results={results} showRes={!adminMode} />
    </div>
  );
}

function ConfBracket({ conf, label, picks, onPick, results, showRes }) {
  const key = conf === "WEST" ? "west" : "east";
  const pfx = conf === "WEST" ? "W" : "E";
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ ...st.confTitle, borderColor: conf === "WEST" ? "#007AC1" : "#C8102E" }}>{label}</h3>
      <RoundHdr round={1} />
      <div style={st.mRow}>{FIRST_ROUND[key].map((m) => <Matchup key={m.id} id={m.id} teams={m.teams} picks={picks} onPick={onPick} results={results} showRes={showRes} />)}</div>
      <RoundHdr round={2} />
      <div style={st.mRow}>{[`${pfx}5`, `${pfx}6`].map((id) => <Matchup key={id} id={id} teams={getMatchupTeams(id, picks)} picks={picks} onPick={onPick} results={results} showRes={showRes} />)}</div>
      <RoundHdr round={3} />
      <div style={st.mRow}><Matchup id={`${pfx}7`} teams={getMatchupTeams(`${pfx}7`, picks)} picks={picks} onPick={onPick} results={results} showRes={showRes} /></div>
    </div>
  );
}

function Finals({ picks, onPick, results, showRes }) {
  const champ = picks["F"];
  return (
    <div style={{ borderTop: "1px solid #1e1e30", paddingTop: 20, marginTop: 8 }}>
      <RoundHdr round={4} />
      <div style={st.mRow}><Matchup id="F" teams={getMatchupTeams("F", picks)} picks={picks} onPick={onPick} results={results} showRes={showRes} finals /></div>
      {champ && TEAMS[champ] && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span style={{ fontFamily: "'Oswald'", fontSize: 11, letterSpacing: 4, color: "#FEC524", display: "block", marginBottom: 8 }}>CHAMPION</span>
          <div style={{ display: "inline-block", padding: "12px 28px", borderRadius: 8, border: "2px solid #FEC524", background: TEAMS[champ].bg }}>
            <span style={{ color: TEAMS[champ].color, fontFamily: "'Oswald'", fontWeight: 700, fontSize: 20 }}>{TEAMS[champ].city} {TEAMS[champ].name}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundHdr({ round }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, padding: "0 4px" }}>
      <span style={{ fontFamily: "'Oswald'", fontSize: 12, fontWeight: 500, letterSpacing: 2, color: "#555" }}>{ROUND_NAMES[round]}</span>
      <span style={{ fontSize: 11, color: "#444" }}>{ROUND_POINTS[round]} pts/correct</span>
    </div>
  );
}

function Matchup({ id, teams, picks, onPick, results, showRes, finals }) {
  const [t1, t2] = teams;
  const picked = picks[id];
  const actual = results[id];
  const clickable = !!onPick;

  return (
    <div style={{ ...st.card, ...(finals ? { maxWidth: 300, margin: "0 auto" } : {}), border: finals ? "2px solid #E56020" : "1px solid #2a2a3e" }}>
      {[t1, t2].map((tk, i) => {
        if (!tk) return <div key={i} style={{ padding: "10px 12px", borderBottom: i === 0 ? "1px solid #1e1e30" : "none" }}><span style={{ color: "#444", fontSize: 13, fontStyle: "italic" }}>TBD</span></div>;
        const tm = TEAMS[tk];
        const isPick = picked === tk;
        const correct = showRes && actual && picked === tk && actual === tk;
        const wrong = showRes && actual && picked === tk && actual !== tk;
        const actualW = showRes && actual === tk;
        return (
          <div key={i} onClick={() => clickable && onPick(id, tk)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px",
              cursor: clickable ? "pointer" : "default", background: isPick ? tm.bg : "transparent",
              borderBottom: i === 0 ? "1px solid #1e1e30" : "none", transition: "all 0.15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontFamily: "'Oswald'", fontWeight: 600, minWidth: 14, color: isPick ? tm.color : "#666" }}>{tm.seed}</span>
              <span style={{ fontSize: 13, fontFamily: "'Source Sans 3'", color: isPick ? tm.color : "#ccc", fontWeight: isPick ? 600 : 400 }}>{tm.city} {tm.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {correct && <span style={{ color: "#4ade80", fontSize: 16, fontWeight: 700 }}>✓</span>}
              {wrong && <span style={{ color: "#ef4444", fontSize: 16, fontWeight: 700 }}>✗</span>}
              {actualW && !isPick && <span style={{ color: "#4ade80", fontSize: 8 }}>●</span>}
              {isPick && !correct && !wrong && <span style={{ color: "#E56020", fontSize: 10 }}>▶</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Scoreboard ─────────────────────────────────────────────────────────
function ScoreboardTab({ players, brackets, results, me }) {
  const hasRes = Object.keys(results).length > 0;
  const sorted = [...players].sort((a, b) => calcScore(brackets[b] || {}, results) - calcScore(brackets[a] || {}, results));

  return (
    <div style={st.sbWrap}>
      <h2 style={st.sbTitle}>LEADERBOARD</h2>
      {!hasRes && <div style={st.noRes}>No results entered yet. Scores update live once an admin enters game outcomes.</div>}
      <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
        <div style={st.sbHdr}>
          <span style={{ ...st.sbCell, flex: 0.5 }}>#</span>
          <span style={{ ...st.sbCell, flex: 2 }}>PLAYER</span>
          <span style={{ ...st.sbCell, flex: 1 }}>R1</span>
          <span style={{ ...st.sbCell, flex: 1 }}>R2</span>
          <span style={{ ...st.sbCell, flex: 1 }}>CF</span>
          <span style={{ ...st.sbCell, flex: 1 }}>FIN</span>
          <span style={{ ...st.sbCell, flex: 1.2, color: "#E56020" }}>PTS</span>
        </div>
        {sorted.map((p, i) => {
          const br = brackets[p] || {};
          const score = calcScore(br, results);
          const bd = getRoundBreakdown(br, results);
          const picks = Object.keys(br).length;
          const isMe = p === me;
          return (
            <div key={p} style={{ ...st.sbRow, background: isMe ? "rgba(229,96,32,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
              <span style={{ ...st.sbCell, flex: 0.5, fontWeight: 700, color: i === 0 && hasRes ? "#FEC524" : "#888" }}>{i + 1}</span>
              <span style={{ ...st.sbCell, flex: 2, fontWeight: isMe ? 700 : 400, color: isMe ? "#E56020" : "#ddd" }}>
                {p}{isMe ? " (you)" : ""}<span style={{ fontSize: 11, color: "#666", marginLeft: 6 }}>{picks}/15</span>
              </span>
              <span style={{ ...st.sbCell, flex: 1 }}>{bd[1].t > 0 ? `${bd[1].c}/${bd[1].t}` : "–"}</span>
              <span style={{ ...st.sbCell, flex: 1 }}>{bd[2].t > 0 ? `${bd[2].c}/${bd[2].t}` : "–"}</span>
              <span style={{ ...st.sbCell, flex: 1 }}>{bd[3].t > 0 ? `${bd[3].c}/${bd[3].t}` : "–"}</span>
              <span style={{ ...st.sbCell, flex: 1 }}>{bd[4].t > 0 ? `${bd[4].c}/${bd[4].t}` : "–"}</span>
              <span style={{ ...st.sbCell, flex: 1.2, fontWeight: 700, color: "#E56020", fontSize: 18 }}>{score}</span>
            </div>
          );
        })}
      </div>
      <div style={st.guide}>
        <h4 style={{ fontFamily: "'Oswald'", fontSize: 13, letterSpacing: 3, color: "#666", margin: "0 0 12px" }}>SCORING</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {Object.entries(ROUND_NAMES).map(([r, name]) => (
            <div key={r} style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 100px", padding: "8px 12px", background: "#0d0d1a", borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: "#888" }}>{name}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#E56020", fontFamily: "'Oswald'" }}>{ROUND_POINTS[r]} pts</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "#555", textAlign: "center" }}>Maximum possible: 240 points</p>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const st = {
  loadWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d0d1a" },
  spinner: { width: 40, height: 40, border: "3px solid #222", borderTopColor: "#E56020", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  app: { minHeight: "100vh", background: "#0d0d1a", color: "#eee", fontFamily: "'Source Sans 3', sans-serif" },
  loginWrap: { minHeight: "100vh", background: "#0d0d1a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  loginCard: { background: "#13132a", border: "1px solid #1e1e3a", borderRadius: 16, padding: "40px 32px", maxWidth: 440, width: "100%" },
  loginTitle: { fontFamily: "'Oswald'", fontSize: 36, fontWeight: 700, textAlign: "center", margin: 0, color: "#fff", letterSpacing: 4 },
  loginSub: { fontFamily: "'Oswald'", fontSize: 18, fontWeight: 400, textAlign: "center", margin: "4px 0 0", color: "#E56020", letterSpacing: 6 },
  loginSeason: { textAlign: "center", color: "#555", fontSize: 13, letterSpacing: 3, margin: "8px 0 32px", fontFamily: "'Oswald'" },
  label: { fontSize: 11, letterSpacing: 2, color: "#666", marginBottom: 10, fontFamily: "'Oswald'" },
  playerBtn: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#1a1a32", border: "1px solid #2a2a44", borderRadius: 8, cursor: "pointer", color: "#ddd", fontFamily: "'Source Sans 3'", fontSize: 15, width: "100%" },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "#E56020", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Oswald'", fontWeight: 700, fontSize: 14, color: "#fff" },
  input: { flex: 1, padding: "10px 14px", background: "#1a1a32", border: "1px solid #2a2a44", borderRadius: 8, color: "#fff", fontSize: 15, fontFamily: "'Source Sans 3'", outline: "none" },
  joinBtn: { padding: "10px 20px", background: "#E56020", border: "none", borderRadius: 8, color: "#fff", fontFamily: "'Oswald'", fontWeight: 600, fontSize: 14, letterSpacing: 2, cursor: "pointer" },
  lockNotice: { textAlign: "center", marginTop: 24, fontSize: 12, letterSpacing: 2, color: "#555", fontFamily: "'Oswald'" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: "#0a0a18", borderBottom: "1px solid #1a1a30", flexWrap: "wrap", gap: 8 },
  logo: { fontFamily: "'Oswald'", fontWeight: 700, fontSize: 22, color: "#E56020", letterSpacing: 2 },
  headerSub: { fontFamily: "'Oswald'", fontWeight: 400, fontSize: 13, color: "#888", letterSpacing: 3 },
  lockedBadge: { fontSize: 10, letterSpacing: 2, color: "#E56020", padding: "2px 8px", border: "1px solid #E56020", borderRadius: 4, fontFamily: "'Oswald'" },
  headerPlayer: { fontFamily: "'Oswald'", fontWeight: 500, fontSize: 14, color: "#ccc" },
  logoutBtn: { padding: "4px 12px", background: "none", border: "1px solid #333", borderRadius: 4, color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'Oswald'" },
  tabBar: { display: "flex", borderBottom: "1px solid #1a1a30", background: "#0d0d1a" },
  tabBtn: { flex: 1, padding: "14px 0", background: "none", border: "none", borderBottom: "2px solid transparent", color: "#666", fontSize: 13, fontFamily: "'Oswald'", fontWeight: 500, letterSpacing: 3, cursor: "pointer" },
  bracketWrap: { padding: "12px 16px 40px", maxWidth: 800, margin: "0 auto" },
  controls: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" },
  ctrlLabel: { fontSize: 11, letterSpacing: 2, color: "#666", fontFamily: "'Oswald'" },
  dropdown: { padding: "8px 12px", background: "#13132a", border: "1px solid #2a2a44", borderRadius: 6, color: "#ddd", fontSize: 14, fontFamily: "'Source Sans 3'", outline: "none", cursor: "pointer", minWidth: 160 },
  roBadge: { fontSize: 10, letterSpacing: 2, color: "#666", padding: "3px 10px", border: "1px solid #333", borderRadius: 4, fontFamily: "'Oswald'" },
  editBadge: { fontSize: 10, letterSpacing: 2, color: "#4ade80", padding: "3px 10px", border: "1px solid #4ade80", borderRadius: 4, fontFamily: "'Oswald'" },
  adminBadge: { fontSize: 10, letterSpacing: 2, color: "#fbbf24", padding: "3px 10px", border: "1px solid #fbbf24", borderRadius: 4, fontFamily: "'Oswald'" },
  confTitle: { fontFamily: "'Oswald'", fontSize: 15, fontWeight: 600, letterSpacing: 4, color: "#888", borderLeft: "3px solid", paddingLeft: 12, margin: "0 0 16px" },
  mRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  card: { flex: "1 1 170px", minWidth: 160, background: "#13132a", borderRadius: 8, overflow: "hidden" },
  sbWrap: { padding: "20px 16px 40px", maxWidth: 700, margin: "0 auto" },
  sbTitle: { fontFamily: "'Oswald'", fontSize: 22, fontWeight: 700, letterSpacing: 4, color: "#fff", textAlign: "center", marginBottom: 24 },
  noRes: { textAlign: "center", padding: "20px 16px", color: "#666", fontSize: 14, background: "#13132a", borderRadius: 8, marginBottom: 20 },
  sbHdr: { display: "flex", padding: "10px 14px", background: "#1a1a32", borderBottom: "1px solid #2a2a44" },
  sbRow: { display: "flex", padding: "12px 14px", borderBottom: "1px solid #1a1a2a", alignItems: "center" },
  sbCell: { fontSize: 13, fontFamily: "'Oswald'", fontWeight: 400, color: "#aaa", letterSpacing: 1 },
  guide: { background: "#13132a", borderRadius: 8, padding: 20, border: "1px solid #1e1e3a" },
};
