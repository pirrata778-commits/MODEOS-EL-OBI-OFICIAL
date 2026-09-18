import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config';
import { startBot } from './bot';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1. Middlewares globales
app.use(cors());
app.use(express.json());

// 2. Rutas principales de la API y autenticación
app.use('/api', apiRouter);
app.use('/auth', authRouter);

// Ruta de estado opcional para verificar la API
app.get('/api-status', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Servidor y Dashboard de Discord Bot activos correctamente',
  });
});

// 3. Servir el Frontend de React (Vite)
const clientDistPath = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Cualquier otra ruta que no sea /api o /auth cargará la interfaz gráfica de la web
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = Number(process.env.PORT || config.port) || 8081;

// 4. LEVANTAR EXPRESS DE INMEDIATO (Vital para Render)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor Express escuchando en el puerto ${PORT}`);
  
  // 5. Iniciar el bot de Discord en segundo plano
  console.log('🤖 Iniciando el cliente de Discord en segundo plano...');
  startBot().catch(err => {
    console.error('❌ Error al iniciar el bot de Discord:', err);
  });
});
