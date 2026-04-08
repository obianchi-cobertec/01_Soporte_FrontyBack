# Cobertec Intake — MVP Fase 1

Sistema de intake inteligente para soporte técnico de Cobertec.

## Arquitectura

```
Frontend (React + Vite)  →  Backend (Fastify)  →  Motor IA (Claude API)
                                    ↓                      
                              Redmine API    Event Store (SQLite)
```

## Estructura

```
cobertec-intake/
├── config/                  # Taxonomía, mapeo Redmine, reglas de asignación
├── backend/                 # API + clasificador + integración Redmine + eventos
│   ├── src/
│   │   ├── routes/          # Endpoints: intake submit/confirm, métricas
│   │   ├── services/
│   │   │   ├── classifier/  # Motor IA v1: prompt builder, validador, clasificador
│   │   │   ├── redmine/     # Cliente API Redmine + compositor de tickets
│   │   │   └── events/      # Event store SQLite para métricas del piloto
│   │   ├── middleware/      # Validación de payloads (Zod)
│   │   ├── config/          # Cargador de configuración
│   │   └── types.ts         # Contratos de datos centrales
│   └── tests/               # Batería de pruebas del clasificador
├── frontend/                # React SPA: formulario, confirmación, resultado
│   └── src/
│       ├── components/      # IntakeForm, ConfirmationView, TicketResult, etc.
│       ├── services/        # API client
│       └── utils/           # Session ID
└── docs/                    # Contratos JSON, decisiones
```

## Requisitos

- Node.js 20+
- API key de Anthropic (Claude)
- Acceso a API de Redmine (para integración real)

## Arranque rápido

### Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tu ANTHROPIC_API_KEY
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend arranca en `http://localhost:5173` y proxifica `/api` al backend en `:3001`.

## Tests del clasificador

```bash
cd backend
ANTHROPIC_API_KEY=sk-ant-... npm run test:classifier

# Con detalle completo:
ANTHROPIC_API_KEY=sk-ant-... VERBOSE=1 npm run test:classifier
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/intake/submit` | Envía descripción, devuelve clasificación |
| POST | `/api/intake/confirm` | Confirma o edita, crea ticket en Redmine |
| GET | `/api/metrics` | Métricas generales del piloto |
| GET | `/api/metrics/session/:id` | Eventos de una sesión |
| GET | `/api/health` | Health check |

## Vacíos técnicos pendientes

Estos valores aparecen como `__PENDIENTE__` en la configuración y requieren datos reales de Cobertec:

- Custom fields de Redmine (IDs)
- Mapeo empresa → proyecto Redmine
- IDs de tracker, estados y prioridades
- Tabla de asignación por dominio
- Mecanismo de autenticación del portal
- Receptor por defecto para tickets sin asignación

## Estado

- [x] Contratos de datos definidos
- [x] Taxonomía intermedia v1
- [x] Motor IA v1 (clasificador)
- [x] Backend con rutas de intake y métricas
- [x] Frontend con flujo completo
- [x] Batería de pruebas del clasificador
- [ ] Validación de vacíos técnicos con Cobertec
- [ ] Integración real con Redmine
- [ ] Piloto controlado
