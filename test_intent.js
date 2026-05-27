const fs = require('fs');
const path = require('path');
const root = '/home/papajoe/projects/toe';
const redivivusDir = path.join(root, '.redivivus');
const configPath = path.join(redivivusDir, 'config.json');
console.log('isInit:', fs.existsSync(redivivusDir) && fs.existsSync(configPath));
