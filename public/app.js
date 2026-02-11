const API_BASE = window.location.origin;

// Application state
const state = {
    originalFiles: [],
    revisedFiles: [],
    originalFileMap: {},
    revisedFileMap: {},
    originalImageMap: {},
    revisedImageMap: {},
    originalOnlyFiles: [],
    revisedOnlyFiles: [],
    bothFiles: [],
    currentDrawing: null,
    originalImage: null,
    revisedImage: null,
    canvas: null,
    ctx: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    showOriginal: true,
    showRevised: true,
    isAligning: false,
    aligningVersion: null,
    alignmentData: {},
    originalAlignOffsetX: 0,
    originalAlignOffsetY: 0,
    revisedAlignOffsetX: 0,
    revisedAlignOffsetY: 0,
    alignDragging: false,
    alignDragStartX: 0,
    alignDragStartY: 0,
    selectedDrawings: new Set(),
    viewedDrawings: new Set(),
    flaggedDrawings: new Set(),
    drawingNotes: {},
    currentLetterFilter: 'ALL',
    statusFilter: 'ALL',
    isAlignmentPreview: false,
    alignOriginalTinted: null,
    alignRevisedTinted: null,
    pendingSessionData: null,
    originalFolderName: '',
    revisedFolderName: '',
    originalFolderHandle: null,
    revisedFolderHandle: null,
    drawingCategoryMap: {},
    notesFilter: 'BOTH',
    listScrollPositions: {
        'original-only-list': 0,
        'both-list': 0,
        'revised-only-list': 0
    },
    manualMatches: {},
    matchingMode: false,
    matchingSource: null,
    matchingSourceSide: null
};

state.compositeCanvas = document.createElement('canvas');
state.compositeCtx = state.compositeCanvas.getContext('2d');
state.tempOriginalCanvas = document.createElement('canvas');
state.tempOriginalCtx = state.tempOriginalCanvas.getContext('2d', { willReadFrequently: true });
state.tempRevisedCanvas = document.createElement('canvas');
state.tempRevisedCtx = state.tempRevisedCanvas.getContext('2d', { willReadFrequently: true });
state.needsOverlayRebuild = true;
state.overlayRebuildFrame = null;

const MARK_THRESHOLD = 0.02;
const ALIGN_FINE_TUNE_FACTOR = 0.1;

