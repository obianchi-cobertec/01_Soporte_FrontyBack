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
    │   action='confirm'                     │ Sube adjuntos en paralelo (Promise.all) → tokens
    │   (requiere company en token)          │ Resuelve asignado: role_to_user_id lookup
    │                                        │ Compone ticket (asunto + descripción + custom fields)
    │                                        │ Impersona usuario Redmine si tiene redmine_login
    │                                        └─► ticket_id + ticket_url
    │
    ├─ POST /api/intake/confirm  ─────► [Auth Plugin] → ClassifierService (re-classify)
    │   action='edit'
    │
    ├─ GET /api/config/redmine-users ──► Llama Redmine API, filtra @cobertec.com
    │   (requiere admin o superadmin)        └─► Lista de usuarios internos con id, login, name
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

## Workflow de desarrollo

### Antes de tocar código
- Confirmar el enfoque en Claude.ai si la feature afecta contratos de tipos o arquitectura
- Si hay cambios en `types.ts` o `identity-types.ts`, actualizar SIEMPRE el espejo frontend

### Comandos frecuentes
- `cd backend && npm run dev` — arrancar backend
- `cd frontend && npm run dev` — arrancar frontend  
- `cd backend && npx tsx scripts/<script>.ts` — ejecutar scripts one-shot

---

## Archivos clave — qué hacen exactamente

### `backend/src/types.ts`
**Los contratos de datos del sistema de intake.** Define todos los tipos TypeScript:
- `Nature` — 10 valores posibles del tipo de problema
- `Domain` — 21 valores del área de negocio afectada (incluyendo `academia_cobertec` y `ecommerce_web` recientes)
- `Solution` — 12 productos de Cobertec posibles (incluyendo Academia Cobertec y Ecommerce/Web)
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
- `LoginRequestSchema` — **@deprecated**, usar `TokenRequestSchema` con `grant_type: 'password'`

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
- `users`: contact_id (FK), password_hash, active (int 0/1), is_superadmin (int 0/1), last_login, **redmine_login** (TEXT, nullable — para impersonation)
- `companies`: name, redmine_project_id, active
- `user_companies`: (user_id, company_id) PK, role ('user'|'admin')
- `refresh_tokens`: token_hash PK, user_id FK, expires_at

Métodos principales:
- `getUserByEmail()`, `getUserById()`, `createUser()`, `updateUserActive()`, `updateUserPassword()`
- `getCompaniesForUser()` — para superadmin devuelve TODAS las empresas activas
- `isUserInCompany()` — superadmin siempre retorna true
- `getUserCompanyRole()` — superadmin siempre retorna 'admin'
- `isAdmin()` — true si es superadmin O tiene rol 'admin' en cualquier empresa
- `isSuperAdmin()` — comprueba flag is_superadmin en users
- `getRedmineLogin(userId)` — devuelve el login de Redmine del usuario (para impersonación vía `X-Redmine-Switch-User`). **El campo existe en BD pero nunca se escribe actualmente.**
- `listUsers()`, `listCompanies()` — queries de admin con JOINs
- `storeRefreshToken()`, `getRefreshToken()`, `deleteRefreshToken()`, `deleteRefreshTokensForUser()`, `pruneExpiredTokens()`

Singleton: `getIdentityStore()` devuelve instancia cacheada. El path de la DB viene de `process.env.IDENTITY_DB_PATH` (se setea en `index.ts` a `data/identity.db`).

Las columnas `is_superadmin` y `redmine_login` se añaden mediante migración no destructiva (`ALTER TABLE ... ADD COLUMN`) en el constructor, por lo que son seguras de aplicar sobre BDs existentes.

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
- `PUT /config/:file` — valida estructura mínima, hace backup automático (`.bak`), sobreescribe
- `GET /config/redmine-users` — **nuevo**: llama a la API de Redmine (`/users.json`), filtra solo los usuarios con email `@cobertec.com`, devuelve `{ id, login, name }[]` para uso en el ConfigPanel. Requiere `REDMINE_URL` y `REDMINE_API_KEY` configurados; si no están, devuelve 503.

Validación superficial de estructura (solo verifica claves de primer nivel). El archivo editado entra en efecto en la próxima llamada a `reloadConfig()`.

**Nota:** hay `console.log('[config GET] Reading:', filePath)` tanto en el GET como en el PUT — son debug logs a eliminar antes de producción.

