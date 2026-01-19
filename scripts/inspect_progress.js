const sqlite3 = require('sqlite3').verbose();
const progId = process.argv[2] || 'prog-user-1767221474680-pk66qztk0';

const db = new sqlite3.Database('data/prosperus.db', sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Erro ao abrir DB:', err);
    process.exit(1);
  }
});

db.get('SELECT * FROM user_progress WHERE id = ?', [progId], (err, row) => {
  if (err) {
    console.error('Erro na query:', err);
    process.exit(1);
  }
  console.log('USER_PROGRESS:', JSON.stringify(row || null, null, 2));
  db.close();
});
