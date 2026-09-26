# Content schema generation

The initial content schema was generated with drizzle-kit from db/content-schema.ts. Its SQL is published as ../0020_content_hub.sql. This isolated snapshot avoids recreating existing tables whose historical migrations 0003–0019 predate snapshot maintenance. Future content changes: generate with drizzle.content.config.ts, inspect SQL, move the new SQL to the next unused root drizzle migration number, and retain generated metadata here. Do not rewrite applied migrations.
