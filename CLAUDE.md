# CLAUDE.md — Cobertec Intake

Guía completa para que Claude entienda este proyecto sin contexto previo. Lee este archivo antes de tocar cualquier código.

---

## ¿Qué hace este sistema?

**Cobertec Intake** es un sistema de intake inteligente de soporte técnico para la empresa Cobertec (distribuidora de software ERP llamado Expertis / Movilsat). El objetivo es:

1. El cliente (o técnico) describe un problema en lenguaje natural
2. Un LLM (Claude o GPT-4o) lo clasifica contra una taxonomía configurable
3. El sistema crea automáticamente el ticket en Redmine con metadatos de enrutamiento
4. El ticket llega al equipo correcto sin intervención manual del 1er nivel

**Producto principal de Cobertec:** Expertis / Movilsat ERP — software de gestión empresarial con módulos de compras, ventas, GMAO, presupuestos, financiero, CRM, etc.

---

## Stack técnico

- **Backend:** Node.js + Fastify + TypeScript (ESM, ES2022)
- **Frontend:** React 19 + Vite + TypeScript
- **LLM:** Anthropic Claude (primario) o OpenAI GPT-4o (configurable por env var)
- **Base de datos:** SQLite (better-sqlite3, embebido, solo para métricas)
- **Validación:** Zod (runtime, backend y frontend)
- **Integración externa:** Redmine API REST

---

## Arquitectura de alto nivel

```
Frontend (React :5173)
    │
    ├─ POST /api/intake/submit  ─────► ClassifierService
    │                                       │ Construye prompt desde config/
    │                                       │ Llama LLM (15s timeout)
    │                                       │ Valida y sanitiza respuesta
    │                                       └─► ClassifiedResponse (summary + preguntas)
    │
    ├─ POST /api/intake/confirm ─────► RedmineClient
    │   action='confirm'                    │ Sube adjuntos → tokens
    │                                       │ Compone ticket (asunto + descripción + custom fields)
    │                                       └─► ticket_id + ticket_url
    │
    ├─ POST /api/intake/confirm ─────► ClassifierService (re-classify)
    │   action='edit'                       └─► ClassifiedResponse (nueva clasificación)
    │
    └─ GET /api/metrics ─────────────► EventStore (SQLite)
                                            └─► métricas del piloto
```

### Patrón de estado del backend

El backend mantiene un `Map<session_id, SessionState>` en memoria. Cada sesión guarda:
- `intake`: payload original del usuario
- `classification`: última clasificación del LLM
- `attempt`: número de re-clasificaciones

El session_id lo genera el frontend (UUID v4) y viaja en cada request.

---

## Archivos clave — qué hacen exactamente

### `backend/src/types.ts`
**Los contratos de datos del sistema.** Define todos los tipos TypeScript:
- `Nature` — 10 valores posibles del tipo de problema
- `Domain` — 19 valores del área de negocio afectada
- `Solution` — 10 productos de Cobertec posibles
- `ExpertisModule` — 12 módulos del ERP
- `Classification`, `ClassificationResponse` — salida del LLM
- `IntakePayload`, `ConfirmationPayload` — entradas del usuario
- `IntakeResponse` (union: `ClassifiedResponse | CreatedResponse | ErrorResponse`) — respuesta del backend al frontend
- `IntakeEvent`, `EventType` — eventos del event store

**Regla importante:** frontend (`frontend/src/types.ts`) es un subconjunto espejo de este archivo. Si cambias los contratos en backend, actualizar frontend también.

### `config/taxonomy.json`
**El cerebro de la clasificación.** Define qué categorías existen y cómo reconocerlas.

Estructura por cada naturaleza/dominio:
```json
{
  "id": "incidencia_error",
  "label": "Incidencia / Error",
  "keywords_positive": ["no funciona", "da error", "falla"],
  "keywords_negative": ["cómo se hace", "quiero"],
  "examples_positive": ["No me deja guardar la factura", "Sale un mensaje rojo"],
  "examples_negative": ["¿Cómo creo un pedido?"],
  "decision_rules": ["Si hay mensaje de error explícito → incidencia_error"],
  "confusion_with": ["consulta_funcional"]
}
```

