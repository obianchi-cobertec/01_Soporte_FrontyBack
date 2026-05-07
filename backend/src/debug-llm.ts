import 'dotenv/config';
import { buildSystemPrompt, buildUserPrompt } from './services/classifier/prompt-builder.js';
import { getLLMProvider } from './services/llm/index.js';
import { validateClassificationResponse } from './services/classifier/response-validator.js';
import type { ClassificationRequest } from './types.js';

const provider = getLLMProvider();
const sys = buildSystemPrompt();

const request: ClassificationRequest = {
  session_id: 'debug-001',
  description: 'Necesito un usuario para entrar en la Academia Cobertec para poder estudiar los cursos de aprendizaje.',
  user_context: { company_id: '379', company_name: 'HERGOPAS_sat', user_id: '848' },
  attachment_names: [],
  attempt: 1,
};

const usr = buildUserPrompt(request);
console.log('[DEBUG] system prompt length:', sys.length, 'chars');
console.log('[DEBUG] calling LLM...');

const result = await provider.call(sys, usr);
console.log('[DEBUG] LLM text length:', result.text?.length ?? 0, 'chars');
console.log('[DEBUG] RAW OUTPUT:');
console.log(result.text);

const v = validateClassificationResponse(result.text ?? '', 'debug-001');
if (v.success) {
  console.log('\n[DEBUG] Validation OK ✅');
  console.log('nature:', v.data.classification.nature);
  console.log('domain:', v.data.classification.domain);
  console.log('suggested_assignee:', v.data.suggested_assignee);
} else {
  console.log('\n[DEBUG] Validation FAILED ❌');
  console.log('errors:', v.errors);
  console.log('raw (first 400):', v.raw?.slice(0, 400));
}