### `backend/src/routes/intake.ts`
Dos rutas principales:
- `POST /api/intake/submit` — valida payload, llama classifier, genera preguntas dinámicas, guarda en session store, devuelve `ClassifiedResponse`
- `POST /api/intake/confirm` — si `action='edit'`: re-clasifica; si `action='confirm'`: crea ticket en Redmine y limpia sesión

Ambas rutas llaman `request.requireCompany()` — el intake requiere un token JWT con empresa seleccionada. El `user_id`, `company_id` y `company_name` del payload se sobreescriben siempre con los valores del token (nunca se confía en el body del cliente).

**Nota:** hay debug `console.log` en las líneas 262-266 y 293 que imprimen datos de clasificación y errores Redmine. Eliminar antes de producción.

### `backend/scripts/` — Scripts de utilidad

| Script | Descripción |
|--------|-------------|
| `seed-identity.ts` | Crea 2 empresas y 3 usuarios de prueba (contraseña: `test1234`). Solo para desarrollo. |
| `add-test-user.ts` | Añade un usuario de prueba concreto a la BD. Utility de dev. |
| `check-db.ts` | Diagnóstico rápido: lista tablas y conteos de la identity.db. |
| `check-schema.ts` | Verifica que el esquema de la BD tiene todas las columnas esperadas. |
| `import-redmine-clients.ts` | **Script de producción**: importa proyectos de Redmine como empresas en identity.db, con mapeo `redmine_project_id`. Usa los JSON en `scripts/redmine_*.json` como fuente. |
| `import-new-projects.ts` | **Script de producción**: importa nuevos proyectos/clientes de Redmine que aún no existen en la BD. |

Los archivos `redmine_*.json` en `backend/scripts/` son volcados de la API de Redmine usados durante la importación. **No deben commitearse** (añadir a `.gitignore`).

Ejecutar cualquier script desde el directorio `backend/`:
```bash
cd backend && npx tsx scripts/<nombre>.ts
```

### `backend/src/services/classifier/prompt-builder.ts`
Construye dos prompts:
1. **System prompt** — vuelca taxonomy completa (nature + domain con keywords, ejemplos, reglas) + need_resolution + assignment roles
2. **User prompt** — descripción del usuario + company_name + lista de adjuntos

### `backend/src/services/classifier/response-validator.ts`
Valida la respuesta JSON del LLM con Zod. También aplica **coherencia**:
- `confidence:high` → fuerza `review_status:'auto_ok'`
- `confidence:low` → fuerza `review_status:'review_recommended'` como mínimo
- Si el JSON falla parsing → genera una clasificación fallback (ambiguo, low confidence, human_required)

### `backend/src/services/redmine/index.ts`
Dos implementaciones del cliente Redmine:

**`RedmineClient`** (real, con `REDMINE_URL` + `REDMINE_API_KEY`):
- `createTicket(intake, classification)`: orquesta el flujo completo de creación
  1. `uploadAttachments()` — sube todos los adjuntos **en paralelo** (`Promise.all`); los que fallan se omiten
  2. Resuelve el `projectId` via `mapping.company_to_project[intake.company_id]` → fallback `_default` → fallback hardcoded `'cobertec-intake-test'`
  3. `buildIssuePayload()` — construye el payload completo:
     - Normaliza `solution_associated` con tabla `SOLUTION_NORMALIZE` (ej: 'Expertis / Movilsat ERP' → 'expertis')
     - Normaliza `expertis_module` con tabla `MODULE_NORMALIZE`
     - Resuelve assignee: `role_to_user_id[classification.suggested_assignee]` → fallback `default_assignee_id`; si ambos null, el ticket se crea sin asignar
     - Construye array de `custom_fields` usando los IDs del config (`mapping.custom_fields.*.id`)
  4. `postIssue()` — POST a `/issues.json`; si el usuario tiene `redmine_login`, añade header `X-Redmine-Switch-User` para impersonación

**`SimulatedRedmineClient`**: devuelve tickets ficticios con IDs incrementales a partir de 1000. Se activa automáticamente si no están configuradas `REDMINE_URL`/`REDMINE_API_KEY`.

**`resetRedmineClient()`**: utility para tests, resetea la instancia singleton.

