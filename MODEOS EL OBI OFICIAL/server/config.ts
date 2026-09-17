import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Configuración de Discord (Bot y Servidor)
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },

  // Configuración del Servidor Express y Hosting
  server: {
    port: parseInt(process.env.PORT || '8081', 10),
    env: process.env.NODE_ENV || 'development',
    basePath: process.env.BASE_PATH || '/',
  },

  // Configuración de la Base de Datos PostgreSQL
  db: {
    url: process.env.DATABASE_URL || '',
  },

  // Seguridad y Sesiones del Dashboard
  session: {
    secret: process.env.SESSION_SECRET || 'super-secret-session-key',
  }
};