# CLAUDE.md — Cobertec Intake

Guía completa para que Claude entienda este proyecto sin contexto previo. Lee este archivo antes de tocar cualquier código.

---

## ¿Qué hace este sistema?

**Cobertec Intake** es un sistema de intake inteligente de soporte técnico para la empresa Cobertec (distribuidora de software ERP llamado Expertis / Movilsat). El objetivo es:

1. El cliente se autentica con email + contraseña (Cobertec gestiona las cuentas)
2. El cliente describe un problema en lenguaje natural
3. Un LLM (Claude o GPT-4o) lo clasifica contra una taxonomía configurable
4. El sistema crea automáticamente el ticket en Redmine con metadatos de enrutamiento
5. El ticket llega al equipo correcto sin intervención manual del 1er nivel

**Producto principal de Cobertec:** Expertis / Movilsat ERP — software de gestión empresarial con módulos de compras, ventas, GMAO, presupuestos, financiero, CRM, etc.

---

## Stack técnico

- **Backend:** Node.js + Fastify + TypeScript (ESM, ES2022)
- **Frontend:** React 19 + Vite + TypeScript
- **LLM:** Anthropic Claude (primario) o OpenAI GPT-4o (configurable por env var)
- **Base de datos:** SQLite (better-sqlite3, embebido) — dos bases: `events.db` (métricas) y `identity.db` (usuarios/empresas)
- **Auth:** JWT (jsonwebtoken) + bcrypt + refresh token httpOnly cookie
- **Validación:** Zod (runtime, backend y frontend)
- **Integración externa:** Redmine API REST

---

## Arquitectura de alto nivel

```
Frontend (React :5173)
    │
    ├─ POST /api/auth/token      ─────► AuthService.login()
    │   grant_type=password                  │ Verifica email + bcrypt(password)
    │                                        │ Emite access_token (15m, sin company)
    │                                        └─► access_token + refresh cookie + companies[]
    │
    ├─ POST /api/auth/token      ─────► AuthService.refresh()
    │   grant_type=refresh_token             │ Verifica refresh token en BD, rota
    │                                        └─► nuevo access_token + nueva cookie
    │
    ├─ POST /api/auth/select     ─────► AuthService.selectCompany()
    │                                        │ Verifica company ∈ user.companies
    │                                        └─► access_token (15m, con company embebida)
    │
    ├─ GET  /api/identity/me     ─────► IdentityStore (SQLite)
    │                                        └─► MeResponse (user + is_superadmin + company + companies[])
    │
    ├─ POST /api/intake/submit   ─────► [Auth Plugin] → ClassifierService
    │   (requiere company en token)          │ Construye prompt desde config/
    │                                        │ Llama LLM (15s timeout)
    │                                        │ Valida y sanitiza respuesta
    │                                        └─► ClassifiedResponse (summary + preguntas)
    │
    ├─ POST /api/intake/confirm  ─────► [Auth Plugin] → RedmineClient
    │   action='confirm'                     │ Sube adjuntos secuencialmente → tokens
    │   (requiere company en token)          │ Compone ticket (asunto + descripción + custom fields)
    │                                        └─► ticket_id + ticket_url
    │
    ├─ POST /api/intake/confirm  ─────► [Auth Plugin] → ClassifierService (re-classify)
    │   action='edit'
    │
    ├─ GET/PUT /api/config/:file ─────► ConfigRoutes
    │   (requiere admin o superadmin)        └─► Lee/escribe taxonomy, redmine-mapping, assignment-rules
    │
    ├─ GET/POST/PATCH/DELETE     ─────► AdminRoutes
    │   /api/admin/users|companies           └─► CRUD usuarios y empresas en IdentityStore
    │
    └─ GET /api/metrics ──────────────► EventStore (SQLite)
                                             └─► métricas del piloto
```

### Patrón de estado del backend

El backend mantiene un `Map<session_id, SessionState>` en memoria. Cada sesión guarda:
- `intake`: payload original del usuario
- `classification`: última clasificación del LLM
- `attempt`: número de re-clasificaciones

El session_id lo genera el frontend (UUID v4) y viaja en cada request.

El auth plugin (`plugins/auth.ts`) decora cada request con:
- `request.auth`: `AccessTokenPayload | null`
- `request.requireAuth()`: lanza 401 si no hay token válido
- `request.requireCompany()`: lanza 403 si no hay company_id en el token

