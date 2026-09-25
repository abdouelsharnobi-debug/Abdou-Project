/* Version identifiers printed on every report for traceability. */
(function (root) {
  const V = {
    APP_VERSION: '2.1.0',
    ENGINE_VERSION: '1.1.0', // js/psychro.js, data.js, calc.js, vent.js — Gate 3 items G3-1…G3-5 (see docs)
    INPUT_DATA_VERSION: '1.1', // engine input dataset: v1 format + optional Gate 3 fields
    SCHEMA_VERSION: 2,       // IndexedDB schema
    APP_NAME: 'ColdLoad Pro',
  };
  root.CL = root.CL || {};
  root.CL.version = V;
  if (typeof module === 'object' && module.exports) module.exports = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
