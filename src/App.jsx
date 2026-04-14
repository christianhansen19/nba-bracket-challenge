import { useState, useEffect } from "react";
import { db, ref, set, onValue } from "./firebase";

// ─── Teams ──────────────────────────────────────────────────────────────
const T = {
  OKC: { n: "Thunder", c: "OKC", s: 1, color: "#007AC1", bg: "#002D62" },
  SAS: { n: "Spurs", c: "SAN", s: 2, color: "#C4CED4", bg: "#000000" },
  DEN: { n: "Nuggets", c: "DEN", s: 3, color: "#FEC524", bg: "#0E2240" },
  LAL: { n: "Lakers", c: "LAL", s: 4, color: "#FDB927", bg: "#552583" },
  HOU: { n: "Rockets", c: "HOU", s: 5, color: "#CE1141", bg: "#000000" },
  MIN: { n: "Wolves", c: "MIN", s: 6, color: "#78BE20", bg: "#0C2340" },
  PHX: { n: "Suns", c: "PHX", s: 7, color: "#E56020", bg: "#1D1160" },
  POR: { n: "Blazers", c: "POR", s: 8, color: "#E03A3E", bg: "#000000" },
  DET: { n: "Pistons", c: "DET", s: 1, color: "#1D42BA", bg: "#C8102E" },
  NYK: { n: "Knicks", c: "NYK", s: 2, color: "#F58426", bg: "#006BB6" },
  CLE: { n: "Cavs", c: "CLE", s: 3, color: "#FDBB30", bg: "#860038" },
  BOS: { n: "Celtics", c: "BOS", s: 4, color: "#BA9653", bg: "#007A33" },
  ATL: { n: "Hawks", c: "ATL", s: 5, color: "#E03A3E", bg: "#C1D32F" },
  TOR: { n: "Raptors", c: "TOR", s: 6, color: "#CE1141", bg: "#000000" },
  PHI: { n: "76ers", c: "PHI", s: 7, color: "#ED174C", bg: "#006BB6" },
  ORL: { n: "Magic", c: "ORL", s: 8, color: "#0077C0", bg: "#000000" },
};

