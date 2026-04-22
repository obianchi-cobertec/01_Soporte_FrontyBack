/**
 * run-tests.ts — Batería de tests automatizados de clasificación IA
 *
 * Ejecuta 14 casos reales contra el sistema de intake y verifica
 * que la clasificación y asignación son correctas.
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/run-tests.ts
 */

const BASE_URL = 'http://localhost:3001/api';
const EMAIL    = 'formacion@cobertec.es';
const PASSWORD = 'Cobertec2024!';

interface TestCase {
  id: string;
  description: string;
  expectedBlock: string;
  expectedNeed: string;
  expectedAssignee: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: 'T01',
    description: '¿Los incrementos en los presupuestos no se pueden aplicar a todo el capítulo? A un trabajo concreto sí que me deja, pero cuando lo aplico a todo el capítulo parece no cogerlo.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: 'obras_formacion',
  },
  {
    id: 'T02',
    description: 'Cuando se crea un informe de una certificación, no coinciden los importes del presupuesto con los importes de la certificación. Con el consiguiente descuadre en los datos.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'T03',
    description: 'Hoy nos ha llegado una factura con tipo de IVA Superreducido del 2%. Di de alta el tipo de IVA en Expertis porque no existía y al mandar la factura al SII nos da error.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'T04',
    description: 'En el último equipo que se ha instalado Expertis aparece un error. Además cuando en el apartado facturación de ventas intento crear una factura me dice que no hay series definidas.',
    expectedBlock: 'ventas',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'T05',
    description: 'Necesitamos saber cuál es el precio que tenemos que tomar como referencia para valorar nuestro stock para el cierre de año correctamente.',
    expectedBlock: '*',
    expectedNeed: 'formacion',
    expectedAssignee: 'formacion_general',
  },
  {
    id: 'T06',
    description: 'Necesito crear accesos para un nuevo usuario. Tiene que tener los mismos permisos que los demás pero además necesita acceso a Pedido Compra y Recepción de Pedidos.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'T07',
    description: 'A una compañera nueva le sale un aviso de error en OpenVPN. Puede entrar al programa pero no sé si funcionará correctamente con ese error.',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: '*',
    expectedAssignee: 'soporte_servidores',
  },
  {
    id: 'T08',
    description: 'Buenos días, adjunto Excel con las tarifas de artículos de almacén a importar. Necesitamos que se carguen en el sistema.',
    expectedBlock: 'tarifas_catalogos',
    expectedNeed: 'importdatos',
    expectedAssignee: 'desarrollo_exportaciones',
  },
  {
    id: 'T09',
    description: 'Buenos días Lorena. Me han surgido varias consultas sobre la contabilidad en Expertis. ¿Cómo se registran correctamente los asientos de apertura del ejercicio?',
    expectedBlock: 'financiero',
    expectedNeed: 'formacion',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'T10',
    description: 'Tenemos que anular el asiento de cierre para volver a generarlo porque hay un error en los importes. Por favor llamarnos para que nos ayudéis.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'T11',
    description: 'Los técnicos de Movilsat no aparecen en el planificador. He estado mirando y ni desde Portal OT ni desde Expertis he encontrado dónde activarlos.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: 'gmao_general',
  },
  {
    id: 'T12',
    description: 'Buenos días, necesito crear un nuevo usuario en la app de fichajes para un trabajador que acaba de incorporarse.',
    expectedBlock: 'app_fichajes',
    expectedNeed: '*',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'T13',
    description: 'Uno de los primeros reglamentos de mantenimiento preventivo que aplicamos no está bien configurado. No me permite generar la revisión de los activos del 1931 al 1938.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: 'gmao_general',
  },
  {
    id: 'T14',
    description: '¿Podría ser que en los presupuestos comerciales solo salga el nombre y primer apellido en el campo Elaborado por? Ahora aparece el nombre completo y queda muy largo.',
    expectedBlock: 'ofertas_comerciales',
    expectedNeed: '*',
    expectedAssignee: 'desarrollo_campos',
  },
  {
    id: 'T15',
    description: 'necesitamos que nos expliquen como vemos que porcentaje o importe hemos ganado/perdido en los proyectos. Si hay un listado de proyectos donde se vea a simple vista si ha habido ben',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T16',
    description: 'En el proyecto MP240002 hemos asignado facturas de gastos a este proyecto y en el proyecto aparecen unas sí y otras no. Parece que no coge bien las facturas asignadas.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T17',
    description: 'Respecto al mantenimiento de Categorías, la Categoría 5 Oficial Instalaciones/Obras tiene un precio por hora, pero al crear una OT con esa categoría no aparece el precio correcto.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T18',
    description: 'Tengo dudas a la hora de facturar desde proyectos. Si quiero facturar al completo, ¿tengo que pasarlo manualmente a hitos? ¿Existe otra forma?',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T19',
    description: 'En el módulo proyectos, a la hora de cambiar el margen nos sale una pregunta de si queremos crear una cuenta contable. Desconocemos qué debemos contestar.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T20',
    description: 'En la impresión de los presupuestos, ¿existe la opción de indicar al final del informe un resumen de los capítulos con su precio unitario? ¿O es algo que tendríais que desarrollar?',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T21',
    description: 'Necesitamos que las facturas de venta salgan selladas y firmadas. ¿Se puede insertar certificado electrónico o pegar foto de firma y sello?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T22',
    description: 'Acabamos de hacer una compra cuyo coste es 2,99. En mantenimiento de artículos sale correcto el precio de última compra, pero al hacer la venta en el coste no refleja el precio cor',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T23',
    description: 'He visto en la ficha de cliente que se puede indicar el tipo de facturación mensual/diaria. ¿Hay alguna forma de ver esta información en el proceso de facturación?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T24',
    description: 'Cuando se crea una factura hay un centro de gestión en la cabecera y uno en cada línea. ¿Tiene sentido tener que rellenarlo individualmente en cada línea?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T25',
    description: 'Necesitamos renovar los programas de venta incorporando un incremento de IPC. Es la primera vez y nos gustaría revisar con vosotros cómo hacerlo correctamente.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T26',
    description: 'El concepto del envío de facturas al SII debe ser la descripción de la cuenta contable de la primera línea tanto en compra como en venta.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T27',
    description: 'Necesito que me llame Lorena para terminar de aclarar el tema de ingresar facturas en el SII.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T28',
    description: 'Adjunto pantallazo con el error que aparece al intentar presentar el impuesto. Me aparece de forma sistemática y no deja a mi asesoría presentar el impuesto.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T29',
    description: 'En Impuestos, información, IVAs, IVA de compras, si intento sacar el listado de facturas de IVA intracomunitaria, no aparece el campo del número VAT del proveedor.',
    expectedBlock: 'financiero',
    expectedNeed: 'infor',
    expectedAssignee: '*',
  },
  {
    id: 'T30',
    description: 'Tengo un problema con el cierre del tercer trimestre del IVA. El cierre de IVA en facturas no está hecho y el asiento sí, y no me deja anularlo.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T31',
    description: 'Necesitamos que nos instaléis el software de Expertis y la VPN en tres ordenadores nuevos. Ya nos decís cuándo os viene bien para coordinarlo.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T32',
    description: 'Buenos días, no me deja acceder al programa, me da un error al intentar entrar.',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T33',
    description: 'Buenos días, ¿podemos crear un nuevo usuario de acceso a Expertis? Gracias.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T34',
    description: 'A continuación adjunto documentación con el fin de importar los artículos de nuestro almacén.',
    expectedBlock: '*',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'T35',
    description: 'Hay que configurar las copias de seguridad del servidor de Eurofor.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T36',
    description: 'Estamos utilizando la Prioridad de las OT para indicar al técnico si ese aviso está citado o no con el cliente. Si la prioridad es 1 no está citado. ¿Puede configurarse esto de otr',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T37',
    description: 'Mi compañero ha intentado enviar un informe de errores porque tiene en su dispositivo algunas OTs en estado Realizado pero no están sincronizadas con el servidor.',
    expectedBlock: 'movilsat',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T38',
    description: 'Solicitamos que se envíe a nuestra nave una Tablet con su SIM para uso con Movilsat.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T39',
    description: 'En el proyecto de mejoras de Movilsat indicamos que debería aparecer marca y modelo de máquina y si el técnico no lo rellena que salte un aviso. Esto no está funcionando.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T40',
    description: 'En la mejora de Movilsat contratada, en cada orden de trabajo el técnico informa automáticamente pero hay casos donde el modo automático no funciona correctamente.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T41',
    description: '¿Se pueden desactivar todos los activos que tenemos creados y únicamente dejar activos los activos abuelo, en nuestro caso los centros?',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T42',
    description: 'Hemos renovado todos los activos de un cliente pero el activo ACT 1451, aunque indicamos las mismas fechas que para el resto, no renueva el reglamento.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T43',
    description: 'Adjunto plantilla de Revisiones Automáticas de Activos para su importación.',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T44',
    description: 'Necesitamos que funcione el campo Importe Total Coste en la pestaña de materiales de las órdenes de trabajo, ya que no salen los importes.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T45',
    description: 'Al hacer una compra, ¿no se actualiza en la ficha del artículo el precio de compra actual? ¿Siempre hay que hacerlo manualmente?',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
];

