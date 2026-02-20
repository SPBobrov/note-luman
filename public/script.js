// Глобальное состояние
let notes = [];                 // все заметки с сервера
let selectedNoteId = null;      // id текущей открытой заметки
let notesMap = {};              // быстрый доступ по id

// DOM элементы
const treeContainer = document.getElementById('tree-container');
const editorPlaceholder = document.getElementById('editor-placeholder');
const editorDiv = document.getElementById('editor');
const noteRefSpan = document.getElementById('note-ref');
const noteTitleInput = document.getElementById('note-title');
const noteContentTextarea = document.getElementById('note-content');
const saveBtn = document.getElementById('save-note');
const deleteBtn = document.getElementById('delete-note');
const newChildBtn = document.getElementById('new-child');
const newNoteRootBtn = document.getElementById('new-note-root');

// Модальное окно
const modal = document.getElementById('modal');
const closeModal = document.querySelector('.close');
const newNoteForm = document.getElementById('new-note-form');
const newTitleInput = document.getElementById('new-title');
const parentTypeRadios = document.querySelectorAll('input[name="parent-type"]');
const parentSelect = document.getElementById('parent-select');

// Загрузка заметок при старте
async function loadNotes() {
    const response = await fetch('/api/notes');
    notes = await response.json();
    notesMap = {};
    notes.forEach(n => notesMap[n.id] = n);
    renderTree();
}

// Рекурсивное построение дерева
function buildTree(parentId = null) {
    return notes
        .filter(n => (n.parent_id || null) === parentId)
        .sort((a, b) => a.order_index - b.order_index)
        .map(n => ({
            ...n,
            children: buildTree(n.id)
        }));
}

function renderTree() {
    const tree = buildTree(null);
    treeContainer.innerHTML = renderTreeNodes(tree);
    // Подсветить выбранный элемент
    if (selectedNoteId) {
        const selectedLi = document.querySelector(`li[data-id="${selectedNoteId}"]`);
        if (selectedLi) {
            selectedLi.classList.add('selected');
        }
    }
    // Обновить выпадающий список в модалке
    updateParentSelect();
}

function renderTreeNodes(nodes) {
    if (!nodes.length) return '<p>Нет заметок</p>';
    let html = '<ul>';
    nodes.forEach(node => {
        html += `<li data-id="${node.id}" data-ref="${node.ref}">${node.ref} ${node.title}`;
        if (node.children && node.children.length) {
            html += renderTreeNodes(node.children);
        }
        html += '</li>';
    });
    html += '</ul>';
    return html;
}

// Обновить select с родителями в модалке
function updateParentSelect() {
    let options = '<option value="">-- выберите родителя --</option>';
    // Рекурсивная функция для добавления опций с отступами
    function addOptions(nodes, prefix = '') {
        nodes.forEach(node => {
            options += `<option value="${node.id}">${prefix}${node.ref} ${node.title}</option>`;
            if (node.children && node.children.length) {
                addOptions(node.children, prefix + '  ');
            }
        });
    }
    const tree = buildTree(null);
    addOptions(tree);
    parentSelect.innerHTML = options;
}

// Обработка клика по дереву (делегирование)
treeContainer.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const noteId = parseInt(li.dataset.id);
    if (noteId) {
        selectNote(noteId);
    }
});

// Выбор заметки для редактирования
async function selectNote(noteId) {
    selectedNoteId = noteId;
    const note = notesMap[noteId];
    if (!note) return;

    // Подсветка в дереве
    document.querySelectorAll('#tree-container li').forEach(li => li.classList.remove('selected'));
    const selectedLi = document.querySelector(`li[data-id="${noteId}"]`);
    if (selectedLi) selectedLi.classList.add('selected');

    // Заполняем редактор
    noteRefSpan.textContent = note.ref;
    noteTitleInput.value = note.title;
    noteContentTextarea.value = note.content || '';

    editorPlaceholder.style.display = 'none';
    editorDiv.style.display = 'flex';
}

