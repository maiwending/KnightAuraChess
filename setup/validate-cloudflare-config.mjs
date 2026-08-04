import { readFileSync } from 'node:fs';

const configPath = new URL('../wrangler.toml', import.meta.url);
const wranglerConfig = readFileSync(configPath, 'utf8');

const checks = [
  {
    label: 'Pages project name',
    test: /^name\s*=\s*"knightaurachess"\s*$/m,
    fix: 'Set name = "knightaurachess" in wrangler.toml.',
  },
  {
    label: 'Pages build output',
    test: /^pages_build_output_dir\s*=\s*"\.\/dist"\s*$/m,
    fix: 'Set pages_build_output_dir = "./dist" in wrangler.toml.',
  },
  {
    label: 'Workers AI section',
    test: /^\[ai\]\s*$/m,
    fix: 'Add an [ai] section to wrangler.toml.',
  },
  {
    label: 'Workers AI binding',
    test: /^binding\s*=\s*"knightaurachess"\s*$/m,
    fix: 'Set binding = "knightaurachess" under [ai] in wrangler.toml.',
  },
];

const failures = checks.filter(({ test }) => !test.test(wranglerConfig));

if (failures.length > 0) {
  console.error('Cloudflare config is incomplete:');
  failures.forEach(({ label, fix }) => {
    console.error(`- ${label}: ${fix}`);
  });
  process.exit(1);
}

console.log('Cloudflare config is ready for Pages + Workers AI.');
