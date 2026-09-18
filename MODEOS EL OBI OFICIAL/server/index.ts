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

// 2. Rutas principales
app.use('/api', apiRouter);
app.use('/auth', authRouter);

// Ruta de estado
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Servidor y Dashboard de Discord Bot activos correctamente',
  });
});

const PORT = Number(process.env.PORT || config.port) || 8081;

// 3. LEVANTAR EXPRESS DE INMEDIATO (Vital para Render)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Express escuchando en el puerto ${PORT}`);
  
  // 4. Iniciar el bot de Discord en segundo plano UNA VEZ QUE EL PUERTO ESTÁ ABIERTO
  console.log('🤖 Iniciando el cliente de Discord en segundo plano...');
  startBot().catch(err => {
    console.error('❌ Error al iniciar el bot de Discord:', err);
  });
});
