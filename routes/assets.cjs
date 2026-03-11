const { Router } = require('express');

module.exports = function createAssetsRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, safeJsonParse }) {
  const router = Router();

  // GET /api/assets — Get my assets (available when status is 'ready' or 'delivered')
  router.get('/api/assets', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      console.log(`📦 Buscando assets do mentor: ${userId}`);

      const row = await dbGet('SELECT assets, assets_status FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || row.assets_status === 'pending' || !row.assets_status) {
        return res.json({ success: true, data: null });
      }

      res.json({
        success: true,
        data: {
          assets: row.assets ? safeJsonParse(row.assets, null) : null,
          assetsStatus: row.assets_status
        }
      });
    } catch (error) {
      console.error('❌ Erro em GET /api/assets:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar assets.' });
    }
  });

  // GET /api/assets/:assetId — Get specific asset content
  router.get('/api/assets/:assetId', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;
      const { assetId } = req.params;
      console.log(`📦 Buscando asset ${assetId} do mentor: ${userId}`);

      const READY_TO_SELL = ['outreachScript', 'followUpSequences', 'salesScript'];
      const BONUS = ['landingPageCopy', 'vslScript'];
      const ALL_VALID = [...READY_TO_SELL, ...BONUS];

      if (!ALL_VALID.includes(assetId)) {
        return res.status(400).json({ success: false, message: `Asset inválido: ${assetId}.` });
      }

      const row = await dbGet('SELECT assets, assets_status FROM pipeline WHERE user_id = ?', [userId]);

      if (!row || row.assets_status === 'pending' || !row.assets_status || !row.assets) {
        return res.status(404).json({ success: false, message: 'Asset não encontrado ou ainda não disponível.' });
      }

      const assets = safeJsonParse(row.assets);
      const pack = READY_TO_SELL.includes(assetId) ? assets.readyToSell : assets.bonus;
      const asset = pack ? pack[assetId] : null;

      if (!asset) {
        return res.status(404).json({ success: false, message: `Asset ${assetId} ainda não foi gerado.` });
      }

      res.json({ success: true, data: { assetId, asset } });
    } catch (error) {
      console.error('❌ Erro em GET /api/assets/:assetId:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar asset.' });
    }
  });

  return router;
};