---

## Archivos clave — qué hacen exactamente

### `backend/src/types.ts`
**Los contratos de datos del sistema de intake.** Define todos los tipos TypeScript:
- `Nature` — 10 valores posibles del tipo de problema
- `Domain` — 19 valores del área de negocio afectada
- `Solution` — 10 productos de Cobertec posibles
- `ExpertisModule` — 12 módulos del ERP
- `Classification`, `ClassificationResponse` — salida del LLM
- `IntakePayload`, `ConfirmationPayload` — entradas del usuario
- `IntakeResponse` (union: `ClassifiedResponse | CreatedResponse | ErrorResponse`) — respuesta del backend al frontend
- `IntakeEvent`, `EventType` — eventos del event store

**Regla importante:** frontend (`frontend/src/types.ts`) es un subconjunto espejo de este archivo. Si cambias los contratos en backend, actualizar frontend también.

### `backend/src/identity-types.ts`
**Los contratos de datos del sistema de identidad y auth.** Define:
- `Contact`, `User`, `Company`, `UserCompany` — entidades de la base de datos de identidad
- `CompanyDTO`, `MeResponse` — DTOs de salida de la API
- `TokenRequestSchema` — schema Zod discriminado (grant_type: 'password' | 'refresh_token')
- `SelectCompanyRequestSchema` — schema Zod para selección de empresa
- `LoginResponse`, `SelectCompanyResponse`, `RefreshResponse` — respuestas de auth
- `AccessTokenPayload`, `RefreshTokenPayload` — contenido del JWT
- `AuthErrorCode`, `AuthError` — errores tipados

**Regla importante:** `frontend/src/auth-types.ts` es espejo de este archivo. Cambios aquí → actualizar también en frontend.

### `backend/src/plugins/auth.ts`
Plugin Fastify registrado globalmente (antes de las rutas). En cada request:
1. Extrae el JWT del header `Authorization: Bearer <token>`
2. Lo verifica con `verifyAccessToken()` — pone el payload en `request.auth` o null si inválido
3. Decora el request con `requireAuth()` y `requireCompany()` para uso desde los handlers
4. Registra un error handler global para `AuthServiceError` → responde JSON con código y status HTTP

### `backend/src/services/auth/service.ts`
Lógica de auth pura. Cuatro operaciones:
- `login(email, password)` → verifica credenciales en IdentityStore, emite access_token (sin company) + refresh token
- `selectCompany(currentToken, companyId)` → verifica que el user pertenece a esa company, emite nuevo access_token (con company_id + company_name embebidos)
- `refresh(refreshTokenRaw)` → verifica refresh token en BD, rota (borra viejo, emite nuevo), devuelve nuevo access_token
- `logout(refreshTokenRaw)` → borra refresh token de BD

Notas de seguridad:
- bcrypt 12 rounds
- Refresh tokens almacenados como hashes SHA-256 (nunca el token raw)
- Rotación en cada refresh (token reuse detection: si el hash no existe, revoca todos los del usuario)
- `JWT_SECRET` debe ser distinto del dev default en producción (el código lanza Error si no)

### `backend/src/services/identity/store.ts`
`IdentityStore` — clase SQLite (better-sqlite3) con 5 tablas:
- `contacts`: name, email (UNIQUE COLLATE NOCASE), phone, whatsapp
- `users`: contact_id (FK), password_hash, active (int 0/1), last_login
- `companies`: name, redmine_project_id, active
- `user_companies`: (user_id, company_id) PK, role ('user'|'admin')
- `refresh_tokens`: token_hash PK, user_id FK, expires_at

Métodos principales: `getUserByEmail()`, `getCompaniesForUser()`, `isUserInCompany()`, `storeRefreshToken()`, `getRefreshToken()`, `deleteRefreshToken()`, `pruneExpiredTokens()` (se invoca en `index.ts` al arrancar el servidor).

Singleton: `getIdentityStore()` devuelve instancia cacheada. El path de la DB viene de `process.env.IDENTITY_DB_PATH` (se setea en `index.ts` a `data/identity.db`).

