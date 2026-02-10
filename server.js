const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 3500;
const PDF_CONVERSION_DPI = Number(process.env.PDF_CONVERSION_DPI || 200);
const MAX_CONVERSION_CACHE_ITEMS = Number(process.env.MAX_CONVERSION_CACHE_ITEMS || 120);
const conversionCache = new Map();

// Configure multer for file uploads
const upload = multer({ 
    dest: '/tmp/pdf-uploads/',
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


function addToConversionCache(cacheKey, base64Image) {
    if (conversionCache.has(cacheKey)) {
        conversionCache.delete(cacheKey);
    }

    conversionCache.set(cacheKey, base64Image);

    if (conversionCache.size > MAX_CONVERSION_CACHE_ITEMS) {
        const oldestKey = conversionCache.keys().next().value;
        conversionCache.delete(oldestKey);
    }
}

async function sha1OfFile(filePath) {
    const hash = crypto.createHash('sha1');
    const buffer = await fs.readFile(filePath);
    hash.update(buffer);
    return hash.digest('hex');
}

// Convert PDF to PNG
app.post('/api/convert-pdf', upload.single('pdf'), async (req, res) => {
    const pdfPath = req.file?.path;

    if (!pdfPath) {
        return res.status(400).json({ success: false, error: 'No PDF uploaded' });
    }

    const outputPath = path.join('/tmp', `${req.file.filename}.png`);

    try {
        const fileHash = await sha1OfFile(pdfPath);
        const cacheKey = `${fileHash}:${PDF_CONVERSION_DPI}`;

        if (conversionCache.has(cacheKey)) {
            await fs.unlink(pdfPath).catch(() => {});
            return res.json({
                success: true,
                image: conversionCache.get(cacheKey),
                cached: true,
                dpi: PDF_CONVERSION_DPI
            });
        }

        const pdftoppmArgs = [
            'pdftoppm',
            '-f', '1',
            '-singlefile',
            '-png',
            '-r', String(PDF_CONVERSION_DPI),
            '-aa', 'yes',
            '-aaVector', 'yes',
            '-thinlinemode', 'shape',
            `"${pdfPath}"`,
            `"${outputPath.replace('.png', '')}"`
        ];

        await execPromise(pdftoppmArgs.join(' '));

        const imageBuffer = await fs.readFile(outputPath);
        const imageBase64 = imageBuffer.toString('base64');

        addToConversionCache(cacheKey, imageBase64);

        await fs.unlink(pdfPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        res.json({
            success: true,
            image: imageBase64,
            cached: false,
            dpi: PDF_CONVERSION_DPI
        });

    } catch (error) {
        await fs.unlink(pdfPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        console.error('Conversion error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Check if converted images exist in folder
app.post('/api/check-converted', async (req, res) => {
    try {
        const { folderPath, filename } = req.body;
        const convertedDir = path.join(folderPath, '_converted_images');
        const imageName = filename.replace('.pdf', '.png');
        const imagePath = path.join(convertedDir, imageName);
        
        const exists = fsSync.existsSync(imagePath);
        
        res.json({ success: true, exists, path: imagePath });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get converted image
app.post('/api/get-converted-image', async (req, res) => {
    try {
        const { imagePath } = req.body;
        
        const imageBuffer = await fs.readFile(imagePath);
        
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// List PDF files in a directory
app.post('/api/list-pdfs', async (req, res) => {
    try {
        const { folderPath } = req.body;
        
        // Resolve the path - handle both Windows and Unix paths
        const resolvedPath = path.resolve(folderPath);
        
        const files = await fs.readdir(resolvedPath);
        const pdfFiles = files
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .sort();
        
        res.json({ success: true, files: pdfFiles, path: resolvedPath });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Unable to read directory. Check path and permissions.'
        });
    }
});

// Serve PDF file
app.post('/api/get-pdf', async (req, res) => {
    try {
        const { folderPath, filename } = req.body;
        const resolvedPath = path.resolve(folderPath);
        const filePath = path.join(resolvedPath, filename);
        
        // Security check - ensure the file is within the requested folder
        if (!filePath.startsWith(resolvedPath)) {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied' 
            });
        }
        
        const fileBuffer = await fs.readFile(filePath);
        res.set('Content-Type', 'application/pdf');
        res.send(fileBuffer);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Export overlay images to PDF
app.post('/api/export-pdf', async (req, res) => {
    try {
        const { images, exportPath } = req.body;
        
        const pdfDoc = await PDFDocument.create();
        
        for (const imgData of images) {
            // Remove data URL prefix
            const base64Data = imgData.data.replace(/^data:image\/png;base64,/, '');
            const imgBytes = Buffer.from(base64Data, 'base64');
            
            const image = await pdfDoc.embedPng(imgBytes);
            const page = pdfDoc.addPage([imgData.width, imgData.height]);
            
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: imgData.width,
                height: imgData.height,
            });
        }
        
        const pdfBytes = await pdfDoc.save();
        
        // If exportPath is provided, save to that location
        if (exportPath) {
            const resolvedExportPath = path.resolve(exportPath);
            await fs.writeFile(resolvedExportPath, pdfBytes);
            res.json({ success: true, message: 'PDF exported successfully', path: resolvedExportPath });
        } else {
            // Otherwise, send the PDF as a download
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', 'attachment; filename="drawing-comparison.pdf"');
            res.send(Buffer.from(pdfBytes));
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`PDF Drawing Comparator running on http://localhost:${PORT}`);
});