### `backend/src/services/redmine/ticket-composer.ts`
Formatea asunto y descripción del ticket:
- `composeSubject(classification)`: genera asunto limpio:
  - `stripSubject()` elimina prefijos en tercera persona que el LLM puede añadir ("El cliente no puede…" → "…")
  - Añade prefijo `[REVISIÓN]` si `confidence: 'low'` o `review_status` es `'out_of_map'` / `'human_required'`
  - Trunca a 80 chars (72 si lleva prefijo)
- `composeDescription(intake, classification)`: estructura markdown con sección "Descripción original" + "Resumen operativo (IA)" + conteo de adjuntos

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
| `frontend/src/pages/ConfigPanel.tsx` | Completo* | Panel de 5 pestañas: Taxonomía / Soluciones / Necesidades / Asignación / Redmine. Ver nota. |

**Nota sobre ConfigPanel:** Es un editor visual estructurado completo (no raw JSON). Las 5 pestañas mapean a los tres JSON de config. La pestaña "Redmine" carga usuarios reales de Redmine via `GET /config/redmine-users` para asignar `role_to_user_id` con selector dropdown. Tiene dos bugs menores de TypeScript (ver sección "Bugs conocidos activos").

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
   → Sube adjuntos en paralelo a Redmine → ticket-composer → POST /issues.json
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

6. **Session store en memoria** — Intencionadamente simple (Map). Dura solo mientras el usuario completa el flujo. **Pendiente de migrar a SQLite antes de producción.**

7. **Event store SQLite** — Solo para métricas del piloto. No es la fuente de verdad (Redmine lo es).

8. **Identity store SQLite** — Fuente de verdad de usuarios, empresas y refresh tokens. Persiste en `data/identity.db`.

9. **Access token sin company hasta select** — El token de login nunca incluye company_id. El usuario debe llamar `/auth/select` para embeber la empresa. Esto permite multi-empresa en el mismo token.

10. **TypeScript strict** — Ambos proyectos usan `"strict": true`. No usar `any` sin justificación.

---

## Estado de la integración Redmine

La integración con Redmine está **sustancialmente completada** en config pero aún requiere validación en producción.

### Mapeados y resueltos

- **Custom fields IDs** — IDs 21-28 configurados en `redmine-mapping.json` → `custom_fields`
- **Priority mapping** — `normal→4`, `high→5`, `urgent→5`
- **Tracker y estado inicial** — `tracker_id: 3`, `status_id_initial: 1`
- **Asignados** — `role_to_user_id` con ~40 roles mapeados a IDs numéricos de Redmine
- **Company → Project** — ~120 empresas cliente mapeadas a sus proyectos Redmine reales

### Aún pendientes

| Ítem | Estado | Impacto |
|------|--------|---------|
| `redmine_defaults.default_assignee_id` | `null` en config | Si `role_to_user_id` no resuelve el assignee, el ticket se crea **sin asignar** |
| `company_to_project._default` | apunta a `"cobertec-intake-test"` | Las empresas sin mapeo explícito van al proyecto de prueba |
| `users.redmine_login` | columna existe pero nunca se escribe | La impersonación vía `X-Redmine-Switch-User` nunca se activa |
| Validación E2E en Redmine real | No realizada | Los IDs de custom fields (21-28) deben verificarse contra la instancia real |

---

## Bugs conocidos activos

No hay bugs activos rastreados en este momento.

---

## Bugs resueltos (referencia histórica)

1. ~~`frontend/src/main.tsx` — Falta `<AuthProvider>`~~ — **Resuelto**
2. ~~`frontend/src/App.tsx` — Usa `PLACEHOLDER_USER`~~ — **Resuelto**
3. ~~`backend/src/routes/intake.ts` — Sin `requireCompany()`~~ — **Resuelto**
4. ~~No existe `LoginPage.tsx`~~ — **Resuelto**
5. ~~No existe `CompanySelector.tsx`~~ — **Resuelto**
6. ~~`pruneExpiredTokens()` nunca se llama~~ — **Resuelto**
7. ~~Subida de adjuntos secuencial~~ — **Resuelto**: `Promise.all` en `uploadAttachments()`
8. ~~Custom fields `__PENDIENTE__`~~ — **Resuelto**: IDs 21-28 configurados
9. ~~`role_to_user_id` no existe en config~~ — **Resuelto**: tabla completa con ~40 roles
10. ~~Debug `console.log` en `intake.ts`, `config.ts`, `redmine/index.ts`, `auth.ts`~~ — **Resuelto**: eliminados todos
11. ~~TypeScript: props extra en `<RedmineTab>`, `redmineUsers` state muerto, null access en `assignmentRules`~~ — **Resuelto**: `redmineUsers` eliminado del padre, props extra quitadas de la llamada
12. ~~`any` cast en `redmine/index.ts` — `(mapping as any).role_to_user_id`~~ — **Resuelto**: `role_to_user_id` tipado en `RedmineMappingConfig`, guard `!= null` antes de indexar
13. ~~Sin rate limiting en `POST /api/auth/token`~~ — **Resuelto**: `@fastify/rate-limit` registrado, límite 10 req/min por IP