const R1 = {
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

const TREE = {
  W5: { p: ["W1", "W2"], r: 2 },
  W6: { p: ["W3", "W4"], r: 2 },
  W7: { p: ["W5", "W6"], r: 3 },
  E5: { p: ["E1", "E2"], r: 2 },
  E6: { p: ["E3", "E4"], r: 2 },
  E7: { p: ["E5", "E6"], r: 3 },
  F: { p: ["W7", "E7"], r: 4 },
};

const R1_IDS = ["W1", "W2", "W3", "W4", "E1", "E2", "E3", "E4"];
const ALL_IDS = [...R1_IDS, ...Object.keys(TREE)];
const PTS = { 1: 10, 2: 20, 3: 40, 4: 80 };
const RNAME = {
  1: "First Round",
  2: "Conf. Semis",
  3: "Conf. Finals",
  4: "NBA Finals",
};
const LOCK = new Date("2026-04-18T16:00:00Z");
const MAX_P = 6;

function getRound(id) {
  return R1_IDS.includes(id) ? 1 : TREE[id]?.r || 4;
}

function getTeams(id, picks) {
  if (R1_IDS.includes(id)) {
    const conf = id[0] === "W" ? "west" : "east";
    return R1[conf].find((m) => m.id === id).teams;
  }
  const node = TREE[id];
  return node ? node.p.map((p) => picks[p] || null) : [null, null];
}

function getDesc(id) {
  const d = [];
  for (const [k, v] of Object.entries(TREE)) {
    if (v.p.includes(id)) {
      d.push(k);
      d.push(...getDesc(k));
    }
  }
  return d;
}

function score(picks, res) {
  let t = 0;
  for (const id of ALL_IDS) {
    if (picks[id] && res[id] && picks[id] === res[id]) {
      t += PTS[getRound(id)];
      if (
        picks[id + "_g"] &&
        res[id + "_g"] &&
        picks[id + "_g"] === res[id + "_g"]
      )
        t += 5;
    }
  }
  return t;
}

function breakdown(picks, res) {
  const b = {
    1: { c: 0, t: 0, g: 0 },
    2: { c: 0, t: 0, g: 0 },
    3: { c: 0, t: 0, g: 0 },
    4: { c: 0, t: 0, g: 0 },
  };
  for (const id of ALL_IDS) {
    const r = getRound(id);
    if (res[id]) {
      b[r].t++;
      if (picks[id] === res[id]) {
        b[r].c++;
        if (
          picks[id + "_g"] &&
          res[id + "_g"] &&
          picks[id + "_g"] === res[id + "_g"]
        )
          b[r].g++;
      }
    }
  }
  return b;
}

// ─── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [me, setMe] = useState(() => localStorage.getItem("nba26_me") || null);
  const [players, setPlayers] = useState([]);
  const [brackets, setBrackets] = useState({});
  const [results, setResults] = useState({});
  const [tab, setTab] = useState("bracket");
  const [viewing, setViewing] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const locked = new Date() >= LOCK;

  useEffect(() => {
    const u = [];
    u.push(
      onValue(ref(db, "players"), (s) => {
        const v = s.val();
        const list = v ? Object.keys(v) : [];
        setPlayers(list);
        const saved = localStorage.getItem("nba26_me");
        if (saved && list.includes(saved)) setViewing((p) => p || saved);
        setLoading(false);
      }),
    );
    u.push(onValue(ref(db, "results"), (s) => setResults(s.val() || {})));
    u.push(onValue(ref(db, "brackets"), (s) => setBrackets(s.val() || {})));
    return () => u.forEach((fn) => fn());
  }, []);

  async function join(name) {
    const n = name.trim();
    if (!n || players.includes(n) || players.length >= MAX_P) return;
    await set(ref(db, `players/${n}`), true);
    localStorage.setItem("nba26_me", n);
    setMe(n);
    setViewing(n);
  }

  function select(name) {
    localStorage.setItem("nba26_me", name);
    setMe(name);
    setViewing(name);
  }

  async function pick(id, team) {
    if (locked || viewing !== me) return;
    const b = { ...(brackets[me] || {}) };
    b[id] = team;
    for (const d of getDesc(id)) {
      const dt = getTeams(d, b);
      if (b[d] && !dt.includes(b[d])) {
        delete b[d];
        delete b[d + "_g"];
      }
    }
    await set(ref(db, `brackets/${me}`), b);
  }

  async function pickGames(id, g) {
    if (locked || viewing !== me) return;
    const b = { ...(brackets[me] || {}) };
    b[id + "_g"] = g;
    await set(ref(db, `brackets/${me}`), b);
  }

  async function setRes(id, team) {
    const r = { ...results, [id]: team };
    for (const d of getDesc(id)) {
      const dt = getTeams(d, r);
      if (r[d] && !dt.includes(r[d])) {
        delete r[d];
        delete r[d + "_g"];
      }
    }
    await set(ref(db, "results"), r);
  }

  async function setResGames(id, g) {
    const r = { ...results, [id + "_g"]: g };
    await set(ref(db, "results"), r);
  }

  if (loading)
    return (
      <div style={S.loadWrap}>
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <div style={S.spinner} />
        <p style={{ color: "#666", marginTop: 16, fontFamily: "'Oswald'" }}>
          Connecting...
        </p>
      </div>
    );

  if (!me || !players.includes(me))
    return (
      <Login
        players={players}
        onJoin={join}
        onSelect={select}
        name={newName}
        setName={setNewName}
        locked={locked}
      />
    );

  const activePicks = admin ? results : brackets[viewing] || {};
  const isOwn = viewing === me;
  const canEdit = isOwn && !locked;

  return (
    <div style={S.app}>
      <link
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap"
        rel="stylesheet"
      />
      <Header
        me={me}
        onLogout={() => {
          localStorage.removeItem("nba26_me");
          setMe(null);
          setViewing(null);
        }}
        locked={locked}
      />
      <TabBar tab={tab} setTab={setTab} />
      {tab === "bracket" ? (
        <div style={S.bracketWrap}>
          <Controls
            players={players}
            viewing={viewing}
            setViewing={setViewing}
            admin={admin}
            setAdmin={setAdmin}
            isOwn={isOwn}
            canEdit={canEdit}
          />
          <ConfBracket
            conf="west"
            label="WESTERN CONFERENCE"
            picks={activePicks}
            results={results}
            onPick={admin ? setRes : canEdit ? pick : null}
            onGames={admin ? setResGames : canEdit ? pickGames : null}
            showRes={!admin}
          />
          <ConfBracket
            conf="east"
            label="EASTERN CONFERENCE"
            picks={activePicks}
            results={results}
            onPick={admin ? setRes : canEdit ? pick : null}
            onGames={admin ? setResGames : canEdit ? pickGames : null}
            showRes={!admin}
          />
          <FinalsSection
            picks={activePicks}
            results={results}
            onPick={admin ? setRes : canEdit ? pick : null}
            onGames={admin ? setResGames : canEdit ? pickGames : null}
            showRes={!admin}
          />
        </div>
      ) : (
        <Scoreboard
          players={players}
          brackets={brackets}
          results={results}
          me={me}
        />
      )}
    </div>
  );
}

