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
    │   action='edit'                        │ Reset clarification state, re-clasifica
    │                                        └─► ClassifiedResponse (puede incluir nueva pregunta)
    │
    ├─ POST /api/intake/confirm  ─────► [Auth Plugin] → ClassifierService (re-classify con contexto)
    │   action='clarify'                     │ Re-clasifica con { question, answer } del usuario
    │                                        │ Solo una iteración de clarify por sesión
    │                                        └─► ClassifiedResponse (clarifying_question: null)
    │
    ├─ DELETE /api/intake/session ────► [Auth Plugin] → sessionStore.delete(session_id)
    │   ?session_id=xxx                      │ Borra la sesión del Map en memoria
    │   (requiere company en token)          │ Loguea evento intake_cancelled
    │                                        └─► { ok: true } (idempotente)
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
    ├─ GET  /api/requests/companies ──► IdentityStore.listActiveCompanies() (pública)
    │
    ├─ POST /api/requests ────────────► IdentityStore.createUserRequest() + mailer
    │   (pública)                            └─► request_id + email notificación a admins
    │
    ├─ GET  /api/requests/admin ──────► IdentityStore.listUserRequests() (requiere admin)
    ├─ PATCH /api/requests/admin/:id ─► IdentityStore.updateUserRequest() (requiere admin)
    ├─ POST /api/requests/admin/:id/approve → Redmine API + identity.db + email bienvenida
    ├─ POST /api/requests/admin/:id/reject  → rejectUserRequest() + email rechazo
    │
    ├─ POST /api/auth/forgot-password ► mailer.sendPasswordResetEmail() (pública)
    ├─ POST /api/auth/reset-password ─► IdentityStore.updateUserPassword() (pública, token)
    │
    └─ GET /api/metrics ──────────────► EventStore (SQLite)
                                             └─► métricas del piloto
```

### Patrón de estado del backend

El backend mantiene un `Map<session_id, SessionState>` en memoria. Cada sesión guarda:
- `intake`: payload original del usuario
- `classification`: última clasificación del LLM
- `attempt`: número de re-clasificaciones
- `clarification_attempted`: flag que impide bucles (solo una iteración de clarify por sesión)
- `clarification?`: `{ question, answer }` si el usuario respondió la pregunta (se incluye en la descripción del ticket)
- `clarifying_question_reason`: reason del último `ClarifyingQuestion` generado (para detectar el caso especial `heuristic_solution_confirm + "No"`)

La sesión se elimina del Map al confirmar el ticket (`action='confirm'`) o al cancelar (`DELETE /api/intake/session`).

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
- `NATURE_VALUES`, `SOLUTION_VALUES`, `EXPERTIS_MODULE_VALUES`, `CONFIDENCE_VALUES`, `REVIEW_STATUS_VALUES`, `PRIORITY_VALUES` — constantes `as const` usadas por Zod en `response-validator.ts`
- `Nature`, `Solution`, `ExpertisModule`, `Confidence`, `ReviewStatus`, `Priority` — tipos derivados de las constantes
- `ClarifyingQuestion` — `{ question: string; options: string[] | null; reason: string }` — pregunta única generada por el LLM (null = no hay pregunta)
- `ClassificationRequest` — entrada al `ClassifierService`; incluye `clarification?: { question, answer }` para re-clasificación tras aclaración
- `ClassificationResponse` — salida del LLM; `nature` y `domain` anidados en sub-objeto `classification`; incluye `alternative_solutions: string[]` (soluciones que el LLM consideró antes de elegir, array vacío si la elección fue clara)
- `ConfirmationPayload` — entrada del `/confirm`; `action: 'confirm' | 'edit' | 'clarify'`; campos opcionales `clarification_answer?` y `clarification_question?` para action='clarify'
- `ClassifiedResponse` — respuesta al frontend tras clasificar; incluye `clarifying_question: ClarifyingQuestion | null`
- `FlowStep` — `'form' | 'loading' | 'clarifying' | 'confirmation' | 'creating' | 'done' | 'error'`
- `IntakePayload` — entrada del `/submit`
- `IntakeResponse` (union: `ClassifiedResponse | CreatedResponse | ErrorResponse`) — respuesta del backend al frontend
- `EventType` — incluye `clarifying_question_generated`, `clarifying_question_answered`, `unassignable_fallback_applied`, `intake_cancelled`

**Regla importante:** frontend (`frontend/src/types.ts`) es un subconjunto espejo de este archivo. Si cambias los contratos en backend, actualizar frontend también.

### `backend/src/identity-types.ts`
**Los contratos de datos del sistema de identidad y auth.** Define:
- `Contact`, `User`, `Company`, `UserCompany` — entidades de la base de datos de identidad
- `CompanyDTO`, `MeResponse` — DTOs de salida de la API
- `TokenRequestSchema` — schema Zod discriminado (grant_type: 'password' | 'refresh_token'); campo `email` usa `.min(1)` (no `.email()`) para aceptar logins Redmine
- `SelectCompanyRequestSchema` — schema Zod para selección de empresa
- `LoginResponse`, `SelectCompanyResponse`, `RefreshResponse` — respuestas de auth
- `AccessTokenPayload`, `RefreshTokenPayload` — contenido del JWT
- `AuthErrorCode`, `AuthError` — errores tipados
- `LoginRequestSchema` — **@deprecated**, usar `TokenRequestSchema` con `grant_type: 'password'`
- `UserRequestStatus`, `UserRequest` — entidad de solicitudes de alta (tabla `user_requests`):
  - `company_id: string | null` — nullable; el admin lo asigna después de revisar la solicitud
  - `company_name_requested: string` — nombre de empresa en texto libre que escribió el solicitante
  - `phone: string` — requerido (no nullable)
- `UserRequestFormSchema` — schema Zod del formulario público: `company_name: z.string().min(1)` (texto libre, **no** `company_id`); `phone: z.string().min(1)` (requerido); `company_id: z.string().min(1).optional().nullable()` (solo para edición admin — usa `.min(1)` en lugar de `.uuid()` porque las empresas importadas de Redmine tienen IDs numéricos como PK, no UUIDs)
- `RejectRequestSchema` — schema Zod para el motivo de rechazo; campo `reason` con mensaje de error en español: `"El motivo del rechazo es obligatorio"`

**Regla importante:** `frontend/src/auth-types.ts` es espejo de este archivo. Cambios aquí → actualizar también en frontend.

### `backend/src/plugins/auth.ts`
Plugin Fastify registrado globalmente (antes de las rutas). En cada request:
1. Extrae el JWT del header `Authorization: Bearer <token>`
2. Lo verifica con `verifyAccessToken()` — pone el payload en `request.auth` o null si inválido
3. Decora el request con `requireAuth()` y `requireCompany()` para uso desde los handlers
4. Registra un error handler global para `AuthServiceError` → responde JSON con código y status HTTP

### `backend/src/services/auth/service.ts`
Lógica de auth pura. Cuatro operaciones:
- `login(email, password)` → busca primero por email (`getUserByEmail`), si no encuentra intenta por `redmine_login` (`getUserByRedmineLogin`); verifica bcrypt, emite access_token (sin company) + refresh token
- `selectCompany(currentToken, companyId)` → verifica que el user pertenece a esa company, emite nuevo access_token (con company_id + company_name embebidos)
- `refresh(refreshTokenRaw)` → verifica refresh token en BD, rota (borra viejo, emite nuevo), devuelve nuevo access_token
- `logout(refreshTokenRaw)` → borra refresh token de BD

Notas de seguridad:
- bcrypt 12 rounds
- Refresh tokens almacenados como hashes SHA-256 (nunca el token raw)
- Rotación en cada refresh (token reuse detection: si el hash no existe, revoca todos los del usuario)
- `JWT_SECRET` debe ser distinto del dev default en producción (el código lanza Error si no)

### `backend/src/services/identity/store.ts`
`IdentityStore` — clase SQLite (better-sqlite3) con 6 tablas:
- `contacts`: name, email (UNIQUE COLLATE NOCASE), phone, whatsapp
- `users`: contact_id (FK), password_hash, active (int 0/1), is_superadmin (int 0/1), last_login, **redmine_login** (TEXT, nullable — para impersonation)
- `companies`: name, redmine_project_id, active
- `user_companies`: (user_id, company_id) PK, role ('user'|'admin')
- `refresh_tokens`: token_hash PK, user_id FK, expires_at
- `user_requests`: id (UUID), first_name, last_name, email, company_id (FK, **NULLABLE** — admin asigna tras revisión), company_name_requested (TEXT — nombre libre del formulario), phone (TEXT NOT NULL), status ('pending'|'approved'|'rejected'), rejection_reason, redmine_user_id, created_at, updated_at. **Nota de migración:** la tabla se recrea vía rename→recreate→INSERT SELECT→DROP backup si la columna `company_name_requested` no existe, para añadir la constraint nullable de `company_id` (SQLite no permite ALTER COLUMN).

Métodos principales:
- `getUserByEmail()`, `getUserById()`, `createUser()`, `updateUserActive()`, `updateUserPassword()`
- `getUserByRedmineLogin(login)` — mismo JOIN a contacts que `getUserByEmail()`, busca por `users.redmine_login` COLLATE NOCASE; usado en `login()` como fallback cuando el identificador no es un email
- `getCompaniesForUser()` — para superadmin devuelve TODAS las empresas activas
- `isUserInCompany()` — superadmin siempre retorna true
- `getUserCompanyRole()` — superadmin siempre retorna 'admin'
- `isAdmin()` — true si es superadmin O tiene rol 'admin' en cualquier empresa
- `isSuperAdmin()` — comprueba flag is_superadmin en users
- `getRedmineLogin(userId)` — devuelve el login de Redmine del usuario (para impersonación vía `X-Redmine-Switch-User`)
- `listUsers()`, `listCompanies()` — queries de admin con JOINs
- `storeRefreshToken()`, `getRefreshToken()`, `deleteRefreshToken()`, `deleteRefreshTokensForUser()`, `pruneExpiredTokens()`
- `createUserRequest()`, `getUserRequestById()`, `listUserRequests()`, `updateUserRequest()`, `approveUserRequest()`, `rejectUserRequest()` — CRUD de solicitudes de alta
- `getContactByEmail()` — verifica duplicados de email antes de crear solicitud
- `generateRedmineLogin(firstName, lastName, companySlug)` — genera login único para Redmine con deduplicación automática

Singleton: `getIdentityStore()` devuelve instancia cacheada. El path de la DB viene de `process.env.IDENTITY_DB_PATH` (se setea en `index.ts` a `data/identity.db`).

Las columnas `is_superadmin` y `redmine_login` se añaden mediante migración no destructiva (`ALTER TABLE ... ADD COLUMN`) en el constructor, por lo que son seguras de aplicar sobre BDs existentes.

### `backend/src/routes/auth.ts`
Cinco endpoints bajo `/api/auth` (estilo OAuth 2.0):
- `POST /token` — endpoint unificado con discriminación por `grant_type`:
  - `grant_type: 'password'` → valida email+password con Zod, llama `login()`, setea cookie httpOnly
  - `grant_type: 'refresh_token'` → lee cookie `cobertec_refresh`, llama `refresh()`, rota cookie
- `POST /select` — requiere `request.requireAuth()`, valida con Zod, llama `selectCompany()`
- `POST /logout` — llama `logout()`, limpia cookie con `clearCookie()`
- `PUT /password` — requiere `requireAuth()`; cambio voluntario pide contraseña actual, cambio obligatorio no; actualiza hash en identity.db + pone `must_change_password = false`
- `POST /forgot-password` — pública; busca usuario por email, genera token de reset (JWT 1h), envía email. Siempre responde `ok: true` (no revela si el email existe)
- `POST /reset-password` — pública; verifica token JWT de reset, actualiza contraseña, invalida token

Cookie: `httpOnly: true`, `secure: true` solo en producción, `sameSite: 'strict'` en prod / `'lax'` en dev, `path: '/api/auth'`, `maxAge: 7d`.

Rate limiting: `@fastify/rate-limit` con límite 10 req/min por IP en `POST /token`; el `errorResponseBuilder` devuelve el mensaje de error en español: `"Demasiados intentos. Espera X segundos antes de volver a intentarlo."`

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
- `GET /redmine-projects` — lista proyectos activos de Redmine (status=1); caché en memoria con TTL de 5 min; `?refresh=true` fuerza refresco; 503 si `REDMINE_URL`/`REDMINE_API_KEY` no configurados; 502 si error Redmine. Cache: variables de módulo `_redmineProjectsCache` + `_redmineProjectsCacheTime`.

El guard `requireAdmin()` verifica `IdentityStore.isAdmin(auth.sub)`. Los superadmin también pasan este guard.

### `backend/src/routes/config.ts`
Gestión de la configuración externalizada bajo `/api/config`. Solo accesible a admins (o superadmin):
- `GET /config/:file` — lee y devuelve el JSON del disco (taxonomy, redmine-mapping, assignment-rules)
- `PUT /config/:file` — valida estructura mínima, hace backup automático (`.bak`), sobreescribe
- `GET /config/redmine-users` — **nuevo**: llama a la API de Redmine (`/users.json`), filtra solo los usuarios con email `@cobertec.com`, devuelve `{ id, login, name }[]` para uso en el ConfigPanel. Requiere `REDMINE_URL` y `REDMINE_API_KEY` configurados; si no están, devuelve 503.

Validación superficial de estructura (solo verifica claves de primer nivel). El archivo editado entra en efecto en la próxima llamada a `reloadConfig()`.

**Nota:** hay `console.log('[config GET] Reading:', filePath)` tanto en el GET como en el PUT — son debug logs a eliminar antes de producción.

### `backend/src/routes/intake.ts`
Tres rutas:
- `POST /api/intake/submit` — valida payload, llama classifier, genera `ClarifyingQuestion` via `question-generator.ts`, guarda en session store, devuelve `ClassifiedResponse` con la pregunta
- `POST /api/intake/confirm` — tres acciones:
  - `action='clarify'`: re-clasifica incluyendo `{ question, answer }` en el prompt; caso especial si `reason='heuristic_solution_confirm'` y respuesta es "No" (devuelve follow-up de texto libre); impide bucles (`clarification_attempted` flag)
  - `action='edit'`: actualiza descripción, reset del estado de clarificación, re-clasifica; puede generar nueva pregunta
  - `action='confirm'`: sube adjuntos, crea ticket Redmine (pasando `clarification?`), loguea eventos, limpia sesión
- `DELETE /api/intake/session?session_id=xxx` — cancela y elimina la sesión del Map; requiere `requireAuth()` + `requireCompany()`; responde `{ ok: true }` siempre (idempotente); loguea `intake_cancelled`

Todas las rutas llaman `request.requireCompany()`. El `user_id`, `company_id` y `company_name` se sobreescriben siempre con los valores del JWT.

Eventos logueados: `clarifying_question_generated`, `clarifying_question_answered`, `unassignable_fallback_applied`, `intake_cancelled`.

### `config/cobertec-users.json` y `docs/redmine-users.md`

**Fuente de verdad de los usuarios internos de Cobertec en Redmine.** Estos dos archivos son espejos: el `.json` para uso programático del backend, el `.md` para consulta humana. Contienen ID Redmine, login, nombre real y email de cada usuario `@cobertec.com`.

- **Cualquier ID en `config/redmine-mapping.json` → `role_to_user_id` o `default_assignee_id` debe existir en `cobertec-users.json`.** El backend valida esto al arranque y emite warning si hay IDs huérfanos (ver `services/redmine/identity-validator.ts`).
- **Cuando se añade o quita personal en Cobertec:** actualizar AMBOS archivos antes de tocar `role_to_user_id`.
- **No reproducir esta lista en otros lugares de la documentación** — referenciar siempre estos archivos como fuente única.

### `backend/src/services/redmine/identity-validator.ts`

Módulo de validación de configuración Redmine al arranque. Dos funciones:
- `validateRedmineMapping(mapping)` — comprueba que todos los IDs en `role_to_user_id`, `default_assignee_id` y `unassignable_fallback_assignee_id` existen en `cobertec-users.json`. Devuelve `{ valid, orphanIds }`.
- `lookupCobertecUser(id)` — devuelve el objeto `{ id, login, name, email }` de un usuario por ID, o `null` si no existe.

Se llama desde `index.ts` al arranque (tras `app.listen()`). Si hay IDs huérfanos: `console.warn` con detalle. Si todo OK: `console.log` de confirmación. **No lanza excepción** — un ID huérfano no debe romper el arranque.

### `backend/scripts/` — Scripts de utilidad

| Script | Descripción |
|--------|-------------|
| `seed-identity.ts` | Crea 2 empresas y 3 usuarios de prueba (contraseña: `test1234`). Solo para desarrollo. |
| `add-test-user.ts` | Añade un usuario de prueba concreto a la BD. Utility de dev. |
| `check-db.ts` | Diagnóstico rápido: lista tablas y conteos de la identity.db. |
| `check-schema.ts` | Verifica que el esquema de la BD tiene todas las columnas esperadas. |
| `import-redmine-clients.ts` | **Script de producción**: importa proyectos de Redmine como empresas en identity.db, con mapeo `redmine_project_id`. Usa los JSON en `scripts/redmine_*.json` como fuente. |
| `import-new-projects.ts` | **Script de producción**: importa nuevos proyectos/clientes de Redmine que aún no existen en la BD. |
| `import-cobertec-users.ts` | **Script de producción**: importa usuarios internos de Cobertec (`@cobertec.com`) desde Redmine a identity.db. Crea o actualiza contacto+usuario con `is_superadmin=1`, `must_change_password=1`, contraseña `Cobertec2024!` (bcrypt), `redmine_login` y `redmine_user_id`. Si el usuario ya existe por email, actualiza solo los campos Redmine sin tocar la contraseña. Pagina automáticamente la API de Redmine (100 por página). |
| `migrate-redmine-ids.ts` | **Script de migración**: añade columnas `redmine_user_id` y `must_change_password` a la BD; puebla `redmine_user_id` consultando Redmine por login. Ejecutar una sola vez sobre BDs antiguas. |

Los archivos `redmine_*.json` en `backend/scripts/` son volcados de la API de Redmine usados durante la importación. **No deben commitearse** (añadir a `.gitignore`).

Ejecutar cualquier script desde el directorio `backend/`:
```bash
cd backend && npx tsx scripts/<nombre>.ts
```

### `backend/src/services/classifier/assignee-resolver.ts`
Resolución **determinista** del assignee: lee `assignment-rules.json` y aplica las reglas (ordenadas por `priority` ascendente) sobre `block`, `module`, `need`, y opcionalmente `solution`. La primera regla que hace match devuelve el `assignee`. Si ninguna hace match, devuelve `default_assignee`. Esto garantiza que el asignado siempre sea correcto independientemente del assignee que el LLM haya devuelto.

Nota: en `classifier/index.ts`, después de `validateClassificationResponse()`, se sobreescribe `validation.data.suggested_assignee` con `resolveAssignee(validation.data)`.

### `backend/src/services/classifier/prompt-builder.ts`
Construye dos prompts:
1. **System prompt** — vuelca taxonomy completa (nature + domain con keywords, señales positivas/negativas, ejemplos, reglas) + soluciones con pesos + módulos Expertis + domain→block mapping + need catalogue + reglas de asignación. El JSON schema pedido al LLM incluye el campo `alternative_solutions: ["string"]` con instrucción explícita en REGLAS FINALES para declarar soluciones alternativas con señales reales.
2. **User prompt** — descripción del usuario + company_name + lista de adjuntos. Si hay `request.clarification`, añade sección `## ⚠ ACLARACIÓN PRIORITARIA — LEER ANTES DE CLASIFICAR` con instrucción explícita de que la respuesta del usuario prevalece sobre la descripción original (incluye regla específica ERP vs Movilsat App).