---

## Mejoras pendientes antes de producción

| Prioridad | Área | Descripción | Bloqueante |
|-----------|------|-------------|------------|
| **Alta** | Backend | Session store en memoria (Map) → migrar a SQLite/Redis para sobrevivir reinicios | Decisión de arquitectura |
| **Alta** | Config | Definir `redmine_defaults.default_assignee_id` con ID numérico real de Redmine | Cobertec debe dar el ID |
| **Alta** | Config | Cambiar `company_to_project._default` de `"cobertec-intake-test"` a proyecto de producción | Cobertec debe definirlo |
| **Alta** | Backend | Poblar el campo `redmine_login` en usuarios para activar la impersonación en Redmine | Decisión operativa |
| **Alta** | Config | Verificar que los IDs de custom fields (21-28) existen en la instancia Redmine de Cobertec | Acceso a Redmine de prod |
| **Media** | Frontend | Llamadas a `submitIntake`/`confirmIntake` sin timeout explícito — añadir `AbortController` | — |
| **Baja** | Seguridad | Los archivos `backend/scripts/redmine_*.json` contienen datos de usuarios — añadir al `.gitignore` | — |
| **Baja** | Scripts | Documentar uso de `import-redmine-clients.ts` e `import-new-projects.ts` | — |

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
| Nueva naturaleza o dominio | `config/taxonomy.json` + actualizar listas en `backend/src/types.ts` y `frontend/src/types.ts` |
| Nueva regla de need | `config/redmine-mapping.json` → `need_resolution` |
| Nueva solución Redmine | `config/redmine-mapping.json` → `solution_resolution` + tabla `SOLUTION_NORMALIZE` en `redmine/index.ts` |
| Nueva regla de asignación | `config/assignment-rules.json` |
| Nuevo rol funcional → usuario Redmine | `config/redmine-mapping.json` → `role_to_user_id` (editable desde ConfigPanel pestaña Redmine) |
| Nueva empresa → proyecto Redmine | `config/redmine-mapping.json` → `company_to_project` |
| Nuevo proveedor LLM | `backend/src/services/classifier/provider-*.ts` + factory en `index.ts` |
| Nuevo campo custom en ticket | `redmine-mapping.json` → `custom_fields` + `redmine/index.ts` → `buildIssuePayload()` |
| Nuevo componente UI | `frontend/src/components/` |
| Nuevo endpoint | `backend/src/routes/` + registro en `index.ts` |
| Nuevo usuario/empresa | `backend/scripts/seed-identity.ts` o vía AdminPanel → `POST /api/admin/users` |
| Poblar redmine_login de usuario | Query directa a identity.db: `UPDATE users SET redmine_login='login.redmine' WHERE id='...'` |

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

## Dominios (21 total)

`funcionamiento_general`, `compras`, `ventas_facturacion`, `almacen_stocks`, `gmao`, `movilsat`, `portal_ot`, `presupuestos_proyectos`, `financiero`, `crm`, `ofertas_comerciales`, `planificador_inteligente`, `app_fichajes`, `servidor_sistemas`, `tarifas_catalogos`, `usuarios_accesos`, `informes_documentos`, `sesiones_conectividad`, `solucionesia`, `dominio_no_claro`, `academia_cobertec`, `ecommerce_web`

---

## Gestión de contraseñas — implementado (sesión 2025-04)

### Qué se construyó

