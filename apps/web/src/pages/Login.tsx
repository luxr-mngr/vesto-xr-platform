import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { useI18n } from "../lib/i18n.js";
import luxrLogo from "../assets/luxr-logo.svg";

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/");
      } else {
        await apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
        setRegistered(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 dark:bg-bg-dark">
      <div className="w-full max-w-md">
        <p className="mb-8 text-center text-2xl font-bold tracking-tight text-text-primary dark:text-text-primary-dark">
          {t("login.appName")}
        </p>

        <div className="rounded-xl border border-border bg-surface p-6 dark:border-border-dark dark:bg-surface-dark">
          {registered ? (
            <div className="space-y-2 text-center">
              <h1 className="text-lg font-semibold">{t("login.registeredTitle")}</h1>
              <p className="text-sm text-text-secondary dark:text-text-secondary-dark">{t("login.registeredBody")}</p>
              <button
                onClick={() => {
                  setRegistered(false);
                  setMode("login");
                }}
                className="mt-2 text-sm font-medium text-accent hover:underline"
              >
                {t("login.backToLogin")}
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold">{mode === "login" ? t("login.titleLogin") : t("login.titleRegister")}</h1>
              <p className="mb-6 text-sm text-text-secondary dark:text-text-secondary-dark">
                {mode === "login" ? t("login.subtitleLogin") : t("login.subtitleRegister")}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("login.email")}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("login.password")}</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent dark:border-border-dark"
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
                {mode === "login" ? (
                  <>
                    {t("login.noAccount")}{" "}
                    <button onClick={() => setMode("register")} className="font-semibold text-accent hover:underline">
                      {t("login.signUp")}
                    </button>
                  </>
                ) : (
                  <>
                    {t("login.haveAccount")}{" "}
                    <button onClick={() => setMode("login")} className="font-semibold text-accent hover:underline">
                      {t("login.signIn")}
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-text-secondary dark:text-text-secondary-dark">
          <span className="text-xs">{t("login.poweredBy")}</span>
          <img src={luxrLogo} alt="LuXR" className="h-3.5 w-auto opacity-80" />
        </div>
      </div>
    </div>
  );
}