### `backend/src/services/classifier/response-validator.ts`
Valida la respuesta JSON del LLM con Zod. Aplica **coherencia**:
- `solution ≠ Expertis` → `expertis_module = null`
- `solution = Expertis` y `expertis_module = null` → fuerza `'general'`
- `solution = Comercial` → `review_status = 'out_of_map'`, confidence baja a `'medium'` si era `'high'`
- `confidence:high` → fuerza `review_status:'auto_ok'`
- `confidence:medium/low` → fuerza `review_status:'review_recommended'` si era `'auto_ok'`
- `alternative_solutions: z.array(z.string()).default([])` — si el LLM no lo devuelve o es null, defaultea a `[]`

Usa `.passthrough()` para ignorar campos extra. `buildFallbackResponse()` incluye `alternative_solutions: []`.

Si el JSON falla parsing → genera clasificación fallback (ambiguo, low confidence, human_required).

### `backend/src/services/redmine/index.ts`
Dos implementaciones del cliente Redmine:

**`RedmineClient`** (real, con `REDMINE_URL` + `REDMINE_API_KEY`):
- `createTicket(intake, classification, clarification?)`: orquesta el flujo completo de creación
  1. Detecta **caso inasignable**: `suggested_assignee` no resuelve en `role_to_user_id` AND (`domain === 'dominio_no_claro'` OR `nature === 'ambiguo'`). Si es inasignable, usa `mapping.redmine_defaults.unassignable_fallback_assignee_id` (actualmente `null`) y loguea `unassignable_fallback_applied`.
  2. `uploadAttachments()` — sube todos los adjuntos **en paralelo** (`Promise.all`); los que fallan se omiten
  3. Resuelve el `projectId` via `mapping.company_to_project[intake.company_id]` → fallback `_default` → fallback hardcoded `'cobertec-intake-test'`
  4. `buildIssuePayload()` — construye el payload completo:
     - Normaliza `solution_associated` con tabla `SOLUTION_NORMALIZE` (ej: 'Expertis / Movilsat ERP' → 'expertis')
     - Normaliza `expertis_module` con tabla `MODULE_NORMALIZE`
     - Resuelve assignee: `role_to_user_id[classification.suggested_assignee]`; si inasignable, usa `unassignable_fallback_assignee_id`; si ambos null, el ticket se crea sin asignar
     - Construye array de `custom_fields` usando los IDs del config (`mapping.custom_fields.*.id`)
  5. `postIssue()` — POST a `/issues.json`; si el usuario tiene `redmine_login`, añade header `X-Redmine-Switch-User` para impersonación

**`SimulatedRedmineClient`**: devuelve tickets ficticios con IDs incrementales a partir de 1000. Se activa automáticamente si no están configuradas `REDMINE_URL`/`REDMINE_API_KEY`.

**`resetRedmineClient()`**: utility para tests, resetea la instancia singleton.

### `backend/src/services/redmine/ticket-composer.ts`
Formatea asunto y descripción del ticket:
- `composeSubject(classification, forceReview?)`: genera asunto limpio:
  - `stripSubject()` elimina prefijos en tercera persona que el LLM puede añadir ("El cliente no puede…" → "…")
  - Añade prefijo `[REVISIÓN]` si `forceReview=true` (caso inasignable), `confidence: 'low'` o `review_status` es `'out_of_map'` / `'human_required'`
  - Trunca a 80 chars (72 si lleva prefijo)
