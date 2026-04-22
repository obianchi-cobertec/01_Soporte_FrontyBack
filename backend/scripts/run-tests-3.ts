/**
 * run-tests-3.ts — Batería de tests automatizados de clasificación IA
 * 100 incidencias reales enero 2025
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/run-tests-3.ts
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
    id: 'M01',
    description: 'Hola,   Necesitamos que en la empresa CONEN, crear articulo V.ABONO CTA 708000  /  C.ABONO 608000   También cuando tiene un abono, CLAVE TIPO FACTURAS ( No le aparece para elegir factura rectificativa / CLAVE OPERACION tampoco salen facturas rectificativas.   Silvia Seijas',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M02',
    description: 'dar acceso al diario contable a la sesión de ESTELA',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M03',
    description: 'CAMBIAR PRECIO POR PRECIO COSTE',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M04',
    description: 'Se puede cambiar "Precio Presup." por "Precio Coste"',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M05',
    description: 'Buenos días,   Debe haber alguna sesión colgada, porque no nos deja acceder al programa por sesiones superadas y no estamos todos conectados.   Nos avisáis para cerrar el programa y liberar las sesiones, por favor.',
    expectedBlock: 'sesiones_conectividad',
    expectedNeed: 'sesion',
    expectedAssignee: 'soporte_sesiones_generales',
  },
  {
    id: 'M06',
    description: 'Después de crear a un proveedor, nos dice que ya existe pero no está.',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M07',
    description: 'Buenos días Tenemos 100 pedidos sin generar y no podemos generarlos porque da error Por favor, corregir',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M08',
    description: 'Buenos días,   En la pestaña de proyectos dentro del módulo de obras, me aparece bloqueada la opción de eliminar registros. ¿Hay alguna opción para borrar los proyectos?',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'formacion',
    expectedAssignee: 'obras_formacion',
  },
  {
    id: 'M09',
    description: 'Egun on  me comenta Aingeru que cuando va a imprimir le aparece un error y no le deja.   Adjunto pantallazo',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M10',
    description: 'Buenas tardes   Por favor revisar e indicar que esta pasando con el Cliente LENNOX , no esta mostrando los datos del clientes en la facturación, según pantallazo',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M11',
    description: 'Buenas tardes,   Necesito que nos instalen Expertis en un nuevo equipo.',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: 'instalar',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M12',
    description: 'ADJUNTO ARCHIVO.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M13',
    description: 'Hola,   Queremos que las facturas se vean como en presupuesto y no las líneas de la composición',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'infor',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M14',
    description: '¿Sería esto posible hacer con una salida de impresora como la que tengo para enviar el parte de trabajo valorado, pero añadiendo ahora al enviar a través de mail el archivo firmado de expertis?',
    expectedBlock: 'gmao',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'M15',
    description: 'Buenos días,   A continuación, adjunto excel con el inmovilizado según los datos que podemos exportar a Excel desde nuestro programa actual.',
    expectedBlock: 'financiero',
    expectedNeed: 'importdatos',
    expectedAssignee: '*',
  },
  {
    id: 'M16',
    description: 'Hola   Se me están dando casos, en ots que las piezas, a veces, no se actualiza el stock',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M17',
    description: 'Buenos días,   Las acciones de actualizar precios de material, y precios de MOD en presupuestos no están funcionando al no actualizar ningún valor.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M18',
    description: 'NO NOS HABIA PASADO HASTA AHORA, AYER ENVIAMOS LA PRIMERA FACTURA DEL 2025 MEDIANTE EL PROGRAMA POR EMAIL Y LA FACTURA HA LLEGADO EN BLANCO.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M19',
    description: 'Habría que dar de baja a avisos@iparfrio.com para que no envíe las OTs a esta dirección.',
    expectedBlock: 'movilsat',
    expectedNeed: 'configuracion',
    expectedAssignee: '*',
  },
  {
    id: 'M20',
    description: 'NOS HAN ACEPTADO UN PRESUPUESTO IN20250003, HEMOS CREADO UN PROYECTO PRIN00000004. AL HACER UN PEDIDO DE COMPRA, NOS SALE ESTE ERROR (ADJUNTO CAPTURA PANTALLA).',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M21',
    description: 'Buenas días.   Necesito saber en donde tengo que hacer constar  un número de pedido para que me salga en la factura eléctronica. En el contrato me dicen que tiene que salir en el campo FILEREFERENCE.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M22',
    description: 'Estará en todos los documentos que se emite para enviar al exterior. Debemos quitar de todos los informes el nº de CAF',
    expectedBlock: 'informes_documentos',
    expectedNeed: 'infor',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M23',
    description: 'Hay que instalarles el planificador.',
    expectedBlock: 'planificador_inteligente',
    expectedNeed: 'instalar',
    expectedAssignee: '*',
  },
  {
    id: 'M24',
    description: 'Buenos días,   Llevamos un tiempo haciendo pruebas con uno de nuestros técnicos utilizando la versión nueva de Movilsat 8. Esta semana le ha dado un error de sincronización en la OT 24PRE00062.',
    expectedBlock: 'movilsat',
    expectedNeed: 'error',
    expectedAssignee: 'gmao_listado_ot_mov',
  },
  {
    id: 'M25',
    description: 'Buenas tardes,   Actualmente, el proceso no modifica el campo "Prioridad". Necesitamos que se modifique de acuerdo al Asunto del correo electrónico que utiliza para la creación automática.',
    expectedBlock: 'gmao',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'M26',
    description: 'El trabajador Jose Luis Ojeda no puede fichar la salida nunca y se lo tenemos que hacer nosotros, así mismo cuando miramos el listado de horas del día que falta por fichar la salida salen unas 8000 horas',
    expectedBlock: 'app_fichajes',
    expectedNeed: '*',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'M27',
    description: 'fichaje trabajador no funciona - no puede entrar de ninguna manera, le sale error. Se lo ha quitado del móvil y ha vuelto a ponerlo varias veces',
    expectedBlock: 'app_fichajes',
    expectedNeed: '*',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'M28',
    description: 'Nos solicitan la actualización a movilsat 8 con los componentes de Expertis que sean necesarios. La valoración de 300€ ha sido aceptada.',
    expectedBlock: 'movilsat',
    expectedNeed: 'instalar',
    expectedAssignee: '*',
  },
  {
    id: 'M29',
    description: 'Les gustaría tener algún proceso en presupuestos, que cambie los tipos de presupuestos. Cuando importan un BC3, el sistema les pone el tipo de presupuesto que viene en el BC3',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'M30',
    description: 'Buenos días,  al intentar enviar un pedido por mail desde el programa, devuelve el siguiente error',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M31',
    description: 'Cuando ahora se quiere crear en un presupuesto un material que tiene asociado de MOD, hay que crear un trabajo llamado así que tenga su artículo y su MOD.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'proceso',
    expectedAssignee: '*',
  },
  {
    id: 'M32',
    description: 'No permite copiar ni partidas ni materiales.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M33',
    description: 'Cuando se intenta borrar cualquier artículo, da el error adjunto.',
    expectedBlock: 'funcionamiento_general',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M34',
    description: 'Cuando queremos crear desde el CRM a un acreedor no nos da opción, solo nos permite darle de alta como proveedor',
    expectedBlock: 'crm',
    expectedNeed: 'formacion',
    expectedAssignee: 'crm_formacion',
  },
  {
    id: 'M35',
    description: 'Buenos días porfis necesito que me hagáis esta importación de datos de la pestaña artículos (para añadirlos a los que ya tenemos)',
    expectedBlock: '*',
    expectedNeed: 'importdatos',
    expectedAssignee: 'desarrollo_campos',
  },
  {
    id: 'M36',
    description: 'Actualizar los modelos: 303 - 349',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M37',
    description: 'He realizado 4 facturas de compra pero he puesto en nº  mal FC29,30,31,32 HE PUESTO FC240000 en vez de FC250000, y ya las he enviado al SII, no me deja modificarlas.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M38',
    description: 'Buenos días,   Hemos detectado un error en las facturas de venta emitidas. La base imponible sólo se refleja la correspondiente a la primera línea.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M39',
    description: 'Buenos días, No conseguimos encontrar el campo de descripción del cliente en la tabla de búsqueda avanzada ObraPresupCabecera (solo aparece el ID) en gestión de presupuestos.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'sacarcampo',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M40',
    description: 'Como puedo retirar de la búsqueda los operarios de este listado para no crear error, ya que hay personas en el listado que ya no trabajan en la empresa',
    expectedBlock: 'portal_ot',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M41',
    description: 'Buenos días, al intentar hacer un inventario de un artículo que no usamos nunca, nos da un error y no podemos hacerlo.',
    expectedBlock: 'almacen_stocks',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M42',
    description: 'Para que sirve y como se utiliza.',
    expectedBlock: '*',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'M43',
    description: 'Buenos días,   Me escribí con un compañero vuestro porque un chico no puede instalarse la aplicación movilsat en el teléfono.',
    expectedBlock: 'movilsat',
    expectedNeed: 'instalar',
    expectedAssignee: 'soporte_sesiones_generales',
  },
  {
    id: 'M44',
    description: 'necesito borrar el asiento 421 y no me deja porque me dice que hay lineas que no se pueden borrar',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M45',
    description: 'Hoy he dado de alta en la plataforma de fichajes a: Carlos Quintana, Nabil Chettouh, Jose Vicente Colonge. ¿Podriais decirme cual es su contraseña de entrada en la App de fichajes?',
    expectedBlock: 'app_fichajes',
    expectedNeed: '*',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'M46',
    description: 'Se ha colocado la dirección de entrega manual y no se refleja en el pedido de compra.',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M47',
    description: 'Estamos planteando la opción de realizar una importación de los activos de PCI para poder realizar las revisiones a través de Expertis.',
    expectedBlock: 'gmao',
    expectedNeed: 'importdatos',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M48',
    description: 'Adjunto excel para importar cobros y pagos (me da error al hacerlo desde sus pantallas)',
    expectedBlock: 'financiero',
    expectedNeed: 'importdatos',
    expectedAssignee: 'desarrollo_campos',
  },
  {
    id: 'M49',
    description: 'Buenas tardes, nuestro compañero avega ha cambiado de ordenador, por lo que necesita que se le instale Expertis en el mismo.',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: 'instalar',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M50',
    description: 'al hacer el asiento de pago de unas facturas me equivoque y puse 30/12/25, en vez de 30/12/24. quise borrar el asiento para hacerlo bien , pero no me dejaba. las facturas no cambian de estado, siguen en estado pagado',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M51',
    description: 'Buenos días Por favor, cambiar la generación de clientes de BattSeller a "Albarán por...pedido"',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M52',
    description: 'INTENTANDO AÑADIR UN ARTICULO 013N1300 SOLO FIGURA SU PRECIO DE COMPRA, NO APARECE SU PRECIO DE VENTA.',
    expectedBlock: 'gmao',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'M53',
    description: 'Tenemos un logo nuevo y queremos hacer algunos cambios en los albaranes y facturas de venta',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'infor',
    expectedAssignee: '*',
  },
  {
    id: 'M54',
    description: 'Necesito que me habiliten poder meter albaranes de compras 2024 y 2025. porque todavía me siguen llegando albaranes 2024 y necesito abrir el 2025.',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M55',
    description: 'en ordenes de trabajo tanto previstos como en control sacar la opción de abrir albarán de compra, sale factura de compra y no albaran.',
    expectedBlock: 'gmao',
    expectedNeed: 'sacarcampo',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M56',
    description: 'Instalar a SETI el módulo de Lectura automatizada de Albaranes',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: 'instalar',
    expectedAssignee: 'soporte_accesos',
  },
  {
    id: 'M57',
    description: 'Como asocio el articulo MAN2025 (CREADO NUEVO) A NUEVA CATEGORIA DE CONTRATO C25H.',
    expectedBlock: 'gmao',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'M58',
    description: 'Buenos días: Nos gustaria saber si podeis poner en el campo configuración de inventarios el número de pedido a que corresponde el articulo y el proyecto al que corresponde.',
    expectedBlock: 'almacen_stocks',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M59',
    description: 'PONER EN MARCHA PARA PODER HACER FACTURAS TBB CON ITURRIAGA QUE NO SE PUEDE. TIENE OTRO CERTIFICADO DISTINTO QUE YO LO TENGO EN EL TELEFONO.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M60',
    description: 'Hemos cambiado las direcciones de correo y tenemos problemas para enviar las facturas electrónicas.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M61',
    description: 'EN COMPRAS CONTADO NO SALE LA BARRA DE DIRECCIONES PARA PONER NOMBRE Y APELLIDOS DE LA PERSONA QUE HACE LA VENTA.',
    expectedBlock: 'compras',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M62',
    description: 'en la factura cogiendo la de Iturriaga , por defecto a la hora de imprimir sale HIERROS, TIENE QUE SALIR ITURRIAGA Y LO MISMO CON RENIAN',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M63',
    description: 'Quiero facturar las líneas de los proyectos 4893 y 62 juntas pero no me deja. Es el mismo cliente  y en su ficha está indicado para facturar obra por cliente.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M64',
    description: 'Buenos dias, Podrían decirme si modificación de los precios de la facturación automática y los artículos creados respecto al incremento de IPC establecido en 2025 lo tenemos que hacer nosotros manualmente o lo podéis hacer vosotros mediante un comando.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'M65',
    description: 'Adjunto excel con el Plan General de Contabilidad para importar de Conen',
    expectedBlock: 'financiero',
    expectedNeed: 'importdatos',
    expectedAssignee: 'desarrollo_campos',
  },
  {
    id: 'M66',
    description: 'Buenos días,   Estamos cerrando trimestre y comprobamos un par de cosas: Modelo 349 y Modelo 390. Al hacer comprobación de importes trimestrales todo cuadra a excepción del Iva deducible en regimen general.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: 'financiero_formacion',
  },
  {
    id: 'M67',
    description: 'Al trabajador Antonio Fernández no le va bien la app, no puede entrar de ninguna manera, le sale error.',
    expectedBlock: 'app_fichajes',
    expectedNeed: 'error',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'M68',
    description: 'Poner todos los artículos con tipo de IVA: IG7',
    expectedBlock: '*',
    expectedNeed: 'importdatos',
    expectedAssignee: 'desarrollo_campos',
  },
  {
    id: 'M69',
    description: 'El trabajador Jose Luis Ojeda no puede fichar la salida nunca y se lo tenemos que hacer nosotros, así mismo cuando miramos el listado de horas del día que falta por fichar la salida salen unas 8000 horas cuando tendrían que ser como mucho 72 horas',
    expectedBlock: 'app_fichajes',
    expectedNeed: 'error',
    expectedAssignee: 'app_fichajes_plataforma',
  },
  {
    id: 'M70',
    description: 'al renovar reglamento nuevo aparece este error, necesito generarlos en el dia de hoy tengo al tecnico en la instalacion',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M71',
    description: 'no salen correos, no conecta a servidor. Problemas varios Tablets',
    expectedBlock: 'movilsat',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'M72',
    description: 'buenos días. nos hicisteis un formato nuevo hace algun tiempo, pero no sale todo alineado cuando facturas albaranes que vienen por distintos sitios',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'infor',
    expectedAssignee: '*',
  },
  {
    id: 'M73',
    description: 'Buenos días, me han propuesto crear una alarma o algún tipo de indicador que salte cuando tomemos un aviso de algún activo y tenga alguna orden abierta',
    expectedBlock: 'gmao',
    expectedNeed: 'campo',
    expectedAssignee: 'soporte_errores_expertis',
  },
  {
    id: 'M74',
    description: 'Buenos días:   No me aparecen las revisiones correspondientes al 2025 del activo CON07086.',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: 'gmao_listado_ot_mov',
  },
  {
    id: 'M75',
    description: 'Hace un rato por error hemos eliminado un presupuesto de los que nosotros denominamos bibliotecas que usamos para copiarlos en presupuestos. El número de presupuesto era el PR00000013. Querríamos saber si existe la posibilidad de que nos lo puedan recuperar.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'M76',
    description: 'Buenas tardes, os envío las actualizaciones de artículos de Baxi.',
    expectedBlock: 'almacen_stocks',
    expectedNeed: 'importdatos',
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
  console.log('  BATERÍA DE TESTS M — Cobertec Intake IA (enero 2025)');
  console.log('═'.repeat(60));

  const { accessToken } = await getToken();
  console.log('✓ Autenticado como Usuario Prueba (HERGOPAS_sat)\n');

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const test of TEST_CASES) {
    process.stdout.write(`[${test.id}] Clasificando... `);
    try {
      const { classification } = await submitIntake(accessToken, test.description);
      const block    = classification.display?.estimated_area ?? '?';
      const need     = classification.display?.need ?? '?';
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
    failures.forEach(f => console.log(`    • ${f}`));
  }
  console.log('═'.repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
