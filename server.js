const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// База данных
const db = new sqlite3.Database('./database.sqlite');

// Создание таблицы notes, если её нет
db.run(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT NOT NULL DEFAULT 'note',   -- 'note' или 'bib'
    parent_id INTEGER,
    order_index INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`);

// Вспомогательная функция для генерации ref
function generateRef(type, parentId, callback) {
  if (type === 'bib') {
    // Библиографическая заметка: B1, B2, ...
    db.get('SELECT MAX(order_index) as maxOrder FROM notes WHERE type = "bib"', (err, row) => {
      if (err) return callback(err);
      const newOrder = (row.maxOrder || 0) + 1;
      const ref = 'B' + newOrder;
      callback(null, ref, newOrder);
    });
  } else {
    // Обычная заметка (иерархическая)
    if (parentId === null || parentId === undefined) {
      // Корневая заметка
      db.get('SELECT MAX(order_index) as maxOrder FROM notes WHERE type = "note" AND parent_id IS NULL', (err, row) => {
        if (err) return callback(err);
        const newOrder = (row.maxOrder || 0) + 1;
        callback(null, String(newOrder), newOrder);
      });
    } else {
      // Дочерняя заметка
      db.get('SELECT order_index, ref FROM notes WHERE id = ?', [parentId], (err, parent) => {
        if (err) return callback(err);
        if (!parent) return callback(new Error('Parent not found'));
        db.get('SELECT MAX(order_index) as maxOrder FROM notes WHERE parent_id = ?', [parentId], (err, row) => {
          if (err) return callback(err);
          const newOrder = (row.maxOrder || 0) + 1;
          const newRef = parent.ref + '.' + newOrder;
          callback(null, newRef, newOrder);
        });
      });
    }
  }
}

// API: получить все заметки
app.get('/api/notes', (req, res) => {
  db.all('SELECT * FROM notes ORDER BY type, ref', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API: получить одну заметку по id
app.get('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    res.json(row);
  });
});

// API: создать новую заметку
app.post('/api/notes', (req, res) => {
  const { title, parent_id, type } = req.body;
  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }
  const noteType = type === 'bib' ? 'bib' : 'note'; // по умолчанию note

  generateRef(noteType, parent_id, (err, ref, orderIndex) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    db.run(
      'INSERT INTO notes (ref, title, content, type, parent_id, order_index) VALUES (?, ?, ?, ?, ?, ?)',
      [ref, title, '', noteType, noteType === 'note' ? (parent_id || null) : null, orderIndex],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        db.get('SELECT * FROM notes WHERE id = ?', [this.lastID], (err, newNote) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.status(201).json(newNote);
        });
      }
    );
  });
});

// API: обновить заметку
app.put('/api/notes/:id', (req, res) => {
  const id = req.params.id;
  const { title, content } = req.body;
  if (!title && content === undefined) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  let updates = [];
  let params = [];
  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  db.run(
    `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      db.get('SELECT * FROM notes WHERE id = ?', [id], (err, updatedNote) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json(updatedNote);
      });
    }
  );
});

// API: удалить заметку (только если нет дочерних)
app.delete('/api/notes/:id', (req, res) => {
  const id = req.params.id;

  // Проверяем наличие дочерних заметок
  db.get('SELECT COUNT(*) as count FROM notes WHERE parent_id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (row.count > 0) {
      res.status(400).json({ error: 'Cannot delete note with children' });
      return;
    }

    db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }
      res.json({ message: 'Note deleted' });
    });
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});