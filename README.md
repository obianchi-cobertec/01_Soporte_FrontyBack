# Cobertec Intake — MVP Fase 1

Sistema de intake inteligente para soporte técnico de Cobertec. Captura descripciones en lenguaje natural de clientes, las clasifica con IA (Claude / GPT-4o) contra una taxonomía configurable, y crea tickets en Redmine con metadata de enrutamiento automático.

---

## Arquitectura general

```
Usuario (autenticado)
  │
  ▼
Frontend React (Vite, :5173)
  │  POST /api/auth/token        → [Login: grant_type=password]
  │  POST /api/auth/token        → [Refresh: grant_type=refresh_token]
  │  POST /api/auth/select       → [Selección empresa]
  │  POST /api/auth/logout       → [Cerrar sesión]
  │  GET  /api/identity/me       → [Datos del usuario actual]
  │  POST /api/intake/submit     → [Clasificación IA]  ← requiere auth+empresa
  │  POST /api/intake/confirm    → [Crear ticket]       ← requiere auth+empresa
  │  GET/PUT /api/config/:file   → [Configuración JSON] ← requiere admin
  │  GET/POST/PATCH/DELETE /api/admin/*  → [CRUD usuarios/empresas] ← requiere admin
  │  GET  /api/metrics           → [Métricas piloto]
  ▼
Backend Fastify (:3001)
  ├── Auth Plugin (JWT verification)
  ├── Identity Store (SQLite: usuarios, empresas, tokens)
  ├── Motor IA (Claude / GPT-4o)  ←→  Anthropic / OpenAI API
  ├── Cliente Redmine              ←→  Redmine API
  └── Event Store (SQLite: métricas)
```

### Configuración externalizada

Las tres decisiones clave se leen de JSON en `/config/` (sin recompilación):

- **`taxonomy.json`** — Taxonomía de naturaleza y dominio del problema
- **`redmine-mapping.json`** — Mapeo taxonomía → campos Redmine
- **`assignment-rules.json`** — Reglas de enrutamiento a equipo/rol

---

## Estructura de carpetas

