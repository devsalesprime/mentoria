const { Router } = require('express');

module.exports = function createInsightsRoutes({ db, dbGet, dbRun, dbAll, authMiddleware, safeJsonParse }) {
  const router = Router();

  // GET /api/insights — Return personalized insights for authenticated user
  // Returns: priorities, recommendation data, feedback status, and personalized feedback
  router.get('/api/insights', authMiddleware, async (req, res) => {
    try {
      const { userId } = req.user;

      // Load priorities from diagnostic_data
      const diagnostic = await dbGet(
        'SELECT priorities FROM diagnostic_data WHERE user_id = ?',
        [userId]
      );

      const priorities = diagnostic?.priorities
        ? safeJsonParse(diagnostic.priorities, null)
        : null;

      // Load feedback data from pipeline
      const pipeline = await dbGet(
        `SELECT personalized_feedback, feedback_status, feedback_delivered_at, show_assets_to_user, educational_suggestions
         FROM pipeline WHERE user_id = ?`,
        [userId]
      );

      const data = {
        priorities,
        feedbackStatus: pipeline?.feedback_status || 'pending',
        personalizedFeedback: pipeline?.personalized_feedback || null,
        feedbackDeliveredAt: pipeline?.feedback_delivered_at || null,
        showAssetsToUser: pipeline?.show_assets_to_user === 1,
        hasEducationalSuggestions: !!(pipeline?.educational_suggestions),
      };

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error in GET /api/insights:', error);
      res.status(500).json({ success: false, message: 'Erro interno.' });
    }
  });

  return router;
};
