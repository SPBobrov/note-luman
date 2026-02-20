// Глобальное состояние
let notes = [];
let selectedNoteId = null;
let notesMap = {};

// DOM элементы
const treeContainer = document.getElementById('tree-container');
const bibContainer = document.getElementById('bib-container');
const editorPlaceholder = document.getElementById('editor-placeholder');
const editorDiv = document.getElementById('editor');
const noteRefSpan = document.getElementById('note-ref');
const noteTitleInput = document.getElementById('note-title');
const noteContentTextarea = document.getElementById('note-content');
const previewDiv = document.getElementById('preview');
const saveBtn = document.getElementById('save-note');
const deleteBtn = document.getElementById('delete-note');
const newChildBtn = document.getElementById('new-child');
const previewBtn = document.getElementById('preview-btn');
const newNoteRootBtn = document.getElementById('new-note-root');

// Элементы для вставки внутренней ссылки
const insertLinkBtn = document.getElementById('insert-link-btn');
const linkModal = document.getElementById('link-modal');
const closeLink = document.querySelector('.close-link');
const linkSearch = document.getElementById('link-search');
const linkSelect = document.getElementById('link-select');
const insertLinkConfirm = document.getElementById('insert-link-confirm');

// Элементы для внешней ссылки
const insertExternalLinkBtn = document.getElementById('insert-external-link-btn');
const externalLinkModal = document.getElementById('external-link-modal');
const closeExternalLink = document.querySelector('.close-external-link');
const externalLinkText = document.getElementById('external-link-text');
const externalLinkUrl = document.getElementById('external-link-url');
const insertExternalLinkConfirm = document.getElementById('insert-external-link-confirm');

// Элементы для форматирования
const quoteBtn = document.getElementById('insert-quote-btn');
const highlightBtn = document.getElementById('insert-highlight-btn');

// Модальное окно создания заметки
const modal = document.getElementById('modal');
const closeModal = document.querySelector('.close');
const newNoteForm = document.getElementById('new-note-form');
const newTitleInput = document.getElementById('new-title');
const noteTypeRadios = document.querySelectorAll('input[name="note-type"]');
const parentGroup = document.getElementById('parent-group');
const parentTypeRadios = document.querySelectorAll('input[name="parent-type"]');
const parentSelect = document.getElementById('parent-select');

let previewMode = false; // флаг режима предпросмотра

// ==================== Загрузка данных ====================
async function loadNotes() {
    console.log('📥 Загрузка заметок...');
    try {
        const response = await fetch('/api/notes');
        if (!response.ok) {
            console.error('❌ Ошибка загрузки, статус:', response.status);
            return;
        }
        notes = await response.json();
        console.log('✅ Заметки загружены:', notes);
        notesMap = {};
        notes.forEach(n => notesMap[n.id] = n);
        renderBibList();
        renderTree();
    } catch (error) {
        console.error('❌ Ошибка при загрузке:', error);
    }
}