El `prompt-builder.ts` vuelca TODA esta estructura en el system prompt del LLM. **Cambiar este archivo cambia el comportamiento de la IA sin tocar código.**

### `config/redmine-mapping.json`
**El puente entre la clasificación y Redmine.** Contiene:
- `need_resolution` — 39 reglas (naturaleza + contexto → need ID)
- `domain_to_block` / `domain_to_module` — mapeo dominio → campos Redmine
- `special_module_rules` — sobreescrituras por contexto específico
- `custom_fields` — IDs de campos custom en Redmine (**`__PENDIENTE__`**)
- `priority_mapping` — prioridades → IDs Redmine (**`__PENDIENTE__`**)
- `company_to_project` — company_id → project_id Redmine (**`__PENDIENTE__`**)

### `config/assignment-rules.json`
**El router de tickets.** Reglas ordenadas por prioridad (número menor = más específica):
```json
{
  "priority": 1,
  "need": "campo",
  "block": "*",
  "module": "*",
  "solution": "*",
  "assignee": "desarrollo_campos"
}
```
Si ninguna regla hace match → asignado default = `soporte_errores_expertis`.

### `backend/src/services/classifier/prompt-builder.ts`
Construye dos prompts:
1. **System prompt** — vuelca taxonomy completa + need_resolution + assignment roles (da al LLM contexto de toda la clasificación)
2. **User prompt** — descripción del usuario + company_name + lista de adjuntos

El LLM debe responder con JSON estricto que incluye todos los campos de `ClassificationResponse`.

### `backend/src/services/classifier/response-validator.ts`
Valida la respuesta JSON del LLM con Zod. También aplica **coherencia**:
- `confidence:high` → fuerza `review_status:'auto_ok'`
- `confidence:low` → fuerza `review_status:'review_recommended'` como mínimo
- Si el JSON falla parsing → genera una clasificación fallback (ambiguo, low confidence, human_required)

### `backend/src/services/redmine/index.ts`
Dos implementaciones de la misma interfaz:
- `RedmineClient` — real, usa `REDMINE_URL` + `REDMINE_API_KEY`
- `SimulatedRedmineClient` — devuelve tickets ficticios (se activa si no hay env vars de Redmine)

El `getRedmineClient()` decide cuál usar automáticamente.

### `backend/src/routes/intake.ts`
Dos rutas principales:
- `POST /submit` — valida payload, llama classifier, genera preguntas dinámicas, guarda en session store, devuelve `ClassifiedResponse`
- `POST /confirm` — si `action='edit'`: re-clasifica; si `action='confirm'`: crea ticket en Redmine y limpia sesión

### `backend/src/services/events/index.ts`
Event store SQLite con 10 tipos de evento. Cada evento tiene:
- `event_id` (UUID), `event_type`, `session_id`, `timestamp`, `data` (JSON flexible)

Eventos principales: `flow_started`, `description_submitted`, `classification_requested`, `classification_completed`, `confirmation_shown`, `confirmation_accepted`, `confirmation_edited`, `ticket_created`, `flow_error`, `flow_abandoned`.

---

## Modelo de datos central

```typescript
// Entrada del usuario
interface IntakePayload {
  session_id: string;      // UUID generado por frontend
  user_id: string;
  company_id: string;      // mapea a project_id de Redmine
  company_name: string;
  description: string;     // texto libre, mínimo 10 chars
  attachments: Attachment[]; // base64
  timestamp: string;
}

// Salida del LLM (clasificación completa)
interface ClassificationResponse {
  nature: Nature;           // tipo del problema
  domain: string;           // área de negocio
  solution_associated: Solution;  // producto Cobertec
  expertis_module: ExpertisModule | null;
  redmine_mapping: { block: string; module: string; need: string; };
  confidence: 'high' | 'medium' | 'low';
  review_status: 'auto_ok' | 'review_recommended' | 'ambiguous' | 'out_of_map' | 'human_required';
  suggested_priority: 'normal' | 'high' | 'urgent';
  suggested_assignee: string | null;  // rol como "soporte_errores_expertis"
  summary: string;          // 1-2 frases operativas para el técnico
  reasoning: string;        // por qué eligió esta clasificación
}

// Respuesta al frontend (clasificado)
interface ClassifiedResponse {
  session_id: string;
  status: 'classified';
  display: {
    summary: string;
    estimated_area: string;  // etiqueta del dominio
    impact: string | null;   // "Prioridad sugerida: urgent" o null
    attachments_received: string[];
  };
  questions?: DynamicQuestion[];  // 0-2 preguntas de aclaración
}
```