// ─── Login ──────────────────────────────────────────────────────────────
function Login({ players, onJoin, onSelect, name, setName, locked }) {
  return (
    <div style={S.loginWrap}>
      <link
        href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600&display=swap"
        rel="stylesheet"
      />
      <div style={S.loginCard}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle
              cx="24"
              cy="24"
              r="22"
              stroke="#E56020"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M12 24C12 24 18 14 24 14C30 14 36 24 36 24C36 24 30 34 24 34C18 34 12 24 12 24Z"
              stroke="#E56020"
              strokeWidth="2"
              fill="none"
            />
            <line
              x1="2"
              y1="24"
              x2="46"
              y2="24"
              stroke="#E56020"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <h1 style={S.loginTitle}>NBA PLAYOFF</h1>
        <h2 style={S.loginSub}>BRACKET CHALLENGE</h2>
        <p style={S.loginSeason}>2025–26 SEASON</p>
        {players.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={S.label}>SELECT YOUR NAME</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {players.map((p) => (
                <button key={p} onClick={() => onSelect(p)} style={S.playerBtn}>
                  <span style={S.avatar}>{p[0].toUpperCase()}</span>
                  <span style={{ fontWeight: 500 }}>{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!locked && players.length < MAX_P && (
          <div>
            <p style={S.label}>
              NEW PLAYER ({MAX_P - players.length} spots left)
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={S.input}
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onJoin(name);
                    setName("");
                  }
                }}
                maxLength={16}
              />
              <button
                style={S.joinBtn}
                onClick={() => {
                  onJoin(name);
                  setName("");
                }}
                disabled={!name.trim() || players.includes(name.trim())}
              >
                JOIN
              </button>
            </div>
          </div>
        )}
        {locked && players.length < MAX_P && (
          <p
            style={{
              color: "#E56020",
              fontSize: 13,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Brackets are locked — no new players.
          </p>
        )}
        <div style={S.lockNotice}>
          {locked ? (
            <span style={{ color: "#E56020" }}>BRACKETS LOCKED</span>
          ) : (
            <span>Brackets lock Apr 18 at noon ET</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chrome ─────────────────────────────────────────────────────────────
function Header({ me, onLogout, locked }) {
  return (
    <div style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={S.logo}>NBA</span>
        <span style={S.headerSub}>BRACKET CHALLENGE</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {locked && <span style={S.lockedBadge}>LOCKED</span>}
        <span style={S.headerPlayer}>{me}</span>
        <button onClick={onLogout} style={S.logoutBtn}>
          Exit
        </button>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <div style={S.tabBar}>
      {["bracket", "scoreboard"].map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            ...S.tabBtn,
            ...(tab === t
              ? { color: "#E56020", borderBottomColor: "#E56020" }
              : {}),
          }}
        >
          {t.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Controls({
  players,
  viewing,
  setViewing,
  admin,
  setAdmin,
  isOwn,
  canEdit,
}) {
  return (
    <div style={S.controls}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={S.ctrlLabel}>VIEWING:</label>
        <select
          value={admin ? "__r__" : viewing || ""}
          onChange={(e) => {
            if (e.target.value === "__r__") setAdmin(true);
            else {
              setAdmin(false);
              setViewing(e.target.value);
            }
          }}
          style={S.dropdown}
        >
          {players.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__r__">Actual Results (Admin)</option>
        </select>
      </div>
      {!admin && !isOwn && <div style={S.roBadge}>READ ONLY</div>}
      {!admin && canEdit && <div style={S.editBadge}>EDITING</div>}
      {admin && <div style={S.adminBadge}>ADMIN MODE</div>}
    </div>
  );
}

// ─── Bracket Layout ─────────────────────────────────────────────────────

function ConfBracket({
  conf,
  label,
  picks,
  results,
  onPick,
  onGames,
  showRes,
}) {
  const pfx = conf === "west" ? "W" : "E";
  const cfId = `${pfx}7`;
  return (
    <div style={{ marginBottom: 32 }}>
      <h3
        style={{
          ...S.confTitle,
          borderColor: conf === "west" ? "#007AC1" : "#C8102E",
        }}
      >
        {label}
      </h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, paddingLeft: 4 }}>
        {[1, 2, 3].map((r) => (
          <span key={r} style={S.roundTag}>
            {RNAME[r]} · {PTS[r]}pts
          </span>
        ))}
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <BracketNode
          id={cfId}
          picks={picks}
          results={results}
          onPick={onPick}
          onGames={onGames}
          showRes={showRes}
        />
      </div>
    </div>
  );
}

function BracketNode({ id, picks, results, onPick, onGames, showRes }) {
  const round = getRound(id);

  if (round === 1) {
    return (
      <div style={{ padding: "5px 0" }}>
        <MCard
          id={id}
          picks={picks}
          results={results}
          onPick={onPick}
          onGames={onGames}
          showRes={showRes}
        />
      </div>
    );
  }

  const [pA, pB] = TREE[id].p;

  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      {/* Children */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <BracketNode
            id={pA}
            picks={picks}
            results={results}
            onPick={onPick}
            onGames={onGames}
            showRes={showRes}
          />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <BracketNode
            id={pB}
            picks={picks}
            results={results}
            onPick={onPick}
            onGames={onGames}
            showRes={showRes}
          />
        </div>
      </div>
      {/* Connector lines */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 20,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            borderBottom: "2px solid #2a2a3e",
            borderRight: "2px solid #2a2a3e",
          }}
        />
        <div
          style={{
            flex: 1,
            borderTop: "2px solid #2a2a3e",
            borderRight: "2px solid #2a2a3e",
          }}
        />
      </div>
      {/* Line to current + card */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: 12, height: 2, background: "#2a2a3e" }} />
        <MCard
          id={id}
          picks={picks}
          results={results}
          onPick={onPick}
          onGames={onGames}
          showRes={showRes}
        />
      </div>
    </div>
  );
}

function FinalsSection({ picks, results, onPick, onGames, showRes }) {
  const champ = picks["F"];
  return (
    <div
      style={{
        borderTop: "1px solid #1e1e30",
        paddingTop: 20,
        marginTop: 8,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 8, paddingLeft: 4 }}>
        <span style={S.roundTag}>
          {RNAME[4]} · {PTS[4]}pts
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <MCard
          id="F"
          picks={picks}
          results={results}
          onPick={onPick}
          onGames={onGames}
          showRes={showRes}
          finals
        />
      </div>
      {champ && T[champ] && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <span
            style={{
              fontFamily: "'Oswald'",
              fontSize: 11,
              letterSpacing: 4,
              color: "#FEC524",
              display: "block",
              marginBottom: 8,
            }}
          >
            CHAMPION
          </span>
          <div
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 8,
              border: "2px solid #FEC524",
              background: T[champ].bg,
            }}
          >
            <span
              style={{
                color: T[champ].color,
                fontFamily: "'Oswald'",
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              {T[champ].c} {T[champ].n}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Matchup Card ───────────────────────────────────────────────────────

function MCard({ id, picks, results, onPick, onGames, showRes, finals }) {
  const [t1, t2] = getTeams(id, picks);
  const picked = picks[id];
  const pickedG = picks[id + "_g"];
  const actual = results[id];
  const actualG = results[id + "_g"];
  const clickable = !!onPick;

  return (
    <div
      style={{ ...S.card, ...(finals ? { border: "2px solid #E56020" } : {}) }}
    >
      {[t1, t2].map((tk, i) => {
        if (!tk)
          return (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                borderBottom: i === 0 ? "1px solid #1e1e30" : "none",
              }}
            >
              <span
                style={{ color: "#444", fontSize: 12, fontStyle: "italic" }}
              >
                TBD
              </span>
            </div>
          );
        const tm = T[tk];
        const isPick = picked === tk;
        const correct = showRes && actual && picked === tk && actual === tk;
        const wrong = showRes && actual && picked === tk && actual !== tk;
        const actualW = showRes && actual === tk;
        return (
          <div
            key={i}
            onClick={() => clickable && onPick(id, tk)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "7px 10px",
              cursor: clickable ? "pointer" : "default",
              background: isPick ? tm.bg : "transparent",
              borderBottom: i === 0 ? "1px solid #1e1e30" : "none",
              transition: "background 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Oswald'",
                  fontWeight: 600,
                  minWidth: 12,
                  color: isPick ? tm.color : "#555",
                }}
              >
                {tm.s}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "'Source Sans 3'",
                  color: isPick ? tm.color : "#bbb",
                  fontWeight: isPick ? 600 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {tm.c} {tm.n}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {correct && (
                <span
                  style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}
                >
                  ✓
                </span>
              )}
              {wrong && (
                <span
                  style={{ color: "#ef4444", fontSize: 14, fontWeight: 700 }}
                >
                  ✗
                </span>
              )}
              {actualW && !isPick && (
                <span style={{ color: "#4ade80", fontSize: 8 }}>●</span>
              )}
              {isPick && !correct && !wrong && (
                <span style={{ color: "#E56020", fontSize: 9 }}>▶</span>
              )}
            </div>
          </div>
        );
      })}
      {/* Games selector - shown when a winner is picked */}
      {picked && (
        <div style={S.gamesRow}>
          <span
            style={{
              fontSize: 10,
              color: "#555",
              fontFamily: "'Oswald'",
              letterSpacing: 1,
            }}
          >
            IN
          </span>
          {[4, 5, 6, 7].map((g) => {
            const sel = pickedG === g;
            const gCorrect =
              showRes &&
              actual &&
              picked === actual &&
              actualG === g &&
              pickedG === g;
            const gWrong =
              showRes && actual && actualG && pickedG === g && actualG !== g;
            return (
              <button
                key={g}
                onClick={(e) => {
                  e.stopPropagation();
                  if (clickable && onGames) onGames(id, g);
                }}
                style={{
                  ...S.gBtn,
                  background: sel
                    ? gCorrect
                      ? "#166534"
                      : gWrong
                        ? "#7f1d1d"
                        : "#E56020"
                    : "transparent",
                  color: sel ? "#fff" : "#666",
                  border: sel ? "1px solid transparent" : "1px solid #2a2a3e",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                {g}
              </button>
            );
          })}
          <span
            style={{
              fontSize: 10,
              color: "#555",
              fontFamily: "'Oswald'",
              letterSpacing: 1,
            }}
          >
            GM
          </span>
          {showRes &&
            actual &&
            picked === actual &&
            actualG &&
            pickedG === actualG && (
              <span
                style={{
                  fontSize: 10,
                  color: "#4ade80",
                  fontFamily: "'Oswald'",
                  marginLeft: 2,
                }}
              >
                +5
              </span>
            )}
        </div>
      )}
    </div>
  );
}

// ─── Scoreboard ─────────────────────────────────────────────────────────

function Scoreboard({ players, brackets, results, me }) {
  const hasRes =
    Object.keys(results).filter((k) => !k.includes("_")).length > 0;
  const sorted = [...players].sort(
    (a, b) =>
      score(brackets[b] || {}, results) - score(brackets[a] || {}, results),
  );
  const maxBonus = 15 * 5; // 15 series × 5 pts each

  return (
    <div style={S.sbWrap}>
      <h2 style={S.sbTitle}>LEADERBOARD</h2>
      {!hasRes && (
        <div style={S.noRes}>
          No results entered yet. Scores update live once an admin enters game
          outcomes.
        </div>
      )}
      <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 24 }}>
        <div style={S.sbHdr}>
          <span style={{ ...S.sbCell, flex: 0.4 }}>#</span>
          <span style={{ ...S.sbCell, flex: 2 }}>PLAYER</span>
          <span style={{ ...S.sbCell, flex: 0.8 }}>R1</span>
          <span style={{ ...S.sbCell, flex: 0.8 }}>R2</span>
          <span style={{ ...S.sbCell, flex: 0.8 }}>CF</span>
          <span style={{ ...S.sbCell, flex: 0.8 }}>FIN</span>
          <span style={{ ...S.sbCell, flex: 1, color: "#E56020" }}>PTS</span>
        </div>
        {sorted.map((p, i) => {
          const br = brackets[p] || {};
          const sc = score(br, results);
          const bd = breakdown(br, results);
          const picks = Object.keys(br).filter((k) => !k.includes("_")).length;
          const isMe = p === me;
          return (
            <div
              key={p}
              style={{
                ...S.sbRow,
                background: isMe
                  ? "rgba(229,96,32,0.08)"
                  : i % 2 === 0
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
              }}
            >
              <span
                style={{
                  ...S.sbCell,
                  flex: 0.4,
                  fontWeight: 700,
                  color: i === 0 && hasRes ? "#FEC524" : "#888",
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  ...S.sbCell,
                  flex: 2,
                  fontWeight: isMe ? 700 : 400,
                  color: isMe ? "#E56020" : "#ddd",
                }}
              >
                {p}
                {isMe ? " (you)" : ""}
                <span style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>
                  {picks}/15
                </span>
              </span>
              {[1, 2, 3, 4].map((r) => (
                <span key={r} style={{ ...S.sbCell, flex: 0.8 }}>
                  {bd[r].t > 0 ? (
                    <span>
                      {bd[r].c}/{bd[r].t}
                      {bd[r].g > 0 && (
                        <span style={{ color: "#4ade80", fontSize: 10 }}>
                          {" "}
                          +{bd[r].g * 5}
                        </span>
                      )}
                    </span>
                  ) : (
                    "–"
                  )}
                </span>
              ))}
              <span
                style={{
                  ...S.sbCell,
                  flex: 1,
                  fontWeight: 700,
                  color: "#E56020",
                  fontSize: 18,
                }}
              >
                {sc}
              </span>
            </div>
          );
        })}
      </div>
      <div style={S.guide}>
        <h4
          style={{
            fontFamily: "'Oswald'",
            fontSize: 13,
            letterSpacing: 3,
            color: "#666",
            margin: "0 0 12px",
          }}
        >
          SCORING
        </h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(RNAME).map(([r, name]) => (
            <div key={r} style={S.guideItem}>
              <span style={{ fontSize: 11, color: "#888" }}>{name}</span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#E56020",
                  fontFamily: "'Oswald'",
                }}
              >
                {PTS[r]} pts
              </span>
            </div>
          ))}
          <div style={S.guideItem}>
            <span style={{ fontSize: 11, color: "#888" }}>Games Bonus</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#4ade80",
                fontFamily: "'Oswald'",
              }}
            >
              +5 pts
            </span>
          </div>
        </div>
        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: "#555",
            textAlign: "center",
          }}
        >
          Max: {8 * 10 + 4 * 20 + 2 * 40 + 80 + 15 * 5} points (240 winners + 75
          games bonuses)
        </p>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const S = {
  loadWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#0d0d1a",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid #222",
    borderTopColor: "#E56020",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  app: {
    minHeight: "100vh",
    background: "#0d0d1a",
    color: "#eee",
    fontFamily: "'Source Sans 3', sans-serif",
  },
  loginWrap: {
    minHeight: "100vh",
    background: "#0d0d1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  loginCard: {
    background: "#13132a",
    border: "1px solid #1e1e3a",
    borderRadius: 16,
    padding: "40px 32px",
    maxWidth: 440,
    width: "100%",
  },
  loginTitle: {
    fontFamily: "'Oswald'",
    fontSize: 36,
    fontWeight: 700,
    textAlign: "center",
    margin: 0,
    color: "#fff",
    letterSpacing: 4,
  },
  loginSub: {
    fontFamily: "'Oswald'",
    fontSize: 18,
    fontWeight: 400,
    textAlign: "center",
    margin: "4px 0 0",
    color: "#E56020",
    letterSpacing: 6,
  },
  loginSeason: {
    textAlign: "center",
    color: "#555",
    fontSize: 13,
    letterSpacing: 3,
    margin: "8px 0 32px",
    fontFamily: "'Oswald'",
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#666",
    marginBottom: 10,
    fontFamily: "'Oswald'",
  },
  playerBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    background: "#1a1a32",
    border: "1px solid #2a2a44",
    borderRadius: 8,
    cursor: "pointer",
    color: "#ddd",
    fontFamily: "'Source Sans 3'",
    fontSize: 15,
    width: "100%",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#E56020",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Oswald'",
    fontWeight: 700,
    fontSize: 14,
    color: "#fff",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    background: "#1a1a32",
    border: "1px solid #2a2a44",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    fontFamily: "'Source Sans 3'",
    outline: "none",
  },
  joinBtn: {
    padding: "10px 20px",
    background: "#E56020",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontFamily: "'Oswald'",
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: 2,
    cursor: "pointer",
  },
  lockNotice: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 12,
    letterSpacing: 2,
    color: "#555",
    fontFamily: "'Oswald'",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    background: "#0a0a18",
    borderBottom: "1px solid #1a1a30",
    flexWrap: "wrap",
    gap: 8,
  },
  logo: {
    fontFamily: "'Oswald'",
    fontWeight: 700,
    fontSize: 22,
    color: "#E56020",
    letterSpacing: 2,
  },
  headerSub: {
    fontFamily: "'Oswald'",
    fontWeight: 400,
    fontSize: 13,
    color: "#888",
    letterSpacing: 3,
  },
  lockedBadge: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#E56020",
    padding: "2px 8px",
    border: "1px solid #E56020",
    borderRadius: 4,
    fontFamily: "'Oswald'",
  },
  headerPlayer: {
    fontFamily: "'Oswald'",
    fontWeight: 500,
    fontSize: 14,
    color: "#ccc",
  },
  logoutBtn: {
    padding: "4px 12px",
    background: "none",
    border: "1px solid #333",
    borderRadius: 4,
    color: "#888",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Oswald'",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #1a1a30",
    background: "#0d0d1a",
  },
  tabBtn: {
    flex: 1,
    padding: "14px 0",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#666",
    fontSize: 13,
    fontFamily: "'Oswald'",
    fontWeight: 500,
    letterSpacing: 3,
    cursor: "pointer",
  },
  bracketWrap: { padding: "12px 16px 40px", maxWidth: 900, margin: "0 auto" },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  ctrlLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#666",
    fontFamily: "'Oswald'",
  },
  dropdown: {
    padding: "8px 12px",
    background: "#13132a",
    border: "1px solid #2a2a44",
    borderRadius: 6,
    color: "#ddd",
    fontSize: 14,
    fontFamily: "'Source Sans 3'",
    outline: "none",
    cursor: "pointer",
    minWidth: 160,
  },
  roBadge: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#666",
    padding: "3px 10px",
    border: "1px solid #333",
    borderRadius: 4,
    fontFamily: "'Oswald'",
  },
  editBadge: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#4ade80",
    padding: "3px 10px",
    border: "1px solid #4ade80",
    borderRadius: 4,
    fontFamily: "'Oswald'",
  },
  adminBadge: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#fbbf24",
    padding: "3px 10px",
    border: "1px solid #fbbf24",
    borderRadius: 4,
    fontFamily: "'Oswald'",
  },
  confTitle: {
    fontFamily: "'Oswald'",
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: 4,
    color: "#888",
    borderLeft: "3px solid",
    paddingLeft: 12,
    margin: "0 0 10px",
  },
  roundTag: {
    fontSize: 10,
    color: "#555",
    fontFamily: "'Oswald'",
    letterSpacing: 1,
    background: "#13132a",
    padding: "2px 8px",
    borderRadius: 4,
  },
  card: {
    width: 150,
    background: "#13132a",
    borderRadius: 6,
    border: "1px solid #2a2a3e",
    overflow: "hidden",
    flexShrink: 0,
  },
  gamesRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "rgba(0,0,0,0.3)",
    justifyContent: "center",
  },
  gBtn: {
    width: 22,
    height: 20,
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "'Oswald'",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  sbWrap: { padding: "20px 16px 40px", maxWidth: 700, margin: "0 auto" },
  sbTitle: {
    fontFamily: "'Oswald'",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 4,
    color: "#fff",
    textAlign: "center",
    marginBottom: 24,
  },
  noRes: {
    textAlign: "center",
    padding: "20px 16px",
    color: "#666",
    fontSize: 14,
    background: "#13132a",
    borderRadius: 8,
    marginBottom: 20,
  },
  sbHdr: {
    display: "flex",
    padding: "10px 14px",
    background: "#1a1a32",
    borderBottom: "1px solid #2a2a44",
  },
  sbRow: {
    display: "flex",
    padding: "12px 14px",
    borderBottom: "1px solid #1a1a2a",
    alignItems: "center",
  },
  sbCell: {
    fontSize: 13,
    fontFamily: "'Oswald'",
    fontWeight: 400,
    color: "#aaa",
    letterSpacing: 1,
  },
  guide: {
    background: "#13132a",
    borderRadius: 8,
    padding: 20,
    border: "1px solid #1e1e3a",
  },
  guideItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: "1 1 80px",
    padding: "8px 10px",
    background: "#0d0d1a",
    borderRadius: 6,
  },
};