```
cobertec-intake/
│
├── config/                          # Configuración externalizada (leída en runtime)
│   ├── taxonomy.json                # 10 naturalezas × 19 dominios; keywords, ejemplos, reglas
│   ├── redmine-mapping.json         # need_resolution, block/module por dominio, campos custom, prioridades
│   └── assignment-rules.json        # Reglas maestras: (need+block+module+solution) → rol/asignado
│
├── backend/
│   ├── .env                         # Variables de entorno (API keys, Redmine URL, puerto)
│   ├── package.json
│   ├── scripts/
│   │   └── seed-identity.ts         # Crea usuarios/empresas de prueba; usar desde backend/
│   └── src/
│       ├── index.ts                 # Arranque Fastify: CORS, cookie, auth plugin, rutas, shutdown
│       ├── types.ts                 # Contratos de datos de intake (Nature, Domain, Classification…)
│       ├── identity-types.ts        # Contratos de auth/identidad (Contact, User, Company, JWT payloads…)
│       ├── config/
│       │   └── loader.ts            # Carga y cachea los tres JSON de config; expone tipos TS + reloadConfig()
│       ├── middleware/
│       │   └── validation.ts        # Esquemas Zod para IntakePayload y ConfirmationPayload
│       ├── plugins/
│       │   └── auth.ts              # Plugin Fastify: verifica JWT en cada request; decora request.auth / requireAuth() / requireCompany()
│       ├── routes/
│       │   ├── auth.ts              # POST /auth/token (login+refresh con grant_type), /select, /logout
│       │   ├── identity.ts          # GET /identity/me (incluye is_superadmin)
│       │   ├── intake.ts            # POST /submit y /confirm; session store en memoria; orquestación
│       │   ├── admin.ts             # CRUD /admin/users y /admin/companies; requiere rol admin
│       │   ├── config.ts            # GET+PUT /config/:file (taxonomy|redmine-mapping|assignment-rules); requiere admin
│       │   └── metrics.ts           # GET /metrics, /metrics/recent, /metrics/session/:id
│       └── services/
│           ├── auth/
│           │   ├── index.ts         # Re-exports del servicio
│           │   └── service.ts       # login(), selectCompany(), refresh(), logout(); JWT + bcrypt
│           ├── identity/
│           │   ├── index.ts         # Re-exports del store
│           │   └── store.ts         # IdentityStore: SQLite (contacts, users, companies, refresh_tokens)
│           ├── classifier/
│           │   ├── index.ts              # ClassifierService orquestador; factory por proveedor; singleton
│           │   ├── llm-provider.ts       # Interfaz abstracta: name, call(systemPrompt, userPrompt)
│           │   ├── prompt-builder.ts     # Construye system prompt desde config + user prompt desde request
│           │   ├── response-validator.ts # Valida JSON del LLM (Zod); fallback; coherencia confidence↔review
│           │   ├── assignee-resolver.ts  # Resuelve assignee determinista desde assignment-rules.json
│           │   ├── provider-anthropic.ts # Cliente @anthropic-ai/sdk (claude-sonnet-4-20250514)
│           │   ├── provider-openai.ts    # Cliente openai (gpt-4o)
│           │   └── dynamic-questions.ts  # Genera 0-2 preguntas de aclaración según nivel de confianza
│           ├── redmine/
│           │   ├── index.ts         # RedmineClient (real) y SimulatedRedmineClient (dev/test)
│           │   └── ticket-composer.ts    # Formatea asunto y descripción del ticket desde la clasificación
│           └── events/
│               └── index.ts         # Event store SQLite; 10 tipos de evento; consultas por sesión/métrica
│
└── frontend/
    ├── vite.config.ts               # Dev server :5173; proxy /api → :3001
    └── src/
        ├── App.tsx                  # Máquina de estados: form→loading→questions→confirmation→creating→done
        ├── main.tsx                 # Punto de entrada React con AuthProvider
        ├── types.ts                 # Contratos frontend de intake
        ├── auth-types.ts            # Contratos frontend de auth (espejo de identity-types.ts backend)
        ├── contexts/
        │   └── AuthContext.tsx      # React Context: estado auth global; refresh silencioso al montar
        ├── components/
        │   ├── LoginPage.tsx         # Formulario email + contraseña; errores del servidor y validación local
        │   ├── CompanySelector.tsx   # Selector multi-empresa; logout sin seleccionar empresa
        │   ├── IntakeForm.tsx        # Textarea + subida de archivos; validación mínimo 10 chars
        │   ├── ConfirmationView.tsx  # Resumen, área estimada, badge de impacto, lista de adjuntos
        │   ├── DynamicQuestions.tsx  # Preguntas opcionales (opciones o texto libre); Skip disponible
        │   ├── TicketResult.tsx      # Pantalla de éxito: ticket_id + ticket_url
        │   ├── ErrorDisplay.tsx      # Mensaje de error + botones Reintentar / Nueva incidencia
        │   ├── Dashboard.tsx         # Métricas piloto: totales, tasa completado, distribución confianza
        │   ├── StepIndicator.tsx     # Indicador visual de progreso (breadcrumb)
        │   └── Loading.tsx           # Spinner con mensaje
        ├── services/
        │   ├── api.ts               # POST /submit y /confirm; fileToAttachment (File → base64)
        │   ├── auth-api.ts          # Fetch wrapper con auth header; auto-refresh en 401; loginApi, selectCompanyApi…
        │   ├── admin-api.ts         # CRUD usuarios/empresas para AdminPanel
        │   └── metrics.ts           # GET /metrics, /metrics/recent
        ├── pages/
        │   └── ConfigPanel.tsx      # Editor JSON de los tres ficheros de config (solo admin/superadmin)
        └── utils/
            └── session.ts           # Genera UUID v4 por sesión de página
```

---

## Modelo de autenticación

El sistema usa **JWT stateless + refresh token httpOnly** con endpoint OAuth 2.0 estilo:

```
1. POST /api/auth/token { grant_type: "password", email, password }
   → access_token (15m, sin company_id) + refresh cookie (7d, httpOnly) + companies[]

2. POST /api/auth/select { company_id }   [requiere Bearer token]
   → access_token (15m, con company_id y company_name embebidos)

3. GET /api/identity/me                   [requiere Bearer token]
   → { user_id, is_superadmin, contact, company, companies[] }

4. POST /api/auth/token { grant_type: "refresh_token" }   [usa cookie automáticamente]
   → nuevo access_token + nueva refresh cookie (rotación)

5. POST /api/auth/logout
   → invalida refresh token en BD + limpia cookie
```

Los superadmin (`is_superadmin: true`) omiten la selección de empresa y acceden directamente a todas las funciones.

El `AuthContext` del frontend intenta un refresh silencioso al montar para restaurar sesión. Si el usuario tiene solo una empresa, la auto-selecciona.

Gestión de cuentas: solo Cobertec puede crear usuarios (no hay registro libre).

---

## Flujo intake completo

