const { Router } = require('express');

module.exports = function createAudioRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, multer, DATA_DIR }) {
  const router = Router();

  // Multer configuration for audio uploads
  const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(DATA_DIR, 'audio', req.user.userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `${req.body.questionId || 'unknown'}_${Date.now()}.webm`);
    }
  });
  const uploadAudio = multer({ storage: audioStorage, limits: { fileSize: 50 * 1024 * 1024 } });

  // Helper: transcribe an audio file using Gemini and save to DB (fire-and-forget safe)
  async function transcribeAudioFile(audioId, filePath) {
    try {
      if (!process.env.GEMINI_APIKEY) {
        console.warn(`⚠️ [Transcription] GEMINI_APIKEY not set, skipping audio ${audioId}`);
        return;
      }
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ [Transcription] File not found for audio ${audioId}: ${filePath}`);
        return;
      }

      const audioBuffer = fs.readFileSync(filePath);
      const audioBase64 = audioBuffer.toString('base64');
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === '.wav' ? 'audio/wav' : 'audio/webm';

      const { GoogleGenAI } = require('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_APIKEY });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: 'Transcreva este áudio com precisão. Retorne apenas o texto transcrito, sem comentários adicionais.' }
          ]
        }]
      });

      const transcript = response.text || '';

      await dbRun(
        'UPDATE audio_recordings SET transcript = ? WHERE id = ?',
        [transcript, audioId]
      );

      console.log(`✅ [Transcription] Audio ${audioId} transcribed (${transcript.length} chars)`);
    } catch (error) {
      console.error(`❌ [Transcription] Failed for audio ${audioId}:`, error.message);
    }
  }

  // POST /api/audio/upload — Upload audio recording
  router.post('/api/audio/upload', authMiddleware, uploadAudio.single('audio'), async (req, res) => {
    try {
      const { userId } = req.user;
      const { module, questionId, durationSeconds } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo de áudio enviado.' });
      }

      if (!module || !questionId) {
        return res.status(400).json({ success: false, message: 'module e questionId são obrigatórios.' });
      }

      const audioId = uuidv4();

      await dbRun(
        `INSERT INTO audio_recordings (id, user_id, module, question_id, file_path, duration_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [audioId, userId, module, questionId, req.file.path, durationSeconds || null]
      );

      // Fire-and-forget transcription — does not block the response
      transcribeAudioFile(audioId, req.file.path).catch(() => {});

      res.json({
        success: true,
        data: {
          id: audioId,
          userId,
          module,
          questionId,
          filePath: req.file.path,
          durationSeconds: durationSeconds || null
        }
      });
    } catch (error) {
      console.error('Error in POST /api/audio/upload:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/audio/:id — Stream audio file back
  router.get('/api/audio/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const row = await dbGet(
        `SELECT * FROM audio_recordings WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Áudio não encontrado.' });
      }

      if (!fs.existsSync(row.file_path)) {
        return res.status(404).json({ success: false, message: 'Arquivo de áudio não encontrado no disco.' });
      }

      res.setHeader('Content-Type', 'audio/webm');
      const stream = fs.createReadStream(row.file_path);
      stream.pipe(res);
    } catch (error) {
      console.error('Error in GET /api/audio/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/audio/list — List saved audio recordings for a question
  router.get('/api/audio/list', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { module, questionId } = req.query;

      if (!module || !questionId) {
        return res.status(400).json({ success: false, message: 'module and questionId are required.' });
      }

      const rows = await dbAll(
        `SELECT id, duration_seconds, transcript, created_at FROM audio_recordings WHERE user_id = ? AND module = ? AND question_id = ? ORDER BY created_at ASC`,
        [userId, module, questionId]
      );

      res.json({
        success: true,
        data: (rows || []).map(r => ({
          serverId: r.id,
          duration: r.duration_seconds || 0,
          transcript: r.transcript || null,
          createdAt: r.created_at,
        })),
      });
    } catch (error) {
      console.error('Error in GET /api/audio/list:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/audio/:id — Delete audio recording from DB and disk
  router.delete('/api/audio/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const row = await dbGet(
        `SELECT * FROM audio_recordings WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Áudio não encontrado.' });
      }

      // Delete file from disk
      if (row.file_path && fs.existsSync(row.file_path)) {
        try {
          fs.unlinkSync(row.file_path);
        } catch (unlinkErr) {
          console.error('Error deleting audio file from disk:', unlinkErr);
        }
      }

      // Delete record from DB
      await dbRun(
        `DELETE FROM audio_recordings WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      res.json({ success: true, message: 'Áudio deletado com sucesso.' });
    } catch (error) {
      console.error('Error in DELETE /api/audio/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // POST /api/audio/:id/transcribe — Manually transcribe audio using Google Gemini
  router.post('/api/audio/:id/transcribe', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const row = await dbGet(
        'SELECT * FROM audio_recordings WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Áudio não encontrado.' });
      }

      await transcribeAudioFile(id, row.file_path);

      const updated = await dbGet('SELECT transcript FROM audio_recordings WHERE id = ?', [id]);

      res.json({ success: true, transcript: updated?.transcript || '' });
    } catch (error) {
      console.error('Error in POST /api/audio/:id/transcribe:', error);
      res.status(500).json({ success: false, message: 'Erro ao transcrever áudio.' });
    }
  });

  return router;
};