- `composeDescription(intake, classification, clarification?)`: estructura markdown con sección "Descripción original" + (si `clarification`) sección "Aclaración del usuario" con la pregunta y respuesta + "Resumen operativo (IA)" + conteo de adjuntos

### `backend/src/routes/requests.ts`
Rutas bajo `/api/requests` para el flujo de solicitudes de alta de nuevos usuarios:
- `GET /companies` — **pública**: lista empresas activas (ya no se usa en el frontend — el formulario ahora usa texto libre — pero se mantiene por compatibilidad)
- `POST /` — **pública**: crea solicitud con `company_name` (texto libre) + notifica a admins por email; verifica email duplicado vs contacts; **no** valida la existencia de la empresa
- `GET /admin` — requiere admin; lista solicitudes filtrables por `?status=pending|approved|rejected`; usa `LEFT JOIN` a companies (company_id puede ser null)
- `PATCH /admin/:id` — requiere admin; edita solicitud pendiente; mapea `body.company_name → company_name_requested` y acepta `company_id` opcional para asignar empresa concreta
- `POST /admin/:id/approve` — requiere admin; **bloquea con 409 (`COMPANY_NOT_ASSIGNED`) si `company_id` es null** — el admin debe asignar empresa primero; luego crea usuario en Redmine + identity.db + envía email de bienvenida
- `POST /admin/:id/reject` — requiere admin; marca rechazada + envía email de rechazo; usa `company?.name ?? userRequest.company_name_requested` como nombre de empresa en el email

La aprobación genera un login Redmine único via `generateRedmineLogin()`, crea el usuario en Redmine real (si `REDMINE_URL` configurado), añade membresía al proyecto de la empresa, crea contact + user en identity.db con `must_change_password: true`.

Constante `ADMIN_NOTIFICATION_EMAILS` en el archivo — actualmente `['o.bianchi@cobertec.com']`. **Cambiar a `soporte@cobertec.com` + `j.quintanilla@cobertec.com` en producción.**

### `backend/src/services/mailer/`
Servicio de email con nodemailer. Dos archivos:
- `mailer-index.ts` — clase `Mailer` con métodos:
  - `sendAdminNewRequestNotification()` — notifica a admins cuando llega una nueva solicitud
  - `sendWelcomeEmail()` — email de bienvenida al usuario aprobado (login + contraseña temporal)
  - `sendRejectionEmail()` — email de rechazo con motivo
  - `sendPasswordResetEmail()` — email de recuperación de contraseña con link de reset
- `index.ts` — barrel re-export (`export { Mailer, getMailer } from './mailer-index.js'`)

Singleton `getMailer()`. Configuración via variables de entorno `SMTP_*`. Si `SMTP_HOST` no está configurado, los métodos loguean en consola sin lanzar error (modo dev).

### `backend/src/services/events/index.ts`
Event store SQLite. Cada evento tiene:
- `event_id` (UUID), `event_type`, `session_id`, `timestamp`, `data` (JSON flexible)

Tipos de evento del flujo de intake: `flow_started`, `description_submitted`, `classification_requested`, `classification_completed`, `confirmation_shown`, `confirmation_accepted`, `confirmation_edited`, `ticket_created`, `flow_error`, `flow_abandoned`, `clarifying_question_generated`, `clarifying_question_answered`, `clarifying_question_skipped`, `unassignable_fallback_applied`

### `frontend/src/auth-types.ts`
Espejo frontend de `backend/src/identity-types.ts`. Incluye: `CompanyDTO`, `LoginRequest/Response`, `SelectCompanyRequest/Response`, `RefreshResponse`, `MeResponse`, `AuthError`, `AuthState`, `UserRequestStatus`, `UserRequest`.

### `frontend/src/contexts/AuthContext.tsx`
React Context con estado de auth global. Al montar, intenta refresh silencioso (cookie → nuevo access_token → fetch `/identity/me`). Si el usuario tiene solo 1 empresa, la auto-selecciona. Si el refresh falla, el usuario está `'unauthenticated'`.

Expone: `authState` (status + user + selectedCompany), `isLoading`, `error`, `login()`, `selectCompany()`, `logout()`.

### `frontend/src/services/auth-api.ts`
Wrapper de fetch para llamadas a `/api/auth/*` y `/api/identity/*`:
- `accessToken` en memoria (no localStorage)
- `authFetch<T>()`: añade header `Authorization: Bearer` si hay token, lanza `AuthApiError` si falla
- `authenticatedFetch<T>()`: auto-retry con refresh en caso de 401
- Funciones: `loginApi()`, `selectCompanyApi()`, `refreshToken()`, `logoutApi()`, `fetchMe()`, `changePasswordApi()`, `forgotPasswordApi()`, `resetPasswordApi()`

---

## Estado actual del frontend

| Componente | Estado | Notas |
|---|---|---|
| `frontend/src/contexts/AuthContext.tsx` | Completo | Lógica de estado, refresh silencioso, superadmin |
| `frontend/src/services/auth-api.ts` | Completo | Cliente API con auto-refresh, token en memoria; forgot/reset password |
| `frontend/src/services/api.ts` | Completo | submitIntake, confirmIntake, clarifyIntake, cancelIntake, fileToAttachment |
| `frontend/src/services/admin-api.ts` | Completo | CRUD usuarios/empresas para AdminPanel; `fetchRedmineProjects(refresh?)` |
| `frontend/src/services/metrics.ts` | Completo | GET /metrics, /metrics/recent |
| `frontend/src/auth-types.ts` | Completo | Tipos espejo del backend; incluye UserRequest |
| `frontend/src/types.ts` | Completo | Tipos de intake espejo del backend |
| `frontend/src/main.tsx` | Completo | `<AuthProvider>` envuelve `<App />`; importa tailwind.css |
| `frontend/src/App.tsx` | Completo | Máquina de estados: flujo auth + páginas (intake, dashboard, admin, config, requests) + vistas públicas; maneja estado `'clarifying'` con `<ClarifyingQuestion>`; `handleCancelIntake` llama `cancelIntake()` + `resetFlow()` |
| `frontend/src/components/LoginPage.tsx` | Completo | "Email o usuario" + toggle visibilidad contraseña + link "¿No tienes cuenta?" |
| `frontend/src/components/CompanySelector.tsx` | Completo | Selector multi-empresa con opción de logout |
| `frontend/src/components/IntakeForm.tsx` | Completo | Textarea + subida archivos + paste handler; galería miniaturas; contador MB; validación mín. 10 chars |
| `frontend/src/components/ClarifyingQuestion.tsx` | Completo | Pregunta única; >4 opciones → `<select>` dropdown, ≤4 → botones, sin opciones → textarea; `onAnswer` + `onCancel` + `loading`; botón "Cancelar incidencia" con `<CancelConfirm>` inline |
| `frontend/src/components/ConfirmationView.tsx` | Completo | Resumen, área estimada, badge de impacto, lista adjuntos; `onConfirm` + `onEdit` + `onCancel`; botón "Cancelar incidencia" con `<CancelConfirm>` inline |
| `frontend/src/components/CancelConfirm.tsx` | Completo | Confirmación inline "¿Seguro que quieres cancelar?"; props `onConfirm` + `onDismiss`; sin modal ni overlay |
| `frontend/src/components/TicketResult.tsx` | Completo | Pantalla éxito: ticket_id + ticket_url |
| `frontend/src/components/ErrorDisplay.tsx` | Completo | Mensaje de error + botones Reintentar / Nueva incidencia |
| `frontend/src/components/Dashboard.tsx` | Completo | Métricas piloto: totales, tasa completado, distribución confianza |
| `frontend/src/components/AdminPanel.tsx` | Completo | CRUD usuarios y empresas; botón "Sincronizar proyectos Redmine"; `CompanyFormModal` usa dropdown cuando proyectos cargados |
| `frontend/src/components/StepIndicator.tsx` | Completo | Indicador visual de progreso; `'clarifying'` mapea al mismo índice visual que `'loading'` (paso 1 de 4) |
| `frontend/src/components/Loading.tsx` | Completo | Spinner con mensaje |
| `frontend/src/components/ChangePasswordPage.tsx` | Completo | Cambio obligatorio (sin pedir actual) y voluntario; props: `voluntary?`, `onCancel?`; toggle visibilidad en todos los campos |
| `frontend/src/components/ForgotPasswordPage.tsx` | Completo | Formulario de recuperación; llama `forgotPasswordApi()`; siempre muestra éxito |
| `frontend/src/components/ResetPasswordPage.tsx` | Completo | Lee `?token=` de la URL; llama `resetPasswordApi()`; redirige al login; toggle visibilidad en ambos campos |
| `frontend/src/pages/ConfigPanel.tsx` | Completo | Panel de 5 pestañas: Taxonomía / Soluciones / Necesidades / Asignación / Redmine |
| `frontend/src/pages/RequestAccessPage.tsx` | Completo | Formulario público en `/solicitar-acceso`; empresa como **texto libre** (no dropdown); teléfono obligatorio |
| `frontend/src/pages/RequestsPanel.tsx` | Completo | Panel admin: lista solicitudes por estado, aprobar/rechazar/editar; modal edición con campo empresa texto + selector ID; botón Aprobar deshabilitado sin company_id |
| `frontend/src/pages/ReviewPage.tsx` | Completo | Página pública `/review/:token`; approve/reassign con formulario; sin login |
| `frontend/src/pages/PendingReviewsPanel.tsx` | Completo | Panel support_lead: filtros, tabla con estado, audit log expandible, forzar aprobación/reasignación; botón "Nota" abre modal con historial de reasignaciones + sync Redmine; botón "Exportar CSV" (UTF-8 BOM, Excel-compatible) |
| `frontend/src/pages/ConfigProposalsPanel.tsx` | Completo | Panel admin/support_lead: tabs Pendientes/Aplicadas/Rechazadas, diff visual antes/después, modal Aplicar/Rechazar con motivo; visible para `isAdmin \|\| isSuperAdmin \|\| isSupportLead` |

**Nota sobre Tailwind:** integrado con `preflight: false` (no resetea CSS existente). Solo se importan utilidades. Archivos: `tailwind.config.js`, `postcss.config.js`, `src/tailwind.css`. Las páginas nuevas (`RequestsPanel`, `RequestAccessPage`) usan clases Tailwind; los componentes existentes mantienen sus clases CSS propias.

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

// Pregunta aclaratoria opcional (generada por el LLM, sanitizada por response-validator)
interface ClarifyingQuestion {
  question: string;
  options: string[] | null;  // null = pregunta abierta; si array, máx 4 opciones
  reason: string;            // por qué el LLM cree que necesita aclarar (logging)
}

// Respuesta al frontend tras clasificar (incluye pregunta si la hay)
interface ClassifiedResponse {
  session_id: string;
  status: 'classified';
  display: {
    summary: string;
    nature?: string;
    estimated_area: string;
    impact: string | null;
    attachments_received: string[];
    need: string | null;
  };
  clarifying_question: ClarifyingQuestion | null;
  billable: BillableInfo | null; // null si no aplica ninguna regla de facturación
}

// BillableInfo: lo que el backend devuelve al frontend sobre facturación
interface BillableInfo {
  is_billable: boolean;              // true → mostrar aviso + checkbox
  requires_disambiguation: boolean;  // true → pendiente de respuesta a pregunta de desambiguación
  min_cost_eur: number;
  notice_text: string;               // texto con placeholder {min_cost_eur} ya sustituido
  matched_rule_nature?: string;
}

