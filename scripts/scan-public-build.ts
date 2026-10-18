/**
 * Fails the build if the public/static output contains private material: PDFs, private storage keys,
 * DB/secret identifiers or premium map links. Run automatically by `npm run build`.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist/client');
if (!fs.existsSync(root)) {
  console.error('dist/client not found — run astro build first.');
  process.exit(1);
}

const FORBIDDEN_EXT = ['.pdf', '.gpx', '.kml', '.kmz'];
const FORBIDDEN_TEXT = [
  /storage\/private/i,
  /private_object_key|privateObjectKey/,
  /guides\/[a-z0-9-]+\/v\d+/i, // private object key pattern
  /APP_SECRET|DATABASE_URL|S3_SECRET_ACCESS_KEY|SMTP_URL/,
  /external_url|externalUrl/,
  /postgres(ql)?:\/\//i,
  /premium_places|TEST premium point/, // premium map locations must never be public
];

const problems: string[] = [];
function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full);
      if (FORBIDDEN_EXT.includes(path.extname(entry.name).toLowerCase())) problems.push(`forbidden file type: ${rel}`);
      if (/\.(html|js|json|xml|txt|css|map)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const re of FORBIDDEN_TEXT) if (re.test(text)) problems.push(`${rel}: matches ${re}`);
      }
    }
  }
}
walk(root);

if (problems.length) {
  console.error('Public build scan FAILED:\n' + problems.map((p) => ` - ${p}`).join('\n'));
  process.exit(1);
}
console.info(`Public build scan passed (${root}).`);