// DOM Elements
const folderSelectionView = document.getElementById('folder-selection');
const drawingListView = document.getElementById('drawing-list');
const comparisonView = document.getElementById('comparison-view');
const originalFolderInput = document.getElementById('original-folder');
const revisedFolderInput = document.getElementById('revised-folder');
const originalCountEl = document.getElementById('original-count');
const revisedCountEl = document.getElementById('revised-count');
const loadFoldersBtn = document.getElementById('load-folders');
const loadSessionBtn = document.getElementById('load-session');
const loadSessionFileInput = document.getElementById('load-session-file');
const saveSessionBtn = document.getElementById('save-session');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');
const backToFoldersBtn = document.getElementById('back-to-folders');
const letterFilterSelect = document.getElementById('letter-filter');
const statusFilterSelect = document.getElementById('status-filter');
const backToListBtn = document.getElementById('back-to-list');
const canvas = document.getElementById('comparison-canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
const currentDrawingName = document.getElementById('current-drawing-name');
const toggleOriginalCheckbox = document.getElementById('toggle-original');
const toggleRevisedCheckbox = document.getElementById('toggle-revised');
const resetViewBtn = document.getElementById('reset-view');
const zoomLevelSpan = document.getElementById('zoom-level');
const alignButton = document.getElementById('align-button');
const alignInstructions = document.getElementById('align-instructions');
const alignOriginalBtn = document.getElementById('align-original');
const alignRevisedBtn = document.getElementById('align-revised');
const toggleFlagBtn = document.getElementById('toggle-flag');
const cancelAlignBtn = document.getElementById('cancel-align');
const alignActiveMessage = document.getElementById('align-active-message');
const selectAllBtn = document.getElementById('select-all');
const deselectAllBtn = document.getElementById('deselect-all');
const exportSelectedBtn = document.getElementById('export-selected');
const editNoteBtn = document.getElementById('edit-note');
const notePanel = document.getElementById('note-panel');
const closeNotePanelBtn = document.getElementById('close-note-panel');
const noteTextarea = document.getElementById('note-textarea');
const saveNoteBtn = document.getElementById('save-note');
const seeAllNotesBtn = document.getElementById('see-all-notes');
const notesModal = document.getElementById('notes-modal');
const closeNotesModalBtn = document.getElementById('close-notes-modal');
const notesModalBody = document.getElementById('notes-modal-body');
const notesModalTitle = document.getElementById('notes-modal-title');
const notesFilterGroup = document.getElementById('notes-filter-group');
const notesFilterSelect = document.getElementById('notes-filter-select');
const exportNotesBtn = document.getElementById('export-notes');
const originalOnlyListEl = document.getElementById('original-only-list');
const bothListEl = document.getElementById('both-list');
const revisedOnlyListEl = document.getElementById('revised-only-list');

state.canvas = canvas;
state.ctx = ctx;


const HANDLE_DB_NAME = 'drawing-compare-handles';
const HANDLE_STORE_NAME = 'folderHandles';
const ORIGINAL_HANDLE_KEY = 'original-folder-handle';
const REVISED_HANDLE_KEY = 'revised-folder-handle';

function getFolderNameFromFiles(files) {
    const first = files[0];
    if (!first || !first.webkitRelativePath) return '';
    return first.webkitRelativePath.split('/')[0] || '';
}

function setOriginalFiles(files, folderName = '') {
    state.originalFiles = files;
    state.originalFileMap = {};
    files.forEach((file) => {
        state.originalFileMap[file.name] = file;
    });
    state.originalFolderName = folderName || getFolderNameFromFiles(files);
    const label = state.originalFolderName ? ` (${state.originalFolderName})` : '';
    originalCountEl.textContent = `${files.length} PDF files selected${label}`;
}

function setRevisedFiles(files, folderName = '') {
    state.revisedFiles = files;
    state.revisedFileMap = {};
    files.forEach((file) => {
        state.revisedFileMap[file.name] = file;
    });
    state.revisedFolderName = folderName || getFolderNameFromFiles(files);
    const label = state.revisedFolderName ? ` (${state.revisedFolderName})` : '';
    revisedCountEl.textContent = `${files.length} PDF files selected${label}`;
}

function buildSessionHandleKey(prefix) {
    const token = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now()}-${token}`;
}

function openHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
                db.createObjectStore(HANDLE_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putStoredFolderHandle(key, handle) {
    if (!window.showDirectoryPicker || !handle) {
        console.log('[Session] putStoredFolderHandle skipped — showDirectoryPicker:', !!window.showDirectoryPicker, 'handle:', !!handle);
        return;
    }
    console.log('[Session] Storing DirectoryHandle in IndexedDB — key:', key, 'folder:', handle.name);
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
        tx.objectStore(HANDLE_STORE_NAME).put(handle, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[Session] DirectoryHandle stored successfully — key:', key);
}

async function getStoredFolderHandle(key) {
    if (!window.showDirectoryPicker) {
        console.log('[Session] getStoredFolderHandle — showDirectoryPicker not available');
        return null;
    }
    const db = await openHandleDb();
    const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
        const req = tx.objectStore(HANDLE_STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    db.close();
    console.log('[Session] getStoredFolderHandle — key:', key, 'found:', !!result, result ? '(folder: ' + result.name + ')' : '');
    return result;
}

async function promptForFolderRelocation(storageKey, label, expectedName = '') {
    if (!window.showDirectoryPicker) return null;

    const nameHint = expectedName ? ` (${expectedName})` : '';
    const shouldRelocate = window.confirm(
        `Saved session could not automatically access the ${label} folder${nameHint}.

Click OK to locate it now.`
    );

    if (!shouldRelocate) {
        return null;
    }

    try {
        const handle = await window.showDirectoryPicker({ id: storageKey });
        if (handle) {
            await putStoredFolderHandle(storageKey, handle);
        }
        return handle;
    } catch (error) {
        console.warn(`Folder relocation cancelled for ${label}:`, error);
        return null;
    }
}

async function collectPdfFilesFromDirectoryHandle(directoryHandle, files = []) {
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
            const file = await entry.getFile();
            files.push(file);
        } else if (entry.kind === 'directory') {
            await collectPdfFilesFromDirectoryHandle(entry, files);
        }
    }
    return files;
}

async function loadFilesFromStoredFolderHandle(handle) {
    if (!handle) {
        console.log('[Session] loadFilesFromStoredFolderHandle — no handle provided');
        return [];
    }

    console.log('[Session] Checking permission for folder:', handle.name);
    const permission = await handle.queryPermission({ mode: 'read' });
    console.log('[Session] Current permission for', handle.name, ':', permission);
    if (permission !== 'granted') {
        console.log('[Session] Requesting permission for', handle.name);
        const requested = await handle.requestPermission({ mode: 'read' });
        console.log('[Session] Permission request result for', handle.name, ':', requested);
        if (requested !== 'granted') {
            throw new Error(`Permission denied for folder ${handle.name}`);
        }
    }

    const files = await collectPdfFilesFromDirectoryHandle(handle, []);
    console.log('[Session] Loaded', files.length, 'PDF files from', handle.name);
    return files;
}

function getSessionRestoreHelpMessage() {
    const secureContextHint = window.isSecureContext
        ? ''
        : ' Also, File System Access APIs only work on secure contexts (https or localhost), so loading from a network IP over plain http will disable auto-restore.';

    return `This browser cannot auto-restore saved folders because Directory Handle APIs are unavailable.${secureContextHint}\n\nPlease reselect Original and Revised folders manually, then click Load Drawings. Your session selections/notes/flags will still be applied.`;
}

async function tryRestoreFoldersFromSession(sessionData) {
    console.log('[Session] === tryRestoreFoldersFromSession START ===');
    console.log('[Session] showDirectoryPicker available:', !!window.showDirectoryPicker);
    if (!window.showDirectoryPicker) {
        console.log('[Session] Cannot auto-restore: showDirectoryPicker unavailable');
        return false;
    }

    const info = sessionData.folderHandles;
    console.log('[Session] folderHandles from session file:', JSON.stringify(info));
    if (!info || typeof info !== 'object') {
        console.log('[Session] No folderHandles in session data — aborting restore');
        return false;
    }

    const originalKey = info.originalStorageKey || ORIGINAL_HANDLE_KEY;
    const revisedKey = info.revisedStorageKey || REVISED_HANDLE_KEY;
    console.log('[Session] Looking up handles — originalKey:', originalKey, 'revisedKey:', revisedKey);

    let originalHandle = await getStoredFolderHandle(originalKey);
    let revisedHandle = await getStoredFolderHandle(revisedKey);

    if (!originalHandle && originalKey !== ORIGINAL_HANDLE_KEY) {
        console.log('[Session] Original session-specific handle missing — falling back to legacy key');
        originalHandle = await getStoredFolderHandle(ORIGINAL_HANDLE_KEY);
    }
    if (!revisedHandle && revisedKey !== REVISED_HANDLE_KEY) {
        console.log('[Session] Revised session-specific handle missing — falling back to legacy key');
        revisedHandle = await getStoredFolderHandle(REVISED_HANDLE_KEY);
    }

    if (!originalHandle) {
        console.log('[Session] Original handle NOT found in IndexedDB — prompting user to relocate');
        originalHandle = await promptForFolderRelocation(originalKey, 'Original', info.originalName || '');
    }
    if (!revisedHandle) {
        console.log('[Session] Revised handle NOT found in IndexedDB — prompting user to relocate');
        revisedHandle = await promptForFolderRelocation(revisedKey, 'Revised', info.revisedName || '');
    }

    if (!originalHandle || !revisedHandle) {
        console.log('[Session] Missing handle(s) after relocation — original:', !!originalHandle, 'revised:', !!revisedHandle);
        return false;
    }

    console.log('[Session] Both handles acquired — original:', originalHandle.name, 'revised:', revisedHandle.name);
    try {
        const [originalFiles, revisedFiles] = await Promise.all([
            loadFilesFromStoredFolderHandle(originalHandle),
            loadFilesFromStoredFolderHandle(revisedHandle)
        ]);

        if (originalFiles.length === 0 || revisedFiles.length === 0) {
            return false;
        }

        setOriginalFiles(originalFiles, info.originalName || originalHandle.name || '');
        setRevisedFiles(revisedFiles, info.revisedName || revisedHandle.name || '');
        state.originalFolderHandle = originalHandle;
        state.revisedFolderHandle = revisedHandle;
        return true;
    } catch (error) {
        console.warn('Unable to restore folders from session handles:', error);

        originalHandle = await promptForFolderRelocation(originalKey, 'Original', info.originalName || '');
        revisedHandle = await promptForFolderRelocation(revisedKey, 'Revised', info.revisedName || '');
        if (!originalHandle || !revisedHandle) return false;

        try {
            const [originalFiles, revisedFiles] = await Promise.all([
                loadFilesFromStoredFolderHandle(originalHandle),
                loadFilesFromStoredFolderHandle(revisedHandle)
            ]);

            if (originalFiles.length === 0 || revisedFiles.length === 0) {
                return false;
            }

            setOriginalFiles(originalFiles, info.originalName || originalHandle.name || '');
            setRevisedFiles(revisedFiles, info.revisedName || revisedHandle.name || '');
            state.originalFolderHandle = originalHandle;
            state.revisedFolderHandle = revisedHandle;
            return true;
        } catch (retryError) {
            console.warn('Retry restore failed:', retryError);
            return false;
        }
    }
}


if (window.showDirectoryPicker) {
    console.log('[Session] showDirectoryPicker available — using it for folder selection');
    originalFolderInput.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('[Session] Original folder input clicked — opening showDirectoryPicker');
        try {
            const handle = await window.showDirectoryPicker({ id: 'original-folder-handle' });
            console.log('[Session] User selected original folder:', handle.name);
            await putStoredFolderHandle(ORIGINAL_HANDLE_KEY, handle);
            const files = await collectPdfFilesFromDirectoryHandle(handle);
            console.log('[Session] Found', files.length, 'PDF files in original folder');
            setOriginalFiles(files, handle.name);
            state.originalFolderHandle = handle;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Original folder selection failed:', err);
            else console.log('[Session] Original folder selection cancelled by user');
        }
    });

    revisedFolderInput.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('[Session] Revised folder input clicked — opening showDirectoryPicker');
        try {
            const handle = await window.showDirectoryPicker({ id: 'revised-folder-handle' });
            console.log('[Session] User selected revised folder:', handle.name);
            await putStoredFolderHandle(REVISED_HANDLE_KEY, handle);
            const files = await collectPdfFilesFromDirectoryHandle(handle);
            console.log('[Session] Found', files.length, 'PDF files in revised folder');
            setRevisedFiles(files, handle.name);
            state.revisedFolderHandle = handle;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Revised folder selection failed:', err);
            else console.log('[Session] Revised folder selection cancelled by user');
        }
    });
} else {
    console.log('[Session] showDirectoryPicker NOT available — falling back to <input> file picker');
}

originalFolderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setOriginalFiles(files);
});

revisedFolderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    setRevisedFiles(files);
});


loadSessionBtn.addEventListener('click', () => {
    loadSessionFileInput.click();
});

loadSessionFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const sessionData = JSON.parse(text);
        state.pendingSessionData = sessionData;
        console.log('[Session] === Loading session file ===');
        console.log('[Session] Original files already loaded:', state.originalFiles.length);
        console.log('[Session] Revised files already loaded:', state.revisedFiles.length);

        if (state.originalFiles.length === 0 || state.revisedFiles.length === 0) {
            console.log('[Session] Folders not yet loaded — attempting restore from session');
            const restored = await tryRestoreFoldersFromSession(sessionData);
            console.log('[Session] Restore result:', restored);
            if (!restored) {
                if (!window.showDirectoryPicker) {
                    alert(getSessionRestoreHelpMessage());
                } else {
                    alert('Could not auto-locate one or both saved folders. Please reselect the missing folder(s), then click Load Drawings.');
                }
                return;
            }
        } else {
            console.log('[Session] Folders already loaded — skipping restore');
        }

        applySessionData(sessionData);
        state.pendingSessionData = null;
        showDrawingList();
    } catch (error) {
        console.error('[Session] Failed to load session:', error);
        alert('Failed to load session file: ' + error.message);
    } finally {
        loadSessionFileInput.value = '';
    }
});

saveSessionBtn.addEventListener('click', async () => {
    await downloadSessionFile();
});

function loadAlignmentData() {
    const saved = localStorage.getItem('alignments_local');
    if (saved) {
        try {
            state.alignmentData = JSON.parse(saved);
        } catch (e) {
            state.alignmentData = {};
        }
    }
}

function saveAlignmentData() {
    localStorage.setItem('alignments_local', JSON.stringify(state.alignmentData));
}

function loadFlaggedData() {
    const saved = localStorage.getItem('flags_local');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.flaggedDrawings = new Set(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
            state.flaggedDrawings = new Set();
        }
    }
}

function saveFlaggedData() {
    localStorage.setItem('flags_local', JSON.stringify(Array.from(state.flaggedDrawings)));
}

function loadNotesData() {
    const saved = localStorage.getItem('notes_local');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.drawingNotes = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            state.drawingNotes = {};
        }
    }
}

function saveNotesData() {
    localStorage.setItem('notes_local', JSON.stringify(state.drawingNotes));
}

function getNote(filename) {
    return (state.drawingNotes[filename] || '').trim();
}

function loadManualMatches() {
    const saved = localStorage.getItem('manual_matches_local');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.manualMatches = parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            state.manualMatches = {};
        }
    }
}

function saveManualMatches() {
    localStorage.setItem('manual_matches_local', JSON.stringify(state.manualMatches));
}

function updateNoteButtonState() {
    if (!state.currentDrawing) return;

    const hasNote = Boolean(getNote(state.currentDrawing));
    editNoteBtn.textContent = hasNote ? 'Edit Note' : 'Add Note';
    editNoteBtn.classList.toggle('has-note', hasNote);
}

function updateFlagButtonState() {
    if (!state.currentDrawing) return;

    const flagged = state.flaggedDrawings.has(state.currentDrawing);
    toggleFlagBtn.textContent = flagged ? 'Unflag Significant Change' : 'Flag Significant Change';
    toggleFlagBtn.classList.toggle('flagged', flagged);
}


function buildSessionData(folderHandleInfo = {}) {
    const {
        originalStorageKey = ORIGINAL_HANDLE_KEY,
        revisedStorageKey = REVISED_HANDLE_KEY
    } = folderHandleInfo;

    return {
        version: 1,
        savedAt: new Date().toISOString(),
        originalFiles: state.originalFiles.map(f => f.name).sort(),
        revisedFiles: state.revisedFiles.map(f => f.name).sort(),
        selectedDrawings: Array.from(state.selectedDrawings),
        viewedDrawings: Array.from(state.viewedDrawings),
        viewedFiles: Array.from(state.viewedDrawings),
        flaggedDrawings: Array.from(state.flaggedDrawings),
        drawingNotes: state.drawingNotes,
        folderHandles: {
            originalStorageKey,
            revisedStorageKey,
            originalName: state.originalFolderName,
            revisedName: state.revisedFolderName
        },
        alignmentData: state.alignmentData,
        manualMatches: state.manualMatches,
        letterFilter: state.currentLetterFilter,
        statusFilter: state.statusFilter
    };
}

async function ensureStoredFolderHandlesForSession() {
    if (!window.showDirectoryPicker) return null;

    try {
        if (!state.originalFolderHandle) {
            const hasOriginal = await getStoredFolderHandle(ORIGINAL_HANDLE_KEY);
            if (hasOriginal) {
                state.originalFolderHandle = hasOriginal;
            }
        }

        if (!state.originalFolderHandle && state.originalFiles.length > 0) {
            const originalHandle = await window.showDirectoryPicker({ id: 'original-folder-handle' });
            if (originalHandle) {
                await putStoredFolderHandle(ORIGINAL_HANDLE_KEY, originalHandle);
                state.originalFolderHandle = originalHandle;
                state.originalFolderName = state.originalFolderName || originalHandle.name || '';
            }
        }
    } catch (error) {
        console.warn('Original folder-handle capture skipped:', error);
    }

    try {
        if (!state.revisedFolderHandle) {
            const hasRevised = await getStoredFolderHandle(REVISED_HANDLE_KEY);
            if (hasRevised) {
                state.revisedFolderHandle = hasRevised;
            }
        }

        if (!state.revisedFolderHandle && state.revisedFiles.length > 0) {
            const revisedHandle = await window.showDirectoryPicker({ id: 'revised-folder-handle' });
            if (revisedHandle) {
                await putStoredFolderHandle(REVISED_HANDLE_KEY, revisedHandle);
                state.revisedFolderHandle = revisedHandle;
                state.revisedFolderName = state.revisedFolderName || revisedHandle.name || '';
            }
        }
    } catch (error) {
        console.warn('Revised folder-handle capture skipped:', error);
    }

    if (!state.originalFolderHandle || !state.revisedFolderHandle) {
        return null;
    }

    const originalStorageKey = buildSessionHandleKey('original-folder-handle');
    const revisedStorageKey = buildSessionHandleKey('revised-folder-handle');

    await putStoredFolderHandle(originalStorageKey, state.originalFolderHandle);
    await putStoredFolderHandle(revisedStorageKey, state.revisedFolderHandle);

    return { originalStorageKey, revisedStorageKey };
}

async function downloadSessionFile() {
    const folderHandleInfo = await ensureStoredFolderHandlesForSession();
    const sessionData = buildSessionData(folderHandleInfo || {});
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `drawing-session-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function applySessionData(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        throw new Error('Invalid session file format');
    }

    const originalSet = new Set(state.originalFiles.map(f => f.name));
    const revisedSet = new Set(state.revisedFiles.map(f => f.name));
    const availableSet = new Set([...originalSet, ...revisedSet]);

    const selected = Array.isArray(sessionData.selectedDrawings) ? sessionData.selectedDrawings : [];
    const viewed = Array.isArray(sessionData.viewedDrawings)
        ? sessionData.viewedDrawings
        : (Array.isArray(sessionData.viewedFiles) ? sessionData.viewedFiles : []);
    const flagged = Array.isArray(sessionData.flaggedDrawings) ? sessionData.flaggedDrawings : [];
    const sessionNotes = sessionData.drawingNotes && typeof sessionData.drawingNotes === 'object'
        ? sessionData.drawingNotes
        : {};

    state.selectedDrawings = new Set(selected.filter(name => originalSet.has(name) && revisedSet.has(name)));
    state.viewedDrawings = new Set(viewed.filter(name => availableSet.has(name)));
    state.flaggedDrawings = new Set(flagged.filter(name => availableSet.has(name)));

    state.drawingNotes = {};
    Object.entries(sessionNotes).forEach(([name, value]) => {
        if (!availableSet.has(name)) return;
        if (typeof value !== 'string') return;
        const trimmed = value.trim();
        if (trimmed) {
            state.drawingNotes[name] = trimmed;
        }
    });

    const alignmentData = sessionData.alignmentData && typeof sessionData.alignmentData === 'object'
        ? sessionData.alignmentData
        : {};

    state.alignmentData = {};
    Object.entries(alignmentData).forEach(([name, value]) => {
        if (!originalSet.has(name) || !revisedSet.has(name)) return;
        if (!value || typeof value !== 'object') return;

        state.alignmentData[name] = {
            originalOffsetX: Number(value.originalOffsetX) || 0,
            originalOffsetY: Number(value.originalOffsetY) || 0,
            revisedOffsetX: Number(value.revisedOffsetX) || 0,
            revisedOffsetY: Number(value.revisedOffsetY) || 0
        };
    });

    const sessionMatches = sessionData.manualMatches && typeof sessionData.manualMatches === 'object'
        ? sessionData.manualMatches
        : {};
    state.manualMatches = {};
    Object.entries(sessionMatches).forEach(([origName, revName]) => {
        if (typeof revName !== 'string') return;
        if (originalSet.has(origName) && revisedSet.has(revName)) {
            state.manualMatches[origName] = revName;
        }
    });

    const requestedFilter = sessionData.letterFilter;
    state.currentLetterFilter = typeof requestedFilter === 'string' ? requestedFilter.toUpperCase() : 'ALL';

    const requestedStatusFilter = sessionData.statusFilter;
    state.statusFilter = typeof requestedStatusFilter === 'string' ? requestedStatusFilter.toUpperCase() : 'ALL';

    saveAlignmentData();
    saveFlaggedData();
    saveNotesData();
    saveManualMatches();
}

