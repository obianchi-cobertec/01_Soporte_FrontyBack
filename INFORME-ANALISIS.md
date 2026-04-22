# Informe de análisis — Cobertec Intake
*Generado el 2026-04-21*

---

## Resumen ejecutivo

El proyecto está en un estado sólido y sustancialmente más avanzado de lo que la documentación anterior reflejaba. La integración con Redmine está completada en configuración (custom fields, prioridades, asignados, proyectos de cliente), el sistema de auth es robusto, y el ConfigPanel es un editor visual completo de 5 pestañas. Lo que queda antes de producción es un conjunto acotado de ítems de configuración final y deuda técnica menor.

---

## Qué se actualizó en CLAUDE.md y README.md

Los dos archivos de documentación estaban desactualizados respecto al código real. Estos son los desfases que se corrigieron:

- La sección "Pendientes críticos (`__PENDIENTE__`)" describía IDs sin rellenar que **ya están configurados**: custom fields IDs 21-28, prioridades (normal→4, high→5, urgent→5), `role_to_user_id` con ~40 roles, `company_to_project` con ~120 clientes reales.
- `redmine/index.ts` no documentaba `buildIssuePayload()`, las tablas de normalización `SOLUTION_NORMALIZE`/`MODULE_NORMALIZE`, la resolución de assignee vía `role_to_user_id`, ni la impersonación con `X-Redmine-Switch-User`.
- `ticket-composer.ts` no documentaba `stripSubject()`, `truncate()`, ni el prefijo `[REVISIÓN]` en asuntos de baja confianza.
- `identity/store.ts` le faltaban `getRedmineLogin()`, `isSuperAdmin()`, `getUserCompanyRole()`, `listUsers()`, `listCompanies()`, y la columna `redmine_login`.
- `config.ts` tenía documentado 2 endpoints; ahora tiene 3 (`GET /config/redmine-users`).
- `ConfigPanel.tsx` estaba documentado como "Editor JSON de los tres ficheros" cuando es un panel visual estructurado de 5 pestañas con editor específico por sección y selector de usuarios Redmine en tiempo real.
- Los 5 scripts nuevos en `backend/scripts/` no estaban documentados.
- La tabla "Mejoras pendientes" listaba como pendiente la subida paralela de adjuntos y los `__PENDIENTE__` que ya estaban resueltos.
- README.md tenía la sección "Vacíos pendientes" describiendo todos los campos como `__PENDIENTE__`.

---

## Informe de mejoras pendientes

### Alta prioridad — bloquean o degradan producción

#### 1. `redmine_defaults.default_assignee_id: null`

**Problema:** Si `role_to_user_id` no tiene el rol sugerido por el clasificador, el ticket se crea sin asignar y el equipo no lo ve en Redmine.

**Sugerencia:** Conseguir el ID numérico del usuario Redmine del equipo de soporte genérico y escribirlo en `config/redmine-mapping.json`:
```json
"redmine_defaults": {
  "tracker_id": 3,
  "status_id_initial": 1,
  "default_assignee": "soporte_errores_expertis",
  "default_assignee_id": 73
}
```

---

#### 2. `company_to_project._default: "cobertec-intake-test"`

**Problema:** Las empresas nuevas o sin mapeo explícito van al proyecto de prueba en lugar de a un proyecto de soporte real.

**Sugerencia:** Cambiar a un proyecto Redmine de producción real, por ejemplo:
```json
"company_to_project": {
  "_default": "cobertec-soporte-general",
  ...
}
```
O añadir validación al arranque que registre un aviso cuando llega un `company_id` sin mapeo.

---

#### 3. Campo `redmine_login` nunca se popula

**Problema:** La columna `redmine_login` existe en la tabla `users` y el código la usa (`getRedmineLogin()` → `X-Redmine-Switch-User`), pero ningún código la escribe. La impersonación de usuario en Redmine nunca se activa.

**Sugerencia (dos opciones):**
- **Opción A** — Añadir el campo al script de importación `import-redmine-clients.ts` para que al importar cada empresa/contacto también se guarde su login de Redmine.
- **Opción B** — Añadir `redmine_login` como campo editable en `PATCH /api/admin/users/:id` y en el AdminPanel.
- **Opción inmediata** — Query SQL directa hasta que haya UI: `UPDATE users SET redmine_login = 'login.redmine' WHERE id = '...'`

---

#### 4. Session store en memoria (Map)

**Problema:** Un reinicio del servidor durante el flujo de intake (entre `/submit` y `/confirm`) destruye la sesión del usuario. El cliente recibe un error "Sesión no encontrada" y pierde el trabajo.

**Sugerencia:** Persistir las sesiones en SQLite con TTL. Ejemplo de migración mínima en `intake.ts`:
```typescript
// En lugar de:
const sessionStore = new Map<string, SessionState>();

// Añadir tabla en identity.db o events.db:
// CREATE TABLE intake_sessions (
//   session_id TEXT PRIMARY KEY,
//   data       TEXT NOT NULL,  -- JSON
//   expires_at TEXT NOT NULL
// );
```
El TTL recomendado es 30-60 minutos. Redis es también válido si el entorno lo permite.

---

#### 5. Debug `console.log` en producción

**Problema:** Hay logs de depuración en código de producción que imprimen datos internos:
- `backend/src/routes/intake.ts` líneas 262-266: imprime datos de clasificación en cada confirm
- `backend/src/routes/config.ts` líneas 41 y 128: imprime rutas de archivo en cada GET/PUT
- `backend/src/services/redmine/index.ts` línea 173: imprime el login de impersonación