### `backend/src/routes/auth.ts`
Tres endpoints bajo `/api/auth` (estilo OAuth 2.0):
- `POST /token` — endpoint unificado con discriminación por `grant_type`:
  - `grant_type: 'password'` → valida email+password con Zod, llama `login()`, setea cookie httpOnly
  - `grant_type: 'refresh_token'` → lee cookie `cobertec_refresh`, llama `refresh()`, rota cookie
- `POST /select` — requiere `request.requireAuth()`, valida con Zod, llama `selectCompany()`
- `POST /logout` — llama `logout()`, limpia cookie con `clearCookie()`

Cookie: `httpOnly: true`, `secure: true` solo en producción, `sameSite: 'strict'` en prod / `'lax'` en dev, `path: '/api/auth'`, `maxAge: 7d`.

### `backend/src/routes/identity.ts`
Un endpoint: `GET /api/identity/me`. Requiere auth. Consulta IdentityStore para armar `MeResponse` con user_id, is_superadmin, contact, empresa actual (del token) y lista de empresas disponibles.

### `backend/src/routes/admin.ts`
CRUD de usuarios y empresas bajo `/api/admin`. Requiere rol `admin` o `superadmin`:
- `GET /users` — lista todos los usuarios con sus empresas asignadas
- `POST /users` — crea contacto + usuario + asigna empresa(s); verifica email duplicado
- `PATCH /users/:id` — edita nombre, email, teléfono, activo, contraseña; verifica email duplicado
- `DELETE /users/:id` — soft delete (marca `active=false`); no borra de la BD
- `POST /users/:id/companies` — asigna una empresa a un usuario con rol ('user'|'admin')
- `DELETE /users/:id/companies/:companyId` — desasigna empresa
- `GET /companies` — lista todas las empresas
- `POST /companies` — crea empresa con `redmine_project_id` opcional
- `PATCH /companies/:id` — edita nombre, redmine_project_id, activo

El guard `requireAdmin()` verifica `IdentityStore.isAdmin(auth.sub)`. Los superadmin también pasan este guard.

### `backend/src/routes/config.ts`
Gestión de la configuración externalizada bajo `/api/config`. Solo accesible a admins (o superadmin):
- `GET /config/:file` — lee y devuelve el JSON del disco (taxonomy, redmine-mapping, assignment-rules)
- `PUT /config/:file` — valida estructura mínima, hace backup del fichero anterior, sobreescribe

Validación superficial de estructura (solo verifica claves de primer nivel). El archivo editado entra en efecto en la próxima llamada a `reloadConfig()`.

### `backend/src/routes/intake.ts`
Dos rutas principales:
- `POST /api/intake/submit` — valida payload, llama classifier, genera preguntas dinámicas, guarda en session store, devuelve `ClassifiedResponse`
- `POST /api/intake/confirm` — si `action='edit'`: re-clasifica; si `action='confirm'`: crea ticket en Redmine y limpia sesión

Ambas rutas llaman `request.requireCompany()` — el intake requiere un token JWT con empresa seleccionada. El `user_id`, `company_id` y `company_name` del payload se sobreescriben siempre con los valores del token (nunca se confía en el body del cliente).

### `backend/scripts/seed-identity.ts`
Script de desarrollo para poblar `identity.db` con datos de prueba. Crea 2 empresas y 3 usuarios (contraseña: `test1234`). Ejecutar desde el directorio `backend/`:
```bash
cd backend && npx tsx scripts/seed-identity.ts
```

### `backend/src/services/classifier/prompt-builder.ts`
Construye dos prompts:
1. **System prompt** — vuelca taxonomy completa + need_resolution + assignment roles
2. **User prompt** — descripción del usuario + company_name + lista de adjuntos

### `backend/src/services/classifier/response-validator.ts`
Valida la respuesta JSON del LLM con Zod. También aplica **coherencia**:
- `confidence:high` → fuerza `review_status:'auto_ok'`
- `confidence:low` → fuerza `review_status:'review_recommended'` como mínimo
- Si el JSON falla parsing → genera una clasificación fallback (ambiguo, low confidence, human_required)

### `backend/src/services/redmine/index.ts`
Dos implementaciones de la misma interfaz:
- `RedmineClient` — real, usa `REDMINE_URL` + `REDMINE_API_KEY`
- `SimulatedRedmineClient` — devuelve tickets ficticios (se activa si no hay env vars de Redmine)

### `backend/src/services/events/index.ts`
Event store SQLite con 10 tipos de evento. Cada evento tiene:
- `event_id` (UUID), `event_type`, `session_id`, `timestamp`, `data` (JSON flexible)

