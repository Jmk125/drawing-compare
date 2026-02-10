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
    selectedDrawings: new Set()
};

// DOM Elements
const folderSelectionView = document.getElementById('folder-selection');
const drawingListView = document.getElementById('drawing-list');
const comparisonView = document.getElementById('comparison-view');
const originalFolderInput = document.getElementById('original-folder');
const revisedFolderInput = document.getElementById('revised-folder');
const originalCountEl = document.getElementById('original-count');
const revisedCountEl = document.getElementById('revised-count');
const loadFoldersBtn = document.getElementById('load-folders');
const loadingMessage = document.getElementById('loading-message');
const errorMessage = document.getElementById('error-message');
const backToFoldersBtn = document.getElementById('back-to-folders');
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
const cancelAlignBtn = document.getElementById('cancel-align');
const alignActiveMessage = document.getElementById('align-active-message');
const selectAllBtn = document.getElementById('select-all');
const deselectAllBtn = document.getElementById('deselect-all');
const exportSelectedBtn = document.getElementById('export-selected');

state.canvas = canvas;
state.ctx = ctx;

originalFolderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    state.originalFiles = files;
    state.originalFileMap = {};
    files.forEach(file => {
        state.originalFileMap[file.name] = file;
    });
    originalCountEl.textContent = `${files.length} PDF files selected`;
});

revisedFolderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    state.revisedFiles = files;
    state.revisedFileMap = {};
    files.forEach(file => {
        state.revisedFileMap[file.name] = file;
    });
    revisedCountEl.textContent = `${files.length} PDF files selected`;
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

loadFoldersBtn.addEventListener('click', async () => {
    if (state.originalFiles.length === 0 || state.revisedFiles.length === 0) {
        showError('Please select both original and revised folders');
        return;
    }
    
    loadingMessage.style.display = 'block';
    loadingMessage.innerHTML = '<p>Loading drawings...</p>';
    errorMessage.style.display = 'none';
    
    try {
        categorizeFiles();
        loadAlignmentData();
        showDrawingList();
        
    } catch (error) {
        showError(error.message);
    } finally {
        loadingMessage.style.display = 'none';
    }
});

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
    
    const img = new Image();
    img.src = 'data:image/png;base64,' + data.image;
    
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });
    
    return img;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function categorizeFiles() {
    const originalNames = state.originalFiles.map(f => f.name);
    const revisedNames = state.revisedFiles.map(f => f.name);
    const originalSet = new Set(originalNames);
    const revisedSet = new Set(revisedNames);
    
    state.originalOnlyFiles = originalNames.filter(f => !revisedSet.has(f));
    state.revisedOnlyFiles = revisedNames.filter(f => !originalSet.has(f));
    state.bothFiles = originalNames.filter(f => revisedSet.has(f));
}

function showDrawingList() {
    document.getElementById('original-only-count').textContent = state.originalOnlyFiles.length;
    document.getElementById('revised-only-count').textContent = state.revisedOnlyFiles.length;
    document.getElementById('both-count').textContent = state.bothFiles.length;
    
    populateList('original-only-list', state.originalOnlyFiles, false);
    populateList('revised-only-list', state.revisedOnlyFiles, false);
    populateList('both-list', state.bothFiles, true);
    
    folderSelectionView.style.display = 'none';
    drawingListView.style.display = 'flex';
}

function populateList(listId, files, withCheckbox) {
    const listEl = document.getElementById(listId);
    listEl.innerHTML = '';
    
    files.forEach(filename => {
        const itemEl = document.createElement('div');
        itemEl.className = 'drawing-item';
        
        if (withCheckbox) {
            itemEl.classList.add('with-checkbox');
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.selectedDrawings.has(filename);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    state.selectedDrawings.add(filename);
                } else {
                    state.selectedDrawings.delete(filename);
                }
            });
            
            const span = document.createElement('span');
            span.textContent = filename;
            span.addEventListener('click', () => openComparison(filename));
            
            itemEl.appendChild(checkbox);
            itemEl.appendChild(span);
        } else {
            itemEl.textContent = filename;
        }
        
        listEl.appendChild(itemEl);
    });
}

