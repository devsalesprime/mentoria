const { Router } = require('express');

module.exports = function createHealthRoutes() {
  const router = Router();

  router.get('/health', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, service: 'Prosperus Mentor Diagnosis', status: 'online' });
  });

  // UX-17: Debug/test routes only available in development
  if (process.env.NODE_ENV !== 'production') {
    router.get('/api/test', (req, res) => {
      res.json({ success: true, message: 'API está funcionando', timestamp: new Date().toISOString() });
    });

    router.post('/api/test', (req, res) => {
      res.json({ success: true, message: 'API POST está funcionando', body: req.body, timestamp: new Date().toISOString() });
    });
  }

  return router;
};