### `frontend/src/auth-types.ts`
Espejo frontend de `backend/src/identity-types.ts`. Incluye: `CompanyDTO`, `LoginRequest/Response`, `SelectCompanyRequest/Response`, `RefreshResponse`, `MeResponse`, `AuthError`, `AuthState`.

### `frontend/src/contexts/AuthContext.tsx`
React Context con estado de auth global. Al montar, intenta refresh silencioso (cookie → nuevo access_token → fetch `/identity/me`). Si el usuario tiene solo 1 empresa, la auto-selecciona. Si el refresh falla, el usuario está `'unauthenticated'`.

Expone: `authState` (status + user + selectedCompany), `isLoading`, `error`, `login()`, `selectCompany()`, `logout()`.

### `frontend/src/services/auth-api.ts`
Wrapper de fetch para llamadas a `/api/auth/*` y `/api/identity/*`:
- `accessToken` en memoria (no localStorage)
- `authFetch<T>()`: añade header `Authorization: Bearer` si hay token, lanza `AuthApiError` si falla
- `authenticatedFetch<T>()`: auto-retry con refresh en caso de 401
- Funciones: `loginApi()`, `selectCompanyApi()`, `refreshToken()`, `logoutApi()`, `fetchMe()`

---

## Estado actual del frontend

| Componente | Estado | Notas |
|---|---|---|
| `frontend/src/contexts/AuthContext.tsx` | Completo | Lógica de estado, refresh silencioso, superadmin |
| `frontend/src/services/auth-api.ts` | Completo | Cliente API con auto-refresh, token en memoria |
| `frontend/src/services/api.ts` | Completo | submitIntake, confirmIntake, fileToAttachment |
| `frontend/src/services/admin-api.ts` | Completo | CRUD usuarios/empresas para AdminPanel |
| `frontend/src/services/metrics.ts` | Completo | GET /metrics, /metrics/recent |
| `frontend/src/auth-types.ts` | Completo | Tipos espejo del backend |
| `frontend/src/types.ts` | Completo | Tipos de intake espejo del backend |
| `frontend/src/main.tsx` | Completo | `<AuthProvider>` envuelve `<App />` |
| `frontend/src/App.tsx` | Completo | Máquina de estados: flujo auth + páginas (intake, dashboard, admin, config) |
| `frontend/src/components/LoginPage.tsx` | Completo | Formulario email+contraseña, validación local y errores de servidor |
| `frontend/src/components/CompanySelector.tsx` | Completo | Selector multi-empresa con opción de logout |
| `frontend/src/components/IntakeForm.tsx` | Completo | Textarea + subida archivos; validación mín. 10 chars |
| `frontend/src/components/DynamicQuestions.tsx` | Completo | Preguntas opcionales (opciones o texto libre); Skip disponible |
| `frontend/src/components/ConfirmationView.tsx` | Completo | Resumen, área estimada, badge de impacto, lista adjuntos |
| `frontend/src/components/TicketResult.tsx` | Completo | Pantalla éxito: ticket_id + ticket_url |
| `frontend/src/components/ErrorDisplay.tsx` | Completo | Mensaje de error + botones Reintentar / Nueva incidencia |
| `frontend/src/components/Dashboard.tsx` | Completo | Métricas piloto: totales, tasa completado, distribución confianza |
| `frontend/src/components/AdminPanel.tsx` | Completo | CRUD usuarios y empresas para admins |
| `frontend/src/components/StepIndicator.tsx` | Completo | Indicador visual de progreso (breadcrumb) |
| `frontend/src/components/Loading.tsx` | Completo | Spinner con mensaje |
| `frontend/src/pages/ConfigPanel.tsx` | Completo | Editor JSON de los tres ficheros de config (solo admin/superadmin) |

---

## Modelo de datos central