---

## Flujo de datos end-to-end

```
1. Frontend genera session_id (UUID) → persiste mientras dura el flujo

2. POST /api/intake/submit:
   { session_id, user_id, company_id, description, attachments }
   
   Backend:
   → Valida con Zod
   → loader.ts carga taxonomy + redmine-mapping + assignment-rules (singleton cache)
   → prompt-builder construye system prompt (toda la taxonomía volcada)
   → LLM call con timeout 15s
   → response-validator valida JSON + aplica coherencia
   → dynamic-questions genera 0-2 preguntas según confidence
   → Guarda { intake, classification, attempt:1 } en session Map
   → Devuelve ClassifiedResponse

3. Frontend muestra preguntas (si hay) → usuario responde o salta
   Frontend muestra ConfirmationView con summary + estimated_area

4. POST /api/intake/confirm { action: 'edit' }:
   → Actualiza session.intake.description
   → Re-clasifica (attempt++)
   → Devuelve ClassifiedResponse actualizado

4b. POST /api/intake/confirm { action: 'confirm' }:
   → Sube adjuntos a Redmine → obtiene upload tokens
   → ticket-composer arma asunto: "[NATURALEZA] SOLUCIÓN — RESUMEN"
   → Construye issue con custom_fields desde classification
   → Mapea company_id → project_id (redmine-mapping.json)
   → Mapea priority → redmine priority_id
   → POST /issues.json a Redmine
   → Loguea event: ticket_created
   → Borra sesión del Map
   → Devuelve CreatedResponse { ticket_id, ticket_url }

5. Frontend muestra TicketResult
```

---

## Convenciones y decisiones de diseño

1. **Config externalizada** — Toda lógica de negocio (qué es una incidencia, cómo enrutar) vive en `/config/*.json`. El código solo la carga y la usa. Cambiar comportamiento = cambiar JSON, no código.

2. **Abstracción LLM** — La interfaz `LLMProvider` (`llm-provider.ts`) define solo `name` y `call()`. Las implementaciones (Anthropic, OpenAI) son intercambiables por env var `LLM_PROVIDER`.

3. **Singleton lazy** — `getClassifier()`, `getRedmineClient()`, `getConfigLoader()` devuelven instancias cacheadas. No se reinicializan entre requests.

4. **Fallback siempre disponible** — Si el LLM falla, `response-validator.ts` genera una clasificación fallback (ambiguo, low confidence, human_required) en lugar de tirar 500.

5. **SimulatedRedmineClient** — Si no hay env vars de Redmine, el cliente simulado devuelve un ticket ficticio. Esto permite desarrollar el flujo completo sin acceso a Redmine.

6. **Session store en memoria** — Intencionadamente simple (Map). El estado de la sesión dura solo mientras el usuario completa el flujo. Al crear el ticket o al error terminal, se limpia.

7. **Event store SQLite** — Solo para métricas del piloto. No es la fuente de verdad del negocio (Redmine lo es).

8. **TypeScript strict** — Ambos proyectos usan `"strict": true`. No usar `any` sin justificación.

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

---

## Estrategia de integración Redmine

**El backend y frontend se finalizan primero**, sin tocar Redmine en producción. La integración real con Redmine es Fase 2. Durante el desarrollo, `SimulatedRedmineClient` cubre el flujo completo.

---

## Cómo arrancar en desarrollo

```bash
# Terminal 1 — Backend
cd backend
# Crear backend/.env con: LLM_PROVIDER=openai, OPENAI_API_KEY=sk-..., PORT=3001
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# Abre http://localhost:5173
```

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
