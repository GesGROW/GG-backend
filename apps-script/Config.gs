// LEGACY de compatibilidad en retirada progresiva. Portal Web es la interfaz
// administrativa actual. No desarrollar nuevas funcionalidades en Apps Script.
// Ver README.md y el cutover administrativo F7.7 antes de retirar un archivo.
var SCC_CONFIG = Object.freeze({
  hojaTrabajadores: 'TRABAJADORES',
  hojaCampanias: 'CAMPANIAS',
  hojaVariedades: 'VARIEDADES',
  hojaLotes: 'LOTES',
  hojaRolesCampania: 'ROLES_CAMPANIA',
  hojaResumen: 'RESUMEN',
  hojaRanking: 'RANKING',
  hojaProduccionDiaria: 'PRODUCCION_DIARIA',
  hojaProduccionLotes: 'PRODUCCION_LOTES',
  filaEncabezado: 1,
  columnas: Object.freeze({
    dni: 1,
    nombres: 2,
    apellidos: 3,
    activo: 4,
    estadoSync: 5,
    observacion: 6,
    idSistema: 7,
    ultimaSincronizacion: 8
  }),
  columnasCampanias: Object.freeze({
    codigo: 1,
    nombre: 2,
    fechaInicio: 3,
    fechaFin: 4,
    estado: 5,
    estadoSync: 6,
    observacion: 7,
    idSistema: 8,
    ultimaSincronizacion: 9
  }),
  columnasVariedades: Object.freeze({
    nombre: 1,
    activo: 2,
    estadoSync: 3,
    observacion: 4,
    idSistema: 5,
    ultimaSincronizacion: 6
  }),
  columnasLotes: Object.freeze({
    codigo: 1,
    nombre: 2,
    campania: 3,
    variedad: 4,
    activo: 5,
    estadoSync: 6,
    observacion: 7,
    idSistema: 8,
    ultimaSincronizacion: 9
  }),
  columnasRolesCampania: Object.freeze({
    dni: 1,
    trabajador: 2,
    campania: 3,
    rol: 4,
    activo: 5,
    estadoSync: 6,
    observacion: 7,
    idSistema: 8,
    ultimaSincronizacion: 9
  }),
  estados: Object.freeze({
    pendiente: 'PENDIENTE',
    sincronizado: 'SINCRONIZADO',
    error: 'ERROR'
  }),
  propiedades: Object.freeze({
    supabaseUrl: 'SUPABASE_URL',
    publishableKey: 'SUPABASE_PUBLISHABLE_KEY',
    integrationEmail: 'SUPABASE_INTEGRATION_EMAIL',
    integrationPassword: 'SUPABASE_INTEGRATION_PASSWORD',
    campaniaId: 'SCC_CAMPANIA_ID',
    spreadsheetId: 'SCC_SPREADSHEET_ID'
  })
});

var SCC_ENCABEZADOS_TRABAJADORES = [
  'DNI',
  'Nombres',
  'Apellidos',
  'Activo',
  'Estado Sync',
  'Observación',
  'ID Sistema',
  'Última sincronización'
];

var SCC_ENCABEZADOS_CAMPANIAS = [
  'Código',
  'Nombre',
  'Fecha inicio',
  'Fecha fin',
  'Estado',
  'Estado Sync',
  'Observación',
  'ID Sistema',
  'Última sincronización'
];

var SCC_ENCABEZADOS_VARIEDADES = [
  'Nombre',
  'Activo',
  'Estado Sync',
  'Observación',
  'ID Sistema',
  'Última sincronización'
];

var SCC_ENCABEZADOS_LOTES = [
  'Código',
  'Nombre',
  'Campaña',
  'Variedades (separadas por ;)',
  'Activo',
  'Estado Sync',
  'Observación',
  'ID Sistema',
  'Última sincronización'
];

var SCC_ENCABEZADOS_ROLES_CAMPANIA = [
  'DNI',
  'Trabajador',
  'Campa\u00f1a',
  'Rol',
  'Activo',
  'Estado Sync',
  'Observaci\u00f3n',
  'ID Sistema',
  '\u00daltima sincronizaci\u00f3n'
];