```typescript
// ─── AUTH / IDENTITY ─────────────────────────────────────

// Payload del JWT (access token)
interface AccessTokenPayload {
  sub: string;            // user_id
  contact_id: string;
  company_id: string | null;   // null hasta que el usuario seleccione empresa
  company_name: string | null;
  type: 'access';
}

// Respuesta a GET /identity/me
interface MeResponse {
  user_id: string;
  is_superadmin: boolean;  // ← admin global de Cobertec (acceso total sin empresa)
  contact: { name: string; email: string; phone: string | null; };
  company: CompanyDTO | null;   // empresa actualmente seleccionada (del token)
  companies: CompanyDTO[];      // todas las empresas a las que tiene acceso
}

// Estado de auth en el frontend
interface AuthState {
  status: 'unauthenticated' | 'authenticated' | 'company_selected';
  accessToken: string | null;
  user: MeResponse | null;
  selectedCompany: CompanyDTO | null;
}

// ─── INTAKE ──────────────────────────────────────────────

// Entrada del usuario (body del POST /submit)
interface IntakePayload {
  session_id: string;      // UUID generado por frontend
  user_id: string;         // debe venir del JWT, no del body
  company_id: string;      // debe venir del JWT, no del body
  company_name: string;    // debe venir del JWT, no del body
  description: string;     // texto libre, mínimo 10 chars
  attachments: Attachment[]; // base64
  timestamp: string;
}

// Salida del LLM (tipo real en backend/src/types.ts)
// ¡ATENCIÓN: nature y domain están anidados en el sub-objeto classification!
interface ClassificationResponse {
  session_id: string;
  summary: string;
  classification: {          // ← sub-objeto con la clasificación semántica
    nature: Nature;
    domain: string;
    object: string;
    action: string;
  };
  solution_associated: Solution;
  expertis_module: ExpertisModule | null;
  redmine_mapping: { block: string; module: string; need: string; };
  confidence: Confidence;
  review_status: ReviewStatus;
  suggested_priority: Priority;
  suggested_assignee: string | null;
  reasoning: string;
}
```

---

## Flujo de datos end-to-end (con auth)

```
0. (Al cargar la SPA) AuthContext intenta refresh silencioso:
   POST /api/auth/token { grant_type: 'refresh_token' } (usa cookie automáticamente)
   → nuevo access_token → GET /api/identity/me
   Si éxito y hay 1 empresa → status='company_selected'
   Si is_superadmin → status='company_selected' (sin empresa, acceso total)
   Si falla → status='unauthenticated' → mostrar login

1. Usuario hace login:
   POST /api/auth/token { grant_type: 'password', email, password }
   → access_token (sin company) + refresh cookie + companies[]
   → Si 1 empresa: auto POST /api/auth/select → access_token (con company)
   → Si varias: mostrar selector
   → Si superadmin: salta selector, accede directamente

2. POST /api/intake/submit:
   Authorization: Bearer <token-con-company>
   { session_id, user_id, company_id, description, attachments }
   
   Backend:
   → [Auth Plugin] verifica JWT → request.auth con company_id garantizado
   → requireCompany() valida que el token incluye empresa
   → loader.ts carga taxonomy + redmine-mapping + assignment-rules
   → prompt-builder construye system prompt
   → LLM call con timeout 15s
   → response-validator valida JSON + aplica coherencia
   → dynamic-questions genera 0-2 preguntas
   → Guarda { intake, classification, attempt:1 } en session Map
   → Devuelve ClassifiedResponse

3. Frontend muestra preguntas → usuario responde o salta
   Frontend muestra ConfirmationView

4. POST /api/intake/confirm { action: 'edit' }:
   → Actualiza description → Re-clasifica → Devuelve ClassifiedResponse

4b. POST /api/intake/confirm { action: 'confirm' }:
   → Sube adjuntos a Redmine → ticket-composer → POST /issues.json
   → Loguea event: ticket_created → Borra sesión
   → Devuelve CreatedResponse { ticket_id, ticket_url }

5. Frontend muestra TicketResult
```

---

## Convenciones y decisiones de diseño

1. **Config externalizada** — Toda lógica de negocio vive en `/config/*.json`. Cambiar comportamiento = cambiar JSON, no código.

2. **Abstracción LLM** — La interfaz `LLMProvider` define solo `name` y `call()`. Intercambiable por env var `LLM_PROVIDER`.

3. **Singleton lazy** — `getClassifier()`, `getRedmineClient()`, `getConfigLoader()`, `getIdentityStore()` devuelven instancias cacheadas.

4. **Fallback siempre disponible** — Si el LLM falla, `response-validator.ts` genera clasificación fallback.

5. **SimulatedRedmineClient** — Si no hay env vars de Redmine, el cliente simulado actúa. Permite desarrollar sin acceso a Redmine.

