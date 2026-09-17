import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

if (!config.db.url) {
  throw new Error('❌ DATABASE_URL no está definida en las variables de entorno (.env)');
}

// Configuración del cliente de postgres
const queryClient = postgres(config.db.url);

// Inicialización de Drizzle ORM con los esquemas
export const db = drizzle(queryClient, { schema });