// Сохранение изменений заметки
saveBtn.addEventListener('click', async () => {
    if (!selectedNoteId) return;
    const title = noteTitleInput.value.trim();
    const content = noteContentTextarea.value;
    if (!title) {
        alert('Название не может быть пустым');
        return;
    }

    const response = await fetch(`/api/notes/${selectedNoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
    });
    if (response.ok) {
        const updatedNote = await response.json();
        // Обновляем локальные данные
        const index = notes.findIndex(n => n.id === updatedNote.id);
        if (index !== -1) notes[index] = updatedNote;
        notesMap[updatedNote.id] = updatedNote;
        renderTree();
        // Обновляем отображаемые поля (ref не меняется)
        noteRefSpan.textContent = updatedNote.ref;
        noteTitleInput.value = updatedNote.title;
        noteContentTextarea.value = updatedNote.content || '';
    } else {
        const err = await response.json();
        alert('Ошибка сохранения: ' + err.error);
    }
});

// Удаление заметки
deleteBtn.addEventListener('click', async () => {
    if (!selectedNoteId) return;
    if (!confirm('Вы уверены, что хотите удалить эту заметку? (У неё не должно быть дочерних)')) return;

    const response = await fetch(`/api/notes/${selectedNoteId}`, { method: 'DELETE' });
    if (response.ok) {
        // Убираем из локальных данных
        notes = notes.filter(n => n.id !== selectedNoteId);
        delete notesMap[selectedNoteId];
        selectedNoteId = null;
        renderTree();
        editorDiv.style.display = 'none';
        editorPlaceholder.style.display = 'block';
    } else {
        const err = await response.json();
        alert('Ошибка удаления: ' + err.error);
    }
});

// Новая заметка верхнего уровня
newNoteRootBtn.addEventListener('click', () => {
    openNewNoteModal(null);
});

// Новая дочерняя заметка (от текущей)
newChildBtn.addEventListener('click', () => {
    if (!selectedNoteId) return;
    openNewNoteModal(selectedNoteId);
});

// Открыть модалку создания заметки
function openNewNoteModal(parentId = null) {
    // Сброс формы
    newTitleInput.value = '';
    document.querySelector('input[name="parent-type"][value="root"]').checked = true;
    parentSelect.value = '';
    parentSelect.disabled = true;

    // Если передан родитель, выбираем соответствующий radio
    if (parentId !== null) {
        document.querySelector('input[name="parent-type"][value="existing"]').checked = true;
        parentSelect.value = parentId;
        parentSelect.disabled = false;
    }

    modal.style.display = 'flex';
}

// Закрыть модалку
closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
});

// Включение/отключение select при выборе radio
parentTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        parentSelect.disabled = e.target.value !== 'existing';
    });
});

// Отправка формы создания заметки
newNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = newTitleInput.value.trim();
    if (!title) {
        alert('Введите название');
        return;
    }

    let parentId = null;
    if (document.querySelector('input[name="parent-type"]:checked').value === 'existing') {
        parentId = parentSelect.value ? parseInt(parentSelect.value) : null;
        if (!parentId) {
            alert('Выберите родителя из списка');
            return;
        }
    }

    const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: parentId })
    });

    if (response.ok) {
        const newNote = await response.json();
        notes.push(newNote);
        notesMap[newNote.id] = newNote;
        renderTree();
        selectNote(newNote.id);
        modal.style.display = 'none';
    } else {
        const err = await response.json();
        alert('Ошибка создания: ' + err.error);
    }
});

// Обработка ссылок в тексте (конвертация [[ref]] в ссылки при отображении)
// Мы не делаем отдельный режим просмотра, но можно реализовать при необходимости.
// Здесь для простоты оставим как есть, но можно добавить функцию, которая при загрузке заметки
// заменяет [[...]] на кликабельные ссылки в отдельном режиме.
// Для минимальной функциональности мы будем просто показывать текст как есть,
// но добавим обработчик кликов по ссылкам внутри textarea? Это неудобно.
// Лучше добавить кнопку "Просмотр", которая рендерит content с заменой.
// Однако по ТЗ нужно именно "делать ссылки из текста текущей заметки на другие заметки".
// Будем считать, что пользователь вручную пишет [[ref]] и при клике на заметку мы можем
// распознать такие ссылки и предложить переход. Но для удобства добавим двойной клик по textarea? Не очень.
// Реализуем функцию, которая при открытии заметки создаёт кнопку "Перейти по ссылке под курсором"?
// Проще: добавим кнопку "Найти ссылки в тексте" и список ссылок, но это усложняет.
// В рамках демо ограничимся тем, что ссылки будут просто текстом, но мы можем
// добавить обработчик событий нажатия на Ctrl+клик по слову с [[...]].
// Однако для простоты я добавлю кнопку "Показать ссылки", которая анализирует текст
// и выводит список ссылок с возможностью перехода.

// Добавим простую функцию: при клике на текст (в нередактируемом режиме) не получится.
// Поэтому я реализую парсинг содержимого и замену в отдельном блоке, но для минимальной версии
// можно просто добавить кнопку "Перейти к заметке по ref" с вводом ref вручную.
// Но ТЗ требует функциональность делать ссылки из текста на другие заметки, т.е. пользователь
// пишет [[1.2]] и это становится кликабельным. Для этого нужен режим предпросмотра.
// Я добавлю чекбокс "Режим просмотра", который показывает текст с преобразованными ссылками.
// Это будет сверх требования, но сделаем.

// Добавим в редактор кнопку "Предпросмотр" и переключатель.

// Для простоты добавим в editor-panel дополнительный элемент preview и переключатель.
// Изменим HTML: добавим div с id="preview" и кнопку "Просмотр/Редактирование".
// Но чтобы не усложнять, в текущей версии оставим без предпросмотра, но с возможностью
// вставлять ссылки через UI. Позже можно доработать.

// Однако по ТЗ: "Нужно реализовать функциональность делать ссылки из текста текущей заметки на другие заметки любого уровня в древовидном списке заметок."
// Это можно интерпретировать как возможность вставлять ссылки на другие заметки при редактировании, а при просмотре они становятся кликабельными.
// Я добавлю режим просмотра с преобразованием [[ref]] в <a>.

// Добавим кнопку "Предпросмотр" и соответствующий обработчик.

// Расширим editor-panel:

// В HTML после textarea добавим:
// <div id="preview" style="display:none; border:1px solid #ccc; padding:1rem; overflow-y:auto;"></div>
// и кнопку "Предпросмотр" рядом с Save.

// В CSS стилизуем.

// В script.js добавим переключение.

// Но для краткости в финальном ответе я опишу этот момент текстом, а код приложу полный.
// Однако в рамках ответа мы должны выдать готовый код. Поэтому включу эту функциональность.

// Обновлённый script.js с предпросмотром:

// (Продолжение script.js)

// Элементы для предпросмотра
const previewDiv = document.createElement('div');
previewDiv.id = 'preview';
previewDiv.style.display = 'none';
previewDiv.style.border = '1px solid #ccc';
previewDiv.style.padding = '1rem';
previewDiv.style.overflowY = 'auto';
previewDiv.style.height = '300px';
editorDiv.insertBefore(previewDiv, noteContentTextarea.nextSibling);

const previewBtn = document.createElement('button');
previewBtn.textContent = 'Предпросмотр';
previewBtn.id = 'preview-btn';
editorDiv.querySelector('.editor-actions').appendChild(previewBtn);

let previewMode = false;

previewBtn.addEventListener('click', () => {
    previewMode = !previewMode;
    if (previewMode) {
        // Переключиться в режим предпросмотра
        noteContentTextarea.style.display = 'none';
        previewDiv.style.display = 'block';
        previewBtn.textContent = 'Редактировать';
        renderPreview();
    } else {
        noteContentTextarea.style.display = 'block';
        previewDiv.style.display = 'none';
        previewBtn.textContent = 'Предпросмотр';
    }
});

function renderPreview() {
    let content = noteContentTextarea.value;
    // Замена [[ref]] на ссылки
    const refRegex = /\[\[([\d.]+)\]\]/g;
    content = content.replace(refRegex, (match, ref) => {
        const note = notes.find(n => n.ref === ref);
        if (note) {
            return `<a href="#" class="note-link" data-ref="${ref}">[[${ref} ${note.title}]]</a>`;
        } else {
            return `<span style="color:red;">[[${ref} (не найдено)]]</span>`;
        }
    });
    // Также заменяем переводы строк на <br>
    content = content.replace(/\n/g, '<br>');
    previewDiv.innerHTML = content;
}

// Обработка кликов по ссылкам в предпросмотре
previewDiv.addEventListener('click', (e) => {
    const link = e.target.closest('a.note-link');
    if (!link) return;
    e.preventDefault();
    const ref = link.dataset.ref;
    const note = notes.find(n => n.ref === ref);
    if (note) {
        selectNote(note.id);
    }
});

// Остальной код без изменений