6. **Session store en memoria** — Intencionadamente simple (Map). Dura solo mientras el usuario completa el flujo.

7. **Event store SQLite** — Solo para métricas del piloto. No es la fuente de verdad (Redmine lo es).

8. **Identity store SQLite** — Fuente de verdad de usuarios, empresas y refresh tokens. Persiste en `data/identity.db`.

9. **Access token sin company hasta select** — El token de login nunca incluye company_id. El usuario debe llamar `/auth/select` para embeber la empresa. Esto permite multi-empresa en el mismo token.

10. **TypeScript strict** — Ambos proyectos usan `"strict": true`. No usar `any` sin justificación.

---

## Bugs resueltos (referencia histórica)

Estos problemas ya han sido corregidos:

1. ~~`frontend/src/main.tsx` — Falta `<AuthProvider>`~~ — **Resuelto**: `<AuthProvider>` envuelve `<App />`.
2. ~~`frontend/src/App.tsx` — Usa `PLACEHOLDER_USER`~~ — **Resuelto**: usa `useAuth()` con flujo de 3 estados.
3. ~~`backend/src/routes/intake.ts` — Sin `requireCompany()`~~ — **Resuelto**: ambas rutas llaman `requireCompany()`.
4. ~~No existe `LoginPage.tsx`~~ — **Resuelto**: componente creado en `frontend/src/components/`.
5. ~~No existe `CompanySelector.tsx`~~ — **Resuelto**: componente creado en `frontend/src/components/`.
6. ~~`pruneExpiredTokens()` nunca se llama~~ — **Resuelto**: se invoca en `backend/src/index.ts` al arrancar.

---

## Pendientes críticos (`__PENDIENTE__`)

Estos valores en `config/redmine-mapping.json` bloquean la integración real con Redmine:

```json
{
  "custom_fields": {
    "nature": "__PENDIENTE__",
    "solution_associated": "__PENDIENTE__",
    "expertis_module": "__PENDIENTE__",
    "block": "__PENDIENTE__",
    "module": "__PENDIENTE__",
    "need": "__PENDIENTE__",
    "confidence": "__PENDIENTE__",
    "review_status": "__PENDIENTE__"
  },
  "priority_mapping": {
    "normal": "__PENDIENTE__",
    "high": "__PENDIENTE__",
    "urgent": "__PENDIENTE__"
  },
  "tracker_id": "__PENDIENTE__",
  "status_id_initial": "__PENDIENTE__",
  "company_to_project": {
    "_default": "__PENDIENTE__"
  }
}
```

Para completarlos: pedir a Cobertec acceso a su instancia de Redmine y extraer los IDs con la API.

También falta en `redmine_defaults`:
- **`default_assignee_id`** — referenciado en `redmine/index.ts` como fallback del assignee pero no está definido en el JSON. Mientras no exista, los tickets se crearán sin asignar cuando `suggested_assignee` sea null.

---

## Errores y mejoras detectadas en la revisión

### Errores de documentación corregidos en este archivo

1. ~~Endpoints de auth documentados como `/login` y `/refresh` separados~~ — **Corregido**: el endpoint real es `POST /auth/token` con `grant_type` para ambos casos.
2. ~~`MeResponse` sin campo `is_superadmin`~~ — **Corregido**: añadido en el modelo de datos.
3. ~~`ClassificationResponse` con `nature`/`domain` en el nivel raíz~~ — **Corregido**: están dentro del sub-objeto `classification: { nature, domain, object, action }`.
4. ~~"Estado actual del frontend" incompleto~~ — **Corregido**: tabla ampliada con todos los componentes.
5. ~~Admin y config routes no documentadas~~ — **Corregido**: añadidas secciones para `admin.ts` y `config.ts`.

### Mejoras pendientes antes de producción

