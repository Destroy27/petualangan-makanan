const fs=require('fs');
const s=fs.readFileSync('game-pencernaan.html','utf8');
const i=s.indexOf("$('lg').onclick");
console.log(s.slice(i,i+470));