// ==================== Рендер библиографии ====================
function renderBibList() {
    const bibNotes = notes.filter(n => n.type === 'bib').sort((a, b) => a.order_index - b.order_index);
    let html = '<ul>';
    bibNotes.forEach(n => {
        html += `<li data-id="${n.id}" data-ref="${n.ref}">${n.ref} ${n.title}</li>`;
    });
    html += '</ul>';
    if (bibContainer) bibContainer.innerHTML = html;

    if (selectedNoteId && notesMap[selectedNoteId]?.type === 'bib') {
        const selectedLi = bibContainer?.querySelector(`li[data-id="${selectedNoteId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');
    }
}

// ==================== Построение дерева заметок ====================
function buildTree(parentId = null) {
    return notes
        .filter(n => n.type === 'note' && (n.parent_id || null) === parentId)
        .sort((a, b) => a.order_index - b.order_index)
        .map(n => ({
            ...n,
            children: buildTree(n.id)
        }));
}

function renderTree() {
    const tree = buildTree(null);
    treeContainer.innerHTML = renderTreeNodes(tree);
    if (selectedNoteId && notesMap[selectedNoteId]?.type === 'note') {
        const selectedLi = document.querySelector(`#tree-container li[data-id="${selectedNoteId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');
    }
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

// Обновление выпадающего списка родителей (для модалки создания)
function updateParentSelect() {
    let options = '<option value="">-- выберите родителя --</option>';
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
    if (parentSelect) parentSelect.innerHTML = options;
}

// ==================== Выбор заметки ====================
async function selectNote(noteId) {
    selectedNoteId = noteId;
    const note = notesMap[noteId];
    if (!note) return;

    // Сброс подсветки
    document.querySelectorAll('#tree-container li, #bib-container li').forEach(li => li.classList.remove('selected'));
    if (note.type === 'bib') {
        const selectedLi = bibContainer?.querySelector(`li[data-id="${noteId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');
    } else {
        const selectedLi = treeContainer?.querySelector(`li[data-id="${noteId}"]`);
        if (selectedLi) selectedLi.classList.add('selected');
    }

    // Заполнение редактора
    noteRefSpan.textContent = note.ref;
    noteTitleInput.value = note.title;
    noteContentTextarea.value = note.content || '';

    // Скрыть кнопку "Дочерняя заметка" для библиографии
    newChildBtn.style.display = note.type === 'bib' ? 'none' : 'inline-block';

    // Обновление отображения в зависимости от режима предпросмотра
    if (previewMode) {
        noteContentTextarea.style.display = 'none';
        previewDiv.style.display = 'block';
        renderPreview();
    } else {
        noteContentTextarea.style.display = 'block';
        previewDiv.style.display = 'none';
    }

    editorPlaceholder.style.display = 'none';
    editorDiv.style.display = 'flex';
}

// ==================== Обработчики кликов по дереву ====================
treeContainer?.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const noteId = parseInt(li.dataset.id);
    if (noteId) selectNote(noteId);
});

bibContainer?.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const noteId = parseInt(li.dataset.id);
    if (noteId) selectNote(noteId);
});

// ==================== Сохранение заметки ====================
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
        const index = notes.findIndex(n => n.id === updatedNote.id);
        if (index !== -1) notes[index] = updatedNote;
        notesMap[updatedNote.id] = updatedNote;
        renderBibList();
        renderTree();
        noteRefSpan.textContent = updatedNote.ref;
        noteTitleInput.value = updatedNote.title;
        noteContentTextarea.value = updatedNote.content || '';

        // Если мы в режиме предпросмотра, обновить предпросмотр
        if (previewMode) {
            renderPreview();
        }
    } else {
        const err = await response.json();
        alert('Ошибка сохранения: ' + err.error);
    }
});

// ==================== Удаление заметки ====================
deleteBtn.addEventListener('click', async () => {
    if (!selectedNoteId) return;
    if (!confirm('Вы уверены, что хотите удалить эту заметку? (У неё не должно быть дочерних)')) return;

    const response = await fetch(`/api/notes/${selectedNoteId}`, { method: 'DELETE' });
    if (response.ok) {
        notes = notes.filter(n => n.id !== selectedNoteId);
        delete notesMap[selectedNoteId];
        selectedNoteId = null;
        renderBibList();
        renderTree();
        editorDiv.style.display = 'none';
        editorPlaceholder.style.display = 'block';
    } else {
        const err = await response.json();
        alert('Ошибка удаления: ' + err.error);
    }
});

// ==================== Создание новой заметки ====================
newNoteRootBtn.addEventListener('click', () => {
    openNewNoteModal('note', null);
});

newChildBtn.addEventListener('click', () => {
    if (!selectedNoteId) return;
    const parentNote = notesMap[selectedNoteId];
    if (parentNote.type === 'bib') return;
    openNewNoteModal('note', selectedNoteId);
});

function openNewNoteModal(type = 'note', parentId = null) {
    newTitleInput.value = '';
    document.querySelector(`input[name="note-type"][value="${type}"]`).checked = true;
    toggleParentGroup();

    if (type === 'note' && parentId !== null) {
        document.querySelector('input[name="parent-type"][value="existing"]').checked = true;
        parentSelect.value = parentId;
        parentSelect.disabled = false;
    } else {
        document.querySelector('input[name="parent-type"][value="root"]').checked = true;
        parentSelect.value = '';
        parentSelect.disabled = true;
    }

    modal.style.display = 'flex';
}

function toggleParentGroup() {
    const selectedType = document.querySelector('input[name="note-type"]:checked').value;
    if (selectedType === 'bib') {
        parentGroup.style.display = 'none';
        document.querySelector('input[name="parent-type"][value="root"]').checked = true;
        parentSelect.disabled = true;
    } else {
        parentGroup.style.display = 'block';
        const parentType = document.querySelector('input[name="parent-type"]:checked').value;
        parentSelect.disabled = parentType !== 'existing';
    }
}

noteTypeRadios.forEach(radio => {
    radio.addEventListener('change', toggleParentGroup);
});

parentTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        parentSelect.disabled = e.target.value !== 'existing';
    });
});

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
});

newNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = newTitleInput.value.trim();
    if (!title) {
        alert('Введите название');
        return;
    }

    const noteType = document.querySelector('input[name="note-type"]:checked').value;

    let parentId = null;
    if (noteType === 'note' && document.querySelector('input[name="parent-type"]:checked').value === 'existing') {
        parentId = parentSelect.value ? parseInt(parentSelect.value) : null;
        if (!parentId) {
            alert('Выберите родителя из списка');
            return;
        }
    }

    const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: parentId, type: noteType })
    });

    if (response.ok) {
        const newNote = await response.json();
        notes.push(newNote);
        notesMap[newNote.id] = newNote;
        renderBibList();
        renderTree();
        selectNote(newNote.id);
        modal.style.display = 'none';
    } else {
        const err = await response.json();
        alert('Ошибка создания: ' + err.error);
    }
});

// ==================== Предпросмотр ====================
previewBtn.addEventListener('click', () => {
    previewMode = !previewMode;
    if (previewMode) {
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

    // 1. Экранируем HTML-сущности, чтобы любой HTML-код отображался как текст
    content = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // 2. Выделение цветом ==текст==
    content = content.replace(/==(.*?)==/g, '<span class="highlight">$1</span>');

    // 3. Внешние ссылки [текст](url)
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 4. Авто-ссылки (http:// и https://)
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    content = content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // 5. Внутренние ссылки [[ref]]
    const refRegex = /\[\[([\d.]+|B\d+)\]\]/g;
    content = content.replace(refRegex, (match, ref) => {
        const note = notes.find(n => n.ref === ref);
        if (note) {
            return `<a href="#" class="note-link" data-ref="${ref}">[[${ref} ${note.title}]]</a>`;
        } else {
            return `<span style="color:red;">[[${ref} (не найдено)]]</span>`;
        }
    });

    // 6. Цитаты: строки, начинающиеся с '> ' (после экранирования это '&gt; ')
    const lines = content.split('\n');
    const newLines = [];
    let quoteBuffer = [];
    let inQuote = false;

    for (const line of lines) {
        if (line.startsWith('&gt; ')) {
            quoteBuffer.push(line.substring(5)); // удаляем '&gt; '
            inQuote = true;
        } else {
            if (inQuote) {
                newLines.push('<blockquote>' + quoteBuffer.join('<br>') + '</blockquote>');
                quoteBuffer = [];
                inQuote = false;
            }
            newLines.push(line);
        }
    }
    if (inQuote) {
        newLines.push('<blockquote>' + quoteBuffer.join('<br>') + '</blockquote>');
    }

    content = newLines.join('<br>');
    previewDiv.innerHTML = content;
}

// Обработка кликов по ссылкам в предпросмотре (внутренние)
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

// ==================== Вставка внутренней ссылки ====================
function populateLinkSelect(filter = '') {
    const sortedNotes = [...notes].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'bib' ? -1 : 1;
        return a.ref.localeCompare(b.ref, undefined, { numeric: true });
    });

    let options = '';
    sortedNotes.forEach(n => {
        const text = `${n.ref} — ${n.title}`;
        if (filter && !text.toLowerCase().includes(filter.toLowerCase())) return;
        options += `<option value="${n.ref}">${text}</option>`;
    });
    linkSelect.innerHTML = options;
}

insertLinkBtn.addEventListener('click', () => {
    populateLinkSelect();
    linkModal.style.display = 'flex';
    linkSearch.value = '';
});

linkSearch.addEventListener('input', () => {
    populateLinkSelect(linkSearch.value);
});

closeLink.addEventListener('click', () => {
    linkModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === linkModal) linkModal.style.display = 'none';
});

function insertAtCursor(myField, myValue) {
    if (document.selection) {
        myField.focus();
        const sel = document.selection.createRange();
        sel.text = myValue;
    } else if (myField.selectionStart || myField.selectionStart === 0) {
        const startPos = myField.selectionStart;
        const endPos = myField.selectionEnd;
        myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
    } else {
        myField.value += myValue;
    }
    myField.focus();
}

insertLinkConfirm.addEventListener('click', () => {
    const selectedRef = linkSelect.value;
    if (!selectedRef) {
        alert('Выберите заметку');
        return;
    }
    insertAtCursor(noteContentTextarea, `[[${selectedRef}]]`);
    linkModal.style.display = 'none';
});

// ==================== Вставка внешней ссылки ====================
insertExternalLinkBtn.addEventListener('click', () => {
    externalLinkText.value = '';
    externalLinkUrl.value = '';
    externalLinkModal.style.display = 'flex';
});

closeExternalLink.addEventListener('click', () => {
    externalLinkModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
    if (e.target === externalLinkModal) externalLinkModal.style.display = 'none';
});

insertExternalLinkConfirm.addEventListener('click', () => {
    const text = externalLinkText.value.trim();
    let url = externalLinkUrl.value.trim();
    if (!url) {
        alert('Введите URL');
        return;
    }
    // Добавляем https:// если нет протокола
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    const markdown = text ? `[${text}](${url})` : url; // если текст не указан, вставляем просто URL
    insertAtCursor(noteContentTextarea, markdown);
    externalLinkModal.style.display = 'none';
});

// ==================== Форматирование: цитаты и выделение ====================
quoteBtn.addEventListener('click', () => {
    insertAtCursor(noteContentTextarea, '> ');
});

function wrapSelection(before, after) {
    const textarea = noteContentTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const newText = before + selectedText + after;
    textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length + selectedText.length;
    textarea.focus();
}

highlightBtn.addEventListener('click', () => {
    wrapSelection('==', '==');
});

// ==================== Инициализация ====================
document.addEventListener('DOMContentLoaded', loadNotes);