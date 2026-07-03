import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { APP_VERSION } from "../lib/version.js";
import { useI18n } from "../lib/i18n.js";
import luxrLogo from "../assets/luxr-logo.svg";

function navLinkClasses(isActive: boolean): string {
  return [
    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-accent/10 text-accent"
      : "text-text-secondary dark:text-text-secondary-dark hover:bg-black/5 dark:hover:bg-white/5",
  ].join(" ");
}

export function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();

  const navItems = [
    { to: "/", label: t("nav.dashboard"), end: true },
    { to: "/store", label: t("nav.store") },
    { to: "/library", label: t("nav.library") },
  ];

  return (
    <div className="flex min-h-screen bg-bg text-text-primary dark:bg-bg-dark dark:text-text-primary-dark">
      <aside className="flex w-64 flex-col border-r border-border bg-surface dark:border-border-dark dark:bg-surface-dark">
        <div className="px-5 py-6">
          <span className="text-lg font-bold tracking-wide">VestoXR</span>
          <span className="ml-2 text-xs font-medium text-text-secondary dark:text-text-secondary-dark">by LUXR</span>
        </div>

        {user && (
          <div className="mx-4 mb-6 mt-2 flex items-center gap-3 rounded-lg border border-border px-3 py-2 dark:border-border-dark">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
              {user.email.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="truncate text-xs capitalize text-text-secondary dark:text-text-secondary-dark">
                {user.role ?? "no role"}
              </p>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => navLinkClasses(isActive)}>
              {item.label}
            </NavLink>
          ))}
          {user?.role === "admin" && (
            <NavLink to="/admin" className={({ isActive }) => navLinkClasses(isActive)}>
              {t("nav.admin")}
            </NavLink>
          )}
        </nav>

        <div className="space-y-3 border-t border-border p-4 dark:border-border-dark">
          <div className="flex w-full overflow-hidden rounded-md border border-border dark:border-border-dark">
            {(["es", "en"] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  lang === code
                    ? "bg-accent/10 text-accent"
                    : "text-text-secondary hover:bg-black/5 dark:text-text-secondary-dark dark:hover:bg-white/5"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => void logout()}
            className="w-full rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-black/5 dark:border-border-dark dark:text-text-secondary-dark dark:hover:bg-white/5"
          >
            {t("sidebar.logout")}
          </button>
          <p className="text-center text-xs text-text-secondary dark:text-text-secondary-dark">v{APP_VERSION}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
