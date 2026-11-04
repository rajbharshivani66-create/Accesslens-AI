const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'devtools', 'visual-agent-overlay');
const marker = path.join(target, 'src', 'overlay.tsx');

if (!fs.existsSync(marker)) {
  console.log('No visual overlay files detected. Nothing to remove.');
  process.exit(0);
}

const result = {
  filesToRemove: [
    'devtools/visual-agent-overlay/README.md',
    'devtools/visual-agent-overlay/package.json',
    'devtools/visual-agent-overlay/src/overlay.tsx',
    'devtools/visual-agent-overlay/src'
  ],
  configChanges: [
    'Disable VISUAL_AGENT_ENABLED in .env.example',
    'Remove overlay import from apps/web/src/app/layout.tsx'
  ]
};

console.log('AccessLens Visual Agent removal plan');
console.log(JSON.stringify(result, null, 2));
console.log('\nThis script is a safe preview only. It does not delete files unless the project is updated to do so explicitly.');
