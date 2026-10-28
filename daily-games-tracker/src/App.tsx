import { useEffect, useState, type ReactNode } from "react";
import AdminPage from "./pages/AdminPage";
import RegistrationPage from "./pages/RegistrationPage";
import DeviceLogin from "./pages/DeviceLogin";
import UserPage from "./pages/UserPage";
import { AllTimeLeaderboardPage, DailyLeaderboardPage } from "./pages/LeaderboardPages";

type Page = "home" | "daily" | "all-time" | "admin" | "register" | "user";
type GameId = "krillion" | "maptap";
interface Game {
  id: GameId;
  title: string;
  icon: string;
  rounds: number;
  scoringStyle: string;
}
interface Health {
  status: string;
  schemaVersion?: number;
  gameDay?: string;
}

const suggestedGames: Game[] = [
  { id: "krillion", title: "Krillion", icon: "🦐", rounds: 7, scoringStyle: "emoji_levels" },
  { id: "maptap", title: "MapTap", icon: "🌎", rounds: 5, scoringStyle: "weighted_numbers" },
];

function PacificDate({ iso }: { iso?: string }) {
  const display = iso ? new Date(`${iso}T12:00:00Z`) : new Date();
  return (
    <span>
      {new Intl.DateTimeFormat("en-US", {
        timeZone: iso ? "UTC" : "America/Los_Angeles",
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(display)}
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for route classification tests
export function getPage(pathname = window.location.pathname): Page {
  if (
    pathname === "/user" ||
    pathname === "/user/" ||
    pathname === "/login" ||
    pathname === "/login/"
  )
    return "user";
  if (pathname === "/daily") return "daily";
  if (pathname.startsWith("/daily/")) return "daily";
  if (pathname === "/all-time" || pathname === "/all-time/") return "all-time";
  if (pathname === "/admin") return "admin";
  if (pathname.startsWith("/register/")) return "register";
  return "home";
}

function Icon({
  name,
  size = 20,
}: {
  name:
    | "send"
    | "calendar"
    | "trophy"
    | "arrow"
    | "lock"
    | "database"
    | "check"
    | "chevron"
    | "shield"
    | "info";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="M8 14h3M8 17h3" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 21h8M12 17v4M7 4h10v8a5 5 0 0 1-10 0V4Z" />
        <path d="M7 7H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="12" rx="2" />
        <path d="M8 10V7a4 4 0 1 1 8 0v3" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function GameBadge({ game }: { game: Game }) {
  return (
    <span className={`game-badge ${game.id}`} aria-hidden="true">
      {game.icon}
    </span>
  );
}

function PlayHelpPage({ games }: { games: Game[] }) {
  const gameUrls: Record<GameId, string> = {
    krillion: "https://krillion.io/",
    maptap: "https://www.maptap.gg/",
  };

  return (
    <>
      <div className="eyebrow">
        <span className="tiny-dot" /> YOUR DAILY RITUAL
      </div>
      <h1>
        Play. Share.
        <br />
        <span className="accent-italic">Compare.</span>
      </h1>
      <p className="page-intro">
        Play on the original game site, then send the finished result through one iPhone Shortcut.
      </p>
      <div className="section-heading">
        <span>01</span>
        <h2>Open a game</h2>
      </div>
      <div className="game-list">
        {games.map((game) => (
          <a
            key={game.id}
            className="game-choice chosen"
            href={gameUrls[game.id]}
            target="_blank"
            rel="noreferrer"
          >
            <GameBadge game={game} />
            <div className="game-info">
              <strong>{game.title}</strong>
              <span>{game.rounds} rounds · Opens the original game</span>
            </div>
            <Icon name="arrow" size={19} />
          </a>
        ))}
      </div>
      <div className="section-heading setup-heading">
        <span>02</span>
        <h2>Upload the finished result</h2>
      </div>
      <ol className="setup-steps">
        <li>
          <strong>Krillion:</strong> use Safari's Share button on the completed results page.
        </li>
        <li>
          <strong>MapTap:</strong> use MapTap's in-game Share your score button.
        </li>
        <li>
          Choose <strong>Upload to WHT</strong>, review the native confirmation, then submit.
        </li>
      </ol>
      <a className="primary-action" href="/user">
        Login with Device <Icon name="arrow" size={20} />
      </a>
      <button
        type="button"
        className="primary-action"
        disabled
        aria-label="Shortcut download after registration"
      >
        Shortcut download after registration <Icon name="lock" size={20} />
      </button>
      <p className="muted-note">
        Registration is invitation-only. Your administrator will send a device invitation, and your
        private scorecard will offer the Shortcut download after setup.
      </p>
      <div className="info-strip">
        <Icon name="shield" size={18} />
        <span>No screenshots, OCR, PINs, passwords, or manual score entry are used.</span>
      </div>
    </>
  );
}

function BottomNav({ page }: { page: Page }) {
  const items = [
    { id: "home", label: "Play", href: "/", icon: "send" },
    { id: "daily", label: "Daily", href: "/daily", icon: "calendar" },
    { id: "all-time", label: "All-Time", href: "/all-time", icon: "trophy" },
    { id: "user", label: "User", href: "/user", icon: "shield" },
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="nav-inner">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={`nav-link ${page === item.id ? "active" : ""}`}
            aria-current={page === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function App() {
  const page = getPage();
  const [games, setGames] = useState<Game[]>(suggestedGames);
  const [health, setHealth] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (window.location.pathname !== "/daily") return;
    const date = new URLSearchParams(window.location.search).get("date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      window.history.replaceState({}, "", `/daily/${date}`);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [healthResponse, gameResponse] = await Promise.all([
          fetch("/api/health", { signal: controller.signal, cache: "no-store" }),
          fetch("/api/games", { signal: controller.signal, cache: "no-store" }),
        ]);
        if (!healthResponse.ok || !gameResponse.ok) throw new Error("API unavailable");
        const h: Health = await healthResponse.json();
        const data: { games: Game[] } = await gameResponse.json();
        if (!Array.isArray(data.games)) throw new Error("Invalid game list");
        setHealth(h);
        setGames(data.games);
      } catch {
        if (!controller.signal.aborted) setHealth({ status: "unavailable" });
      } finally {
        if (!controller.signal.aborted) setChecked(true);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return (
    <div className="app-background">
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Winstitute of Higher Thinking home">
            <span className="brand-symbol">✓</span>
            <span className="brand-copy">
              <span>WINSTITUTE</span>
              <span className="brand-light">OF HIGHER THINKING</span>
            </span>
          </a>
          <div className="top-date">
            <PacificDate iso={health?.gameDay} />
          </div>
        </header>
        <main>
          {page === "home" && <PlayHelpPage games={games} />}
          {page === "daily" && (
            <DeviceLogin redirectWhenSignedOut dailyReturnDate={health?.gameDay}>
              {() => <DailyLeaderboardPage currentDay={health?.gameDay} />}
            </DeviceLogin>
          )}
          {page === "user" && <DeviceLogin>{(auth) => <UserPage {...auth} />}</DeviceLogin>}
          {page === "all-time" && <AllTimeLeaderboardPage />}
          {page === "admin" && <AdminPage />}
          {page === "register" && <RegistrationPage />}
        </main>
        <footer className="status-footer">
          <span className={`connection-dot ${health?.status === "ok" ? "online" : "offline"}`} />
          {checked
            ? health?.status === "ok"
              ? `Cloudflare D1 connected · Schema v${health.schemaVersion}`
              : "Local UI preview · connect D1 to enable backend"
            : "Checking connection…"}
          <span className="phase-label">PHASE 6</span>
        </footer>
        <BottomNav page={page} />
      </div>
    </div>
  );
}