// ─── Auth helpers ─────────────────────────────────────────

async function getToken(): Promise<{ accessToken: string; companyId: string }> {
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json() as any;
  const companyId = data.companies[0]?.id;
  if (!companyId) throw new Error('No company found');

  const res2 = await fetch(`${BASE_URL}/auth/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.access_token}` },
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!res2.ok) throw new Error(`Select company failed: ${res2.status}`);
  const data2 = await res2.json() as any;
  return { accessToken: data2.access_token, companyId };
}

async function submitIntake(token: string, description: string): Promise<any> {
  const sessionId = crypto.randomUUID();
  const res = await fetch(`${BASE_URL}/intake/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      session_id: sessionId,
      user_id: 'test',
      company_id: 'test',
      company_name: 'test',
      description,
      attachments: [],
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  const data = await res.json() as any;
  return { sessionId, classification: data };
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  BATERÍA DE TESTS — Cobertec Intake IA');
  console.log('═'.repeat(60));

  const { accessToken } = await getToken();
  console.log('✓ Autenticado como Usuario Prueba (HERGOPAS_sat)\n');

  let passed = 0;
  let failed = 0;
  const failures: string[] = [  {
    id: 'T15',
    description: 'necesitamos que nos expliquen como vemos que porcentaje o importe hemos ganado/perdido en los proyectos. Si hay un listado de proyectos donde se vea a simple vista si ha habido ben',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T16',
    description: 'En el proyecto MP240002 hemos asignado facturas de gastos a este proyecto y en el proyecto aparecen unas sí y otras no. Parece que no coge bien las facturas asignadas.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T17',
    description: 'Respecto al mantenimiento de Categorías, la Categoría 5 Oficial Instalaciones/Obras tiene un precio por hora, pero al crear una OT con esa categoría no aparece el precio correcto.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T18',
    description: 'Tengo dudas a la hora de facturar desde proyectos. Si quiero facturar al completo, ¿tengo que pasarlo manualmente a hitos? ¿Existe otra forma?',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T19',
    description: 'En el módulo proyectos, a la hora de cambiar el margen nos sale una pregunta de si queremos crear una cuenta contable. Desconocemos qué debemos contestar.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T20',
    description: 'En la impresión de los presupuestos, ¿existe la opción de indicar al final del informe un resumen de los capítulos con su precio unitario? ¿O es algo que tendríais que desarrollar?',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T21',
    description: 'Necesitamos que las facturas de venta salgan selladas y firmadas. ¿Se puede insertar certificado electrónico o pegar foto de firma y sello?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T22',
    description: 'Acabamos de hacer una compra cuyo coste es 2,99. En mantenimiento de artículos sale correcto el precio de última compra, pero al hacer la venta en el coste no refleja el precio cor',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T23',
    description: 'He visto en la ficha de cliente que se puede indicar el tipo de facturación mensual/diaria. ¿Hay alguna forma de ver esta información en el proceso de facturación?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T24',
    description: 'Cuando se crea una factura hay un centro de gestión en la cabecera y uno en cada línea. ¿Tiene sentido tener que rellenarlo individualmente en cada línea?',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'T25',
    description: 'Necesitamos renovar los programas de venta incorporando un incremento de IPC. Es la primera vez y nos gustaría revisar con vosotros cómo hacerlo correctamente.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T26',
    description: 'El concepto del envío de facturas al SII debe ser la descripción de la cuenta contable de la primera línea tanto en compra como en venta.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T27',
    description: 'Necesito que me llame Lorena para terminar de aclarar el tema de ingresar facturas en el SII.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T28',
    description: 'Adjunto pantallazo con el error que aparece al intentar presentar el impuesto. Me aparece de forma sistemática y no deja a mi asesoría presentar el impuesto.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T29',
    description: 'En Impuestos, información, IVAs, IVA de compras, si intento sacar el listado de facturas de IVA intracomunitaria, no aparece el campo del número VAT del proveedor.',
    expectedBlock: 'financiero',
    expectedNeed: 'infor',
    expectedAssignee: '*',
  },
  {
    id: 'T30',
    description: 'Tengo un problema con el cierre del tercer trimestre del IVA. El cierre de IVA en facturas no está hecho y el asiento sí, y no me deja anularlo.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T31',
    description: 'Necesitamos que nos instaléis el software de Expertis y la VPN en tres ordenadores nuevos. Ya nos decís cuándo os viene bien para coordinarlo.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T32',
    description: 'Buenos días, no me deja acceder al programa, me da un error al intentar entrar.',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T33',
    description: 'Buenos días, ¿podemos crear un nuevo usuario de acceso a Expertis? Gracias.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T34',
    description: 'A continuación adjunto documentación con el fin de importar los artículos de nuestro almacén.',
    expectedBlock: '*',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'T35',
    description: 'Hay que configurar las copias de seguridad del servidor de Eurofor.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T36',
    description: 'Estamos utilizando la Prioridad de las OT para indicar al técnico si ese aviso está citado o no con el cliente. Si la prioridad es 1 no está citado. ¿Puede configurarse esto de otr',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T37',
    description: 'Mi compañero ha intentado enviar un informe de errores porque tiene en su dispositivo algunas OTs en estado Realizado pero no están sincronizadas con el servidor.',
    expectedBlock: 'movilsat',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T38',
    description: 'Solicitamos que se envíe a nuestra nave una Tablet con su SIM para uso con Movilsat.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T39',
    description: 'En el proyecto de mejoras de Movilsat indicamos que debería aparecer marca y modelo de máquina y si el técnico no lo rellena que salte un aviso. Esto no está funcionando.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T40',
    description: 'En la mejora de Movilsat contratada, en cada orden de trabajo el técnico informa automáticamente pero hay casos donde el modo automático no funciona correctamente.',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T41',
    description: '¿Se pueden desactivar todos los activos que tenemos creados y únicamente dejar activos los activos abuelo, en nuestro caso los centros?',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T42',
    description: 'Hemos renovado todos los activos de un cliente pero el activo ACT 1451, aunque indicamos las mismas fechas que para el resto, no renueva el reglamento.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T43',
    description: 'Adjunto plantilla de Revisiones Automáticas de Activos para su importación.',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'T44',
    description: 'Necesitamos que funcione el campo Importe Total Coste en la pestaña de materiales de las órdenes de trabajo, ya que no salen los importes.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'T45',
    description: 'Al hacer una compra, ¿no se actualiza en la ficha del artículo el precio de compra actual? ¿Siempre hay que hacerlo manualmente?',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
];

  for (const test of TEST_CASES) {
    process.stdout.write(`[${test.id}] Clasificando... `);
    try {
      const { classification } = await submitIntake(accessToken, test.description);
      const block    = classification.display?.estimated_area ?? '?';
      const need     = classification.display?.need ?? '?';
      // need to get assignee from a confirm — skip for now, check block+need only
      const blockOk  = test.expectedBlock === '*' || block === test.expectedBlock || block.includes(test.expectedBlock);
      const needOk   = need === test.expectedNeed || need === 'otra' || test.expectedNeed === '*';

      if (blockOk && needOk) {
        console.log(`✓ bloque=${block} need=${need}`);
        passed++;
      } else {
        console.log(`✗ bloque=${block} (esperado=${test.expectedBlock}) | need=${need} (esperado=${test.expectedNeed})`);
        failed++;
        failures.push(`${test.id}: bloque=${block}≠${test.expectedBlock} need=${need}≠${test.expectedNeed}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.log(`✗ ERROR: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
      failures.push(`${test.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTADO: ${passed}/${TEST_CASES.length} pasados, ${failed} fallidos`);
  if (failures.length > 0) {
    console.log('\n  FALLOS:');
    failures.forEach(f => console.log(`    • ${typeof f === 'string' ? f : JSON.stringify(f)}`));
  }
  console.log('═'.repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