loadFoldersBtn.addEventListener('click', async () => {
    if (state.originalFiles.length === 0 || state.revisedFiles.length === 0) {
        showError('Please select both original and revised folders');
        return;
    }
    
    loadingMessage.style.display = 'block';
    loadingMessage.innerHTML = '<p>Loading drawings...</p>';
    errorMessage.style.display = 'none';
    
    try {
        loadManualMatches();
        categorizeFiles();
        if (!state.originalFolderName) {
            state.originalFolderName = getFolderNameFromFiles(state.originalFiles);
        }
        if (!state.revisedFolderName) {
            state.revisedFolderName = getFolderNameFromFiles(state.revisedFiles);
        }
        loadAlignmentData();
        loadFlaggedData();
        loadNotesData();

        if (state.pendingSessionData) {
            applySessionData(state.pendingSessionData);
            categorizeFiles();
            state.pendingSessionData = null;
        }

        showDrawingList();
        
    } catch (error) {
        showError(error.message);
    } finally {
        loadingMessage.style.display = 'none';
    }
});

function buildPdfCacheSignature(pdfFile) {
    return `${pdfFile.name}|${pdfFile.size}|${pdfFile.lastModified}`;
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function loadImageFromBase64(base64) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + base64;

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    return img;
}

async function getOrCreateConvertedCacheDir(folderHandle) {
    if (!folderHandle) return null;
    if (!window.showDirectoryPicker) return null;

    try {
        return await folderHandle.getDirectoryHandle('_converted_images', { create: true });
    } catch (error) {
        console.warn('Unable to access _converted_images cache folder:', error);
        return null;
    }
}

async function tryLoadCachedConvertedImage(pdfFile, folderHandle) {
    const cacheDir = await getOrCreateConvertedCacheDir(folderHandle);
    if (!cacheDir) return null;

    const cacheFilename = `${pdfFile.name}.png`;
    const metaFilename = `${pdfFile.name}.meta.json`;

    try {
        const [imageHandle, metaHandle] = await Promise.all([
            cacheDir.getFileHandle(cacheFilename),
            cacheDir.getFileHandle(metaFilename)
        ]);

        const [cachedImageFile, metaFile] = await Promise.all([
            imageHandle.getFile(),
            metaHandle.getFile()
        ]);

        const meta = JSON.parse(await metaFile.text());
        const expectedSignature = buildPdfCacheSignature(pdfFile);
        if (!meta || meta.signature !== expectedSignature) {
            return null;
        }

        const imageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result || '';
                const marker = 'base64,';
                const index = String(result).indexOf(marker);
                if (index === -1) {
                    reject(new Error('Invalid cached image format'));
                    return;
                }
                resolve(String(result).slice(index + marker.length));
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read cached image'));
            reader.readAsDataURL(cachedImageFile);
        });

        const img = await loadImageFromBase64(imageBase64);
        return { img, base64: imageBase64, fromDiskCache: true };
    } catch (_error) {
        return null;
    }
}

