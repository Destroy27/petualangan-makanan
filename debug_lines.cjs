const fs=require('fs');
const raw=fs.readFileSync('game-pencernaan.html','utf8');
const html=raw.replace(/const API_URL='[^']*';/, "const API_URL='https://api.test';");
const lines=html.split(/\r?\n/);
for(let i=78;i<=86;i++) console.log(i+1, lines[i]);
