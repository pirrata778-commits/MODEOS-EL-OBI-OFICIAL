import { Router } from 'express';
import { db } from '../db';
import { userSessions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../config';

const router = Router();

// 1. Ruta de inicio de sesión (simulada/preparada para OAuth2 de Discord)
router.post('/login', async (req, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ success: false, message: 'Faltan credenciales requeridas (userId o token)' });
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas de validez

    // Guardar o actualizar la sesión preservando estrictamente la tabla user_sessions
    await db.insert(userSessions).values({
      id: sessionId,
      userId: userId,
      token: token,
      expiresAt: expiresAt,
    });

    res.json({
      success: true,
      message: 'Sesión iniciada correctamente',
      sessionId: sessionId,
    });
  } catch (error) {
    console.error('❌ Error al iniciar sesión:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 2. Ruta para verificar el estado de la sesión actual
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No autorizado - Token ausente' });
    }

    const token = authHeader.split(' ')[1];
    
    // Buscar la sesión en la base de datos
    const [session] = await db.select().from(userSessions).where(eq(userSessions.token, token));

    if (!session || new Date() > new Date(session.expiresAt)) {
      return res.status(401).json({ success: false, message: 'Sesión inválida o expirada' });
    }

    res.json({
      success: true,
      data: {
        userId: session.userId,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('❌ Error al verificar la sesión:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 3. Ruta para cerrar sesión (eliminar el registro de la sesión)
router.post('/logout', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    }
    res.json({ success: true, message: 'Sesión cerrada con éxito' });
  } catch (error) {
    console.error('❌ Error al cerrar sesión:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

export const authRouter = router;
