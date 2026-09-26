import { defineConfig } from 'drizzle-kit';
export default defineConfig({schema:'./db/content-schema.ts',out:'./drizzle/content-meta',dialect:'sqlite'});
