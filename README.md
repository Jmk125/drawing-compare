# PDF Drawing Comparator

A web-based tool for comparing construction drawings between original and revised PDF sets. Provides visual overlay comparison with color-coded differences and alignment capabilities.

## Features

- **Batch Comparison**: Load entire folders of PDFs and see which drawings exist in both sets
- **Visual Overlay**: 
  - Black = Common lines (in both versions)
  - Blue = Original drawing only
  - Red = Revised drawing only
- **Manual Alignment**: Click-and-drag alignment for drawings that have shifted on the sheet
- **Layer Toggling**: Show/hide original or revised layers independently
- **Zoom & Pan**: Right-click + drag to pan, scroll to zoom
- **Persistent Alignment**: Alignment data saved in browser localStorage
- **PDF Export**: Export selected overlay comparisons to a single PDF file

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm

### Setup

1. Extract the application files to a directory on your Raspberry Pi

2. **Install system dependencies** (PDF conversion tools):
```bash
chmod +x install-dependencies.sh
./install-dependencies.sh
```

3. Install Node.js dependencies:
```bash
npm install
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to:
```
http://localhost:3500
```

Or from another computer on your network:
```
http://[your-pi-ip-address]:3500
```

## How It Works

**Performance Optimization:**
The tool converts PDFs to high-resolution PNG images on first load. This one-time conversion takes a few minutes but makes all subsequent operations lightning fast.

1. Select your Original and Revised folders
2. Click "Load Drawings" - the Pi converts PDFs to images
3. Once converted, pan/zoom is instant with no lag
4. Images are stored in browser memory for the session

## Usage

### Step 1: Load Drawing Folders

1. Enter the full path to your **Original** folder (e.g., `C:\Projects\Original`)
2. Enter the full path to your **Revised** folder (e.g., `C:\Projects\Revised`)
3. Click **Load Drawings**

**Note**: PDF filenames must match exactly between folders (e.g., `A101-1.pdf` in both)

### Step 2: Review Drawing Lists

You'll see three columns:
- **Original Only**: Drawings only in the original set
- **Both Sets**: Drawings in both sets (these are clickable for comparison)
- **Revised Only**: Drawings only in the revised set

### Step 3: Compare Drawings

Click any drawing name in the "Both Sets" column to open the comparison view.

**Controls:**
- **Right-click + drag**: Pan the view
- **Scroll wheel**: Zoom in/out
- **Show Original/Revised checkboxes**: Toggle layer visibility
- **Align Drawings button**: Start alignment mode
- **Reset View**: Return to default zoom and position

### Step 4: Align Drawings (if needed)

If a drawing has shifted between versions:

1. Click **Align Drawings**
2. Select which version to move (Original or Revised)
3. Click once on the drawing to "grab" it
4. Drag to align with the other version
5. Click again to "drop" it in place

The alignment is automatically saved and will be remembered when you return to this drawing.

### Step 5: Export Comparisons

1. Return to the drawing list (click **Back to List**)
2. Use checkboxes to select drawings you want to export
3. Click **Export Selected**
4. The browser will download a PDF containing all selected overlay comparisons

## Tips

- **Large Drawing Sets**: The tool can handle hundreds or even 1000+ drawings. Loading time depends on folder size.
- **Network Paths**: Both Windows UNC paths (`\\server\share\folder`) and mapped drives work
- **Alignment Persistence**: Alignments are stored per folder-pair combination in your browser
- **Color Meanings**: 
  - If you see lots of blue/red, there are many differences
  - Mostly black means the drawings are very similar
- **Toggle Layers**: Use layer toggles to focus on just one version when needed

## Keyboard Shortcuts

- `ESC` (when aligning): Cancel alignment mode
- Browser zoom (`Ctrl +/-`): Affects UI, not drawing zoom (use scroll wheel for drawing zoom)

## Troubleshooting

**"Unable to read directory"**
- Check that folder paths are correct and accessible
- Ensure the Node.js process has permission to read the folders
- For network paths, make sure they're accessible from the Pi

**PDFs not rendering**
- Ensure PDFs are not password-protected
- Vector PDFs work best; scanned/raster PDFs will work but may be slower

**Alignment not saving**
- Check browser localStorage is enabled
- Clear browser cache if alignments seem corrupted

**Performance issues with large PDFs**
- The tool uses lower resolution during dragging for performance
- Full quality renders when you release the mouse

## Technical Details

- **Backend**: Node.js + Express (runs on Pi)
- **Frontend**: PDF.js for rendering, HTML5 Canvas for compositing
- **Storage**: Browser localStorage for alignment data (drawings not stored)
- **Port**: 3500 (configurable in server.js)

## Customization

To change the port, edit `server.js`:
```javascript
const PORT = 3500; // Change this number
```

## Support

For issues or questions, contact your IT department or the tool developer.

---

**Version**: 1.0  
**Last Updated**: February 2026
