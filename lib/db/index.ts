import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Driver HTTP : une requête (ou un lot transactionnel via db.batch) = un aller-retour.
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
export { schema };