// BillingAcceptance: enviado por el frontend en action='confirm' cuando is_billable=true
interface BillingAcceptance {
  accepted: boolean;
  accepted_at: string; // ISO timestamp
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
  alternative_solutions: string[]; // soluciones que el LLM consideró antes de elegir; [] si elección clara
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
   → prompt-builder construye system prompt (con instrucciones de clarifying_question)
   → LLM call con timeout 15s
   → response-validator valida JSON + aplica coherencia + sanitiza clarifying_question
   → assignee-resolver sobreescribe suggested_assignee de forma determinista
   → Guarda { intake, classification, attempt:1, clarification_attempted:false } en session Map
   → Devuelve ClassifiedResponse (con clarifying_question si la hay)

3a. Si ClassifiedResponse.clarifying_question ≠ null:
   Frontend muestra <ClarifyingQuestion> → usuario responde o salta (step='clarifying')

3b. POST /api/intake/confirm { action: 'clarify', clarification_question, clarification_answer }:
   → Re-clasifica con la aclaración embebida en el prompt
   → session.clarification_attempted = true (impide nuevo clarify)
   → Devuelve ClassifiedResponse con clarifying_question: null
   → Frontend pasa a step='confirmation'

3c. Si el usuario salta la pregunta:
   Frontend pasa directamente a step='confirmation' (se logueará clarifying_question_skipped al confirmar)

4. POST /api/intake/confirm { action: 'edit' }:
   → Actualiza description → reset clarification state → Re-clasifica → Devuelve ClassifiedResponse (puede incluir nueva pregunta)

4b. POST /api/intake/confirm { action: 'confirm' }:
   → Detecta unassignable (si aplica) → sube adjuntos en paralelo a Redmine
   → ticket-composer (incluye sección "Aclaración" si la hubo) → POST /issues.json
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

11. **Ejecución autónoma** — Claude Code debe ejecutar todas las tareas hasta el final sin pausas ni preguntas de confirmación. Ante dudas, tomar la decisión más conservadora y documentarla al final.

12. **Mensajes en español** — **Todos los mensajes visibles por el usuario deben estar en español sin excepción.** Esto incluye: errores de validación Zod, respuestas de error HTTP, mensajes de rate limiting, textos de UI, emails, y cualquier cadena que llegue al usuario final.

---

## Estado de la integración Redmine

La integración con Redmine está **sustancialmente completada** en config pero aún requiere validación en producción.

> **Referencia de usuarios:** los IDs numéricos de Redmine y sus nombres reales están documentados en `docs/redmine-users.md`. Consultar ese archivo antes de interpretar cualquier ID en `redmine-mapping.json`.

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
| `redmine_defaults.unassignable_fallback_assignee_id` | **736** en config | Casos inasignables (dominio ambiguo + assignee no resuelto) → asignado al usuario 736 con `[REVISIÓN]` en el asunto |
| `company_to_project._default` | apunta a `"cobertec-intake-test"` | Las empresas sin mapeo explícito van al proyecto de prueba |
| `users.redmine_login` | **poblado** por `import-cobertec-users.ts` para usuarios `@cobertec.com` | La impersonación vía `X-Redmine-Switch-User` está lista para activarse en producción |
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
14. ~~No existe `ForgotPasswordPage.tsx` ni `ResetPasswordPage.tsx`~~ — **Resuelto**: componentes creados; endpoints `POST /forgot-password` y `POST /reset-password` en `routes/auth.ts`
15. ~~No existe formulario público de solicitud de alta~~ — **Resuelto**: `RequestAccessPage.tsx` en `/solicitar-acceso`; rutas en `routes/requests.ts`; link desde `LoginPage`
16. ~~No existe panel admin de gestión de solicitudes~~ — **Resuelto**: `RequestsPanel.tsx` accesible desde nav para admins
17. ~~Sin edición de solicitudes pendientes~~ — **Resuelto**: `PATCH /api/requests/admin/:id` + modal en `RequestsPanel`
18. ~~`TokenRequestSchema` rechaza logins Redmine (`.email()` validation)~~ — **Resuelto**: campo `email` usa `.min(1)` en lugar de `.email()`
19. ~~`user_requests.company_id NOT NULL` bloqueaba solicitudes sin empresa asignada~~ — **Resuelto**: tabla recreada via rename→recreate→INSERT SELECT→DROP backup (SQLite no permite ALTER COLUMN); `company_id` ahora nullable; `company_name_requested` añadida
20. ~~`RequestsPanel` usaba URLs completas en `authenticatedFetch` causando doble prefijo~~ — **Resuelto**: todas las llamadas usan rutas relativas (`/requests/admin`, etc.)
21. ~~`reject` route fallaba si `company_id` era null al llamar `getCompanyById()`~~ — **Resuelto**: guard ternario `userRequest.company_id ? store.getCompanyById(...) : null`; fallback a `company_name_requested` en el email
22. ~~`POST /admin/:id/approve` enviaba `Content-Type: application/json` sin body~~ — **Resuelto**: añadido `body: JSON.stringify({})` en la llamada `fetch` del frontend para evitar error 400 en algunos servidores
23. ~~`company_id` con validación `.uuid()` rechazaba empresas importadas de Redmine con IDs numéricos~~ — **Resuelto**: validación cambiada a `.min(1)` en `UserRequestFormSchema` (frontend y backend); los IDs de Redmine son enteros, no UUIDs
24. ~~`RequestsPanel` enviaba `company_name` en el body del PATCH del modal de edición~~ — **Resuelto**: campo `company_name` puesto como solo lectura en el modal; eliminado del body enviado al backend (el backend espera `company_name_requested` vía mapeo interno)
25. ~~`config-agent/agent.ts` usaba un cast temporal `(classifier as unknown as { callRaw... })` para llamar al LLM~~ — **Resuelto**: extraída capa `services/llm/index.ts` con `getLLMProvider()` consumido directamente por el agente; el clasificador también pasa por esta capa internamente.
26. ~~`PendingReviewsPanel` — botón "Nota" no mostraba historial de reasignaciones~~ — **Resuelto**: el botón llamaba `retryRedmineNoteSync` en vez de mostrar el historial. Ahora abre un modal con la tabla de reasignaciones (`reassignment_history`), estado de sync de cada nota Redmine (cargado via `fetchPendingReviewDetail`), y el botón "Reintentar sync Redmine" movido al footer del modal.
27. ~~`PendingReviewsPanel` — sin exportación CSV~~ — **Resuelto** (nueva funcionalidad): botón "Exportar CSV" en la cabecera exporta todas las revisiones visibles según el filtro activo. CSV UTF-8 con BOM (compatible con Excel en español), separador coma, nombre `revisiones_YYYY-MM-DD.csv`. Columnas principales: `ticket_id, empresa, asignado_actual, rol_actual, estado, reasignaciones, fecha_creacion, fecha_resolucion, dominio, naturaleza, descripcion_resumida`. Para revisiones con reasignaciones: filas de detalle adicionales con `de_rol, a_rol, motivo, fecha_reasignacion, sync_redmine`.
28. ~~`review-tokens/index.ts` — token JWT con `aud` duplicado~~ — **Resuelto**: `signReviewToken` usaba `audience: 'review'` (estándar JWT) y además la interfaz `ReviewTokenPayload` declaraba `aud: 'review'`, lo que podía causar doble escritura dependiendo de la versión de jsonwebtoken. Corregido: el campo `aud` solo se declara en los options de `jwt.sign`, no en el payload manual.
29. ~~Ruta `/api/review/:token` no capturaba el JWT (los puntos del token fragmentaban el parámetro de ruta en Fastify)~~ — **Resuelto**: ruta cambiada a `/api/review?t=<token>` como query param; el frontend actualizado con `?t=` en todas las URLs de revisión.
30. ~~PUT Redmine devolvía 422 al intentar reasignar un usuario sin membresía en el proyecto~~ — **Resuelto**: `RedmineClient.updateIssueAssignee()` llama ahora a `ensureMembership(projectIdentifier, userId)` antes de la actualización del assignee; si ya existe la membresía, Redmine responde 422 (ignorado por el método privado) o 201/200.
31. ~~`SOLUTION_VALUES` no incluía `'Academia Cobertec'`~~ — **Resuelto**: añadida a la constante en `backend/src/types.ts`; el LLM puede ahora clasificar correctamente tickets del módulo Academia sin que el validador los rechace ni aplique fallback.
32. ~~`ConfigProposalsPanel` solo visible en el menú para `isSupportLead`~~ — **Resuelto**: condición de menú en `App.tsx` expandida a `isAdmin || isSuperAdmin || isSupportLead`; guard del backend (`admin-config-proposals.ts`) actualizado a `isSupportLead || isSuperAdmin || isAdmin` para evitar 403 a administradores.
33. ~~`PendingReviewsPanel` mostraba roles técnicos en lugar de nombres reales en la columna "Reasignado por" y en el historial del modal "Nota"~~ — **Resuelto**: `listPendingReviews` en `store.ts` enriquece cada fila con un subquery correlacionado sobre `review_audit_log` (action='reassigned' ORDER BY created_at DESC LIMIT 1) → campo `last_reassigned_by_name`; el modal "Nota" correlaciona `notaReassignEvents` con `notaHistory` por índice para mostrar `"<actor_name> reasignó de <from_role> a <to_role>"`; el CSV añade columnas `reasignado_por` (en filas de resumen) y `actor_nombre` (en filas de detalle).
34. ~~`review_audit_log.actor_name` era `null` en reasignaciones vía email (token público) y vía panel admin~~ — **Resuelto**: en `routes/review.ts` se añade `actor_name: review.current_assignee_name` al evento `'reassigned'`; en `routes/admin-reviews.ts` se añade `getContactByUserId(auth.sub)` (nuevo método en `IdentityStore`) para resolver el nombre del admin antes de insertar el log.

---

## Mejoras pendientes antes de producción

| Prioridad | Área | Descripción | Bloqueante |
|-----------|------|-------------|------------|
| **Alta** | Backend | Session store en memoria (Map) → migrar a SQLite/Redis para sobrevivir reinicios | Decisión de arquitectura |
| **Alta** | Config | Definir `redmine_defaults.default_assignee_id` con ID numérico real de Redmine | Cobertec debe dar el ID |
| ~~**Alta**~~ | ~~Config~~ | ~~Definir `redmine_defaults.unassignable_fallback_assignee_id`~~ | ~~Resuelto: valor 736~~ |
| **Alta** | Config | Cambiar `company_to_project._default` de `"cobertec-intake-test"` a proyecto de producción | Cobertec debe definirlo |
| **Alta** | Backend | Activar impersonación Redmine (`X-Redmine-Switch-User`) en producción — `redmine_login` ya está poblado para usuarios `@cobertec.com` | Decisión operativa |
| **Alta** | Config | Verificar que los IDs de custom fields (21-28) existen en la instancia Redmine de Cobertec | Acceso a Redmine de prod |
| ~~**Media**~~ | ~~Frontend~~ | ~~Llamadas a `submitIntake`/`confirmIntake` sin timeout explícito — añadir `AbortController`~~ | ~~Resuelto: `REQUEST_TIMEOUT_MS = 25_000` con `AbortController` en `frontend/src/services/api.ts`~~ |
| **Baja** | Seguridad | Los archivos `backend/scripts/redmine_*.json` contienen datos de usuarios — añadir al `.gitignore` | — |
| **Baja** | Scripts | Documentar uso de `import-redmine-clients.ts` e `import-new-projects.ts` | — |
| **Alta** | Backend | Configurar SMTP real (host, puerto, credenciales) para que los emails de bienvenida, rechazo y recuperación funcionen en producción | Cobertec debe dar proveedor SMTP |
| **Alta** | Backend | Cambiar `ADMIN_NOTIFICATION_EMAILS` en `routes/requests.ts` a `soporte@cobertec.com` + `j.quintanilla@cobertec.com` antes de producción | — |
| **Alta** | Config | Configurar al menos un usuario como `is_support_lead = 1` (Bruno Saiz) ejecutando `npx tsx scripts/set-support-lead.ts <email>` antes de activar el flujo de revisión | — |
| **Alta** | Config | Verificar que `APP_URL` apunta al dominio público correcto en producción — los emails de revisión llevan links absolutos a `/review/<token>` | — |
| **Media** | Redmine | Validar el formato de la nota privada en la instancia Redmine real — confirmar que aparece como privada y no visible para el cliente | Acceso a Redmine de prod |
| ~~**Baja**~~ | ~~Ops~~ | ~~Verificar que el cron del agente (03:00 UTC, configurable con `CONFIG_AGENT_CRON_HOUR`) no coincide con ventanas de mantenimiento de Cobertec~~ | **Verificado 2026-05-07**: agente probado manualmente con `run-agent-once.ts`; detectó 2 patrones y generó 2 propuestas en `config_change_log`. Flujo end-to-end funcional. |
| **Media** | Ops | Configurar ventana de cron del agente (`CONFIG_AGENT_CRON_HOUR`) para que no coincida con ventanas de mantenimiento de Cobertec en producción | Cobertec debe confirmar horario |

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
| `BODY_LIMIT_MB` | Tamaño máximo request | `25` |
| `CORS_ORIGIN` | Origen CORS permitido | `http://localhost:5173` |
| `APP_URL` | URL pública del frontend (para links en emails) | `http://localhost:5173` |
| `SMTP_HOST` | Servidor SMTP | — |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_USER` | Usuario SMTP | — |
| `SMTP_PASS` | Contraseña SMTP | — |
| `SMTP_FROM` | Dirección remitente | `noreply@cobertec.com` |
| `REQUIRE_HUMAN_REVIEW` | Activa el flujo de revisión humana post-Redmine | `true` |
| `INTAKE_DB_PATH` | Ruta DB de intake (intake.db) | `data/intake.db` |
| `REVIEW_TOKEN_TTL_DAYS` | TTL tokens de revisión enviados a técnicos | `7` |
| `REASSIGNMENT_PATTERN_BUFFER_DAYS` | Días de vida de un patrón en estado buffering | `14` |
| `CONFIG_AGENT_CRON_HOUR` | Hora UTC del cron del agente de configuración | `3` |

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
| Poblar redmine_login de usuarios Cobertec | Ejecutar `import-cobertec-users.ts` — lo hace automáticamente para todos los `@cobertec.com` |
| Poblar redmine_login de usuario concreto | Query directa: `UPDATE users SET redmine_login='login.redmine' WHERE id='...'` |
| Nuevo tipo de evento en revisión | `backend/src/intake-store-types.ts` → `ReviewAuditAction` |
| Cambiar política del agente (umbrales, ventanas) | Variables de entorno `REASSIGNMENT_PATTERN_BUFFER_DAYS`, `CONFIG_AGENT_CRON_HOUR` |
| Nuevo template de email | `backend/src/services/mailer/mailer-index.ts` |
| Marcar a alguien como support lead | `cd backend && npx tsx scripts/set-support-lead.ts <email>` |
| Nuevo proveedor LLM | `backend/src/services/classifier/provider-*.ts` + factory en `backend/src/services/llm/index.ts`; el clasificador y el agente lo heredan automáticamente |

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

### Pendientes de gestión de usuarios

| Ítem | Estado |
|------|--------|
| ~~Recuperación de contraseña olvidada~~ | **Implementado** — `POST /forgot-password` + `POST /reset-password` en `routes/auth.ts`; falta configurar SMTP |
| ~~Solicitud de alta de nuevo usuario~~ | **Implementado** — `RequestAccessPage` en `/solicitar-acceso`; rutas en `routes/requests.ts` |
| ~~Panel admin para aprobar/rechazar altas~~ | **Implementado** — `RequestsPanel` con aprobar/rechazar/editar; falta SMTP para emails |
| Sincronización contraseña con Redmine al cambiar | Activar cuando salga del piloto — `redmine_user_id` ya está disponible |
| Configurar SMTP | Pendiente — Cobertec debe dar proveedor y credenciales |

---

## Alta de usuarios, emails y mejoras de login — implementado (sesión 2026-04)

### Qué se construyó

1. **Toggle de visibilidad de contraseña** (`LoginPage.tsx`): icono ojo/ojo-tachado a la derecha del campo; estado `showPassword`; `type="text"|"password"` dinámico; `tabIndex={-1}` para no interrumpir el flujo de teclado.

2. **Recuperación de contraseña** (`ForgotPasswordPage.tsx` + `ResetPasswordPage.tsx`):
   - `POST /api/auth/forgot-password` — genera token JWT de reset (1h), envía email con link `APP_URL/reset-password?token=...`; siempre responde `ok: true`
   - `POST /api/auth/reset-password` — verifica token, actualiza contraseña, invalida el token
   - Accesibles sin login desde el flujo de `App.tsx`

3. **Servicio de email** (`backend/src/services/mailer/`):
   - Clase `Mailer` con nodemailer; 4 templates: nueva solicitud (admins), bienvenida (usuario aprobado), rechazo, reset de contraseña
   - Sin SMTP configurado: loguea en consola (modo dev)

4. **Formulario público de solicitud de alta** (`frontend/src/pages/RequestAccessPage.tsx`):
   - Ruta `/solicitar-acceso` — no requiere login
   - Carga empresas activas via `GET /api/requests/companies`
   - Valida y envía via `POST /api/requests`
   - Link desde `LoginPage`: "¿No tienes cuenta? Solicitar acceso"

5. **Panel de gestión de solicitudes** (`frontend/src/pages/RequestsPanel.tsx`):
   - Accesible desde nav para admins: "Solicitudes de alta"
   - Tabs: Pendientes / Aprobadas / Rechazadas
   - Acciones: Aprobar → crea usuario en Redmine + identity.db + email; Rechazar → pide motivo + email; Editar → modal con todos los campos
   - Modal de edición: Nombre, Apellido, Email, Empresa (select), Teléfono

6. **Backend de solicitudes** (`backend/src/routes/requests.ts`):
   - 6 endpoints bajo `/api/requests`; tabla `user_requests` en identity.db
   - `generateRedmineLogin()` genera login único con deduplicación
   - Aprobación crea usuario real en Redmine (si configurado) y añade membresía al proyecto

7. **Tailwind CSS** integrado en frontend:
   - `preflight: false` para no romper CSS existente
   - Solo `@tailwind utilities` importado
   - Páginas nuevas usan Tailwind; componentes existentes mantienen sus clases CSS propias

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/routes/requests.ts` | 6 rutas de alta de usuarios |
| `backend/src/services/mailer/mailer-index.ts` | Clase Mailer con nodemailer |
| `backend/src/services/mailer/index.ts` | Barrel re-export |
| `backend/src/services/email/service.ts` | Servicio de email base |
| `backend/scripts/import-cobertec-users.ts` | Importa usuarios @cobertec.com desde Redmine |
| `backend/scripts/check-users.ts` | Utilidad de diagnóstico de usuarios |
| `frontend/src/pages/RequestAccessPage.tsx` | Formulario público de alta |
| `frontend/src/pages/RequestsPanel.tsx` | Panel admin de solicitudes |
| `frontend/src/components/ForgotPasswordPage.tsx` | Página forgot password |
| `frontend/src/components/ResetPasswordPage.tsx` | Página reset password |
| `frontend/tailwind.config.js` | Config Tailwind (preflight: false) |
| `frontend/postcss.config.js` | Config PostCSS |
| `frontend/src/tailwind.css` | Entry point Tailwind (solo utilities) |

---

## Login con email o usuario Redmine — implementado (sesión 2026-04)

El campo de login acepta tanto el email del contacto como el `redmine_login` del usuario.

### Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `backend/src/services/identity/store.ts` | Nuevo método `getUserByRedmineLogin(login)` — mismo JOIN a contacts que `getUserByEmail()`, busca por `users.redmine_login COLLATE NOCASE` |
| `backend/src/services/auth/service.ts` | `login()` hace `getUserByEmail(email) ?? getUserByRedmineLogin(email)` — si el primer lookup devuelve null, intenta el segundo sin cambio de interfaz ni mensajes de error adicionales |
| `frontend/src/components/LoginPage.tsx` | Label "Email" → "Email o usuario"; `type="email"` → `type="text"` (el browser rechaza logins tipo `juan_perez` en campos email); `placeholder` y mensaje de validación actualizados; `autoComplete="username"` |

### Comportamiento

- Si el usuario teclea `usuario@empresa.com` → se resuelve por `contacts.email`
- Si el usuario teclea `juan_perez` → se resuelve por `users.redmine_login`
- El lookup es COLLATE NOCASE en ambos casos
- Si ninguno encuentra el usuario → error `INVALID_CREDENTIALS` (igual que antes)
- No hay cambio en el contrato de la API ni en los tipos

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

**¿Por qué `redmine_login` sirve ahora también como identificador de login?**
La columna se añadió inicialmente para impersonación (`X-Redmine-Switch-User`). Al importar usuarios con `import-cobertec-users.ts` se puebla sistemáticamente. Dado que los usuarios internos de Cobertec conocen su login de Redmine pero pueden no saber el email asociado en identity.db, se habilitó `getUserByRedmineLogin()` como fallback en `login()`. Esto no cambia la seguridad: el flujo de verificación bcrypt es idéntico.

### SMTP y flujo de alta de usuarios

**¿Por qué nodemailer sin SMTP configurado en desarrollo?**
El `Mailer` está implementado completo. Si `SMTP_HOST` no está en el entorno, los métodos de envío loguean el contenido en consola en lugar de fallar. Esto permite desarrollar y probar el flujo completo sin un servidor de correo real. En producción solo hay que añadir las 5 variables `SMTP_*`.

**¿Por qué el formulario de alta va bajo `/solicitar-acceso` en el mismo frontend?**
Decisión conservadora: mismo dominio, mismo deployment, sin gestionar un subdominio separado. La ruta pública no requiere login — `App.tsx` detecta `window.location.pathname === '/solicitar-acceso'` antes de intentar el refresh silencioso y muestra `<RequestAccessPage />` directamente.

**¿Por qué `forgot-password` siempre responde `ok: true`?**
Seguridad estándar: no revelar si un email existe en la base de datos. El usuario siempre ve "si el email existe, recibirás un enlace", independientemente de si la cuenta existe o no.

**Decisiones pendientes de confirmar con Cobertec antes de producción:**
1. Proveedor SMTP para emails transaccionales (credenciales de servidor)
2. ¿Quién es el admin de Cobertec que aprueba las altas? (configurar su cuenta como superadmin si no lo está)
3. ¿Los nuevos usuarios de Redmine deben crearse con algún rol adicional además de Cliente SAT (role_id: 6)?
4. Confirmar `ADMIN_NOTIFICATION_EMAILS` en `routes/requests.ts` (actualmente solo `o.bianchi@cobertec.com`)

---

## Solicitudes de alta mejoradas, Redmine en AdminPanel y toggles de contraseña — sesión 2026-04b

### Qué se construyó

1. **Formulario de alta: empresa como texto libre** (`RequestAccessPage.tsx`):
   - El campo empresa cambia de `<select>` (cargado desde API) a `<input type="text">` libre
   - El teléfono pasa de opcional a **obligatorio**
   - Backend: `UserRequestFormSchema` usa `company_name: z.string().min(1)` en lugar de `company_id`; `phone: z.string().min(1)` (requerido)
   - El flujo admin ahora es: solicitud llega con nombre libre → admin asigna empresa concreta en el modal de edición → aprueba

2. **Esquema `user_requests` actualizado**:
   - Nueva columna `company_name_requested TEXT` — guarda el nombre libre del solicitante
   - `company_id` ahora nullable — se asigna por el admin tras revisar la solicitud
   - Migración automática al iniciar el backend: detecta si falta `company_name_requested`, recrea la tabla (SQLite no permite ALTER COLUMN nullable)
   - `PATCH /admin/:id` mapea `body.company_name → company_name_requested` y acepta `company_id` opcional
   - `POST /admin/:id/approve` bloquea con 409 `COMPANY_NOT_ASSIGNED` si `company_id` es null

3. **Proyectos Redmine en AdminPanel** (`routes/admin.ts` + `AdminPanel.tsx`):
   - Nuevo endpoint `GET /api/admin/redmine-projects`: pagina la API de Redmine, filtra activos (status=1), cachea 5 min en módulo; `?refresh=true` invalida caché
   - `AdminPanel`: estado `redmineProjects` + botón "Sincronizar proyectos Redmine" con spinner; muestra recuento de proyectos cargados
   - `CompanyFormModal`: cuando `redmineProjects` está cargado, muestra `<select>` dropdown para `redmine_project_id`; si no, input de texto libre

4. **Toggle visibilidad de contraseña** (`ChangePasswordPage.tsx` + `ResetPasswordPage.tsx`):
   - Mismo patrón que `LoginPage.tsx`: componentes `EyeIcon`/`EyeOffIcon` SVG + estado `showX` + clases `.password-wrapper`/`.password-toggle`
   - `ChangePasswordPage`: tres toggles (contraseña actual, nueva, confirmar)
   - `ResetPasswordPage`: dos toggles (nueva contraseña, confirmar)

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `backend/src/identity-types.ts` | `UserRequest.company_id: string \| null`; nuevo `UserRequest.company_name_requested: string`; `UserRequest.phone: string`; `UserRequestFormSchema` usa `company_name` (texto) en lugar de `company_id` |
| `backend/src/services/identity/store.ts` | Schema `user_requests` actualizado; migración automática de tabla; `createUserRequest` acepta `company_name_requested`; `listUserRequests` usa LEFT JOIN |
| `backend/src/routes/requests.ts` | POST usa `company_name` libre; PATCH mapea a `company_name_requested`; approve bloquea si `company_id` null; reject con null guard |
| `backend/src/routes/admin.ts` | Nuevo endpoint `GET /redmine-projects` con caché en módulo |
| `frontend/src/auth-types.ts` | `UserRequest` actualizado: `company_id \| null`, `company_name_requested`, `phone` requerido |
| `frontend/src/pages/RequestAccessPage.tsx` | Empresa: `<select>` → `<input type="text">`; teléfono requerido; sin `useEffect` de empresas |
| `frontend/src/pages/RequestsPanel.tsx` | URLs relativas en `authenticatedFetch`; modal edición con texto libre + selector ID; badge "(sin asignar)"; botón Aprobar deshabilitado sin company_id |
| `frontend/src/services/admin-api.ts` | Nueva función `fetchRedmineProjects(refresh?)` e interfaz `RedmineProject` |
| `frontend/src/components/AdminPanel.tsx` | Estado `redmineProjects`; botón Sincronizar; `CompanyFormModal` con dropdown condicional |
| `frontend/src/components/ChangePasswordPage.tsx` | Eye/EyeOff toggles en los 3 campos de contraseña |
| `frontend/src/components/ResetPasswordPage.tsx` | Eye/EyeOff toggles en los 2 campos de contraseña |

---

## Mensajes de error amigables y validaciones en español — sesión 2026-04c

### Qué se corrigió

1. **`frontend/src/services/api.ts` — Errores HTTP con mensajes amigables en español**:
   - Los errores HTTP crudos (códigos numéricos sin contexto) se reemplazaron por mensajes comprensibles por código:
     - 401 → "Tu sesión ha expirado. Por favor, vuelve a iniciar sesión."
     - 403 → "No tienes permiso para realizar esta acción."
     - 500 → "Ha ocurrido un error en el servidor. Inténtalo de nuevo más tarde."
     - Resto → "Ha ocurrido un error inesperado. Inténtalo de nuevo."
   - Timeout con `AbortController` implementado: `REQUEST_TIMEOUT_MS = 25_000`

2. **`backend/src/routes/intake.ts` — Errores Zod sin path técnico**:
   - Los errores de validación Zod ahora exponen solo el campo `message` al cliente, sin el array `path` (que contenía nombres de campos internos en inglés)

3. **`backend/src/services/auth/service.ts` — Error de sesión en español**:
   - El mensaje interno "Usuario no encontrado" (que podía llegar al cliente en flujos de refresh) se sustituyó por: `"Error de sesión. Cierra sesión y vuelve a entrar."`

4. **`frontend/src/components/ResetPasswordPage.tsx` — Token expirado con enlace de acción**:
   - Cuando el token de reset ha expirado, el mensaje de error incluye un enlace directo a `/forgot-password` para que el usuario pueda solicitar uno nuevo sin tener que navegar manualmente

5. **`backend/src/identity-types.ts` — `RejectRequestSchema` en español**:
   - El campo `reason` lleva mensaje de error explícito en español: `"El motivo del rechazo es obligatorio"` (antes era el default "Required" de Zod en inglés)

6. **`backend/src/routes/auth.ts` — Rate limiting en español**:
   - El `errorResponseBuilder` de `@fastify/rate-limit` devuelve: `"Demasiados intentos. Espera X segundos antes de volver a intentarlo."` (X = segundos restantes)

### Regla consolidada

**Todos los mensajes visibles por el usuario deben estar en español sin excepción.** Aplica a: errores de validación Zod, respuestas de error HTTP, mensajes de rate limiting, textos de UI, emails, y cualquier cadena que llegue al usuario final. Los nombres de campos internos (path de Zod, códigos de error internos) no deben exponerse directamente al cliente.

---

## Adjuntos múltiples y paste de capturas — sesión 2026-05

### Qué se construyó

1. **Paste de capturas de pantalla** (`IntakeForm.tsx`): handler `onPaste` en el textarea detecta imágenes en el portapapeles (Ctrl+V). Si hay imágenes, las intercepta y añade como adjuntos; si no, deja pasar el paste de texto sin interferir.

2. **Galería de miniaturas** (`IntakeForm.tsx`): grid responsive de tarjetas 80×80. Las imágenes muestran preview con `object-fit: cover`. Los archivos no imagen muestran un icono 📄 con la extensión. Cada tarjeta tiene nombre truncado (tooltip completo), tamaño legible y botón ✕ para borrado individual.

3. **Contador de tamaño total** (`IntakeForm.tsx`): muestra "Adjuntos: X.X MB / 25 MB" con color verde (<60%), ámbar (60-90%) o rojo (>90%).

4. **Bloqueo de ejecutables**: extensiones bloqueadas validadas en frontend (mensajes amigables sin envío) y en backend (400 `EXECUTABLE_NOT_ALLOWED`). Lista idéntica en ambos lados.

5. **Límite 25 MB**: `BODY_LIMIT_MB` subido de 10 a 25. El backend responde 413 con mensaje amigable en español (`PAYLOAD_TOO_LARGE`) en lugar del HTML por defecto de Fastify. El frontend tiene margen de seguridad de 1 MB (`SAFE_LIMIT_BYTES = 24 MB`) para JSON + texto.

6. **Error handler global** (`index.ts`): `app.setErrorHandler` unificado que maneja `FST_ERR_CTP_BODY_TOO_LARGE` (→ 413 español) y `AuthServiceError` (comportamiento idéntico al auth plugin, que queda reemplazado por este handler al estar en la misma scope vía fastify-plugin).

7. **Nombres de capturas pegadas**: formato `captura-YYYYMMDD-HHmmss.png` con sufijo `-N` si colisión (función `generatePasteFilename`).

8. **Cleanup de object URLs**: `useEffect` con cleanup que revoca todos los `preview_url` al desmontar el componente, evitando memory leaks.

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/utils/blocked-extensions.ts` | Lista negra de extensiones + `isExecutableExtension()` |
| `frontend/src/utils/attachments.ts` | Constantes y utilidades: `BLOCKED_EXTENSIONS`, `MAX_TOTAL_BYTES`, `SAFE_LIMIT_BYTES`, `isExecutableExtension()`, `generatePasteFilename()`, `formatBytes()`, `getExtension()` |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `backend/src/index.ts` | Default `BODY_LIMIT_MB` 10 → 25; `setErrorHandler` global para `FST_ERR_CTP_BODY_TOO_LARGE` y `AuthServiceError` |
| `backend/src/routes/intake.ts` | Validación de extensiones bloqueadas en `/submit` y en `/confirm` action='edit' |
| `backend/.env` | `BODY_LIMIT_MB=25` |
| `frontend/src/types.ts` | Nuevo tipo `AttachmentItem` (local al frontend, no viaja al backend) |
| `frontend/src/components/IntakeForm.tsx` | Refactor completo: estado `AttachmentItem[]`, paste handler, galería, contador, cleanup |
| `frontend/src/services/api.ts` | Manejo de `data.error?.message` para pasar mensajes del backend directamente al usuario |
| `frontend/src/index.css` | Clases CSS para galería de adjuntos (`attachment-gallery`, `attachment-thumb`, etc.) |

---

## Pregunta aclaratoria única (LLM-driven) — sesión 2026-05b

### Qué se construyó

El sistema de preguntas dinámicas multi-paso (`DynamicQuestions.tsx` + `dynamic-questions.ts`) se reemplazó por un sistema de **pregunta aclaratoria única generada por el propio LLM**. El LLM decide si hay una ambigüedad concreta y resoluble, y si es así devuelve una sola pregunta con opciones cerradas (o abierta). Esto elimina la capa de generación determinista post-clasificación.

> **Supersedido por sesión 2026-05c** — ver sección siguiente.

---

## Pregunta aclaratoria determinista — sesión 2026-05c

### Qué cambió respecto a 2026-05b

La generación de la pregunta se movió del LLM a un módulo determinista `question-generator.ts`. El LLM **ya no decide si preguntar ni qué preguntar** — solo clasifica. La pregunta la genera siempre el backend justo después de la clasificación, basándose en `solution_associated`.

**La pregunta es ahora obligatoria** — no existe botón "Saltar". El usuario debe responder antes de ver la confirmación.

### Flujo completo

1. `POST /submit` → LLM clasifica (sin `clarifying_question` en su respuesta)
2. `question-generator.ts` genera siempre una `ClarifyingQuestion` basada en `solution_associated`
3. `ClassifiedResponse.clarifying_question` siempre `≠ null` → frontend pasa a `step='clarifying'`
4. Usuario responde → `POST /confirm { action: 'clarify', clarification_question, clarification_answer }`
5. Backend re-clasifica con la aclaración en el prompt; devuelve `ClassifiedResponse` con `clarifying_question: null`
6. Frontend pasa a `step='confirmation'`
7. La aclaración se incluye en la descripción del ticket Redmine

### Los casos del question-generator

**Caso 0 — Conflicto entre soluciones** (se evalúa antes que los demás):
- Condición: `confidence !== 'high'` AND `alternative_solutions.length > 0`
- El LLM declara en `alternative_solutions` las soluciones que consideró antes de elegir
- Las opciones se construyen dinámicamente: solución elegida + alternativas (máx 3 en total) + "Otra aplicación o servicio"
- Si `alternative_solutions` está vacío → se salta este caso

| Caso | Condición | Pregunta | Opciones | reason |
|------|-----------|----------|----------|--------|
| 0 — Conflicto | `confidence !== 'high'` AND `alternative_solutions.length > 0` | Para identificar mejor tu incidencia, ¿sobre qué solución o aplicación es tu consulta? | Dinámicas: solución elegida + alternativas (máx 3) + "Otra aplicación o servicio" | `heuristic_solution_conflict` |
| 1 — Movilsat ERP | `solution = 'Expertis / Movilsat ERP'` | Para identificar mejor la incidencia, indica el módulo de Movilsat ERP en el que te ocurre. | GMAO, Proyectos, General, Financiero, Logística, Comercial, CRM, Fabricación, No sé, Otro | `heuristic_expertis_module` |
| 2 — Movilsat App | `solution = 'Movilsat'` | ¿Dónde estás viendo el problema? | En el programa de gestión Movilsat ERP (ordenador de oficina), En la app móvil Movilsat (móvil o tablet de los técnicos), En ambos, No sé | `heuristic_movilsat_device` |
| 3 — Solución concreta | Cualquier otra solución con label conocido (Sistemas, Portal OT, App Fichajes, Soluciones IA, Planificador Inteligente, Business Intelligence) | ¿Tu consulta es sobre {label}? | Sí, No | `heuristic_solution_confirm` |
| 4 — Ambiguo | Comercial, Resto o sin identificar | ¿Dónde estás experimentando este problema? | En el programa de gestión Movilsat ERP, En la app móvil Movilsat, Otro | `heuristic_ambiguous` |

### Caso especial: Caso 3 + respuesta "No"

Cuando `reason = 'heuristic_solution_confirm'` y el usuario responde "No":
- El backend **no re-clasifica** todavía
- Devuelve una nueva `ClassifiedResponse` con pregunta de texto libre: `"¿Sobre qué solución o aplicación es tu consulta? Descríbelo brevemente."` (`options: null`, `reason: 'heuristic_solution_confirm_no'`)
- Marca `clarification_attempted = true` (no habrá tercera pregunta)
- La respuesta de texto libre del usuario se usa en el siguiente `action='clarify'` para re-clasificar normalmente

### Lógica anti-bucle

`clarification_attempted` en la sesión impide más de una iteración de `action='clarify'` (salvo el caso especial "No" que consume el flag en la primera llamada, reservando la segunda para re-clasificar). La acción `action='edit'` resetea el estado de clarificación.

### Resolución determinista del assignee

`assignee-resolver.ts` aplica las reglas de `assignment-rules.json` de forma determinista sobre el resultado del LLM, sobreescribiendo `suggested_assignee`.

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/services/classifier/assignee-resolver.ts` | Resolución determinista de assignee por reglas de `assignment-rules.json` |
| `backend/src/services/classifier/question-generator.ts` | Genera `ClarifyingQuestion` determinista según `solution_associated`; 4 casos |
| `frontend/src/components/ClarifyingQuestion.tsx` | Componente pregunta única; botones para opciones o textarea libre; `onAnswer` + `loading`; **sin botón Saltar** |

### Archivos eliminados

| Archivo | Motivo |
|---------|--------|
| `backend/src/services/classifier/dynamic-questions.ts` | Reemplazado por `question-generator.ts` |
| `frontend/src/components/DynamicQuestions.tsx` | Reemplazado por `ClarifyingQuestion.tsx` |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `backend/src/types.ts` | Nueva interfaz `ClarifyingQuestion`; `ConfirmationPayload.action` incluye `'clarify'`; `ClassifiedResponse.clarifying_question`; `FlowStep='clarifying'`; constantes Zod; `ClassificationRequest.clarification?`; eventos: eliminado `clarifying_question_skipped`, añadido `reason` en `clarifying_question_generated` |
| `backend/src/middleware/validation.ts` | `ConfirmationPayloadSchema` acepta `action: 'clarify'`; `superRefine` exige ambos campos de clarificación cuando `action='clarify'` |
| `backend/src/services/classifier/index.ts` | Importa `generateClarifyingQuestion`; llama siempre en primera clasificación; nunca en re-clasificación (`request.clarification` presente) |
| `backend/src/services/classifier/prompt-builder.ts` | Eliminada sección `## PREGUNTA ACLARATORIA` y campo `clarifying_question` del JSON schema del LLM; user prompt mantiene inyección de `clarification` para re-clasificación |
| `backend/src/services/classifier/response-validator.ts` | Eliminada validación de `clarifying_question` del schema Zod; tipo de retorno simplificado (ya no devuelve `clarifying_question`); usa `.passthrough()` para ignorar campos extra del LLM |
| `backend/src/routes/intake.ts` | SessionStore: `clarifying_question_reason` reemplaza `clarifying_question_was_shown`; handler `clarify` detecta `heuristic_solution_confirm + "No"` → devuelve pregunta follow-up; eliminado log `clarifying_question_skipped`; log `clarifying_question_generated` incluye `reason` |
| `backend/src/services/redmine/index.ts` | `createTicket()` acepta `clarification?`; lógica de `unassignable_fallback_assignee_id` (736 = Bruno Saiz) |
| `backend/src/services/redmine/ticket-composer.ts` | `composeSubject()` acepta `forceReview?`; `composeDescription()` acepta `clarification?` y añade sección "Aclaración del usuario" |
| `frontend/src/types.ts` | Espeja cambios del backend; nota sobre eliminación de `clarifying_question_skipped` |
| `frontend/src/services/api.ts` | Nueva función `clarifyIntake(sessionId, question, answer)` |
| `frontend/src/App.tsx` | Eliminado `handleClarifySkip`; `handleClarifyAnswer` redirige a `'clarifying'` si la respuesta trae nueva `clarifying_question` (caso "No"); `<ClarifyingQuestion>` sin prop `onSkip` |
| `frontend/src/components/StepIndicator.tsx` | `step='clarifying'` mapea a índice 1 |

---

## Aviso de coste para incidencias facturables — sesión 2026-05d

### Qué se construyó

Sistema de facturación configurable que muestra un aviso de coste mínimo (120€) que el usuario debe aceptar explícitamente antes de confirmar incidencias facturables. La aceptación se registra en la descripción del ticket Redmine.

### Flujo

**Para natures directamente facturables** (`peticion_cambio_mejora`, `configuracion` con dominios específicos):
1. Submit → LLM clasifica → `evaluateBillable` → `is_billable: true`
2. `ClassifiedResponse.billable` incluye el aviso con texto y coste
3. Pregunta aclaratoria normal sigue su flujo habitual
4. En la pantalla de confirmación: aviso + checkbox obligatorio
5. Usuario marca checkbox → `onConfirm({ accepted: true, accepted_at: '...' })`
6. Backend valida `billing_acceptance.accepted === true` → crea ticket con línea de coste en la descripción

**Para `importacion_exportacion`** (requires_disambiguation):
1. Submit → LLM clasifica → `evaluateBillable` → `requires_disambiguation: true`
2. Pregunta de desambiguación de facturación **reemplaza** la pregunta aclaratoria normal
3. Usuario responde via `action='clarify'` → backend detecta `billing_disambiguation_question_id` en sesión
4. Backend re-evalúa sin llamar al LLM → si `fuera_alcance` → `is_billable: true`, si `en_alcance` → null
5. Frontend pasa a confirmación con el `billable` actualizado

### Arquitectura del módulo

**`billable-evaluator.ts`** — tres funciones:
- `evaluateBillable(classification, disambiguationAnswers, config)` → `BillableInfo | null`
- `buildBillingDisambiguationQuestion(questionId, config)` → `ClarifyingQuestion`
- `findDisambiguationOptionId(questionId, selectedLabel, config)` → `string | null`

**Reglas en `config/redmine-mapping.json`** → nueva sección `billable_rules`:
- `default_min_cost_eur`: 120
- `rules`: array de reglas con `nature`, `domains?`, `min_cost_eur`, `requires_disambiguation?`
- `disambiguation_questions`: mapa `questionId` → `{ question, options: [{id, label}] }`

**SessionState** — nuevos campos:
- `billable: BillableInfo | null` — evaluación más reciente
- `billing_disambiguation_question_id: string | null` — si hay desambiguación pendiente
- `billing_disambiguation_answer?: DisambiguationAnswer` — respuesta guardada para re-evaluaciones

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/services/classifier/billable-evaluator.ts` | Evaluación determinista de facturación |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `config/redmine-mapping.json` | Nueva sección `billable_rules` al final |
| `backend/src/config/loader.ts` | Nuevas interfaces `BillableRuleConfig`, `DisambiguationQuestionOption`, `DisambiguationQuestionConfig`, `BillableRulesConfig`; campo `billable_rules?` en `RedmineMappingConfig` |
| `backend/src/types.ts` | Nuevas interfaces `BillableInfo`, `BillingAcceptance`; `is_billing_disambiguation?` en `ClarifyingQuestion`; `billable` en `ClassifiedResponse`; `billing_acceptance?` en `ConfirmationPayload` |
| `frontend/src/types.ts` | Espejo de los nuevos tipos del backend |
| `backend/src/middleware/validation.ts` | Campo `billing_acceptance` opcional en `ConfirmationPayloadSchema` |
| `backend/src/routes/intake.ts` | Integración completa: evaluación en submit/edit/clarify; handler especial billing disambiguation; validación en confirm |
| `backend/src/services/redmine/ticket-composer.ts` | `composeDescription()` acepta `billable?` y `billingAcceptance?`; añade línea "Coste mínimo aceptado" |
| `backend/src/services/redmine/index.ts` | `createTicket()` acepta y propaga `billable?` y `billingAcceptance?` |
| `frontend/src/components/ConfirmationView.tsx` | Reemplazado `BILLABLE_NEEDS` hardcoded por `data.billable`; `onConfirm` pasa `BillingAcceptance`; texto del aviso desde `billable.notice_text` |
| `frontend/src/App.tsx` | `handleConfirm` acepta y propaga `BillingAcceptance` |

---

## Fix asignación import/export y mapeo de IDs — sesión 2026-04e

### Qué se corrigió

1. **`config/redmine-mapping.json`** — `logistica_formacion` corregido de ID 21 a ID 525 (Hildegart Nieto). El ID 21 es Lorena Baños (formación financiero/general), no la persona responsable de logística.

2. **`docs/redmine-users.md`** — Tabla de referencia corregida:
   - ID 21: era "Andres Arnaiz" → correcto: **Lorena Baños** (login: Financiero)
   - ID 221: era "Álvaro Andrés" → correcto: **Andrés Arnaiz** (login: a.arnaiz)
   - Nota sobre IDs 221/322 corregida (son personas distintas)

3. **Resolver de asignaciones** (`assignee-resolver.ts` + `loader.ts`) — El resolver ahora acepta un campo opcional `nature` en las reglas de `assignment-rules.json`:
   - Si la regla no tiene `nature` → comportamiento anterior (wildcard implícito, compatibilidad hacia atrás)
   - Si la regla tiene `nature: "*"` → wildcard explícito
   - Si la regla tiene `nature: "importacion_exportacion"` → solo matchea esa nature
   - También corregido: `solution: "*"` ahora actúa como wildcard (antes solo `undefined`/vacío era wildcard)
   - Añadido guard `if (!rule.assignee) continue` para objetos de comentario en el JSON

4. **`config/assignment-rules.json`** — Nueva regla catch-all priority 3:
   ```json
   { "priority": 3, "nature": "importacion_exportacion", "block": "*", "module": "*", "need": "*", "solution": "*", "assignee": "desarrollo_exportaciones" }
   ```
   Insertada antes de la regla `need: "formacion"`. Garantiza que cualquier `importacion_exportacion` que no matchee una regla priority 1/2 más específica vaya a Hildegart Nieto (ID 525).

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `config/redmine-mapping.json` | `logistica_formacion: 21 → 525` |
| `docs/redmine-users.md` | IDs 21 y 221 corregidos; nota sobre 221/322 actualizada |
| `backend/src/config/loader.ts` | `nature?: string` añadido a interfaz `AssignmentRule` |
| `backend/src/services/classifier/assignee-resolver.ts` | Evalúa `matchNature`; `solution: "*"` como wildcard; guard para reglas sin `assignee` |
| `config/assignment-rules.json` | Nueva regla priority 3 catch-all por `nature: importacion_exportacion` |

### Decisión de diseño

`nature` ausente en una regla se trata como wildcard (compatible con todas las reglas existentes que no tienen este campo). Esto mantiene compatibilidad hacia atrás sin requerir migración de ninguna regla existente.

---

## Fuente de verdad de usuarios Cobertec consolidada — sesión 2026-05-05

### Qué se construyó

- `config/cobertec-users.json` (nuevo): 19 usuarios @cobertec.com con ID, login, nombre, email — uso programático
- `docs/redmine-users.md` (reescrito): tabla espejo del JSON + reglas de mantenimiento — consulta humana
- `backend/src/services/redmine/identity-validator.ts` (nuevo): `validateRedmineMapping()` valida `role_to_user_id`, `default_assignee_id` y `unassignable_fallback_assignee_id`; `lookupCobertecUser(id)` busca por ID
- `backend/src/index.ts` (modificado): importa y llama `validateRedmineMapping(getRedmineMapping())` tras `app.listen()`; log positivo si todo OK, `console.warn` con detalle si hay IDs huérfanos

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `config/cobertec-users.json` | **Nuevo** — fuente de verdad JSON con 19 usuarios |
| `docs/redmine-users.md` | Reescrito completo — tabla + reglas de mantenimiento |
| `backend/src/services/redmine/identity-validator.ts` | **Nuevo** — `validateRedmineMapping()` + `lookupCobertecUser()` |
| `backend/src/index.ts` | Importa validador; llama validación al arranque con log positivo/warning |

### Decisión de diseño

La lista de usuarios NO se duplica en CLAUDE.md — solo se referencia. El validador cubre los tres campos de ID en `redmine_defaults`. No bloquea el arranque — warning visible es suficiente; un ID huérfano en config intermedia no debe romper el servicio.

---

## Capa de revisión humana post-Redmine + agente de configuración — sesión 2026-05

### Qué se construyó

Sistema completo de revisión humana que opera **en paralelo al flujo del cliente**: cuando el cliente confirma, el ticket se crea en Redmine inmediatamente (sin afectar su SLA). Si `REQUIRE_HUMAN_REVIEW=true`, el backend además crea un `pending_review` en `intake.db`, genera un token JWT de revisión y envía un email al técnico asignado con un enlace de un solo uso.

**Flujo de revisión:**
1. Técnico recibe email → clic en enlace → `/review/<token>` (página pública, sin login)
2. Ve la descripción del problema y la clasificación propuesta
3. Puede **aprobar** (confirma asignación) o **reasignar** (elige otro rol)
4. Si reasigna: se actualiza Redmine vía API + se genera nuevo token para el siguiente técnico + se loguea el patrón en `reassignment_patterns`
5. Con 2 reasignaciones: se alerta al responsable de soporte (Bruno Saiz)
6. Con 3 reasignaciones: el ticket se escala (`status='escalated'`), solo Bruno puede resolverlo desde el panel de revisiones
7. El responsable de soporte también puede actuar desde `PendingReviewsPanel` (forzar aprobación o reasignación)

**Agente de configuración (nocturno):**
- Cada noche a las 03:00 UTC, el agente analiza los patrones de reasignación acumulados
- Si detecta que un rol `A` siempre se reasigna a `B` para un dominio concreto, propone un cambio en `assignment-rules.json`
- Las propuestas quedan en `config_change_log` con estado `'proposed'`
- Bruno las revisa en el panel "Propuestas IA" y decide aplicar o rechazar
- Al aplicar: se modifica el archivo JSON, se crea backup `.bak.{timestamp}`, se recarga la config en memoria

### Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/intake-store-types.ts` | Tipos de las 4 tablas de intake.db: `PendingReview`, `ReviewAuditLog`, `ReassignmentPattern`, `ConfigChangeLog` |
| `backend/src/services/intake-store/store.ts` | `IntakeStore` (SQLite) — 4 tablas, CRUD completo |
| `backend/src/services/intake-store/cron.ts` | Crons de expiración (`runExpiryCheck`) y detección out-of-sync (`runOutOfSyncCheck`) |
| `backend/src/services/review-tokens/index.ts` | `signReviewToken` / `verifyReviewToken` — JWT con JTI para invalidación |
| `backend/src/services/config-agent/agent.ts` | Orquestador del ciclo nocturno |
| `backend/src/services/config-agent/pattern-aggregator.ts` | Agrega reasignaciones recientes y upserta patrones |
| `backend/src/services/config-agent/prompt-builder.ts` | Construye prompts del agente con config actual + patrones |
| `backend/src/services/config-agent/response-validator.ts` | Valida la respuesta JSON del agente |
| `backend/src/services/config-agent/applier.ts` | Aplica cambios aprobados: escribe JSON + backup + recarga |
| `backend/src/services/llm/index.ts` | **Nuevo** — `getLLMProvider()` singleton compartido por clasificador y agente |
| `backend/src/routes/review.ts` | Endpoints públicos `/api/review/:token` (GET + POST approve/reassign) |
| `backend/src/routes/admin-reviews.ts` | Panel admin `/api/admin/reviews` (list, detail, force-approve, force-reassign, retry-note-sync) |
| `backend/src/routes/admin-config-proposals.ts` | Panel admin `/api/admin/config-proposals` (list, detail, apply, reject) |
| `backend/scripts/set-support-lead.ts` | Marca un usuario como `is_support_lead=1` por email |
| `backend/scripts/seed-test-pattern.ts` | **Dev only** — crea 5 pending_reviews + 5 audit_log ficticios para probar el agente |
| `backend/scripts/run-agent-once.ts` | **Dev** — dispara el agente manualmente |
| `frontend/src/services/admin-reviews-api.ts` | Cliente API para `/api/admin/reviews` |
| `frontend/src/services/admin-config-api.ts` | Cliente API para `/api/admin/config-proposals` |
| `frontend/src/pages/PendingReviewsPanel.tsx` | Panel admin de revisiones: filtros, tabla, audit log expandible, acciones |
| `frontend/src/pages/ConfigProposalsPanel.tsx` | Panel de propuestas de config: tabs, diff visual, aplicar/rechazar con modal |
| `frontend/src/pages/ReviewPage.tsx` | Página pública de revisión (ruta `/review/:token`) |

### Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `backend/src/identity-types.ts` | `is_support_lead: boolean` en `User` y `MeResponse` |
| `frontend/src/auth-types.ts` | `is_support_lead: boolean` en `MeResponse` |
| `backend/src/services/identity/store.ts` | Columna `is_support_lead` con migración no destructiva; `setSupportLead()`, `getSupportLead()`, `isSupportLead()` |
| `backend/src/services/classifier/index.ts` | Usa `getLLMProvider()` de `services/llm/index.ts`; eliminada `createProvider()` local |
| `backend/src/services/config-agent/agent.ts` | Eliminado cast temporal `(classifier as unknown as ...)` → usa `getLLMProvider()` directamente |
| `backend/src/services/mailer/mailer-index.ts` | Nuevos templates: `sendReviewerNotification`, `sendBrunoEscalationAlert`, `sendBrunoEscalatedTicketAlert`, `sendBrunoOutOfSyncAlert`, `sendBrunoExpiryDigest` |
| `backend/src/routes/intake.ts` | Flujo dual según `REQUIRE_HUMAN_REVIEW`: tras confirmar, crea `pending_review` + envía email revisor |
| `backend/src/index.ts` | Registra rutas `/api/review`, `/api/admin/reviews`, `/api/admin/config-proposals`; programa 3 crons (expiración, out-of-sync, agente) |
| `frontend/src/App.tsx` | Importa `PendingReviewsPanel` y `ConfigProposalsPanel`; añade `isSupportLead`; entradas de menú "Revisiones" (support_lead o superadmin) y "Propuestas IA" (solo support_lead); renderizado condicional |

### Decisiones de diseño — razonamiento (no obvio en el código)

**¿Por qué el ticket se crea en Redmine antes de la revisión?**
El SLA del cliente no debe depender de que un técnico interno revise el ticket. La creación en Redmine es inmediata. La revisión es un proceso de calidad interno que opera de forma asíncrona.

**¿Por qué la nota privada en Redmine es best-effort?**
La fuente de verdad del historial de reasignaciones es `review_audit_log` en `intake.db`, no Redmine. La nota privada es conveniente para que los técnicos vean el historial sin salir de Redmine, pero su fallo no es crítico. El campo `redmine_sync_status` rastrea si se sincronizó correctamente y permite reintentarlo.

**¿Por qué dos llamadas separadas a Redmine en la reasignación (actualizar assignee + añadir nota)?**
Atomicidad: si la actualización del assignee falla, el token no se rota y el técnico original sigue siendo responsable. Si la nota falla (que es best-effort), el assignee ya está actualizado en Redmine. Mezclar ambas operaciones en una sola llamada no es posible con la API de Redmine.

**¿Por qué el agente se ejecuta en batch nocturno y no inmediatamente tras cada reasignación?**
Para evitar oscilaciones: una sola reasignación puede ser puntual. El agente espera a que el patrón se estabilice (`REASSIGNMENT_PATTERN_BUFFER_DAYS=14`). Además, agregar varias reasignaciones del mismo patrón en un solo prompt produce propuestas más coherentes.

**¿Por qué el agente nunca aplica directamente?**
Gobernanza: las reglas de asignación son decisiones de negocio. El LLM puede proponer cambios con alta confianza, pero siempre requiere aprobación humana explícita (Bruno). El agente es un asistente, no un actor autónomo.

**¿Por qué `is_support_lead` como flag en BD y no en env var?**
Consistencia con `is_superadmin`: ambos son roles de usuario específicos de una persona. Una env var sería un indicador global sin identidad. El flag en BD permite que múltiples personas sean support_lead en el futuro sin cambiar la infraestructura.

**¿Por qué `services/llm/` separado del clasificador?**
El clasificador y el agente son consumidores independientes del mismo proveedor LLM. Mezclarlos en `ClassifierService` rompería la separación de responsabilidades — el agente no debe depender del clasificador para acceder al LLM. La capa `services/llm/` expone el proveedor como utilidad compartida sin acoplamiento.
