const fs=require('fs');
const s=fs.readFileSync('worker.js','utf8');
const i=s.indexOf("const gt=document.getElementById('genToken')");
console.log(s.slice(i, i+1800));
