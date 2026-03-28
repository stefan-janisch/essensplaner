import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = db.prepare('SELECT default_servings FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({ defaultServings: user.default_servings });
});

router.put('/', (req, res) => {
  const { defaultServings } = req.body;
  if (defaultServings == null || defaultServings < 1) {
    return res.status(400).json({ error: 'Ungültige Portionsanzahl' });
  }

  db.prepare('UPDATE users SET default_servings = ? WHERE id = ?').run(defaultServings, req.userId);
  res.json({ defaultServings });
});

export default router;
