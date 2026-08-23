// Misma copia local que usa la página: funciona offline y evita bloqueos de CDN.
importScripts('./vendor/xlsx.full.min.js');

onmessage = function(e){
  try{
    const data = new Uint8Array(e.data);
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    postMessage({ json });
  }catch(err){
    postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