**Sugerencia:**
```typescript
// Eliminar en intake.ts y config.ts.
// En redmine/index.ts, convertir a log estructurado de Fastify si se quiere conservar:
// app.log.debug({ redmineLogin }, '[Redmine] Impersonando usuario');
// O simplemente eliminar.
```

---

### Media prioridad — calidad y robustez

#### 6. Tres bugs de TypeScript en ConfigPanel.tsx

**Problema A** (línea 802): Se pasan props `assignmentRoles` y `redmineUsers` a `<RedmineTab>` pero la interfaz del componente no las declara. Compila con error TypeScript aunque no falla en runtime.

**Sugerencia:**
```typescript
function RedmineTab({
  mapping,
  onChange,
  assignmentRoles,  // añadir
  redmineUsers,     // añadir
}: {
  mapping: RedmineMapping;
  onChange: (m: RedmineMapping) => void;
  assignmentRoles?: Record<string, string>;
  redmineUsers?: { id: number; login: string; name: string }[];
}) { ... }
```

**Problema B** (línea 697): El estado `redmineUsers` del componente padre se carga con el cast incorrecto (`(ru as { users: ... }).users`), pero la API devuelve un array directo, no `{ users: [] }`. El `RedmineTab` carga sus propios usuarios internamente, por lo que esto es código muerto pero confuso.

**Sugerencia:** Eliminar el estado `redmineUsers` del componente principal y dejar que `RedmineTab` gestione sus propios usuarios.

**Problema C** (línea 802): `assignmentRules` puede ser `null` en el primer render. `assignmentRules.rol_funcional` lanzaría `TypeError`.

**Sugerencia:** Añadir guard de null:
```tsx
{activeTab === 'redmine' && redmineMapping && assignmentRules && (
  <RedmineTab ... assignmentRoles={assignmentRules.rol_funcional} />
)}
```

---

#### 7. Sin timeout en llamadas de frontend al backend

**Problema:** `submitIntake` y `confirmIntake` en `frontend/src/services/api.ts` no tienen timeout. Si el backend o Redmine se cuelgan, el usuario queda en estado "Procesando..." indefinidamente.

**Sugerencia:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 35_000);
try {
  const res = await fetch('/api/intake/submit', {
    method: 'POST',
    signal: controller.signal,
    ...
  });
} finally {
  clearTimeout(timeout);
}
```

---

#### 8. Cast `any` en `redmine/index.ts`

**Problema** (línea 92): `(mapping as any).role_to_user_id` viola `strict: true` y hace el código frágil ante refactorizaciones del tipo de config.

**Sugerencia:** Añadir `role_to_user_id?: Record<string, number>` al tipo de retorno de `getRedmineMapping()` en `backend/src/config/loader.ts`.

---

#### 9. Sin rate limiting en `/api/auth/token`

**Problema:** El endpoint de login no tiene protección contra ataques de fuerza bruta. Un atacante puede probar contraseñas indefinidamente.

**Sugerencia:** Usar `@fastify/rate-limit`:
```bash
cd backend && npm install @fastify/rate-limit
```
```typescript
// En index.ts, antes de registrar authRoutes:
await app.register(import('@fastify/rate-limit'), {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
});
```

---

### Baja prioridad — seguridad y mantenimiento

#### 10. Archivos `redmine_*.json` en el repositorio

**Problema:** `backend/scripts/redmine_members.json`, `redmine_users_detail.json`, etc. contienen datos de usuarios reales (IDs, emails, nombres de empleados de clientes). No deben estar en git.

**Sugerencia:** Añadir al `.gitignore`:
```
backend/scripts/redmine_*.json
```
Y hacer `git rm --cached backend/scripts/redmine_*.json` para retirarlos del tracking sin borrarlos del disco.

---

#### 11. Sin audit log de cambios en configuración

**Problema:** El ConfigPanel permite a cualquier admin editar las reglas de clasificación, los IDs de Redmine y las reglas de asignación sin dejar rastro de quién cambió qué ni cuándo.

**Sugerencia:** Añadir un evento al EventStore cada vez que se ejecuta `PUT /api/config/:file`:
```typescript
logEvent('config_updated', 'system', {
  file,
  updated_by: request.auth!.sub,
  timestamp: new Date().toISOString(),
});
```

---

#### 12. Sin validación de config al arranque

**Problema:** El servidor arranca aunque `_default` apunte a un proyecto inexistente, `default_assignee_id` sea null, o los IDs de custom fields no existan en Redmine.

**Sugerencia:** Añadir un check no bloqueante en `index.ts`:
```typescript
// Después de inicializar el servidor:
const mapping = getRedmineMapping();
if (!mapping.redmine_defaults.default_assignee_id) {
  console.warn('[Config] AVISO: default_assignee_id no configurado — tickets sin assignee en fallback');
}
if (mapping.company_to_project['_default'] === 'cobertec-intake-test') {
  console.warn('[Config] AVISO: company_to_project._default apunta al proyecto de prueba');
}
```

---

## Resumen de estado actual

| Área | Estado |
|------|--------|
| Auth (backend + frontend) | Completo |
| Flujo de intake (submit → confirm → ticket) | Completo |
| Integración Redmine (config) | ~90% — faltan 3 valores finales |
| ConfigPanel (editor visual 5 pestañas) | Completo (con 3 bugs menores de TS) |
| AdminPanel (CRUD usuarios/empresas) | Completo |
| Scripts de importación Redmine | Implementados, no documentados |
| Session persistence | Pendiente (actualmente en memoria) |
| Rate limiting | Pendiente |
| Debug logs | Pendiente de limpiar |
| Validación E2E Redmine en producción | Pendiente |
