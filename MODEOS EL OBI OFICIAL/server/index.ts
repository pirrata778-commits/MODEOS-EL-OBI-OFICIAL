import express from 'express';
import cors from 'cors';
import { config } from './config';
import { startBot } from './bot';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';

const app = express();

// 1. Middlewares globales
app.use(cors());
app.use(express.json());

// 2. Montaje de Rutas de la API y Autenticación
app.use('/api', apiRouter);
app.use('/auth', authRouter);

// Ruta base de prueba para comprobar el estado del servidor web
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Servidor y Dashboard de Discord Bot activos correctamente',
  });
});

// 3. Método de Arranque del Servidor Central (Express + Bot)
async function main() {
  try {
    // Iniciar el servidor Express en el puerto configurado
    const PORT = config.port || 3000;
    app.listen(PORT, () => {
      console.log(`🌐 Servidor Express escuchando en el puerto ${PORT}`);
    });

    // Iniciar el bot de Discord en el mismo proceso
    console.log('🤖 Iniciando el cliente de Discord...');
    await startBot();

  } catch (error) {
    console.error('❌ Error crítico al iniciar la aplicación:', error);
    process.exit(1);
  }
}

// Ejecutar la aplicación completa
main();