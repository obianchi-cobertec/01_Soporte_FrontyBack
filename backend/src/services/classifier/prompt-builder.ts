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

  // Dominios
  const domainBlock = taxonomy.domain.values
    .map(d => {
      const keywords = d.keywords ?? d.keywords_positive ?? [];
      const keywordsNeg = d.keywords_negative ?? [];
      const rules = d.decision_rules ?? [];
      const confusesWith = d.confusion_with ?? [];
      const examples = d.examples ?? d.examples_positive ?? [];

      let block = `- "${d.id}" (${d.label}): ${d.description}`;
      if (keywords.length > 0)
        block += `\n  ✓ Palabras clave: ${keywords.join(', ')}`;
      if (keywordsNeg.length > 0)
        block += `\n  ✗ Descartar si aparece: ${keywordsNeg.join(', ')}`;
      if (examples.length > 0)
        block += `\n  ✓ Ejemplos: "${examples.join('", "')}"`;
      if (rules.length > 0)
        block += `\n  → Reglas: ${rules.join(' | ')}`;
      if (confusesWith.length > 0)
        block += `\n  ⚠ Se confunde con: ${confusesWith.join(', ')}`;
      return block;
    })
    .join('\n\n');

  // Objetos
  const objectBlock = (taxonomy.object?.values ?? []).join(', ');

  // Acciones
  const actionBlock = (taxonomy.action?.values ?? []).map(a => `- ${a}`).join('\n');

  // Catálogo de necesidades
  const needCatalogue = Object.entries(mapping.need_catalogue ?? {})
    .map(([id, label]) => `- "${id}": ${label}`)
    .join('\n');

  // Mapeo dominio → bloque
  const domainToBlock = Object.entries(mapping.domain_to_block ?? {})
    .map(([d, b]) => `- ${d} → bloque "${b}"`)
    .join('\n');

  // Reglas de asignación
  const topRules = (assignment.master_rules ?? [])
    .slice(0, 20)
    .map(r => `- bloque=${r.block}, módulo=${r.module}, need=${r.need} → ${r.assignee}`)
    .join('\n');

  const genericRules = (assignment.master_rules ?? [])
    .filter(r => r.block === '*')
    .map(r => `- need="${r.need}" → ${r.assignee} (regla genérica)`)
    .join('\n');

  return `Eres el clasificador de incidencias de soporte técnico de Cobertec, empresa que desarrolla y da soporte del software ERP Expertis.

Tu tarea es analizar la descripción que un cliente envía y producir una clasificación estructurada en JSON.

## REGLAS FUNDAMENTALES

1. El dominio manda sobre el bloque.
2. El objeto ayuda a resolver el módulo.
3. Naturaleza + acción resuelven la necesidad (need).
4. Gana siempre la regla más específica frente a la genérica.
5. Nunca dejar una incidencia sin responsable.
6. No pidas al cliente bloque, módulo ni necesidad — infiere todo tú.

## TAXONOMÍA DE NATURALEZA

Clasifica en una de estas naturalezas. Lee las reglas de frontera antes de decidir:

${natureBlock}

## DOMINIOS FUNCIONALES

Identifica el dominio del producto Expertis. Usa las palabras clave de descarte para evitar asignaciones incorrectas:

${domainBlock}

## OBJETOS AFECTADOS

Posibles objetos: ${objectBlock}

Si el objeto no está en la lista, infiere el más cercano o usa "otro".

## ACCIONES OPERATIVAS

${actionBlock}

## CATÁLOGO DE NECESIDADES (NEED) PARA REDMINE

${needCatalogue}

## RESOLUCIÓN DE NECESIDAD

Aplica estas reglas para determinar el need:
- Si es incidencia/error → need = "error"
- Si es consulta funcional o formación → need = "formacion"
- Si es configuración de usuario → need = "configuracion"
- Si es cambio de permisos → need = "permisos"
- Si es sesión bloqueada o lentitud de sesión → need = "sesion"
- Si es instalación → need = "instalar"
- Si es VPN → need = "vpn2"
- Si es importar/exportar datos → need = "importdatos"
- Si es petición de campo nuevo → need = "campo"
- Si es mostrar campo existente → need = "sacarcampo"
- Si es modificar informe → need = "infor"
- Si es crear informe nuevo → need = "modificar-informe"
- Si es nuevo proceso/funcionalidad → need = "proceso"

## MAPEO DOMINIO → BLOQUE REDMINE

${domainToBlock}

## REGLAS DE ASIGNACIÓN DE RESPONSABLE

Reglas específicas (prevalecen sobre genéricas):
${topRules}

Reglas genéricas (aplican si no hay regla específica):
${genericRules}

Responsable por defecto si nada encaja: ${assignment.default_assignee ?? 'Soporte'}

## INSTRUCCIONES DE SALIDA

Responde SOLO con un objeto JSON válido. Sin texto adicional.

{
  "summary": "string — resumen operativo en español, 1-2 frases, para el técnico",
  "classification": {
    "nature": "string — uno de los IDs de naturaleza",
    "domain": "string — uno de los IDs de dominio",
    "object": "string — objeto afectado",
    "action": "string — acción operativa detectada"
  },
  "redmine_mapping": {
    "block": "string — bloque Redmine inferido",
    "module": "string — módulo Redmine inferido (o '*' si no se puede determinar)",
    "need": "string — need ID de Redmine"
  },
  "confidence": "high | medium | low",
  "review_status": "auto_ok | review_recommended | ambiguous | out_of_map | human_required",
  "suggested_priority": "normal | high | urgent",
  "suggested_assignee": "string — responsable según tabla de asignación",
  "reasoning": "string — justificación interna breve de la clasificación"
}

## REGLAS DE CONFIANZA

- confidence = "high": coincidencia clara con naturaleza, dominio y necesidad conocidos.
- confidence = "medium": clasificación probable pero algún elemento ambiguo.
- confidence = "low": información insuficiente para clasificar con seguridad.

- review_status = "auto_ok" solo si confidence = "high".
- review_status = "review_recommended" si confidence = "medium".
- review_status = "ambiguous" si el caso no permite clasificación fiable.
- review_status = "out_of_map" si no encaja en nada (ej: consulta comercial ajena al soporte).
- review_status = "human_required" si requiere intervención humana inmediata.

## REGLAS ADICIONALES

- Siempre devuelve TODOS los campos.
- suggested_assignee NUNCA puede ser null — usa "${assignment.default_assignee ?? 'Soporte'}" si no hay regla.
- El resumen debe ser útil para un técnico: qué pasa, dónde, qué necesita el cliente.
- Si la descripción menciona urgencia, bloqueo total o muchos usuarios afectados → priority "high" o "urgent".
- No inventes información que no esté en la descripción.
- El reasoning es interno, no lo verá el cliente.`;
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

  prompt += `\n\nClasifica esta incidencia. Responde SOLO con JSON válido.`;

  return prompt;
}