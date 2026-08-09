const fs = require('fs');
const c = fs.readFileSync('src/App.tsx', 'utf8');
const lines = c.split('\n');
let acc = 0;
const info = [];
for (let i = 0; i < lines.length; i++) {
  const lineLen = lines[i].length + 1; // +1 for newline char split removed
  if (acc <= 30694 && 30694 < acc + lineLen) {
    info.push('TARGET IS ON LINE ' + (i+1));
    info.push('  line starts at char ' + acc);
    info.push('  line length ' + lineLen);
    info.push('  context: ' + JSON.stringify(lines[i]));
    info.push('  chars 30680-30720: ' + JSON.stringify(c.slice(30680, 30720)));
  }
  if (i >= 355 && i <= 430) {
    info.push('Line ' + (i+1) + ' (char ' + acc + '): ' + lines[i].slice(0, 120));
  }
  acc += lineLen;
}
fs.writeFileSync('_loc.txt', info.join('\n'));
console.log('total:', c.length, 'lines:', lines.length);