async function saveConvertedImageToDiskCache(pdfFile, folderHandle, base64Image) {
    const cacheDir = await getOrCreateConvertedCacheDir(folderHandle);
    if (!cacheDir) return;

    try {
        const cacheFilename = `${pdfFile.name}.png`;
        const metaFilename = `${pdfFile.name}.meta.json`;
        const [imageHandle, metaHandle] = await Promise.all([
            cacheDir.getFileHandle(cacheFilename, { create: true }),
            cacheDir.getFileHandle(metaFilename, { create: true })
        ]);

        const imageWritable = await imageHandle.createWritable();
        await imageWritable.write(base64ToUint8Array(base64Image));
        await imageWritable.close();

        const metaWritable = await metaHandle.createWritable();
        await metaWritable.write(JSON.stringify({
            signature: buildPdfCacheSignature(pdfFile),
            updatedAt: new Date().toISOString()
        }));
        await metaWritable.close();
    } catch (error) {
        console.warn('Failed to write converted image cache:', error);
    }
}

async function convertPDFToImage(pdfFile) {
    const formData = new FormData();
    formData.append('pdf', pdfFile);

    const response = await fetch(`${API_BASE}/api/convert-pdf`, {
        method: 'POST',
        body: formData
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(`Failed to convert ${pdfFile.name}: ${data.error}`);
    }

    const img = await loadImageFromBase64(data.image);

    return { img, base64: data.image, fromDiskCache: false };
}

async function loadDrawingImageWithCache(filename, side) {
    const imageMap = side === 'original' ? state.originalImageMap : state.revisedImageMap;
    if (imageMap[filename]) {
        return imageMap[filename];
    }

    const fileMap = side === 'original' ? state.originalFileMap : state.revisedFileMap;
    const folderHandle = side === 'original' ? state.originalFolderHandle : state.revisedFolderHandle;
    const pdfFile = fileMap[filename];

    if (!pdfFile) {
        return null;
    }

    const cached = await tryLoadCachedConvertedImage(pdfFile, folderHandle);
    if (cached) {
        imageMap[filename] = cached.img;
        return cached.img;
    }

    const converted = await convertPDFToImage(pdfFile);
    imageMap[filename] = converted.img;
    if (converted.base64) {
        await saveConvertedImageToDiskCache(pdfFile, folderHandle, converted.base64);
    }

    return converted.img;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function extractSheetNumber(filename) {
    if (!filename) return '';

    const baseName = filename.replace(/\.pdf$/i, '').trim();
    const firstToken = baseName.split(/\s+/)[0] || '';

    return firstToken.toUpperCase();
}

const drawingNameCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
});

function compareDrawingNames(a, b) {
    const aSheet = extractSheetNumber(a);
    const bSheet = extractSheetNumber(b);

    if (aSheet && bSheet && aSheet !== bSheet) {
        return drawingNameCollator.compare(aSheet, bSheet);
    }

    return drawingNameCollator.compare(a, b);
}

function categorizeFiles() {
    state.originalFileMap = {};
    state.revisedFileMap = {};

    state.originalFiles.forEach((file) => {
        state.originalFileMap[file.name] = file;
    });

    state.revisedFiles.forEach((file) => {
        state.revisedFileMap[file.name] = file;
    });

    const originalNames = state.originalFiles.map(f => f.name);
    const revisedNames = state.revisedFiles.map(f => f.name);
    const revisedSet = new Set(revisedNames);

    state.bothFiles = originalNames.filter(f => revisedSet.has(f));

    const unmatchedOriginals = originalNames.filter(f => !revisedSet.has(f));
    const matchedRevisedByName = new Set(state.bothFiles);
    const unmatchedRevised = revisedNames.filter(f => !matchedRevisedByName.has(f));

    const revisedBySheet = new Map();
    unmatchedRevised.forEach((name) => {
        const sheetNumber = extractSheetNumber(name);
        if (!sheetNumber) return;
        if (!revisedBySheet.has(sheetNumber)) {
            revisedBySheet.set(sheetNumber, []);
        }
        revisedBySheet.get(sheetNumber).push(name);
    });

    const autoMatchedOriginals = new Set();
    const autoMatchedRevised = new Set();

    unmatchedOriginals.forEach((origName) => {
        const sheetNumber = extractSheetNumber(origName);
        const candidates = sheetNumber ? revisedBySheet.get(sheetNumber) : null;
        const revName = candidates && candidates.length > 0 ? candidates.shift() : null;

        if (!revName) return;

        autoMatchedOriginals.add(origName);
        autoMatchedRevised.add(revName);
        state.bothFiles.push(origName);
        state.revisedFileMap[origName] = state.revisedFileMap[revName];
    });

    state.originalOnlyFiles = unmatchedOriginals.filter(f => !autoMatchedOriginals.has(f));
    state.revisedOnlyFiles = unmatchedRevised.filter(f => !autoMatchedRevised.has(f));

    // Apply manual matches: move matched pairs from only-lists to both-list
    const matchedOriginals = new Set();
    const matchedRevised = new Set();
    const originalOnlySet = new Set(state.originalOnlyFiles);
    const revisedOnlySet = new Set(state.revisedOnlyFiles);

    Object.entries(state.manualMatches).forEach(([origName, revName]) => {
        if (originalOnlySet.has(origName) && revisedOnlySet.has(revName)) {
            state.bothFiles.push(origName);
            matchedOriginals.add(origName);
            matchedRevised.add(revName);
            // Map the revised file under the original's name for comparison lookups
            state.revisedFileMap[origName] = state.revisedFileMap[revName];
        }
    });

    if (matchedOriginals.size > 0) {
        state.originalOnlyFiles = state.originalOnlyFiles.filter(f => !matchedOriginals.has(f));
        state.revisedOnlyFiles = state.revisedOnlyFiles.filter(f => !matchedRevised.has(f));
    }

    state.bothFiles.sort(compareDrawingNames);
    state.originalOnlyFiles.sort(compareDrawingNames);
    state.revisedOnlyFiles.sort(compareDrawingNames);

    state.drawingCategoryMap = {};
    state.originalOnlyFiles.forEach((name) => {
        state.drawingCategoryMap[name] = 'ORIGINAL_ONLY';
    });
    state.revisedOnlyFiles.forEach((name) => {
        state.drawingCategoryMap[name] = 'REVISED_ONLY';
    });
    state.bothFiles.forEach((name) => {
        state.drawingCategoryMap[name] = 'BOTH';
    });
}

function captureDrawingListScrollPositions() {
    state.listScrollPositions['original-only-list'] = originalOnlyListEl ? originalOnlyListEl.scrollTop : 0;
    state.listScrollPositions['both-list'] = bothListEl ? bothListEl.scrollTop : 0;
    state.listScrollPositions['revised-only-list'] = revisedOnlyListEl ? revisedOnlyListEl.scrollTop : 0;
}

function restoreDrawingListScrollPositions() {
    if (originalOnlyListEl) {
        originalOnlyListEl.scrollTop = state.listScrollPositions['original-only-list'] || 0;
    }
    if (bothListEl) {
        bothListEl.scrollTop = state.listScrollPositions['both-list'] || 0;
    }
    if (revisedOnlyListEl) {
        revisedOnlyListEl.scrollTop = state.listScrollPositions['revised-only-list'] || 0;
    }
}

function showDrawingList() {
    document.getElementById('original-only-count').textContent = state.originalOnlyFiles.length;
    document.getElementById('revised-only-count').textContent = state.revisedOnlyFiles.length;
    document.getElementById('both-count').textContent = state.bothFiles.length;

    buildLetterFilterOptions();
    statusFilterSelect.value = state.statusFilter;

    refreshDrawingLists();
    
    folderSelectionView.style.display = 'none';
    drawingListView.style.display = 'flex';
}

