import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const LANG_STORAGE_KEY = "vestoxr-lang";

const translations = {
  nav: {
    dashboard: { es: "Inicio", en: "Dashboard" },
    store: { es: "Tienda", en: "Store" },
    library: { es: "Mi Biblioteca", en: "My Library" },
    admin: { es: "Administración", en: "Administration" },
    organizations: { es: "Organizaciones", en: "Organizations" },
    customFields: { es: "Campos personalizados", en: "Custom Fields" },
    apiKeys: { es: "Claves API", en: "API Keys" },
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
    upload: { es: "Subir artefacto", en: "Upload artifact" },
    uploadTitle: { es: "Título", en: "Title" },
    uploadFile: { es: "Archivo GLB", en: "GLB file" },
    uploadOrganization: { es: "Organización", en: "Organization" },
    uploadSubmit: { es: "Subir", en: "Upload" },
    uploading: { es: "Subiendo…", en: "Uploading…" },
    editTitle: { es: "Editar título", en: "Edit title" },
    save: { es: "Guardar", en: "Save" },
    confirmDelete: { es: "¿Eliminar este artefacto? Esta acción no se puede deshacer.", en: "Delete this artifact? This cannot be undone." },
    confirmReject: { es: "Rechazar este artefacto (volverá a borrador)", en: "Reject this artifact (returns to draft)" },
    fileTooLarge: { es: "El archivo GLB supera el límite de 200MB.", en: "The GLB file exceeds the 200MB limit." },
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
    public: { es: "Público", en: "Public" },
    edit: { es: "Editar título", en: "Edit title" },
    submit: { es: "Enviar a revisión", en: "Submit for review" },
    approve: { es: "Aprobar y publicar", en: "Approve & publish" },
    reject: { es: "Rechazar", en: "Reject" },
    makePublic: { es: "Hacer público", en: "Make public" },
    makePrivate: { es: "Hacer privado", en: "Make private" },
    delete: { es: "Eliminar", en: "Delete" },
    regenerateThumbnail: { es: "Generar vista previa", en: "Generate thumbnail" },
  },
  artifactDetail: {
    back: { es: "Volver", en: "Back" },
    noPreview: { es: "Este artefacto aún no tiene un archivo GLB.", en: "This artifact has no GLB file yet." },
    loadingPreview: { es: "Cargando vista previa…", en: "Loading preview…" },
    notFound: { es: "Artefacto no encontrado.", en: "Artifact not found." },
    status: { es: "Estado", en: "Status" },
    visibility: { es: "Visibilidad", en: "Visibility" },
    visibilityPublic: { es: "Público", en: "Public" },
    visibilityPrivate: { es: "Privado", en: "Private" },
    organization: { es: "Organización", en: "Organization" },
    customFieldsTitle: { es: "Campos personalizados", en: "Custom fields" },
    customFieldsEmpty: { es: "No hay campos personalizados definidos.", en: "No custom fields defined." },
    customFieldsSave: { es: "Guardar campos", en: "Save fields" },
    customFieldsSaved: { es: "Guardado.", en: "Saved." },
    customFieldsError: { es: "Ocurrió un error al guardar.", en: "Something went wrong saving." },
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
    newOrganization: { es: "Nueva organización", en: "New organization" },
    create: { es: "Crear", en: "Create" },
    cancel: { es: "Cancelar", en: "Cancel" },
    delete: { es: "Eliminar", en: "Delete" },
    confirmDelete: { es: "¿Eliminar esta cuenta? Esta acción no se puede deshacer.", en: "Delete this account? This cannot be undone." },
  },
  organizations: {
    title: { es: "Organizaciones", en: "Organizations" },
    subtitle: {
      es: "Crea y renombra las organizaciones de la plataforma.",
      en: "Create and rename the platform's organizations.",
    },
    name: { es: "Nombre", en: "Name" },
    slug: { es: "Slug", en: "Slug" },
    members: { es: "Miembros", en: "Members" },
    save: { es: "Guardar", en: "Save" },
    genericError: { es: "Ocurrió un error.", en: "Something went wrong." },
  },
  customFields: {
    title: { es: "Campos personalizados", en: "Custom Fields" },
    subtitle: {
      es: "Catálogo global de campos de metadatos disponibles para los artefactos.",
      en: "Global catalog of metadata fields available for artifacts.",
    },
    addField: { es: "Agregar campo", en: "Add field" },
    key: { es: "Clave", en: "Key" },
    label: { es: "Etiqueta", en: "Label" },
    fieldType: { es: "Tipo", en: "Type" },
    typeText: { es: "Texto", en: "Text" },
    typeNumber: { es: "Número", en: "Number" },
    typeDate: { es: "Fecha", en: "Date" },
    typeBoolean: { es: "Booleano", en: "Boolean" },
    create: { es: "Crear", en: "Create" },
    cancel: { es: "Cancelar", en: "Cancel" },
    empty: { es: "Aún no hay campos personalizados definidos.", en: "No custom fields defined yet." },
    genericError: { es: "Ocurrió un error.", en: "Something went wrong." },
    actions: { es: "Acciones", en: "Actions" },
    edit: { es: "Editar campo", en: "Edit field" },
    save: { es: "Guardar", en: "Save" },
    delete: { es: "Eliminar campo", en: "Delete field" },
    confirmDelete: {
      es: "¿Eliminar este campo personalizado? Esta acción no se puede deshacer.",
      en: "Delete this custom field? This cannot be undone.",
    },
  },
  apiKeys: {
    title: { es: "Claves API", en: "API Keys" },
    subtitle: {
      es: "Claves para que herramientas externas (por ejemplo, Unreal) consulten los artefactos de esta organización.",
      en: "Keys for external tools (e.g. Unreal) to query this organization's artifacts.",
    },
    selectOrganization: { es: "Selecciona una organización", en: "Select an organization" },
    organization: { es: "Organización", en: "Organization" },
    chooseOrgPrompt: { es: "Elige una organización para ver sus claves.", en: "Choose an organization to see its keys." },
    createKey: { es: "Crear clave", en: "Create key" },
    creating: { es: "Creando…", en: "Creating…" },
    labelField: { es: "Etiqueta (opcional)", en: "Label (optional)" },
    id: { es: "ID", en: "ID" },
    status: { es: "Estado", en: "Status" },
    actions: { es: "Acciones", en: "Actions" },
    active: { es: "Activa", en: "Active" },
    revoked: { es: "Revocada", en: "Revoked" },
    revoke: { es: "Revocar", en: "Revoke" },
    confirmRevoke: { es: "¿Revocar esta clave? Esta acción no se puede deshacer.", en: "Revoke this key? This cannot be undone." },
    empty: { es: "Aún no hay claves API para esta organización.", en: "No API keys for this organization yet." },
    newKeyTitle: { es: "Clave creada", en: "Key created" },
    newKeyWarning: {
      es: "Copia esta clave ahora: no se volverá a mostrar.",
      en: "Copy this key now: it will not be shown again.",
    },
    copy: { es: "Copiar", en: "Copy" },
    copied: { es: "¡Copiada!", en: "Copied!" },
    dismiss: { es: "Cerrar", en: "Dismiss" },
    genericError: { es: "Ocurrió un error.", en: "Something went wrong." },
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
