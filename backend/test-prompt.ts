import { buildSystemPrompt, buildUserPrompt } from './src/services/classifier/prompt-builder.js';

const systemPrompt = buildSystemPrompt();
console.log('=== SYSTEM PROMPT ===');
console.log(systemPrompt);
console.log('\n=== LONGITUD ===');
console.log(`${systemPrompt.length} caracteres`);

const userPrompt = buildUserPrompt({
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  description: 'No puedo generar facturas, da error al guardar',
  user_context: { user_id: 'u1', company_id: 'c1', company_name: 'Test' },
  attachment_names: [],
  attempt: 1,
});
console.log('\n=== USER PROMPT ===');
console.log(userPrompt);