function populateList(listId, files, withCheckbox) {
    const listEl = document.getElementById(listId);
    listEl.innerHTML = '';

    const isOriginalOnly = listId === 'original-only-list';
    const isRevisedOnly = listId === 'revised-only-list';
    const isOnlyList = isOriginalOnly || isRevisedOnly;
    const side = isOriginalOnly ? 'original' : (isRevisedOnly ? 'revised' : null);

    // In matching mode, determine if this list is the target list
    const isMatchTarget = state.matchingMode && (
        (state.matchingSourceSide === 'original' && isRevisedOnly) ||
        (state.matchingSourceSide === 'revised' && isOriginalOnly)
    );

    files.forEach(filename => {
        const itemEl = document.createElement('div');
        itemEl.className = 'drawing-item';

        if (state.viewedDrawings.has(filename)) {
            itemEl.classList.add('viewed');
        }

        if (state.flaggedDrawings.has(filename)) {
            itemEl.classList.add('flagged');
        }

        // Matching mode visual states
        if (state.matchingMode && filename === state.matchingSource) {
            itemEl.classList.add('match-source');
        }
        if (isMatchTarget) {
            itemEl.classList.add('match-target');
        }

        if (withCheckbox) {
            itemEl.classList.add('with-checkbox');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.selectedDrawings.has(filename);
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.selectedDrawings.add(filename);
                } else {
                    state.selectedDrawings.delete(filename);
                }
            });
            itemEl.appendChild(checkbox);
        }

        const span = document.createElement('span');
        span.textContent = filename;

        const handleDrawingItemActivate = () => {
            if (isMatchTarget) {
                completeMatch(filename);
                return;
            }

            openComparison(filename);
        };

        // Show matched-pair name as tooltip for manually matched drawings
        const matchedRevName = state.manualMatches[filename];
        if (matchedRevName && state.drawingCategoryMap[filename] === 'BOTH') {
            span.title = 'Matched with: ' + matchedRevName;
            itemEl.classList.add('manually-matched');
        }

        // Make the entire row clickable for a more reliable drawing selection flow.
        itemEl.addEventListener('click', handleDrawingItemActivate);

        const noteBtn = document.createElement('button');
        noteBtn.type = 'button';
        noteBtn.className = 'note-toggle';
        noteBtn.textContent = getNote(filename) ? '📝' : '🗒';
        noteBtn.title = getNote(filename) ? 'View note' : 'Add note';
        noteBtn.classList.toggle('active', Boolean(getNote(filename)));
        noteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openSingleNoteModal(filename);
        });

        const flagBtn = document.createElement('button');
        flagBtn.type = 'button';
        flagBtn.className = 'flag-toggle';
        flagBtn.textContent = state.flaggedDrawings.has(filename) ? '★' : '☆';
        flagBtn.title = 'Toggle significant-change flag';
        flagBtn.classList.toggle('active', state.flaggedDrawings.has(filename));
        flagBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDrawingFlag(filename);
        });

        itemEl.appendChild(span);
        itemEl.appendChild(noteBtn);
        itemEl.appendChild(flagBtn);

        // Add match button for original-only and revised-only lists
        if (isOnlyList) {
            const matchBtn = document.createElement('button');
            matchBtn.type = 'button';
            matchBtn.className = 'match-toggle';

            if (state.matchingMode && filename === state.matchingSource) {
                matchBtn.textContent = '✕';
                matchBtn.title = 'Cancel matching';
                matchBtn.classList.add('active');
                matchBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    cancelMatching();
                });
            } else if (!state.matchingMode) {
                matchBtn.textContent = '🔗';
                matchBtn.title = 'Match with a drawing in the other list';
                matchBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    startMatching(filename, side);
                });
            } else {
                // In matching mode but not the source — hide the button
                matchBtn.style.visibility = 'hidden';
            }

            itemEl.appendChild(matchBtn);
        }

        listEl.appendChild(itemEl);
    });
}

function drawingPassesStatusFilter(name) {
    if (state.statusFilter === 'ALL') return true;

    const hasNote = Boolean(getNote(name));
    const isFlagged = state.flaggedDrawings.has(name);

    if (state.statusFilter === 'NOTED') return hasNote;
    if (state.statusFilter === 'FLAGGED') return isFlagged;
    if (state.statusFilter === 'NOTED_OR_FLAGGED') return hasNote || isFlagged;

    return true;
}

function getFilteredFiles(files) {
    return files.filter((name) => {
        const matchesLetter = state.currentLetterFilter === 'ALL' || name.toUpperCase().startsWith(state.currentLetterFilter);
        return matchesLetter && drawingPassesStatusFilter(name);
    });
}

function buildLetterFilterOptions() {
    const letters = new Set();

    [...state.originalOnlyFiles, ...state.revisedOnlyFiles, ...state.bothFiles].forEach((name) => {
        if (!name) return;
        letters.add(name[0].toUpperCase());
    });

    const sorted = Array.from(letters).sort((a, b) => a.localeCompare(b));
    letterFilterSelect.innerHTML = '<option value="ALL">All</option>';

    sorted.forEach((letter) => {
        const opt = document.createElement('option');
        opt.value = letter;
        opt.textContent = letter;
        letterFilterSelect.appendChild(opt);
    });

    if (!sorted.includes(state.currentLetterFilter)) {
        state.currentLetterFilter = 'ALL';
    }

    letterFilterSelect.value = state.currentLetterFilter;
}

function refreshDrawingLists() {
    captureDrawingListScrollPositions();

    populateList('original-only-list', getFilteredFiles(state.originalOnlyFiles), false);
    populateList('revised-only-list', getFilteredFiles(state.revisedOnlyFiles), false);
    populateList('both-list', getFilteredFiles(state.bothFiles), true);

    restoreDrawingListScrollPositions();
    updateMatchBanner();
}

// --- Manual Matching ---

let matchBannerEl = null;

function ensureMatchBanner() {
    if (matchBannerEl) return matchBannerEl;
    matchBannerEl = document.createElement('div');
    matchBannerEl.id = 'match-banner';
    matchBannerEl.className = 'match-banner';
    matchBannerEl.style.display = 'none';

    const listContainer = document.querySelector('.list-container');
    listContainer.parentNode.insertBefore(matchBannerEl, listContainer);
    return matchBannerEl;
}

function updateMatchBanner() {
    const banner = ensureMatchBanner();
    if (!state.matchingMode) {
        banner.style.display = 'none';
        return;
    }
    const targetSide = state.matchingSourceSide === 'original' ? 'Revised Only' : 'Original Only';
    banner.innerHTML = '';
    banner.style.display = 'flex';

    const msg = document.createElement('span');
    msg.textContent = `Select a drawing from the ${targetSide} list to match with "${state.matchingSource}"`;
    banner.appendChild(msg);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-small';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => cancelMatching());
    banner.appendChild(cancelBtn);
}

function startMatching(filename, side) {
    state.matchingMode = true;
    state.matchingSource = filename;
    state.matchingSourceSide = side;
    refreshDrawingLists();
}

function cancelMatching() {
    state.matchingMode = false;
    state.matchingSource = null;
    state.matchingSourceSide = null;
    refreshDrawingLists();
}

function completeMatch(targetFilename) {
    if (!state.matchingMode || !state.matchingSource) return;

    let origName, revName;
    if (state.matchingSourceSide === 'original') {
        origName = state.matchingSource;
        revName = targetFilename;
    } else {
        origName = targetFilename;
        revName = state.matchingSource;
    }

    state.manualMatches[origName] = revName;
    saveManualMatches();

    // Exit matching mode
    state.matchingMode = false;
    state.matchingSource = null;
    state.matchingSourceSide = null;

    // Re-categorize files with the new match applied
    categorizeFiles();

    // Update counts and refresh
    document.getElementById('original-only-count').textContent = state.originalOnlyFiles.length;
    document.getElementById('revised-only-count').textContent = state.revisedOnlyFiles.length;
    document.getElementById('both-count').textContent = state.bothFiles.length;
    refreshDrawingLists();
}

function toggleDrawingFlag(filename) {
    if (state.flaggedDrawings.has(filename)) {
        state.flaggedDrawings.delete(filename);
    } else {
        state.flaggedDrawings.add(filename);
    }

    saveFlaggedData();
    refreshDrawingLists();
    updateFlagButtonState();
}

selectAllBtn.addEventListener('click', () => {
    state.bothFiles.forEach(f => state.selectedDrawings.add(f));
    refreshDrawingLists();
});

deselectAllBtn.addEventListener('click', () => {
    state.selectedDrawings.clear();
    refreshDrawingLists();
});

letterFilterSelect.addEventListener('change', () => {
    state.currentLetterFilter = letterFilterSelect.value;
    refreshDrawingLists();
});

statusFilterSelect.addEventListener('change', () => {
    state.statusFilter = statusFilterSelect.value;
    refreshDrawingLists();
});

