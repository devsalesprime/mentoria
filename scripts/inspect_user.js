const sqlite3 = require('sqlite3').verbose();
const userId = process.argv[2] || 'user-1767221474680-pk66qztk0';

const db = new sqlite3.Database('data/prosperus.db', sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Erro ao abrir DB:', err);
    process.exit(1);
  }
});

db.all('SELECT * FROM tasks WHERE user_id = ?', [userId], (err, rows) => {
  if (err) {
    console.error('Erro ao buscar tasks:', err);
    process.exit(1);
  }

  console.log('TASKS:', JSON.stringify(rows || [], null, 2));

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err2, u) => {
    if (err2) console.error('Erro ao buscar user:', err2);
    console.log('USER:', JSON.stringify(u || null, null, 2));
    db.close();
  });
});
