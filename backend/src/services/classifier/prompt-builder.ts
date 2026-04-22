import { getTaxonomy, getRedmineMapping, getAssignmentRules } from '../../config/loader.js';
import type { ClassificationRequest } from '../../types.js';

export function buildSystemPrompt(): string {
  const taxonomy = getTaxonomy();
  const mapping = getRedmineMapping();
  const assignment = getAssignmentRules();

  // Naturalezas
  const natureBlock = taxonomy.nature.values
    .map(n => {
      const examples = n.examples ?? n.examples_positive ?? [];
      const examplesNeg = n.examples_negative ?? [];
      const rules = n.decision_rules ?? [];
      const confusesWith = n.confusion_with ?? [];
      let block = `- "${n.id}" (${n.label}): ${n.description}`;
      if (examples.length > 0)
        block += `\n  ✓ Ejemplos: "${examples.join('", "')}"`;
      if (examplesNeg.length > 0)
        block += `\n  ✗ NO usar si: "${examplesNeg.join('", "')}"`;
      if (rules.length > 0)
        block += `\n  → Reglas: ${rules.join(' | ')}`;
      if (confusesWith.length > 0)
        block += `\n  ⚠ Se confunde con: ${confusesWith.join(', ')}`;
      return block;
    })
    .join('\n\n');

  // Dominios funcionales
  const domainValues = taxonomy.domain?.values ?? [];
  const domainBlock = domainValues
    .map(d => {
      const kwPos = d.keywords_positive ?? [];
      const kwNeg = d.keywords_negative ?? [];
      const examples = d.examples_positive ?? d.examples ?? [];
      const examplesNeg = d.examples_negative ?? [];
      const rules = d.decision_rules ?? [];
      const confusesWith = d.confusion_with ?? [];
      let block = `- "${d.id}" (${d.label}): ${d.description}`;
      if (kwPos.length > 0)
        block += `\n  Señales positivas: ${kwPos.join(', ')}`;
      if (kwNeg.length > 0)
        block += `\n  Señales negativas (NO usar si aparecen): ${kwNeg.join(', ')}`;
      if (examples.length > 0)
        block += `\n  ✓ Ejemplos: "${examples.join('", "')}"`;
      if (examplesNeg.length > 0)
        block += `\n  ✗ NO es este dominio si: "${examplesNeg.join('", "')}"`;
      if (rules.length > 0)
        block += `\n  → Reglas de decisión: ${rules.join(' | ')}`;
      if (confusesWith.length > 0)
        block += `\n  ⚠ Se confunde con: ${confusesWith.join(', ')}`;
      return block;
    })
    .join('\n\n');

  // Soluciones con pesos
  const solutionRules = mapping.solution_resolution?.rules ?? [];
  const solutionBlock = solutionRules
    .sort((a, b) => b.weight - a.weight)
    .map(r => {
      const kw = r.keywords_any?.length
        ? `\n  Señales: ${r.keywords_any.slice(0, 8).join(', ')}`
        : '';
      return `- "${r.solution}" (peso ${Math.round(r.weight * 100)}%)${kw}`;
    })
    .join('\n');

  // Módulos Expertis con keywords
  const expertisRules = mapping.expertis_module_resolution?.rules ?? [];
  const expertisBlock = expertisRules
    .map(r => `- "${r.module_expertis}": ${r.keywords_any.slice(0, 10).join(', ')}`)
    .join('\n');

  const priorityHint = (mapping.expertis_module_resolution?.priority_hint ?? []).join(' > ');

  // Necesidades
  const needCatalogue = Object.entries(mapping.need_catalogue ?? {})
    .map(([id, label]) => `- "${id}": ${label}`)
    .join('\n');

  // Bloques Redmine
  const domainToBlock = Object.entries(mapping.domain_to_block ?? {})
    .map(([d, b]) => `- ${d} → bloque "${b}"`)
    .join('\n');

  // Reglas de asignación
    const rolFuncional = assignment.rol_funcional ?? {};

  const topRules = (assignment.master_rules ?? [])
    .slice(0, 20)
    .map(r => {
      const rolNombre = rolFuncional[r.assignee] ?? r.assignee;
      const sol = r.solution ? `, solución=${r.solution}` : '';
      return `- bloque=${r.block}, módulo=${r.module}, need=${r.need}${sol} → "${r.assignee}" (${rolNombre})`;
    })
    .join('\n');

    const genericRules = (assignment.master_rules ?? [])
    .filter(r => r.block === '*')
    .map(r => {
      const rolNombre = rolFuncional[r.assignee] ?? r.assignee;
      return `- need="${r.need}" → "${r.assignee}" (${rolNombre}) (genérica)`;
    })
    .join('\n');

  const defaultAssignee = assignment.default_assignee ?? 'soporte_errores_expertis';
  const defaultRolNombre = rolFuncional[defaultAssignee] ?? defaultAssignee;


  return `Eres el clasificador de incidencias de soporte técnico de Cobertec, empresa que desarrolla y da soporte del software ERP Expertis (también llamado Movilsat ERP).

## REGLAS SEMÁNTICAS CRÍTICAS

- "Expertis" = "Movilsat ERP" → son el mismo producto. Siempre usar solution_associated = "Expertis / Movilsat ERP".
- "Movilsat" SIN complemento = aplicación móvil de campo, producto distinto. solution_associated = "Movilsat".
- Esta distinción es OBLIGATORIA.
- REGLA DE APLICACIÓN: si la incidencia menciona explícitamente una aplicación concreta (app fichajes, planificador inteligente, portal OT, academia, business intelligence, movilsat app, ecommerce/web), el dominio SIEMPRE debe ser el de esa aplicación, aunque la acción sea "crear usuario", "dar acceso" o "añadir licencia". El dominio de la aplicación prevalece sobre "usuarios_accesos".
- usuarios_accesos es EXCLUSIVAMENTE para accesos al ERP Expertis o a la plataforma de incidencias de Cobertec.
- TBAI, TicketBai, Batuz, SII, Verifactu → dominio SIEMPRE "financiero", sin excepción. Aunque el error sea técnico (SSL, certificado, conexión), el dominio es financiero porque el módulo responsable es el financiero.
- Remesas bancarias, cobros, pagos, SEPA, asientos, balances, contabilización → dominio SIEMPRE "financiero".
- FRONTERA financiero/ventas_facturacion: si el eje es el DOCUMENTO logístico (crear/imprimir/enviar factura, albarán, pedido) → ventas_facturacion. Si el eje es el proceso posterior (cobrar, pagar, contabilizar, declarar impuestos) → financiero. ANTE LA DUDA → financiero.

## FLUJO DE DECISIÓN (seguir en este orden)

1. Determinar NATURALEZA
2. Determinar DOMINIO FUNCIONAL
3. Resolver SOLUCIÓN ASOCIADA
4. Si solución = "Expertis / Movilsat ERP" → resolver MÓDULO EXPERTIS
5. Resolver BLOQUE y MÓDULO de Redmine
6. Resolver NECESIDAD (need)
7. Determinar RESPONSABLE

---

## PASO 1 — NATURALEZA

${natureBlock}

---

## PASO 2 — DOMINIO FUNCIONAL

Elegir el área funcional donde ocurre el problema. ATENCIÓN: respetar estrictamente las reglas de decisión y señales negativas de cada dominio. Si un dominio tiene señales negativas que coinciden con la descripción, DESCARTARLO.

${domainBlock}

Valor por defecto si no se puede inferir: "dominio_no_claro"

---

## PASO 3 — SOLUCIÓN ASOCIADA

El 80% de las incidencias son de Expertis / Movilsat ERP. Ante ambigüedad, usar ese como valor por defecto.

IMPORTANTE: La solución asociada debe ser COHERENTE con el dominio funcional elegido en el paso 2:
- Si domain = "gmao" → solution_associated = "Expertis / Movilsat ERP" (GMAO es módulo de Expertis)
- Si domain = "portal_ot" → solution_associated = "Portal OT"
- Si domain = "movilsat" → solution_associated = "Movilsat"

${solutionBlock}

Valor por defecto si no hay señal clara: "${mapping.solution_resolution?.default ?? 'Expertis / Movilsat ERP'}"

---

## PASO 4 — MÓDULO EXPERTIS (solo si solution_associated = "Expertis / Movilsat ERP")

Prioridad de módulos: ${priorityHint}

Palabras clave por módulo:
${expertisBlock}

Módulos residuales (< 1% de casos): crm, calidad, rrhh, fabricacion — solo asignar si hay señal explícita.
Valor por defecto si no se puede inferir: "general"

Si solution_associated ≠ "Expertis / Movilsat ERP" → expertis_module = null

---

## PASO 5 — BLOQUE Y MÓDULO REDMINE

${domainToBlock}

---

## PASO 6 — NECESIDAD (NEED)

${needCatalogue}

Reglas de resolución:
- incidencia_error → need = "error"
- consulta_funcional o formacion_duda_uso → need = "formacion"
- configuracion + permisos → need = "permisos"
- configuracion → need = "configuracion"
- usuario_acceso + sesión → need = "sesion"
- usuario_acceso + permisos → need = "permisos"
- usuario_acceso → need = "configuracion"
- instalacion_entorno + VPN → need = "vpn2"
- instalacion_entorno → need = "instalar"
- importacion_exportacion → need = "importdatos"
- rendimiento_bloqueo → need = "error"
- peticion_cambio_mejora + campo nuevo → need = "campo"
- peticion_cambio_mejora + mostrar/sacar campo → need = "sacarcampo"
- peticion_cambio_mejora + informe → need = "infor"
- peticion_cambio_mejora + proceso/automatización → need = "proceso"

---

## PASO 7 — RESPONSABLE

Reglas específicas (menor número = más específica):
${topRules}

Reglas genéricas:
${genericRules}

Responsable por defecto: ${defaultAssignee}

---

## INSTRUCCIONES DE SALIDA

Responde SOLO con un objeto JSON válido. Sin texto adicional, sin markdown.

{
  "summary": "string — resumen operativo en español, 1-2 frases, para el técnico receptor",
  "classification": {
    "nature": "string — ID de naturaleza",
    "domain": "string — ID de dominio funcional (del paso 2)",
    "object": "string — objeto afectado",
    "action": "string — acción operativa detectada"
  },
  "solution_associated": "string — una de: Expertis / Movilsat ERP | Movilsat | Sistemas | Portal OT | App Fichajes / Gastos / Vacaciones | Soluciones IA | Planificador Inteligente | Business Intelligence | Comercial | Resto",
  "expertis_module": "string | null — general | financiero | logistica | comercial | proyectos | gmao | crm | calidad | rrhh | fabricacion | no_aplica | no_claro — null si solution_associated ≠ Expertis / Movilsat ERP",
  "redmine_mapping": {
    "block": "string — bloque Redmine",
    "module": "string — módulo Redmine (o '*')",
    "need": "string — need ID"
  },
  "confidence": "high | medium | low",
  "review_status": "auto_ok | review_recommended | ambiguous | out_of_map | human_required",
  "suggested_priority": "normal | high | urgent",
  "suggested_assignee": "string — rol funcional id según tabla (ej: soporte_errores_expertis, gmao_formacion...)",
  "reasoning": "string — dominio elegido y por qué, solución elegida, módulo Expertis si aplica, need aplicado, regla de asignación usada"
}

## REGLAS DE CONFIANZA

- confidence = "high": naturaleza, dominio, solución, módulo Expertis y need todos claros.
- confidence = "medium": algún elemento ambiguo pero clasificación probable.
- confidence = "low": información insuficiente.
- review_status = "auto_ok" solo si confidence = "high".
- review_status = "review_recommended" si confidence = "medium".
- review_status = "ambiguous" si no hay clasificación fiable.
- review_status = "out_of_map" si no encaja (ej: consulta comercial ajena al soporte).

## REGLAS FINALES

- Siempre devuelve TODOS los campos.
- suggested_assignee NUNCA puede ser null — usa "${defaultAssignee}" (${defaultRolNombre}) si no hay regla.
- No inventes información que no esté en la descripción.
- reasoning debe mencionar: dominio elegido y por qué, solución elegida, módulo Expertis si aplica, need aplicado, regla de asignación usada.`;
}

export function buildUserPrompt(request: ClassificationRequest): string {
  let prompt = `## DESCRIPCIÓN DEL CLIENTE

${request.description}

## CONTEXTO

- Empresa: ${request.user_context.company_name} (ID: ${request.user_context.company_id})
- Usuario: ${request.user_context.user_id}
- Intento de clasificación: ${request.attempt}`;

  if (request.attachment_names.length > 0) {
    prompt += `\n- Archivos adjuntos: ${request.attachment_names.join(', ')}`;
  }

  prompt += `\n\nClasifica esta incidencia siguiendo el flujo de decisión. Responde SOLO con JSON válido.`;

  return prompt;
}