1. **Migración DB** (`backend/scripts/migrate-redmine-ids.ts`):
   - Añade columna `redmine_user_id INTEGER` a tabla `users`
   - Añade columna `must_change_password INTEGER DEFAULT 0` a tabla `users`
   - Puebla `redmine_user_id` con 602/611 usuarios via `GET /users.json?name=<login>` a Redmine (solo lectura, sin modificar Redmine)
   - Marca `must_change_password = 1` en los 611 usuarios importados
   - Ejecutar: `cd backend && npx tsx scripts/migrate-redmine-ids.ts`

2. **Cambio de contraseña obligatorio en primer login**:
   - Al login, si `must_change_password = true` en DB → se incluye el flag en el JWT y en `TokenResponse`
   - El frontend intercepta `must_change_password: true` → `authState.status = 'must_change_password'`
   - `App.tsx` muestra `<ChangePasswordPage />` antes de continuar
   - En cambio obligatorio **no se pide contraseña actual** — el backend omite la verificación si `must_change_password = true`
   - Al cambiar: se actualiza el hash en identity.db + se pone `must_change_password = false`

3. **Cambio de contraseña voluntario**:
   - Disponible en cualquier momento desde `<ChangePasswordPage voluntary={true} />`
   - Requiere contraseña actual (verificada con bcrypt)
   - Endpoint: `PUT /api/auth/password` — requiere `requireAuth()` (no necesita empresa seleccionada)

4. **Sincronización con Redmine** — **NO activa todavía**:
   - `redmine_user_id` ya está poblado y disponible en DB
   - Cuando Cobertec salga del piloto, añadir en `changePassword()` del service:
     ```typescript
     await redmineClient.put(`/users/${user.redmine_user_id}.json`, {
       user: { password: newPassword }
     }, { noImpersonation: true }); // sin X-Redmine-Switch-User
     ```

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `backend/src/identity-types.ts` | `must_change_password` en `User`, `AccessTokenPayload`, `TokenResponse`; nuevo `ChangePasswordRequestSchema` y `ChangePasswordResponse`; nuevo error code `WRONG_CURRENT_PASSWORD` |
| `backend/src/services/identity/store.ts` | Migraciones para `redmine_user_id` y `must_change_password`; métodos `getMustChangePassword()`, `setMustChangePassword()`; `createUser()` acepta `must_change_password` |
| `backend/src/services/auth/service.ts` | `login()` incluye `must_change_password` en JWT; `selectCompany()` propaga el flag; `refresh()` re-lee el flag de DB; nueva función `changePassword()` |
| `backend/src/routes/auth.ts` | Nuevo endpoint `PUT /password` |
| `frontend/src/auth-types.ts` | `must_change_password` en `LoginResponse`; nuevo estado `'must_change_password'` en `AuthState`; tipos `ChangePasswordRequest/Response` |
| `frontend/src/services/auth-api.ts` | Nueva función `changePasswordApi()` |
| `frontend/src/contexts/AuthContext.tsx` | Detecta `must_change_password` en login y refresh silencioso; nueva acción `changePassword()` que tras cambiar hace refresh y auto-selecciona empresa |
| `frontend/src/App.tsx` | Nuevo estado `must_change_password` → renderiza `<ChangePasswordPage />` |
| `frontend/src/components/ChangePasswordPage.tsx` | **Nuevo componente**. Props: `voluntary?: boolean`, `onCancel?: () => void`. Sin campo contraseña actual en modo obligatorio. |

### Nuevo script de utilidad

`backend/scripts/reset-must-change.ts` — resetea `must_change_password = 1` para un usuario concreto (útil para pruebas):
```typescript
import { getIdentityStore } from '../src/services/identity/store.js';
const store = getIdentityStore();
const user = store.getUserByEmail('email@ejemplo.com');
if (user) store.setMustChangePassword(user.id, true);
store.close();
```

### Pendientes de gestión de usuarios (fase siguiente)

| Ítem | Dependencia |
|------|-------------|
| Recuperación de contraseña olvidada (`POST /forgot-password`, `POST /reset-password`) | Requiere SMTP — pendiente definir proveedor con Cobertec |
| Solicitud de alta de nuevo usuario (formulario público) | Pendiente decisión: ¿mismo frontend bajo `/registro`? |
| Panel admin para aprobar/rechazar altas | Pendiente SMTP para email de bienvenida |
| Sincronización contraseña con Redmine al cambiar | Activar cuando salga del piloto — `redmine_user_id` ya está disponible |

---

## Decisiones de diseño — razonamiento (no obvio en el código)

