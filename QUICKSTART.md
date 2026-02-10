# Quick Start Guide

## Installation on Raspberry Pi

1. Copy all files to your Pi (e.g., `/home/pi/pdf-comparator/`)

2. Open terminal and navigate to the directory:
```bash
cd /home/pi/pdf-comparator
```

3. Install dependencies (one-time):
```bash
npm install
```

4. Start the server:
```bash
node server.js
```

You should see: `PDF Drawing Comparator running on http://localhost:3500`

## Access from Your Computer

From any computer on your network, open a web browser and go to:
```
http://[your-pi-ip]:3500
```

To find your Pi's IP address, run this on the Pi:
```bash
hostname -I
```

## Run on Startup (Optional)

To make the server start automatically when your Pi boots:

1. Create a systemd service:
```bash
sudo nano /etc/systemd/system/pdf-comparator.service
```

2. Paste this content (update paths if different):
```
[Unit]
Description=PDF Drawing Comparator
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/pdf-comparator
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:
```bash
sudo systemctl enable pdf-comparator
sudo systemctl start pdf-comparator
```

4. Check status:
```bash
sudo systemctl status pdf-comparator
```

## Basic Workflow

1. **Load folders**: Enter paths to your original and revised drawing folders
2. **Click a drawing**: From the "Both Sets" column
3. **Review overlay**: Black = same, Blue = original only, Red = revised only
4. **Align if needed**: Use "Align Drawings" button if sheets are shifted
5. **Export**: Select drawings with checkboxes and click "Export Selected"

## Tips

- Keep the browser tab open - closing it loses alignment data for that session
- Use the same folder paths each time to persist alignments across sessions
- Network folders work fine - just use UNC paths like `\\server\share\project`
- You can zoom way in to see detail - scroll to zoom, right-click drag to pan

Enjoy!
