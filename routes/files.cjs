const { Router } = require('express');

module.exports = function createFilesRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, uuidv4, fs, path, multer, DATA_DIR }) {
  const router = Router();

  // Multer configuration for file uploads
  const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(DATA_DIR, 'uploads', req.user.userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // multer entrega o nome como latin1: "reunião.pdf" chegava como "reuniÃ£o.pdf"
      // (acentos dos mentores). Decodifica uma vez, so quando parece mal decodificado.
      if (/[ÃÂ][-¿]/.test(file.originalname)) {
        try { file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch { /* mantem */ }
      }
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  });
  const uploadFiles = multer({ storage: fileStorage, limits: { fileSize: 50 * 1024 * 1024 } });

  // Script 7 Passos (Materiais): categorias e tipos aceitos. Audio/video vao pelo WhatsApp do Caio.
  const SCRIPT_CATEGORIES = new Set([
    'script_transcricao_venda',
    'script_crm',
    'script_apostila_slides',
    'script_proposta_roteiro',
    'script_outros',
  ]);
  const SCRIPT_ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.txt', '.md', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif', '.svg']);
  const SCRIPT_ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-',
    'application/vnd.ms-', 'text/plain', 'text/csv', 'text/markdown', 'application/json'];

  function scriptUploadError(file) {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      return 'Áudio e vídeo não sobem por aqui: mande pelo WhatsApp ao Caio.';
    }
    const mimeOk = mime && SCRIPT_ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
    const extOk = SCRIPT_ALLOWED_EXT.has(ext);
    if (!mimeOk && !extOk) {
      return 'Tipo não aceito. Envie PDF, Word, PowerPoint, Excel, CSV, TXT, Markdown, JSON ou imagem.';
    }
    return null;
  }

  // POST /api/files/upload — Upload file(s)
  router.post('/api/files/upload', authMiddleware, uploadFiles.single('file'), async (req, res) => {
    try {
      const { userId } = req.user;
      const { category, module: fileModule } = req.body;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
      }

      let resolvedModule = fileModule || 'general';
      if (category && String(category).startsWith('script_')) {
        if (!SCRIPT_CATEGORIES.has(category)) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
          return res.status(400).json({ success: false, message: 'Categoria de material inválida.' });
        }
        const err = scriptUploadError(req.file);
        if (err) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
          return res.status(400).json({ success: false, message: err });
        }
        resolvedModule = 'script';
      }

      const fileId = uuidv4();
      const fileMeta = {
        id: fileId,
        userId,
        category: category || 'general',
        module: resolvedModule,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      };

      await dbRun(
        `INSERT INTO uploaded_files (id, user_id, category, module, file_name, file_path, file_type, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileId, userId, fileMeta.category, fileMeta.module, fileMeta.fileName, fileMeta.filePath, fileMeta.fileType, fileMeta.fileSize]
      );

      res.json({ success: true, data: fileMeta });
    } catch (error) {
      console.error('Error in POST /api/files/upload:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // GET /api/files/:id — Get file metadata
  router.get('/api/files/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const row = await dbGet(
        `SELECT * FROM uploaded_files WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      }

      res.json({
        success: true,
        data: {
          id: row.id,
          userId: row.user_id,
          category: row.category,
          fileName: row.file_name,
          filePath: row.file_path,
          fileType: row.file_type,
          fileSize: row.file_size,
          url: row.url,
          createdAt: row.created_at
        }
      });
    } catch (error) {
      console.error('Error in GET /api/files/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  // DELETE /api/files/:id — Delete file from storage and DB
  router.delete('/api/files/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.user;

      const row = await dbGet(
        `SELECT * FROM uploaded_files WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!row) {
        return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
      }

      // Delete from disk
      if (row.file_path && fs.existsSync(row.file_path)) {
        fs.unlinkSync(row.file_path);
      }

      // Delete from DB
      await dbRun('DELETE FROM uploaded_files WHERE id = ?', [id]);

      res.json({ success: true, message: 'Arquivo deletado.' });
    } catch (error) {
      console.error('Error in DELETE /api/files/:id:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
