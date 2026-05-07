# Usuarios internos de Cobertec en Redmine

> **Fuente de verdad:** este archivo + `config/cobertec-users.json`. Mantener ambos sincronizados.
> **Última actualización:** 2026-05-05.
> **Cómo regenerar:** ejecutar `scripts/sync-cobertec-users.ts` (cuando exista) o consultar `GET /users.json?status=1` en Redmine y filtrar por `@cobertec.com`.

| ID  | Login           | Nombre              | Email                          |
|-----|-----------------|---------------------|--------------------------------|
| 1   | admin           | Administrador Admin | proyectos@cobertec.com         |
| 6   | g.santamaria    | Gonzalo Santamaría  | g.santamaria@cobertec.com      |
| 12  | j.ares          | Javier Ares         | j.ares@cobertec.com            |
| 13  | j.quintanilla   | Jorge Quintanilla   | j.quintanilla@cobertec.com     |
| 21  | Financiero      | Lorena Baños        | administracion@cobertec.com    |
| 25  | Soporte         | Sergio García       | soporte@cobertec.com           |
| 73  | SAT_Exp         | Alberto San Miguel  | a.sanmiguel@cobertec.com       |
| 74  | b.garcia        | Berta Garcia        | b.garcia@cobertec.com          |
| 77  | root            | root                | cobertec@cobertec.com          |
| 79  | a.martinez      | Alberto Martinez    | a.martinez@cobertec.com        |
| 221 | a.arnaiz        | Andrés Arnaiz       | a.arnaiz@cobertec.com          |
| 270 | a.romo          | Alberto Romo        | a.romo@cobertec.com            |
| 322 | alvaro          | Álvaro Andrés       | a.andres@cobertec.com          |
| 329 | e.sardinas      | Elena Sardiñas      | calidad@cobertec.com           |
| 423 | test_sat        | test_sat            | test_sat@cobertec.com          |
| 525 | desarrollo4     | Hildegart Nieto     | h.nieto@cobertec.com           |
| 562 | oscar_cbt       | Óscar Bianchi       | o.bianchi@cobertec.com         |
| 736 | Bruno           | Bruno Saiz          | b.saiz@cobertec.com            |
| 768 | maria_cobertec  | María Portugal      | m.portugal@cobertec.com        |

## Reglas para mantener este archivo

1. **Sincronizado con `config/cobertec-users.json`** — si cambias uno, cambia el otro.
2. **Cualquier ID que aparezca en `config/redmine-mapping.json` → `role_to_user_id` debe existir en esta tabla.** El backend lo valida al iniciar (ver módulo de validación de identidad Redmine).
3. **Cuando hay alta o baja en Cobertec:** actualizar este archivo + `cobertec-users.json` antes de tocar `role_to_user_id`.
