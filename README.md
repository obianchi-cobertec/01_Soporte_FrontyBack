# Cobertec Intake — MVP Fase 1

Sistema de intake inteligente para soporte técnico de Cobertec. Captura descripciones en lenguaje natural de clientes, las clasifica con IA (Claude / GPT-4o) contra una taxonomía configurable, y crea tickets en Redmine con metadata de enrutamiento automático.

---

## Arquitectura general

```
Usuario
  │
  ▼
Frontend React (Vite, :5173)
  │  POST /api/intake/submit   → [Clasificación IA]
  │  POST /api/intake/confirm  → [Crear ticket]
  │  GET  /api/metrics         → [Métricas piloto]
  ▼
Backend Fastify (:3001)
  ├── Motor IA (Claude / GPT-4o)  ←→  Anthropic / OpenAI API
  ├── Cliente Redmine              ←→  Redmine API
  └── Event Store (SQLite)
```

### Configuración externalizada

Las tres decisiones clave se leen de JSON en `/config/` (sin recompilación):

- **`taxonomy.json`** — Taxonomía de naturaleza e dominio del problema
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
│   └── src/
│       ├── index.ts                 # Arranque Fastify: CORS, rutas, shutdown graceful
│       ├── types.ts                 # Contratos de datos centrales (Nature, Domain, Classification…)
│       ├── config/
│       │   └── loader.ts            # Carga y cachea los tres JSON de config; expone tipos TS + reloadConfig()
│       ├── middleware/
│       │   └── validation.ts        # Esquemas Zod para IntakePayload y ConfirmationPayload
│       ├── routes/
│       │   ├── intake.ts            # POST /submit y /confirm; session store en memoria; orquestación
│       │   └── metrics.ts           # GET /metrics, /metrics/recent, /metrics/session/:id
│       └── services/
│           ├── classifier/
│           │   ├── index.ts              # ClassifierService orquestador; factory por proveedor; singleton
│           │   ├── llm-provider.ts       # Interfaz abstracta: name, call(systemPrompt, userPrompt)
│           │   ├── prompt-builder.ts     # Construye system prompt desde config + user prompt desde request
│           │   ├── response-validator.ts # Valida JSON del LLM (Zod); fallback; coherencia confidence↔review
│           │   ├── assignee-resolver.ts  # Resuelve assignee de forma determinista desde assignment-rules.json (post-LLM)
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
        ├── types.ts                 # Contratos frontend: IntakePayload, ClassifiedResponse, DynamicQuestion…
        ├── components/
        │   ├── IntakeForm.tsx       # Textarea + subida de archivos; validación mínimo 10 chars
        │   ├── ConfirmationView.tsx # Resumen, área estimada, badge de impacto, lista de adjuntos
        │   ├── DynamicQuestions.tsx # Preguntas opcionales (opciones o texto libre); Skip disponible
        │   ├── TicketResult.tsx     # Pantalla de éxito: ticket_id + ticket_url
        │   ├── ErrorDisplay.tsx     # Mensaje de error + botones Reintentar / Nueva incidencia
        │   ├── Dashboard.tsx        # Métricas piloto: totales, tasa completado, distribución confianza
        │   ├── StepIndicator.tsx    # Indicador visual de progreso (breadcrumb)
        │   └── Loading.tsx          # Spinner con mensaje
        ├── services/
        │   ├── api.ts               # POST /submit y /confirm; fileToAttachment (File → base64)
        │   └── metrics.ts           # GET /metrics, /metrics/recent
        └── utils/
            └── session.ts           # Genera UUID v4 por sesión de página
```

---

## Flujo completo

```
1. Usuario describe el problema (texto libre + adjuntos opcionales)
2. Backend clasifica con IA:
     • Nature (tipo): incidencia_error | consulta_funcional | formacion_duda_uso | …
     • Domain (área): ventas_facturacion | gmao | servidor_sistemas | …
     • Solution: "Expertis / Movilsat ERP" | "Movilsat" | "Sistemas" | …
     • ExpertisModule: financiero | logistica | gmao | …
     • Redmine: block + module + need
     • confidence: high | medium | low
     • review_status: auto_ok | review_recommended | ambiguous | out_of_map | human_required
     • suggested_assignee: rol resuelto de forma determinista por assignee-resolver.ts
3. Si confidence < high → frontend muestra preguntas de aclaración (0-2)
4. Se muestra resumen al usuario para confirmación
5. Usuario puede confirmar o editar (re-clasifica)
6. Al confirmar: sube adjuntos a Redmine → crea ticket con custom fields
7. Se muestra pantalla de éxito con ticket ID y URL
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
cp .env.example .env     # Crear .env con tu API key
# Editar .env: LLM_PROVIDER, ANTHROPIC_API_KEY o OPENAI_API_KEY, REDMINE_URL, REDMINE_API_KEY
npm install
npm run dev              # Arranca en :3001
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
| `CLASSIFIER_TIMEOUT_MS` | Timeout llamada LLM (ms) | `15000` |
| `BODY_LIMIT_MB` | Tamaño máximo de request | `10` |

Sin `REDMINE_URL` / `REDMINE_API_KEY`, el backend usa `SimulatedRedmineClient` (devuelve tickets ficticios).

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/intake/submit` | Envía descripción → devuelve clasificación + preguntas dinámicas |
| `POST` | `/api/intake/confirm` | Confirma (crea ticket) o edita (re-clasifica) |
| `GET` | `/api/metrics` | Métricas agregadas del piloto |
| `GET` | `/api/metrics/recent` | Últimos 50 tickets creados |
| `GET` | `/api/metrics/session/:id` | Eventos de una sesión específica |
| `GET` | `/api/health` | Health check |

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
- `assignee` — rol al que enrutar (e.g. `soporte_errores_expertis`, `movilsat_errores`, `portalot_operativa`)

El módulo `assignee-resolver.ts` aplica estas reglas **después** de que el LLM clasifica, garantizando que el enrutamiento es siempre determinista (el LLM no puede sobrescribir el assignee con alucinaciones).

---

## Vacíos pendientes (pendiente de datos Cobertec)

Los siguientes valores aparecen como `__PENDIENTE__` en `config/redmine-mapping.json` y bloquean la integración real con Redmine:

- IDs de custom fields (nature, solution, module, block, need, confidence, review_status)
- Mapeo `company_id → project_id` de Redmine
- IDs de tracker, estados iniciales y prioridades
- IDs de usuarios Redmine por rol de asignación
- Mecanismo de autenticación del portal (quién envía el intake)

---

## Estado del proyecto

- [x] Contratos de datos y taxonomía v3
- [x] Motor IA con abstracción multi-proveedor (Claude / GPT-4o)
- [x] Backend: rutas de intake, métricas, event store SQLite
- [x] Frontend: flujo completo (form → confirmación → resultado)
- [x] Configuración 100% externalizada (sin lógica de negocio hardcodeada)
- [x] Cliente Redmine real + simulado para desarrollo
- [x] Assignee determinista post-LLM (`assignee-resolver.ts`)
- [x] Batería de tests end-to-end validada (8 casos, GPT-4o, 3–4.5 s/caso)
- [ ] Completar `__PENDIENTE__` con datos reales de Redmine de Cobertec
- [ ] Integración real con Redmine validada
- [ ] Mecanismo de autenticación del portal
- [ ] Piloto controlado con usuarios reales