```
1. Usuario se autentica (login + selección empresa si tiene varias)
2. Describe el problema (texto libre + adjuntos opcionales)
3. Backend clasifica con IA:
     • Nature (tipo): incidencia_error | consulta_funcional | formacion_duda_uso | …
     • Domain (área): ventas_facturacion | gmao | servidor_sistemas | …
     • Solution: "Expertis / Movilsat ERP" | "Movilsat" | "Sistemas" | …
     • ExpertisModule: financiero | logistica | gmao | …
     • Redmine: block + module + need
     • confidence: high | medium | low
     • review_status: auto_ok | review_recommended | ambiguous | out_of_map | human_required
     • suggested_assignee: rol resuelto de forma determinista por assignee-resolver.ts
4. Si confidence < high → frontend muestra preguntas de aclaración (0-2)
5. Se muestra resumen al usuario para confirmación
6. Usuario puede confirmar o editar (re-clasifica)
7. Al confirmar: sube adjuntos a Redmine → crea ticket con custom fields
8. Se muestra pantalla de éxito con ticket ID y URL
```

---

## Requisitos

- Node.js 20+
- API key de Anthropic **o** OpenAI
- Acceso a API de Redmine (para integración real; en dev usa cliente simulado)

---

## Arranque rápido

### Backend

```bash
cd backend
cp .env.example .env
# Editar .env: LLM_PROVIDER, ANTHROPIC_API_KEY o OPENAI_API_KEY, JWT_SECRET, ...
npm install
npm run dev              # Arranca en :3001
```

### Seed de usuarios de prueba (primera vez)

```bash
cd backend
npx tsx scripts/seed-identity.ts
# Crea 2 empresas y 3 usuarios con contraseña "test1234"
# - maria@distribuciones-garcia.es (admin García, user López)
# - pedro@talleres-lopez.es (admin López)
# - ana@distribuciones-garcia.es (user García)
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # Arranca en :5173; proxifica /api → :3001
```

---

## Variables de entorno clave (backend/.env)

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor | `3001` |
| `LLM_PROVIDER` | `anthropic` o `openai` | — |
| `ANTHROPIC_API_KEY` | API key Anthropic | — |
| `OPENAI_API_KEY` | API key OpenAI | — |
| `REDMINE_URL` | URL base de Redmine | — |
| `REDMINE_API_KEY` | API key Redmine | — |
| `JWT_SECRET` | Secreto para firmar tokens JWT | dev secret (¡cambiar en prod!) |
| `ACCESS_TOKEN_TTL` | Duración del access token | `15m` |
| `IDENTITY_DB_PATH` | Ruta a la base de datos de identidad | `data/identity.db` |
| `CLASSIFIER_TIMEOUT_MS` | Timeout llamada LLM (ms) | `15000` |
| `BODY_LIMIT_MB` | Tamaño máximo de request | `10` |
| `CORS_ORIGIN` | Origen permitido por CORS | `http://localhost:5173` |

Sin `REDMINE_URL` / `REDMINE_API_KEY`, el backend usa `SimulatedRedmineClient` (devuelve tickets ficticios).

