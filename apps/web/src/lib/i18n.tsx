import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const LANG_STORAGE_KEY = "vestoxr-lang";

const translations = {
  nav: {
    dashboard: { es: "Inicio", en: "Dashboard" },
    store: { es: "Tienda", en: "Store" },
    library: { es: "Mi Biblioteca", en: "My Library" },
    admin: { es: "Administración", en: "Administration" },
  },
  sidebar: {
    logout: { es: "Cerrar Sesión", en: "Log Out" },
  },
  dashboard: {
    welcome: { es: "Bienvenido, {email}", en: "Welcome, {email}" },
    statVisible: { es: "Artefactos visibles para ti", en: "Artifacts visible to you" },
    statPublished: { es: "Publicados", en: "Published" },
    statPending: { es: "Pendientes de revisión", en: "Pending review" },
  },
  login: {
    appName: { es: "VestoXR", en: "VestoXR" },
    registeredTitle: { es: "Registro recibido", en: "Registration received" },
    registeredBody: {
      es: "Un administrador debe aprobar tu cuenta y asignarte un rol antes de que puedas iniciar sesión.",
      en: "An administrator needs to approve your account and assign a role before you can log in.",
    },
    backToLogin: { es: "Volver a iniciar sesión", en: "Back to login" },
    titleLogin: { es: "Iniciar sesión", en: "Sign in" },
    titleRegister: { es: "Crear cuenta", en: "Create account" },
    subtitleLogin: { es: "Ingresa tus credenciales para acceder a tu cuenta", en: "Enter your credentials to access your account" },
    subtitleRegister: { es: "Un admin deberá aprobar tu cuenta", en: "An admin will need to approve your account" },
    email: { es: "Correo electrónico", en: "Email address" },
    password: { es: "Contraseña", en: "Password" },
    submitLogin: { es: "Iniciar sesión", en: "Sign in" },
    submitRegister: { es: "Registrarme", en: "Sign up" },
    noAccount: { es: "¿No tienes una cuenta?", en: "Don't have an account?" },
    signUp: { es: "Regístrate", en: "Sign up" },
    haveAccount: { es: "¿Ya tienes una cuenta?", en: "Already have an account?" },
    signIn: { es: "Inicia sesión", en: "Sign in" },
    poweredBy: { es: "Desarrollado por", en: "Powered by" },
    genericError: { es: "Ocurrió un error.", en: "Something went wrong." },
  },
  myLibrary: {
    title: { es: "Mi Biblioteca", en: "My Library" },
    subtitle: {
      es: "Los artefactos de tu organización, incluyendo borradores y pendientes de revisión.",
      en: "Your organization's artifacts, including drafts and pending review.",
    },
    empty: { es: "Aún no se han subido artefactos.", en: "No artifacts uploaded yet." },
  },
  store: {
    title: { es: "Tienda", en: "Store" },
    subtitle: { es: "Artefactos publicados de todas las organizaciones.", en: "Published artifacts from every organization." },
    empty: { es: "Aún no hay artefactos publicados.", en: "No published artifacts yet." },
  },
  artifactGrid: {
    preview: { es: "Vista previa GLB", en: "GLB preview" },
    statusDraft: { es: "Borrador", en: "Draft" },
    statusPendingReview: { es: "Pendiente de revisión", en: "Pending review" },
    statusPublished: { es: "Publicado", en: "Published" },
    statusRejected: { es: "Rechazado", en: "Rejected" },
  },
  admin: {
    title: { es: "Administración de Usuarios", en: "User Management" },
    accountInfo: { es: "Información de Cuentas", en: "Account Information" },
    total: { es: "Total", en: "Total" },
    active: { es: "Activos", en: "Active" },
    pendingApproval: { es: "Pendientes de aprobación", en: "Pending approval" },
    email: { es: "Correo", en: "Email" },
    role: { es: "Rol", en: "Role" },
    organization: { es: "Organización", en: "Organization" },
    status: { es: "Estado", en: "Status" },
    actions: { es: "Acciones", en: "Actions" },
    awaitingApproval: { es: "Esperando aprobación", en: "Awaiting approval" },
    assignFirst: { es: "Asigna primero un rol y una organización", en: "Assign a role and organization first" },
    disableAccount: { es: "Deshabilitar cuenta", en: "Disable account" },
    enableAccount: { es: "Habilitar cuenta", en: "Enable account" },
    addUser: { es: "Agregar usuario", en: "Add user" },
    newUserEmail: { es: "Correo electrónico", en: "Email address" },
    newUserPassword: { es: "Contraseña temporal", en: "Temporary password" },
    create: { es: "Crear", en: "Create" },
    cancel: { es: "Cancelar", en: "Cancel" },
    delete: { es: "Eliminar", en: "Delete" },
    confirmDelete: { es: "¿Eliminar esta cuenta? Esta acción no se puede deshacer.", en: "Delete this account? This cannot be undone." },
  },
} as const;

type Dict = typeof translations;
type Section = keyof Dict;
type FlatKey = { [S in Section]: `${S}.${Extract<keyof Dict[S], string>}` }[Section];

function resolve(key: FlatKey): { es: string; en: string } {
  const [section, leaf] = key.split(".") as [Section, string];
  return (translations[section] as Record<string, { es: string; en: string }>)[leaf]!;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: FlatKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLang(): Lang {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "es" || stored === "en") return stored;
  return "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key, vars) => {
        let text = resolve(key)[lang];
        if (vars) {
          for (const [name, val] of Object.entries(vars)) {
            text = text.replace(`{${name}}`, val);
          }
        }
        return text;
      },
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
