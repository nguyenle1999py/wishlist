import { openDb, migrate, DB_PATH } from "./db.js";

const db = openDb();
migrate(db);
console.log(`Migrated OK → ${DB_PATH}`);
db.close();