En producción, `JWT_SECRET` **debe** estar configurado o el servidor no arranca.

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/token` | No | Login: `grant_type=password` → access token + refresh cookie + companies[] |
| `POST` | `/api/auth/token` | Cookie | Refresh: `grant_type=refresh_token` → nuevo access token (rotación) |
| `POST` | `/api/auth/select` | Bearer | company_id → access token con empresa embebida |
| `POST` | `/api/auth/logout` | Cookie | Invalida refresh token + limpia cookie |
| `GET` | `/api/identity/me` | Bearer | Datos del usuario autenticado + empresa actual + is_superadmin |
| `POST` | `/api/intake/submit` | Bearer+company | Envía descripción → clasificación + preguntas dinámicas |
| `POST` | `/api/intake/confirm` | Bearer+company | Confirma (crea ticket) o edita (re-clasifica) |
| `GET` | `/api/config/:file` | Bearer+admin | Lee JSON de configuración (taxonomy\|redmine-mapping\|assignment-rules) |
| `PUT` | `/api/config/:file` | Bearer+admin | Escribe JSON de configuración (con backup automático) |
| `GET` | `/api/admin/users` | Bearer+admin | Lista todos los usuarios |
| `POST` | `/api/admin/users` | Bearer+admin | Crea usuario + contacto |
| `PATCH` | `/api/admin/users/:id` | Bearer+admin | Edita usuario/contacto |
| `DELETE` | `/api/admin/users/:id` | Bearer+admin | Desactiva usuario (soft delete) |
| `POST` | `/api/admin/users/:id/companies` | Bearer+admin | Asigna empresa a usuario |
| `DELETE` | `/api/admin/users/:id/companies/:cid` | Bearer+admin | Desasigna empresa de usuario |
| `GET` | `/api/admin/companies` | Bearer+admin | Lista todas las empresas |
| `POST` | `/api/admin/companies` | Bearer+admin | Crea empresa |
| `PATCH` | `/api/admin/companies/:id` | Bearer+admin | Edita empresa |
| `GET` | `/api/metrics` | No | Métricas agregadas del piloto |
| `GET` | `/api/metrics/recent` | No | Últimos 50 tickets creados |
| `GET` | `/api/metrics/session/:id` | No | Eventos de una sesión específica |
| `GET` | `/api/health` | No | Health check |

---

## Configuración avanzada

### taxonomy.json
Define las categorías que el LLM puede asignar. Cada naturaleza/dominio incluye:
- `keywords_positive` / `keywords_negative` — señales léxicas
- `examples_positive` / `examples_negative` — ejemplos concretos para el prompt
- `decision_rules` — lógica de desambiguación
- `confusion_with` — categorías similares a no confundir

**No requiere tocar el código** para ajustar la taxonomía.

### redmine-mapping.json
- `need_resolution` — 39 reglas (naturaleza + contexto) → ID de "need"
- `domain_to_block` / `domain_to_module` — mapeo dominio → campos Redmine
- `special_module_rules` — sobreescrituras contextuales
- `custom_fields` — IDs de campos custom en Redmine (**`__PENDIENTE__`**)
- `priority_mapping` — prioridades sugeridas → IDs Redmine (**`__PENDIENTE__`**)
- `company_to_project` — company_id → project_id Redmine (**`__PENDIENTE__`**)

### assignment-rules.json
Reglas ordenadas por prioridad (número menor = más específica). Cada regla especifica:
- `need`, `block`, `module`, `solution` (con wildcard `*`; `solution` es opcional)
- `assignee` — rol al que enrutar (e.g. `soporte_errores_expertis`, `movilsat_errores`)

El módulo `assignee-resolver.ts` aplica estas reglas **después** de que el LLM clasifica, garantizando que el enrutamiento es siempre determinista.

---

## Vacíos pendientes (pendiente de datos Cobertec)

Los siguientes valores aparecen como `__PENDIENTE__` en `config/redmine-mapping.json` y bloquean la integración real con Redmine:

- IDs de custom fields (nature, solution, module, block, need, confidence, review_status)
- Mapeo `company_id → project_id` de Redmine
- IDs de tracker, estados iniciales y prioridades
- IDs de usuarios Redmine por rol de asignación

Para obtenerlos: solicitar acceso a la instancia Redmine de Cobertec y extraer los IDs vía API.

---

## Estado del proyecto

- [x] Contratos de datos y taxonomía v3
- [x] Motor IA con abstracción multi-proveedor (Claude / GPT-4o)
- [x] Backend: rutas de intake, métricas, event store SQLite
- [x] Frontend: flujo completo de intake (form → confirmación → resultado)
- [x] Configuración 100% externalizada (sin lógica de negocio hardcodeada)
- [x] Cliente Redmine real + simulado para desarrollo
- [x] Assignee determinista post-LLM (`assignee-resolver.ts`)
- [x] Batería de tests end-to-end validada (8 casos, GPT-4o, 3–4.5 s/caso)
- [x] Sistema de autenticación backend completo (JWT + refresh token + bcrypt + SQLite)
- [x] Identity store: Contact, User, Company, UserCompany, refresh_tokens, is_superadmin
- [x] AuthContext y auth-api cliente en el frontend (token en memoria, no localStorage)
- [x] LoginPage + CompanySelector conectados; `main.tsx` envuelto en `AuthProvider`
- [x] `App.tsx` usa `useAuth()` — flujo de 3 estados + soporte superadmin
- [x] Rutas de intake protegidas con `requireCompany()` (JWT con empresa obligatorio)
- [x] `pruneExpiredTokens()` llamado al arrancar el servidor
- [x] Panel de administración (AdminPanel + rutas `/api/admin/*`) — CRUD usuarios y empresas
- [x] Panel de configuración (ConfigPanel + rutas `/api/config/*`) — editar JSONs desde la UI
- [ ] Completar `__PENDIENTE__` con datos reales de Redmine de Cobertec (IDs custom fields, prioridades, tracker, project)
- [ ] Definir `redmine_defaults.default_assignee_id` en redmine-mapping.json
- [ ] Integración real con Redmine validada end-to-end
- [ ] Piloto controlado con usuarios reales