Estas decisiones se tomaron de forma explícita y no deben revertirse sin entender el porqué.

### Contraseñas

**¿Por qué `must_change_password` desde el inicio y no verificar contra Redmine?**
Los 611 usuarios importados tienen `Cobertec2024!` en identity.db. Sus contraseñas reales de Redmine son distintas. No es posible extraer contraseñas de Redmine via API (no existe ese endpoint en ningún sistema). La única opción viable sin comunicación previa a los usuarios es marcar `must_change_password = 1` desde el inicio y forzar el cambio en el primer acceso.

**¿Por qué no se pide contraseña actual en el cambio obligatorio?**
En el primer acceso el usuario no conoce `Cobertec2024!` (es la contraseña provisional interna). Pedirsela sería confuso y generaría soporte. El estándar en sistemas enterprise es no pedir contraseña actual cuando el admin fuerza el cambio — el token válido ya es suficiente garantía de identidad.

**¿Por qué la sincronización con Redmine está desactivada?**
Redmine es el sistema operativo activo de Cobertec — cualquier cambio de contraseña en los 611 usuarios afectaría su acceso diario a Redmine. Durante el piloto solo trabajamos con HERGOPAS_sat. Activar la sincronización ahora rompería el trabajo diario de todos los usuarios. El `redmine_user_id` ya está poblado en DB (602/611 usuarios) y la sincronización se activa con 3 líneas de código cuando Cobertec decida salir del piloto.

**Los 9 usuarios sin `redmine_user_id`** (no encontrados en Redmine):
`aintzane_aidesegi`, `antonio_losada`, `gustavo_hergopas`, `noelia_hergopas`, `gloria_hergopas`, `indertec`, `daniel_Jacintoredondo`, `isabel_macool`, `agabea_novofrio`. Pueden haberse eliminado de Redmine o tener el login cambiado. No bloquean nada — simplemente no tendrán sincronización de contraseña cuando llegue el momento.

### Autenticación

**¿Por qué OAuth 2.0 con `grant_type` en lugar de endpoints separados `/login` y `/refresh`?**
Decisión de diseño anterior a esta sesión. El endpoint unificado `POST /auth/token` con `grant_type: 'password' | 'refresh_token'` es el estándar OAuth 2.0 y facilita la integración futura con otros clientes (app móvil, etc.).

**¿Por qué el `must_change_password` viaja en el JWT y no solo en la respuesta del login?**
Porque el refresh silencioso al cargar la SPA también necesita detectar el flag. Si solo estuviera en la respuesta del login, un usuario que cierra el navegador antes de cambiar la contraseña podría saltarse la pantalla de cambio al reabrir. El JWT garantiza que el flag persiste entre sesiones hasta que se cambie la contraseña.

### Redmine

**¿Por qué impersonation via `X-Redmine-Switch-User` y no crear usuarios con su propia API key?**
Cobertec gestiona una única API key admin (`cobertec_intake`, id: 847). Los clientes no tienen API keys propias. La impersonación permite que los tickets aparezcan en Redmine como creados por el usuario cliente, manteniendo la trazabilidad sin gestionar credenciales individuales.

**¿Por qué `redmine_login` existe en DB pero no se usaba antes de esta sesión?**
La columna se añadió en una migración anterior previendo la impersonación, pero el script de importación de usuarios no la poblaba. Ahora está poblada para los 611 usuarios (campo `redmine_login`) y además tenemos `redmine_user_id` para las operaciones que requieren ID numérico (cambio de contraseña).

### SMTP y funcionalidades pendientes

**¿Por qué no se implementó recuperación de contraseña ni alta de usuarios en esta sesión?**
Ambas funcionalidades requieren envío de email. El proveedor SMTP (SendGrid, Gmail, servidor propio de Cobertec) está pendiente de definir con Cobertec. Implementar el flujo sin email funcional no tiene valor — se pospone hasta confirmar el proveedor.

**Decisiones pendientes de confirmar con Cobertec antes de continuar:**
1. Proveedor SMTP para emails transaccionales
2. ¿El formulario de alta de nuevo usuario va en el mismo frontend bajo `/registro` o separado?
3. ¿Quién es el admin de Cobertec que aprueba las altas? (configurar su cuenta como superadmin)
4. ¿Los nuevos usuarios de Redmine deben crearse con algún rol adicional además de Cliente SAT (role_id: 6)?