selectAllBtn.addEventListener('click', () => {
    state.bothFiles.forEach(f => state.selectedDrawings.add(f));
    populateList('both-list', state.bothFiles, true);
});

deselectAllBtn.addEventListener('click', () => {
    state.selectedDrawings.clear();
    populateList('both-list', state.bothFiles, true);
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

async function openComparison(filename) {
    state.currentDrawing = filename;
    currentDrawingName.textContent = filename + ' - Loading...';
    
    drawingListView.style.display = 'none';
    comparisonView.style.display = 'flex';
    
    // Show loading state
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2c3e50';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Converting PDF to image...', canvas.width / 2, canvas.height / 2);
    
    try {
        // Check if already converted
        if (!state.originalImageMap[filename]) {
            state.originalImageMap[filename] = await convertPDFToImage(state.originalFileMap[filename]);
        }
        
        if (!state.revisedImageMap[filename]) {
            state.revisedImageMap[filename] = await convertPDFToImage(state.revisedFileMap[filename]);
        }
        
        state.originalImage = state.originalImageMap[filename];
        state.revisedImage = state.revisedImageMap[filename];
        
        if (!state.originalImage || !state.revisedImage) {
            alert('Images not loaded');
            return;
        }
        
        // Load alignment data for this drawing
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
        
        // Reset view state
        state.scale = 1;
        state.offsetX = 0;
        state.offsetY = 0;
        state.showOriginal = true;
        state.showRevised = true;
        toggleOriginalCheckbox.checked = true;
        toggleRevisedCheckbox.checked = true;
        
        currentDrawingName.textContent = filename;
        
        renderComparison();
        
        // Preload next 2 drawings in background for smoother workflow
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
                convertPDFToImage(state.originalFileMap[nextFilename])
                    .then(img => state.originalImageMap[nextFilename] = img)
                    .catch(() => {}); // Silently fail
            }
            
            if (!state.revisedImageMap[nextFilename]) {
                convertPDFToImage(state.revisedFileMap[nextFilename])
                    .then(img => state.revisedImageMap[nextFilename] = img)
                    .catch(() => {});
            }
        }
    }
}

function renderComparison() {
    const container = canvasContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const imgWidth = state.originalImage.width;
    const imgHeight = state.originalImage.height;
    
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const fitScale = Math.min(scaleX, scaleY) * 0.9;
    
    const displayScale = fitScale * state.scale;
    
    canvas.width = imgWidth * displayScale;
    canvas.height = imgHeight * displayScale;
    
    canvas.style.left = `${(containerWidth - canvas.width) / 2 + state.offsetX}px`;
    canvas.style.top = `${(containerHeight - canvas.height) / 2 + state.offsetY}px`;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(displayScale, displayScale);
    
    renderOverlay(
        ctx,
        state.originalImage,
        state.revisedImage,
        state.showOriginal,
        state.showRevised,
        state.originalAlignOffsetX,
        state.originalAlignOffsetY,
        state.revisedAlignOffsetX,
        state.revisedAlignOffsetY
    );
    
    ctx.restore();
    
    updateZoomDisplay();
}

