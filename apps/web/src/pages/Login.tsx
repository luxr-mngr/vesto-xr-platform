import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { ApiError, apiFetch } from "../lib/api.js";

export function Login() {
  const { login } = useAuth();
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
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 dark:bg-bg-dark">
      <div className="w-full max-w-md">
        <p className="mb-8 text-center text-2xl font-bold tracking-tight text-text-primary dark:text-text-primary-dark">
          VestoXR
        </p>

        <div className="rounded-xl border border-border bg-surface p-6 dark:border-border-dark dark:bg-surface-dark">
          {registered ? (
            <div className="space-y-2 text-center">
              <h1 className="text-lg font-semibold">Registration received</h1>
              <p className="text-sm text-text-secondary dark:text-text-secondary-dark">
                An administrator needs to approve your account and assign a role before you can log in.
              </p>
              <button
                onClick={() => {
                  setRegistered(false);
                  setMode("login");
                }}
                className="mt-2 text-sm font-medium text-accent hover:underline"
              >
                Back to login
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1>
              <p className="mb-6 text-sm text-text-secondary dark:text-text-secondary-dark">
                {mode === "login" ? "Ingresa tus credenciales para acceder a tu cuenta" : "Un admin deberá aprobar tu cuenta"}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Correo electrónico</label>
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
                  <label className="mb-1 block text-sm font-medium">Contraseña</label>
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
                  {mode === "login" ? "Iniciar sesión" : "Registrarme"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
                {mode === "login" ? (
                  <>
                    ¿No tienes una cuenta?{" "}
                    <button onClick={() => setMode("register")} className="font-semibold text-accent hover:underline">
                      Regístrate
                    </button>
                  </>
                ) : (
                  <>
                    ¿Ya tienes una cuenta?{" "}
                    <button onClick={() => setMode("login")} className="font-semibold text-accent hover:underline">
                      Inicia sesión
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