exportSelectedBtn.addEventListener('click', async () => {
    if (state.selectedDrawings.size === 0) {
        alert('Please select at least one drawing to export');
        return;
    }
    
    const btn = exportSelectedBtn;
    const originalText = btn.textContent;
    btn.textContent = 'Exporting...';
    btn.disabled = true;
    
    try {
        const images = [];
        
        for (const filename of state.selectedDrawings) {
            const imgData = await renderOverlayToImage(filename);
            images.push(imgData);
        }
        
        const response = await fetch(`${API_BASE}/api/export-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'drawing-comparison.pdf';
            a.click();
            window.URL.revokeObjectURL(url);
            
            alert('Export completed successfully!');
        } else {
            throw new Error('Export failed');
        }
        
    } catch (error) {
        alert('Export failed: ' + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

async function renderOverlayToImage(filename) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const originalImg = state.originalImageMap[filename];
    const revisedImg = state.revisedImageMap[filename];
    
    tempCanvas.width = originalImg.width;
    tempCanvas.height = originalImg.height;
    
    const alignment = state.alignmentData[filename] || {
        originalOffsetX: 0,
        originalOffsetY: 0,
        revisedOffsetX: 0,
        revisedOffsetY: 0
    };
    
    renderOverlay(
        tempCtx,
        originalImg,
        revisedImg,
        true,
        true,
        alignment.originalOffsetX,
        alignment.originalOffsetY,
        alignment.revisedOffsetX,
        alignment.revisedOffsetY
    );
    
    const dataURL = tempCanvas.toDataURL('image/png');
    
    return {
        data: dataURL,
        width: tempCanvas.width,
        height: tempCanvas.height,
        filename: filename
    };
}

async function createBlankImage(width, height) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const img = new Image();
    img.src = tempCanvas.toDataURL('image/png');
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
    return img;
}

async function openComparison(filename) {
    captureDrawingListScrollPositions();
    state.currentDrawing = filename;
    currentDrawingName.textContent = filename + ' - Loading...';

    drawingListView.style.display = 'none';
    comparisonView.style.display = 'flex';

    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2c3e50';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Converting PDF to image...', canvas.width / 2, canvas.height / 2);

    try {
        const hasOriginal = Boolean(state.originalFileMap[filename]);
        const hasRevised = Boolean(state.revisedFileMap[filename]);

        const realOriginal = hasOriginal ? await loadDrawingImageWithCache(filename, 'original') : null;
        const realRevised = hasRevised ? await loadDrawingImageWithCache(filename, 'revised') : null;

        if (!realOriginal && !realRevised) {
            throw new Error('Drawing not found in either set.');
        }

        if (!realOriginal && realRevised) {
            state.originalImage = await createBlankImage(realRevised.width, realRevised.height);
            state.revisedImage = realRevised;
        } else if (realOriginal && !realRevised) {
            state.originalImage = realOriginal;
            state.revisedImage = await createBlankImage(realOriginal.width, realOriginal.height);
        } else {
            state.originalImage = realOriginal;
            state.revisedImage = realRevised;
        }

        const alignment = state.alignmentData[filename] || {
            originalOffsetX: 0,
            originalOffsetY: 0,
            revisedOffsetX: 0,
            revisedOffsetY: 0
        };
        state.originalAlignOffsetX = alignment.originalOffsetX;
        state.originalAlignOffsetY = alignment.originalOffsetY;
        state.revisedAlignOffsetX = alignment.revisedOffsetX;
        state.revisedAlignOffsetY = alignment.revisedOffsetY;

        state.scale = 1;
        state.offsetX = 0;
        state.offsetY = 0;
        state.showOriginal = hasOriginal;
        state.showRevised = hasRevised;
        state.needsOverlayRebuild = true;
        toggleOriginalCheckbox.checked = hasOriginal;
        toggleRevisedCheckbox.checked = hasRevised;

        state.viewedDrawings.add(filename);

        updateFlagButtonState();
        updateNoteButtonState();

        currentDrawingName.textContent = `${filename} (${formatCategoryLabel(state.drawingCategoryMap[filename] || 'UNKNOWN')})`;

        renderComparison();
        preloadNearbyDrawings(filename);
    } catch (error) {
        alert('Error loading drawing: ' + error.message);
        currentDrawingName.textContent = filename + ' - Error';
    }
}

// Preload nearby drawings in the background
async function preloadNearbyDrawings(currentFilename) {
    const currentIndex = state.bothFiles.indexOf(currentFilename);
    if (currentIndex === -1) return;
    
    // Preload next 2 drawings
    for (let i = 1; i <= 2; i++) {
        const nextIndex = currentIndex + i;
        if (nextIndex < state.bothFiles.length) {
            const nextFilename = state.bothFiles[nextIndex];
            
            // Preload in background without blocking
            if (!state.originalImageMap[nextFilename]) {
                loadDrawingImageWithCache(nextFilename, 'original').catch(() => {}); // Silently fail
            }

            if (!state.revisedImageMap[nextFilename]) {
                loadDrawingImageWithCache(nextFilename, 'revised').catch(() => {});
            }
        }
    }
}

function renderComparison() {
    if (!state.originalImage || !state.revisedImage) {
        return;
    }

    if (state.needsOverlayRebuild) {
        rebuildCompositeOverlay();
    }

    const container = canvasContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const imgWidth = state.originalImage.width;
    const imgHeight = state.originalImage.height;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const fitScale = Math.min(scaleX, scaleY) * 0.9;

    const displayScale = fitScale * state.scale;

    // Keep canvas buffer at native resolution; CSS handles zoom scaling.
    // This avoids reallocating huge buffers when zoomed in — drawImage
    // stays 1:1 and the browser's GPU handles display scaling for free.
    const nativeW = state.compositeCanvas.width;
    const nativeH = state.compositeCanvas.height;
    if (canvas.width !== nativeW || canvas.height !== nativeH) {
        canvas.width = nativeW;
        canvas.height = nativeH;
    }

    const cssW = nativeW * displayScale;
    const cssH = nativeH * displayScale;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.left = `${(containerWidth - cssW) / 2 + state.offsetX}px`;
    canvas.style.top = `${(containerHeight - cssH) / 2 + state.offsetY}px`;

    ctx.clearRect(0, 0, nativeW, nativeH);
    ctx.drawImage(state.compositeCanvas, 0, 0);

    updateZoomDisplay();
}

function queueOverlayRebuildAndRender(isAlignmentDrag = false) {
    state.needsOverlayRebuild = true;
    state.isAlignmentPreview = isAlignmentDrag;

    if (state.overlayRebuildFrame !== null) {
        return;
    }

    state.overlayRebuildFrame = window.requestAnimationFrame(() => {
        state.overlayRebuildFrame = null;
        renderComparison();
    });
}

function createTintedCanvas(image, r, g, b) {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const tintCtx = c.getContext('2d');
    tintCtx.drawImage(image, 0, 0);
    const imageData = tintCtx.getImageData(0, 0, c.width, c.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
        const luma = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        const strength = (1 - luma) * (d[i + 3] / 255);
        if (strength > MARK_THRESHOLD) {
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = Math.max(90, Math.round(strength * 255));
        } else {
            d[i + 3] = 0;
        }
    }
    tintCtx.putImageData(imageData, 0, 0);
    return c;
}

function rebuildCompositeOverlay() {
    const originalImg = state.originalImage;
    const revisedImg = state.revisedImage;

    state.needsOverlayRebuild = false;

    const targetWidth = originalImg.width;
    const targetHeight = originalImg.height;

    // During alignment drag, composite pre-tinted blue/red canvases.
    // These were rendered once in enterAlignMode(), so each frame is
    // just two GPU-accelerated drawImage calls at full resolution.
    if (state.isAlignmentPreview && state.alignOriginalTinted && state.alignRevisedTinted) {
        if (state.compositeCanvas.width !== targetWidth || state.compositeCanvas.height !== targetHeight) {
            state.compositeCanvas.width = targetWidth;
            state.compositeCanvas.height = targetHeight;
        }

        const compCtx = state.compositeCtx;
        compCtx.clearRect(0, 0, targetWidth, targetHeight);
        compCtx.fillStyle = '#ffffff';
        compCtx.fillRect(0, 0, targetWidth, targetHeight);

        compCtx.drawImage(state.alignOriginalTinted, state.originalAlignOffsetX, state.originalAlignOffsetY);
        compCtx.drawImage(state.alignRevisedTinted, state.revisedAlignOffsetX, state.revisedAlignOffsetY);
        return;
    }

    // Full pixel-level color-coded overlay for final rendering
    state.tempOriginalCanvas.width = targetWidth;
    state.tempOriginalCanvas.height = targetHeight;
    state.tempRevisedCanvas.width = targetWidth;
    state.tempRevisedCanvas.height = targetHeight;
    state.compositeCanvas.width = targetWidth;
    state.compositeCanvas.height = targetHeight;

    const ctxOriginal = state.tempOriginalCtx;
    const ctxRevised = state.tempRevisedCtx;

    ctxOriginal.clearRect(0, 0, targetWidth, targetHeight);
    ctxRevised.clearRect(0, 0, targetWidth, targetHeight);

    ctxOriginal.drawImage(originalImg, 0, 0, originalImg.width, originalImg.height,
        state.originalAlignOffsetX, state.originalAlignOffsetY, targetWidth, targetHeight);
    ctxRevised.drawImage(revisedImg, 0, 0, revisedImg.width, revisedImg.height,
        state.revisedAlignOffsetX, state.revisedAlignOffsetY, targetWidth, targetHeight);

    const originalData = ctxOriginal.getImageData(0, 0, targetWidth, targetHeight);
    const revisedData = ctxRevised.getImageData(0, 0, targetWidth, targetHeight);
    const outputData = state.compositeCtx.createImageData(targetWidth, targetHeight);

    writeOverlayPixels(
        originalData.data,
        revisedData.data,
        outputData.data,
        state.showOriginal,
        state.showRevised
    );

    state.compositeCtx.putImageData(outputData, 0, 0);
}

function writeOverlayPixels(originalPixels, revisedPixels, outputPixels, showOriginal, showRevised) {
    for (let i = 0; i < originalPixels.length; i += 4) {
        const origR = originalPixels[i];
        const origG = originalPixels[i + 1];
        const origB = originalPixels[i + 2];
        const origA = originalPixels[i + 3] / 255;

        const revR = revisedPixels[i];
        const revG = revisedPixels[i + 1];
        const revB = revisedPixels[i + 2];
        const revA = revisedPixels[i + 3] / 255;

        const origLuma = (0.2126 * origR + 0.7152 * origG + 0.0722 * origB) / 255;
        const revLuma = (0.2126 * revR + 0.7152 * revG + 0.0722 * revB) / 255;

        const origStrength = Math.max(0, (1 - origLuma) * origA);
        const revStrength = Math.max(0, (1 - revLuma) * revA);

        const origMarked = origStrength > MARK_THRESHOLD;
        const revMarked = revStrength > MARK_THRESHOLD;

        if (origMarked && revMarked) {
            if (showOriginal && showRevised) {
                const shade = Math.round(Math.min(origLuma, revLuma) * 255);
                const alpha = Math.max(origStrength, revStrength);
                outputPixels[i] = shade;
                outputPixels[i + 1] = shade;
                outputPixels[i + 2] = shade;
                outputPixels[i + 3] = Math.max(110, Math.min(255, Math.round(alpha * 255)));
            } else if (showOriginal) {
                const base = Math.round(origLuma * 255);
                outputPixels[i] = Math.round(base * 0.15);
                outputPixels[i + 1] = Math.round(base * 0.15);
                outputPixels[i + 2] = Math.min(255, Math.round(base * 0.3 + 220));
                outputPixels[i + 3] = Math.max(90, Math.min(255, Math.round(origStrength * 255)));
            } else if (showRevised) {
                const base = Math.round(revLuma * 255);
                outputPixels[i] = Math.min(255, Math.round(base * 0.3 + 220));
                outputPixels[i + 1] = Math.round(base * 0.15);
                outputPixels[i + 2] = Math.round(base * 0.15);
                outputPixels[i + 3] = Math.max(90, Math.min(255, Math.round(revStrength * 255)));
            } else {
                outputPixels[i + 3] = 0;
            }
        } else if (origMarked && !revMarked) {
            if (showOriginal) {
                const base = Math.round(origLuma * 255);
                outputPixels[i] = Math.round(base * 0.15);
                outputPixels[i + 1] = Math.round(base * 0.15);
                outputPixels[i + 2] = Math.min(255, Math.round(base * 0.3 + 220));
                outputPixels[i + 3] = Math.max(90, Math.min(255, Math.round(origStrength * 255)));
            } else {
                outputPixels[i + 3] = 0;
            }
        } else if (!origMarked && revMarked) {
            if (showRevised) {
                const base = Math.round(revLuma * 255);
                outputPixels[i] = Math.min(255, Math.round(base * 0.3 + 220));
                outputPixels[i + 1] = Math.round(base * 0.15);
                outputPixels[i + 2] = Math.round(base * 0.15);
                outputPixels[i + 3] = Math.max(90, Math.min(255, Math.round(revStrength * 255)));
            } else {
                outputPixels[i + 3] = 0;
            }
        } else {
            outputPixels[i + 3] = 0;
        }
    }
}


function updateCanvasPosition() {
    const container = canvasContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const cssW = parseFloat(canvas.style.width) || canvas.width;
    const cssH = parseFloat(canvas.style.height) || canvas.height;

    canvas.style.left = `${(containerWidth - cssW) / 2 + state.offsetX}px`;
    canvas.style.top = `${(containerHeight - cssH) / 2 + state.offsetY}px`;
}

function renderOverlay(
    context,
    originalImg,
    revisedImg,
    showOriginal,
    showRevised,
    origOffsetX,
    origOffsetY,
    revOffsetX,
    revOffsetY
) {
    const tempOriginal = document.createElement('canvas');
    const tempRevised = document.createElement('canvas');
    
    tempOriginal.width = originalImg.width;
    tempOriginal.height = originalImg.height;
    tempRevised.width = revisedImg.width;
    tempRevised.height = revisedImg.height;
    
    const ctxOriginal = tempOriginal.getContext('2d');
    const ctxRevised = tempRevised.getContext('2d');
    
    ctxOriginal.drawImage(originalImg, origOffsetX, origOffsetY);
    ctxRevised.drawImage(revisedImg, revOffsetX, revOffsetY);
    
    const originalData = ctxOriginal.getImageData(0, 0, originalImg.width, originalImg.height);
    const revisedData = ctxRevised.getImageData(0, 0, revisedImg.width, revisedImg.height);
    const outputData = context.createImageData(originalImg.width, originalImg.height);
    
    writeOverlayPixels(
        originalData.data,
        revisedData.data,
        outputData.data,
        showOriginal,
        showRevised
    );
    
    context.putImageData(outputData, 0, 0);
}

function openNotePanel() {
    if (!state.currentDrawing) return;
    noteTextarea.value = state.drawingNotes[state.currentDrawing] || '';
    notePanel.style.display = 'flex';
    noteTextarea.focus();
}

function closeNotePanel() {
    notePanel.style.display = 'none';
}

function saveCurrentNote() {
    if (!state.currentDrawing) return;
    const text = noteTextarea.value.trim();

    if (text) {
        state.drawingNotes[state.currentDrawing] = text;
    } else {
        delete state.drawingNotes[state.currentDrawing];
    }

    saveNotesData();
    updateNoteButtonState();
    refreshDrawingLists();
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getDrawingCategory(filename) {
    return state.drawingCategoryMap[filename] || 'UNKNOWN';
}

function formatCategoryLabel(category) {
    if (category === 'ORIGINAL_ONLY') return 'Original Only';
    if (category === 'REVISED_ONLY') return 'Revised Only';
    if (category === 'BOTH') return 'Both Sets';
    return 'Unknown';
}

function getFilteredNoteEntries() {
    const entries = Object.entries(state.drawingNotes)
        .filter(([, note]) => typeof note === 'string' && note.trim())
        .filter(([name]) => {
            if (state.notesFilter === 'ALL') return true;
            return getDrawingCategory(name) === state.notesFilter;
        })
        .sort(([a], [b]) => a.localeCompare(b));

    return entries;
}

function renderNotesModalList() {
    const entries = getFilteredNoteEntries();

    if (entries.length === 0) {
        notesModalBody.innerHTML = '<p>No notes in this set.</p>';
    } else {
        notesModalBody.innerHTML = entries
            .map(([name, note]) => `<div class="note-row"><div class="note-row-title">${escapeHtml(name)} <small>(${escapeHtml(formatCategoryLabel(getDrawingCategory(name)))})</small></div><div class="note-row-body">${escapeHtml(note).replaceAll('\n', '<br>')}</div></div>`)
            .join('');
    }
}

function openSingleNoteModal(filename) {
    notesModalTitle.textContent = `Note: ${filename}`;
    notesFilterGroup.style.display = 'none';
    notesFilterSelect.style.display = 'none';
    const note = getNote(filename);

    if (!note) {
        notesModalBody.innerHTML = '<p>No note saved for this drawing.</p>';
    } else {
        notesModalBody.innerHTML = `<div class="note-row"><div class="note-row-title">${escapeHtml(filename)}</div><div class="note-row-body">${escapeHtml(note).replaceAll('\n', '<br>')}</div></div>`;
    }

    notesModal.style.display = 'flex';
}

function openNotesModal() {
    notesModalTitle.textContent = 'All Drawing Notes';
    notesFilterGroup.style.display = 'inline';
    notesFilterSelect.style.display = 'inline-block';
    notesFilterSelect.value = state.notesFilter;
    renderNotesModalList();
    notesModal.style.display = 'flex';
}

function closeNotesModal() {
    notesModal.style.display = 'none';
    notesModalTitle.textContent = 'All Drawing Notes';
    notesFilterGroup.style.display = 'inline';
    notesFilterSelect.style.display = 'inline-block';
}

function exportNotesToExcelCsv() {
    const rows = [['Drawing', 'Set', 'Note']];
    const entries = getFilteredNoteEntries();

    entries.forEach(([name, note]) => {
        rows.push([name, formatCategoryLabel(getDrawingCategory(name)), note.trim()]);
    });

    const csv = rows
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing-notes.csv';
    a.click();
    URL.revokeObjectURL(url);
}

toggleOriginalCheckbox.addEventListener('change', () => {
    state.showOriginal = toggleOriginalCheckbox.checked;
    queueOverlayRebuildAndRender();
});

toggleRevisedCheckbox.addEventListener('change', () => {
    state.showRevised = toggleRevisedCheckbox.checked;
    queueOverlayRebuildAndRender();
});

resetViewBtn.addEventListener('click', () => {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;

    state.originalAlignOffsetX = 0;
    state.originalAlignOffsetY = 0;
    state.revisedAlignOffsetX = 0;
    state.revisedAlignOffsetY = 0;

    if (state.currentDrawing) {
        delete state.alignmentData[state.currentDrawing];
        saveAlignmentData();
    }

    queueOverlayRebuildAndRender();
});


function finalizeAlignmentIfActive() {
    if (!state.currentDrawing || !state.isAligning) return;

    state.alignmentData[state.currentDrawing] = {
        originalOffsetX: state.originalAlignOffsetX,
        originalOffsetY: state.originalAlignOffsetY,
        revisedOffsetX: state.revisedAlignOffsetX,
        revisedOffsetY: state.revisedAlignOffsetY
    };
    saveAlignmentData();
    state.isAlignmentPreview = false;
    queueOverlayRebuildAndRender();
    exitAlignMode();
}

function zoomAtCursor(clientX, clientY, factor) {
    if (!state.originalImage) return;

    const containerRect = canvasContainer.getBoundingClientRect();
    const mouseX = clientX - containerRect.left;
    const mouseY = clientY - containerRect.top;

    const imgWidth = state.originalImage.width;
    const imgHeight = state.originalImage.height;
    const fitScale = Math.min(
        canvasContainer.clientWidth / imgWidth,
        canvasContainer.clientHeight / imgHeight
    ) * 0.9;

    const oldScale = state.scale;
    const newScale = Math.max(0.1, Math.min(10, oldScale * factor));

    if (newScale === oldScale) {
        return;
    }

    const oldDisplayScale = fitScale * oldScale;
    const oldCanvasLeft = (canvasContainer.clientWidth - imgWidth * oldDisplayScale) / 2 + state.offsetX;
    const oldCanvasTop = (canvasContainer.clientHeight - imgHeight * oldDisplayScale) / 2 + state.offsetY;

    const imageX = (mouseX - oldCanvasLeft) / oldDisplayScale;
    const imageY = (mouseY - oldCanvasTop) / oldDisplayScale;

    state.scale = newScale;

    const newDisplayScale = fitScale * newScale;
    state.offsetX = mouseX - imageX * newDisplayScale - (canvasContainer.clientWidth - imgWidth * newDisplayScale) / 2;
    state.offsetY = mouseY - imageY * newDisplayScale - (canvasContainer.clientHeight - imgHeight * newDisplayScale) / 2;

    renderComparison();
}

canvasContainer.addEventListener('wheel', (e) => {
    if (state.isAligning && state.alignDragging) return;

    e.preventDefault();

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAtCursor(e.clientX, e.clientY, factor);
});

canvasContainer.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        e.preventDefault();
        state.isPanning = true;
        state.panStartX = e.clientX - state.offsetX;
        state.panStartY = e.clientY - state.offsetY;
        canvasContainer.classList.add('panning');
    } else if (e.button === 0 && state.isAligning) {
        state.alignDragging = !state.alignDragging;

        if (state.alignDragging) {
            setupAlignDragOverlay(e);
        } else {
            finalizeAlignmentIfActive();
        }
    }
});

canvasContainer.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        state.offsetX = e.clientX - state.panStartX;
        state.offsetY = e.clientY - state.panStartY;
        updateCanvasPosition();
    } else if (state.isAligning && state.alignDragging && state.alignDragElements) {
        // Pure CSS transform — zero canvas rendering, GPU-composited
        // Use incremental deltas so toggling Shift mid-drag doesn't cause a jump.
        const fineTuneFactor = e.shiftKey ? ALIGN_FINE_TUNE_FACTOR : 1;
        const pointerDeltaX = e.clientX - state.alignDragLastClientX;
        const pointerDeltaY = e.clientY - state.alignDragLastClientY;
        state.alignDragCssDeltaX += pointerDeltaX * fineTuneFactor;
        state.alignDragCssDeltaY += pointerDeltaY * fineTuneFactor;
        state.alignDragLastClientX = e.clientX;
        state.alignDragLastClientY = e.clientY;

        const cssDeltaX = state.alignDragCssDeltaX;
        const cssDeltaY = state.alignDragCssDeltaY;

        const movingOverlay = state.aligningVersion === 'original'
            ? state.alignDragElements.origOverlay
            : state.alignDragElements.revOverlay;
        movingOverlay.style.transform = `translate(${cssDeltaX}px, ${cssDeltaY}px)`;

        // Keep alignment offset in sync (native pixel units)
        if (state.aligningVersion === 'original') {
            state.originalAlignOffsetX = state.alignDragInitialOffsetX + cssDeltaX / state.alignDragScale;
            state.originalAlignOffsetY = state.alignDragInitialOffsetY + cssDeltaY / state.alignDragScale;
        } else {
            state.revisedAlignOffsetX = state.alignDragInitialOffsetX + cssDeltaX / state.alignDragScale;
            state.revisedAlignOffsetY = state.alignDragInitialOffsetY + cssDeltaY / state.alignDragScale;
        }
    }
});

canvasContainer.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        state.isPanning = false;
        canvasContainer.classList.remove('panning');
    }

    if (e.button === 0 && state.isAligning && !state.alignDragging) {
        state.isAlignmentPreview = false;
        queueOverlayRebuildAndRender();
    }
});

canvasContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

alignButton.addEventListener('click', () => {
    alignInstructions.style.display = 'flex';
});

toggleFlagBtn.addEventListener('click', () => {
    if (!state.currentDrawing) return;
    toggleDrawingFlag(state.currentDrawing);
});

editNoteBtn.addEventListener('click', () => {
    openNotePanel();
});

closeNotePanelBtn.addEventListener('click', () => {
    closeNotePanel();
});

saveNoteBtn.addEventListener('click', () => {
    saveCurrentNote();
});

seeAllNotesBtn.addEventListener('click', () => {
    openNotesModal();
});

closeNotesModalBtn.addEventListener('click', () => {
    closeNotesModal();
});

exportNotesBtn.addEventListener('click', () => {
    exportNotesToExcelCsv();
});

notesFilterSelect.addEventListener('change', () => {
    state.notesFilter = notesFilterSelect.value;
    if (notesModal.style.display !== 'none' && notesModalTitle.textContent === 'All Drawing Notes') {
        renderNotesModalList();
    }
});

alignOriginalBtn.addEventListener('click', () => {
    enterAlignMode('original');
});

alignRevisedBtn.addEventListener('click', () => {
    enterAlignMode('revised');
});

cancelAlignBtn.addEventListener('click', () => {
    alignInstructions.style.display = 'none';
});

function setupAlignDragOverlay(e) {
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    const imgW = state.originalImage.width;
    const imgH = state.originalImage.height;
    const fitScale = Math.min(containerWidth / imgW, containerHeight / imgH) * 0.9;
    const dScale = fitScale * state.scale;
    const cssW = imgW * dScale;
    const cssH = imgH * dScale;
    const baseLeft = (containerWidth - cssW) / 2 + state.offsetX;
    const baseTop = (containerHeight - cssH) / 2 + state.offsetY;

    // White backdrop behind the transparent tinted images
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:absolute;left:${baseLeft}px;top:${baseTop}px;width:${cssW}px;height:${cssH}px;background:white;pointer-events:none;`;

    // Original overlay
    const origOverlay = document.createElement('canvas');
    origOverlay.width = state.alignOriginalTinted.width;
    origOverlay.height = state.alignOriginalTinted.height;
    origOverlay.getContext('2d').drawImage(state.alignOriginalTinted, 0, 0);
    origOverlay.style.cssText = `position:absolute;pointer-events:none;width:${cssW}px;height:${cssH}px;left:${baseLeft + state.originalAlignOffsetX * dScale}px;top:${baseTop + state.originalAlignOffsetY * dScale}px;`;

    // Revised overlay
    const revOverlay = document.createElement('canvas');
    revOverlay.width = state.alignRevisedTinted.width;
    revOverlay.height = state.alignRevisedTinted.height;
    revOverlay.getContext('2d').drawImage(state.alignRevisedTinted, 0, 0);
    revOverlay.style.cssText = `position:absolute;pointer-events:none;width:${cssW}px;height:${cssH}px;left:${baseLeft + state.revisedAlignOffsetX * dScale}px;top:${baseTop + state.revisedAlignOffsetY * dScale}px;`;

    // Promote the moving overlay to its own GPU layer
    const movingOverlay = state.aligningVersion === 'original' ? origOverlay : revOverlay;
    movingOverlay.style.willChange = 'transform';

    canvasContainer.appendChild(backdrop);
    canvasContainer.appendChild(origOverlay);
    canvasContainer.appendChild(revOverlay);
    canvas.style.visibility = 'hidden';

    state.alignDragElements = { backdrop, origOverlay, revOverlay };
    state.alignDragScale = dScale;
    state.alignDragStartX = e.clientX;
    state.alignDragStartY = e.clientY;
    state.alignDragLastClientX = e.clientX;
    state.alignDragLastClientY = e.clientY;
    state.alignDragCssDeltaX = 0;
    state.alignDragCssDeltaY = 0;
    state.alignDragInitialOffsetX = state.aligningVersion === 'original' ? state.originalAlignOffsetX : state.revisedAlignOffsetX;
    state.alignDragInitialOffsetY = state.aligningVersion === 'original' ? state.originalAlignOffsetY : state.revisedAlignOffsetY;
}

function teardownAlignDragOverlay() {
    if (state.alignDragElements) {
        state.alignDragElements.backdrop.remove();
        state.alignDragElements.origOverlay.remove();
        state.alignDragElements.revOverlay.remove();
        state.alignDragElements = null;
    }
    canvas.style.visibility = '';
}

function enterAlignMode(version) {
    state.isAligning = true;
    state.aligningVersion = version;
    alignInstructions.style.display = 'none';
    alignActiveMessage.style.display = 'flex';
    canvasContainer.classList.add('aligning');

    // Pre-render tinted canvases once so alignment drag is just two drawImage calls
    if (state.originalImage) {
        state.alignOriginalTinted = createTintedCanvas(state.originalImage, 30, 80, 255);
    }
    if (state.revisedImage) {
        state.alignRevisedTinted = createTintedCanvas(state.revisedImage, 255, 40, 40);
    }
}

function exitAlignMode() {
    state.isAligning = false;
    state.aligningVersion = null;
    state.alignDragging = false;
    state.alignOriginalTinted = null;
    state.alignRevisedTinted = null;
    teardownAlignDragOverlay();
    alignActiveMessage.style.display = 'none';
    canvasContainer.classList.remove('aligning');
}

function updateZoomDisplay() {
    zoomLevelSpan.textContent = Math.round(state.scale * 100) + '%';
}

backToFoldersBtn.addEventListener('click', () => {
    drawingListView.style.display = 'none';
    folderSelectionView.style.display = 'flex';
});

backToListBtn.addEventListener('click', () => {
    finalizeAlignmentIfActive();
    closeNotePanel();
    comparisonView.style.display = 'none';
    drawingListView.style.display = 'flex';
    refreshDrawingLists();
    restoreDrawingListScrollPositions();
});

window.addEventListener('resize', () => {
    if (state.currentDrawing) {
        renderComparison();
    }
});
