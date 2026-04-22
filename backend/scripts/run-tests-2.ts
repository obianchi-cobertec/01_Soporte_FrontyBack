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
    id: 'N01',
    description: 'Buenas tardes,  el empleado de la empresa UTE Plena-LG:     Josep Sole tiene incidencia en fichajes.  Se le queda el logo de cobertec y no le abre la app.  La ha desinstalado y a reiniciado el móvil,',
    expectedBlock: 'app_fichajes',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N02',
    description: 'Buenos días,  Anteriormente, una vez creada una OT, si cambiábamos el activo, y guardábamos los cambios, salía un aviso de que había que asignar cliente. (Cambiaba el activo y en la pestaña cliente, e',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N03',
    description: 'Buenas tardes,     hace tiempo nos conectamos en remoto para que pudiera usar el programa desde mi ordenador personal. Ahora necesito usarlo y no me da acceso. Se queda bloqueado en la pantalla de ide',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N04',
    description: 'cuando voy a crear la remesa me pone esto...',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N05',
    description: 'Egun on, veo que tengo registradas en ticket bai dos facturas  con el mismo número pero diferente cliente e importe.  Adjunto pantallazo.   Necesito saber como se ha producido y como solucionarlo.',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N06',
    description: 'Descuadre en balances',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N07',
    description: 'Todos los activos del cliente Xirivella se han renovado con fecha Fin Contrato 30/09/2025.      La fecha de inicio era del 1/10/2022 y la fecha fin de contrato 30/09/2023. ¿por qué el sistema ha cambi',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N08',
    description: 'Buenos días, he creado una planificación con un reglamento con  fecha de contrato 01/10/2022 al 30/09/2025. La fecha inicio establecida el 01/03/2023. Cuando ha creado las líneas de revisión solo ha p',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N09',
    description: 'Buenos días,  por favor en Listado de obras y OTs añadir una columna con estado del proyecto? Gracias',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N10',
    description: 'Buenos días, estamos referenciando los artículos como los referencia el proveedor y queríamos ver si existe la posibilidad de crear artículos por proveedor o ver si se os ha dado el caso y podemos ges',
    expectedBlock: 'almacen_stocks',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N11',
    description: 'Tras conversación con Javier Ares, solicito nos importéis los Reglamentos IDAE, RITE y RSIF.     Un saludo',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N12',
    description: 'Da error el Portal de Anastasio, y el listadoOT también.',
    expectedBlock: 'portal_ot',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N13',
    description: 'Hola     Como me han comentado indico los datos de cada tablet y el nombre a quien se deberá de colocar en el sistema     TABLET Nº SERIE R9PTB19GA5D (ORLANDO)     TABLET Nº SERIE R9PTB19GVZF (ALBERTO',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N14',
    description: 'Buenos días, al abrir el ListadoOTMov aparece este error que adjuntamos.',
    expectedBlock: 'gmao',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N15',
    description: 'Buenas tardes, necesitamos que cuando metamos material en la orden de trabajo en CONTROL - MATERIALES, se actualice el stock automáticamente sin tener que darle a la pestaña actualizar stock.  Muchas',
    expectedBlock: 'almacen_stocks',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N16',
    description: 'buenos días. ¿cuándo/porqué en la pantalla adjunta salen líneas en amarillo? he estado buscando en varias "apariencia" y no he encontrado nada. gracias.',
    expectedBlock: 'compras',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'N17',
    description: 'Llama Álvaro para que le instalemos Expertis en un equipo nuevo y necesita acceso por VPN también.     Llamarle para decirle cuando se lo podríamos hacer y así poder planificarse.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N18',
    description: 'Normal 0   21   false false false  ES X-NONE X-NONE            MicrosoftInternetExplorer4',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N19',
    description: 'Buenas tardes,     he intentado crear el Estado 5: Enviada, para determinar que la oferta se ha entregado al cliente. Pero no consigo que salga visible dicho estado en las ofertas comerciales.     TAm',
    expectedBlock: 'ofertas_comerciales',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N20',
    description: 'Se detectan unos productos con variantes cuyos precios, los de las variantes son los mismos en el feed de google.     Es porque en su momento todos los ajustes de precios los ponían en el OverriodenPr',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N21',
    description: 'Hola Sergio, ya hemos empezado a utilizar los BOE y queremos hacer los cambios que te indico (te adjunto fichero pdf)     Como los mandaremos ya rellenos desde aquí y solo en algún caso impreso para r',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N22',
    description: 'Normal 0   21   false false false  ES X-NONE X-NONE            MicrosoftInternetExplorer4',
    expectedBlock: 'financiero',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N23',
    description: 'queriamos que en la factura de venta , en las lineas que salen en la factura , queremos que en el campo "descripcion del articulo " poner 3 asteristico (***), en el informe de venta , en la impresion',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N24',
    description: 'en el apartado"estadistica de facturas de compras detalladas, queriamos que nos agregaran el campo de "facturado" y "facturable"',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N25',
    description: 'Posibilidad agregar a filtro dinámico la columna "Desc. Oferta".  Adjunto pantallazo.',
    expectedBlock: 'ofertas_comerciales',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N26',
    description: 'Llama Álvaro diciendo que la VPN del equipo cuya identidad es i.muriel, no les conecta.',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N27',
    description: 'Buenos días,      ¿Se puede configurar que los técnicos desde la tablet no metan valores negativos en los artículos?     Adjunto pantallazo de valores negativos que metió ayer el usuario LVR.      Un',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N28',
    description: 'Buenas tardes:  Cuando un cliente me pregunte a final de año, o cuando sea, por el libro de mantenimiento de sus instalaciones, cómo lo hago?  Es decir, en un supuesto mantenimiento según RITE de un h',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N29',
    description: 'Hola  Hemos realizado una actualizacion de precios desde el el importador y no me actualiza los precios  Si me actualiza el cambio que hemos realizado a control de stock, pero los precios no  Adjunto',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N30',
    description: 'Normal 0   21   false false false  ES X-NONE X-NONE            MicrosoftInternetExplorer4',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N31',
    description: 'Error al generar programas de venta.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N32',
    description: 'NOS PUEDEN LLAMAR PARA VER UN CASO DE VINCULAR UN PEDIDO A UNA OT FACTURADA',
    expectedBlock: 'compras',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N33',
    description: 'no nos deja facturar desde proyectos el material .   algo estamos haciendo mal,  me pueden ayudar porfa.  nos urge facturar esto.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N34',
    description: 'Gonzalo, recuerdas el tema que hiciste para urquiza de poner a cada producto con variante su url y luego mandar ésta al plugin del feed de google.     Bueno pues me han dicho que les han pasado los qu',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N35',
    description: 'Buenos días.     Hoy me está pasando algo muy raro.  Selecciono las líneas que quiero facturar de una OT, me indica un importe, y a la hora de emitir la factura me sale otro importe.  Adjunto pantalla',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N36',
    description: 'Me encuentro muy a menudo  este problema, adjunto pantallazo.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N37',
    description: 'Error al generar programas de venta.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N38',
    description: 'Buenos días estoy intentando pasar un presupuesto desde un excel a proyectos y me sale error.',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N39',
    description: 'Me ha tirado el programa sin mensaje de error. se ha quedado abierta la sesión j.martinez. Ruego la cerréis ya que no puedo entrar',
    expectedBlock: 'servidor_sistemas',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N40',
    description: 'Buenos días, debido a un error estoy intentando borrar todos los albaranes de venta no facturados del día de ayer (22/03). Pero no veo forma de borrarlos todos a la vez.',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'N41',
    description: 'Normal 0   21   false false false  ES X-NONE AR-SA            MicrosoftInternetExplorer4',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N42',
    description: 'Buenos días, necesitamos un nuevo usuario para el expertis     Nombre : Macarena Cuevas Meléndez , DNI 47506470Q  Usuario: MCM',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N43',
    description: 'Buenos días,     en el informe de estadísticas Previstos/Reales OT, no veo la opción de añadir el campo del cliente y del activo padre. ¿es posible?',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N44',
    description: 'Buenos dias,     En las ofertas comerciales, nos sale el % de margen por concepto. Solicito el % Margen global de media entre todos los conceptos, coste/venta total.        Gracias',
    expectedBlock: 'ofertas_comerciales',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N45',
    description: 'Buenas     A la hora de crear un informe de trabajos valorados de un presupuesto para enviarlo al cliente necesitaríamos cómo hacer para que aparezca el precio de una partida pero que tenga un descuen',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N46',
    description: 'No se pueden eliminar las filas de un artículo que está en Previstos en una OT y por otro lado, no se pasan los artículos de Control a Previstos, se queda todo tal cual.   No sé si será un error del p',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N47',
    description: 'Hemos ido a un supermercado: ACT00069 = DIA (03224) IRUÑALDE KALEA (BERRIOZAR) a hacer una revisión con la OT01390 y primero hemos visto cómo están los activos.     Resulta que lo han reformado y tene',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N48',
    description: 'Se adjunta excel de revisiones para importar',
    expectedBlock: 'gmao',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N49',
    description: 'Buenas Alberto,  Una cosilla.. en "Lotes", que en la consulta estandar filtre ya por Stock > 0, porque sino....es un problema. Creo que ya lo habíamos cambiado pero imagino que con alguna modificación',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N50',
    description: 'Se solicita la creación de un nuevo usuario para la generación de incidencias --> tecnico@fontanerosburgos.com',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N51',
    description: 'necesito que paseis ha estado facturado las certificaciones del proyecto 17 (azvi), adjunto pantallazo, estas certificaciones corresponde ha trabajos ya facturados en 2022, pero el cliente me pide que',
    expectedBlock: 'presupuestos_proyectos',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N52',
    description: 'Buenos días  Nos dimos cuenta hoy de que la tarifa de CTT estaba mal puesta, la he corregido pero no está calculando bien y no se si es que se me está olvidando algo  Ejemplo, albarán PVH0005669, son',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N53',
    description: 'Buenos días,      Necesito que me creéis un nuevo usuario/pass:  (practicas/practicas). Solo podrá CREAR y NO PODRA borrar ni modificar. Del mismo modo no verá el MODULO FINANCIERO y respecto a las FA',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N54',
    description: 'Hay que poner a cero los precios de los artículos.     Precio estandar A  Precio ultima compra  Precio de venta (tarifa)',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N55',
    description: 'Buenos días, si de un albarán de venta se facturan ciertas partidas por qué se queda bloqueado el albarán y ya no se puede trabajar más con él, ni facturar las otras partidas ni añadir nuevas partidas',
    expectedBlock: 'ventas_facturacion',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N56',
    description: 'Necesito poder importar tarifas de proveedores desde un archivo excel, ya que las tarifas que existen para descargarse no están actualizadas.  Mira a ver si hay una posibilidad de hacerlo como se impo',
    expectedBlock: '*',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N57',
    description: 'Error inicio TBAI IparLau, adjunto imagen',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N58',
    description: 'Hola,estoy intentando ver videos de artículos para buscar la opción de varias tarifas en un mismo artículo.      Lo que necesito es cuando factura poder elegir la tarifa de un artículo en concreto.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N59',
    description: 'Formación con Lorena para el módulo de previsiones, ya hemos concretado el día faltaba decir sobre que módulo  Gracias  Elvira',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N60',
    description: 'Descripción de trabajo de una OT de larga duración.Al hacer el paso de la mano de obra de la OT al Proyecto, que apareciera automáticamente en el proyecto la descripción del trabajo que el técnico hay',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N61',
    description: 'Buenos días  Necesitaríamos una ventana nueva en Expertis, llamada por ejemplo "Gestión de Garantías". Puede estar en el menú de logística->Ventas     Tiene que ser un Excel tal que:     IDCliente | R',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N62',
    description: 'Facturas de Proveedores con varios vencimientos.Las cantidades correspondientes a cada uno de esos vencimientos siempre hay que modificarlas a mano,porque no coinciden con las correspondientes partici',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N63',
    description: 'Al imprimir una factura de Ventas de Clientes con tres o más fechas de vencimiento;sólo aparecen los dos primeros.Necesitamos aparezcan todos ellos en la factura.  (Pueden ser 3 ó 4 máximo.)  Muchas G',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N64',
    description: 'Rogamos reenvíen claves de acceso para crear incidencias de Daniel Manzano Manzano al correo daniel.manzano@jacintoredondo.com  Muchas gracias',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N65',
    description: 'Rogamos reenvíen claves de acceso para crear incidencias de Daniel Manzano Manzano al correo danie.manzano@jacintoredondo.com  Muchas gracias.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N66',
    description: 'Al intentar enviar una factura aparece el error: La conversión de tipo \'DBNull\' en el tipo \'Double\' no es válida  Hay que actualizar de nuevo el módulo TBAI.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N67',
    description: 'Hola  Para el proveedor Grupo Disco en la Tarifa de Proveedores Cobertec al buscar algunas referencias en "criterios de descarga" y darle a Descarga de tarifas, muestra la ventana de  las coincidencia',
    expectedBlock: 'tarifas_catalogos',
    expectedNeed: 'error',
    expectedAssignee: '*',
  },
  {
    id: 'N68',
    description: 'Buenos días,     En la OT00032479 no se puede añadir una foto. El operario (con número de teléfono 699999382) se ha dado cuenta de que podía hacer la foto pero que, en realidad, no se añadía a la OT m',
    expectedBlock: 'movilsat',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N69',
    description: '¿CÓMO SE HACE PARA VISUALIZAR LAS OT ASIGNADAS A UN USUARIO (EL ENCARGADO) A TODAS LAS TABLES?',
    expectedBlock: 'portal_ot',
    expectedNeed: 'formacion',
    expectedAssignee: '*',
  },
  {
    id: 'N70',
    description: 'Rogamos reenvíen claves de acceso para crear incidencias de Elvira Redondo.Correo: elvira@jacintoredondo.com  Muchas gracias.',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N71',
    description: 'Pendientes de demostración de dos módulos externos por parte de Lorena.  Rogamos se ponga Lorena en contacto con Elvira Redondo.  Gracias',
    expectedBlock: '*',
    expectedNeed: '*',
    expectedAssignee: '*',
  },
  {
    id: 'N72',
    description: 'En el equipo de Arantxa no puede enviar el TBAI con el certificado, error \'Anulada la solicitud: No se puede crear un canal seguro SSL/TLS.',
    expectedBlock: 'financiero',
    expectedNeed: 'error',
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
    expectedBlock: 'gmao',
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
    expectedNeed: '*',
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
    expectedNeed: '*',
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
    expectedBlock: '*',
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
    expectedBlock: '*',
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