function updateCanvasPosition() {
    const container = canvasContainer;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    canvas.style.left = `${(containerWidth - canvas.width) / 2 + state.offsetX}px`;
    canvas.style.top = `${(containerHeight - canvas.height) / 2 + state.offsetY}px`;
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
    
    for (let i = 0; i < originalData.data.length; i += 4) {
        const origR = originalData.data[i];
        const origG = originalData.data[i + 1];
        const origB = originalData.data[i + 2];
        const origA = originalData.data[i + 3];
        
        const revR = revisedData.data[i];
        const revG = revisedData.data[i + 1];
        const revB = revisedData.data[i + 2];
        const revA = revisedData.data[i + 3];
        
        const origMarked = origA > 10 && (origR < 250 || origG < 250 || origB < 250);
        const revMarked = revA > 10 && (revR < 250 || revG < 250 || revB < 250);
        
        if (origMarked && revMarked) {
            outputData.data[i] = 0;
            outputData.data[i + 1] = 0;
            outputData.data[i + 2] = 0;
            outputData.data[i + 3] = 255;
        } else if (origMarked && !revMarked) {
            if (showOriginal) {
                outputData.data[i] = 0;
                outputData.data[i + 1] = 0;
                outputData.data[i + 2] = 255;
                outputData.data[i + 3] = 255;
            } else {
                outputData.data[i + 3] = 0;
            }
        } else if (!origMarked && revMarked) {
            if (showRevised) {
                outputData.data[i] = 255;
                outputData.data[i + 1] = 0;
                outputData.data[i + 2] = 0;
                outputData.data[i + 3] = 255;
            } else {
                outputData.data[i + 3] = 0;
            }
        } else {
            outputData.data[i + 3] = 0;
        }
    }
    
    context.putImageData(outputData, 0, 0);
}

toggleOriginalCheckbox.addEventListener('change', () => {
    state.showOriginal = toggleOriginalCheckbox.checked;
    renderComparison();
});

toggleRevisedCheckbox.addEventListener('change', () => {
    state.showRevised = toggleRevisedCheckbox.checked;
    renderComparison();
});

resetViewBtn.addEventListener('click', () => {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    renderComparison();
});

canvasContainer.addEventListener('wheel', (e) => {
    if (state.isAligning && state.alignDragging) return;
    
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.scale *= delta;
    state.scale = Math.max(0.1, Math.min(10, state.scale));
    
    renderComparison();
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
            const rect = canvasContainer.getBoundingClientRect();
            state.alignDragStartX = e.clientX - rect.left - (rect.width - canvas.width) / 2;
            state.alignDragStartY = e.clientY - rect.top - (rect.height - canvas.height) / 2;
        } else {
            state.alignmentData[state.currentDrawing] = {
                originalOffsetX: state.originalAlignOffsetX,
                originalOffsetY: state.originalAlignOffsetY,
                revisedOffsetX: state.revisedAlignOffsetX,
                revisedOffsetY: state.revisedAlignOffsetY
            };
            saveAlignmentData();
            exitAlignMode();
        }
    }
});

canvasContainer.addEventListener('mousemove', (e) => {
    if (state.isPanning) {
        state.offsetX = e.clientX - state.panStartX;
        state.offsetY = e.clientY - state.panStartY;
        updateCanvasPosition();
    } else if (state.isAligning && state.alignDragging) {
        const rect = canvasContainer.getBoundingClientRect();
        const currentX = e.clientX - rect.left - (rect.width - canvas.width) / 2;
        const currentY = e.clientY - rect.top - (rect.height - canvas.height) / 2;
        
        const deltaX = (currentX - state.alignDragStartX) / state.scale;
        const deltaY = (currentY - state.alignDragStartY) / state.scale;
        
        if (state.aligningVersion === 'original') {
            state.originalAlignOffsetX += deltaX;
            state.originalAlignOffsetY += deltaY;
        } else {
            state.revisedAlignOffsetX += deltaX;
            state.revisedAlignOffsetY += deltaY;
        }
        
        state.alignDragStartX = currentX;
        state.alignDragStartY = currentY;
        
        renderComparison();
    }
});

canvasContainer.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        state.isPanning = false;
        canvasContainer.classList.remove('panning');
    }
});

canvasContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

alignButton.addEventListener('click', () => {
    alignInstructions.style.display = 'flex';
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

function enterAlignMode(version) {
    state.isAligning = true;
    state.aligningVersion = version;
    alignInstructions.style.display = 'none';
    alignActiveMessage.style.display = 'flex';
    canvasContainer.classList.add('aligning');
}

function exitAlignMode() {
    state.isAligning = false;
    state.aligningVersion = null;
    state.alignDragging = false;
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
    comparisonView.style.display = 'none';
    drawingListView.style.display = 'flex';
});

window.addEventListener('resize', () => {
    if (state.currentDrawing) {
        renderComparison();
    }
});
