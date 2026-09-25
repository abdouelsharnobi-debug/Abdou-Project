/* Version identifiers printed on every report for traceability. */
(function (root) {
  const V = {
    APP_VERSION: '2.0.0',
    ENGINE_VERSION: '1.0.0', // js/psychro.js, data.js, calc.js, vent.js — unchanged since baseline-v1
    INPUT_DATA_VERSION: 1,   // engine input dataset format (see migrate.js)
    SCHEMA_VERSION: 2,       // IndexedDB schema
    APP_NAME: 'ColdLoad Pro',
  };
  root.CL = root.CL || {};
  root.CL.version = V;
  if (typeof module === 'object' && module.exports) module.exports = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