| Prioridad | Área | Descripción |
|-----------|------|-------------|
| **Alta** | Config | Completar todos los `__PENDIENTE__` con IDs reales de Redmine |
| **Alta** | Config | Definir `redmine_defaults.default_assignee_id` en redmine-mapping.json |
| **Alta** | Backend | Session store en memoria (Map) → migrar a SQLite o Redis antes de producción para sobrevivir reinicios |
| **Media** | Backend | Subida de adjuntos secuencial en `RedmineClient.uploadAttachments()` → paralelizar con `Promise.all()` |
| **Media** | Backend | `config.ts` mezcla tabs y espacios en la indentación (líneas 24-33, 49-58) — formatear con Prettier |
| **Media** | Frontend | Llamadas a `submitIntake`/`confirmIntake` sin timeout explícito — añadir `AbortController` |
| **Baja** | Auth | El guard de admin en `admin.ts` usa `isAdmin()` pero la función real comprueba sólo el rol en `user_companies`; los superadmin necesitan el guard `isSuperAdmin()` también (ya gestionado en la función) |

---

## Estrategia de integración Redmine

**El backend y frontend se finalizan primero**, sin tocar Redmine en producción. La integración real con Redmine es Fase 2. Durante el desarrollo, `SimulatedRedmineClient` cubre el flujo completo.

---

## Cómo arrancar en desarrollo

```bash
# Terminal 1 — Backend
cd backend
# Crear backend/.env con: LLM_PROVIDER=openai, OPENAI_API_KEY=sk-..., PORT=3001, JWT_SECRET=dev-secret
npm install
npx tsx scripts/seed-identity.ts   # Solo la primera vez
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# Abre http://localhost:5173
```

### Variables de entorno backend

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | `3001` |
| `LLM_PROVIDER` | `anthropic` o `openai` | — |
| `ANTHROPIC_API_KEY` | API key Anthropic | — |
| `OPENAI_API_KEY` | API key OpenAI | — |
| `REDMINE_URL` | URL base de Redmine | — |
| `REDMINE_API_KEY` | API key Redmine | — |
| `JWT_SECRET` | Secreto JWT (¡obligatorio en prod!) | dev-secret |
| `ACCESS_TOKEN_TTL` | Duración access token | `15m` |
| `IDENTITY_DB_PATH` | Ruta DB de identidad | `data/identity.db` |
| `CLASSIFIER_TIMEOUT_MS` | Timeout llamada LLM | `15000` |
| `BODY_LIMIT_MB` | Tamaño máximo request | `10` |
| `CORS_ORIGIN` | Origen CORS permitido | `http://localhost:5173` |

---

## Dónde añadir cosas

| Necesidad | Dónde |
|---|---|
| Nueva naturaleza o dominio | `config/taxonomy.json` |
| Nueva regla de need | `config/redmine-mapping.json` → `need_resolution` |
| Nueva regla de asignación | `config/assignment-rules.json` |
| Nuevo proveedor LLM | `backend/src/services/classifier/provider-*.ts` + factory en `index.ts` |
| Nuevo campo custom en ticket | `redmine-mapping.json` → `custom_fields` + `ticket-composer.ts` |
| Nuevo componente UI | `frontend/src/components/` |
| Nuevo endpoint | `backend/src/routes/` + registro en `index.ts` |
| Nuevo usuario/empresa | `backend/scripts/seed-identity.ts` o vía AdminPanel → `POST /api/admin/users` |
| Gestionar usuarios en producción | `frontend/src/pages/ConfigPanel.tsx` (admin/superadmin) o `GET/POST /api/admin/*` |

---

## Tipos de Nature (los 10 posibles)

| ID | Etiqueta |
|---|---|
| `incidencia_error` | Sistema roto, error explícito |
| `consulta_funcional` | "¿Por qué funciona así?" |
| `formacion_duda_uso` | "¿Cómo hago X?" |
| `configuracion` | Alta de usuario, parámetros, permisos |
| `peticion_cambio_mejora` | Campo nuevo, informe, mejora |
| `usuario_acceso` | Login, licencias, contraseña |
| `instalacion_entorno` | Instalación, VPN, entorno |
| `importacion_exportacion` | Migración de datos |
| `rendimiento_bloqueo` | Lentitud, cuelgues, rendimiento |
| `ambiguo` | No clasificable |

## Dominios principales (19 total)

`funcionamiento_general`, `compras`, `ventas_facturacion`, `almacen_stocks`, `gmao`, `movilsat`, `portal_ot`, `presupuestos_proyectos`, `financiero`, `crm`, `ofertas_comerciales`, `planificador_inteligente`, `app_fichajes`, `servidor_sistemas`, `tarifas_catalogos`, `usuarios_accesos`, `informes_documentos`, `sesiones_conectividad`, `solucionesia`, `dominio_no_claro`
