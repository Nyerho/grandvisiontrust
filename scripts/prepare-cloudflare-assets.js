const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'cloudflare-public');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.html')) {
    fs.copyFileSync(path.join(root, entry.name), path.join(output, entry.name));
  }
}

const allowedDirectories = ['assets', 'images'];
for (const name of allowedDirectories) {
  fs.cpSync(path.join(root, name), path.join(output, name), {
    recursive: true,
    filter(source) {
      const relative = path.relative(path.join(root, name), source).split(path.sep).join('/');
      if (name === 'assets') {
        return source === path.join(root, name) || ['alpine.min.js', 'countries.js', 'tailwindcss.js'].includes(relative);
      }
      return source === path.join(root, name)
        || relative === 'home'
        || ['logo.jpg', 'home/feature.jpg', 'home/metro.jpg'].includes(relative);
    }
  });
}

fs.copyFileSync(path.join(root, 'placeholder.svg'), path.join(output, 'placeholder.svg'));
console.log(`Prepared Cloudflare static assets in ${path.relative(root, output)}`);
console.log('Excluded database files, uploaded storage, server code, and repository metadata.');
