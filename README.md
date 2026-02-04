# AwardShow Suite

An application that runs a local web server for hosting award show prediction parties. Guests submit their predictions for award winners, and the app displays nominees, tracks scores, and shows a live leaderboard as winners are announced.

Based on the [Taskmaster Suite](https://github.com/LocoMH/TaskmasterSuite) project by LocoMH, customized for award show parties.

## Features

- **Guest Predictions**: Guests submit predictions via their phones/tablets
- **Live Display**: Show nominees on a TV/projector for the audience
- **Winner Announcements**: Mark winners and see predictions highlighted
- **Live Leaderboard**: Animated scoreboard showing who's winning
- **Room Support**: Create separate rooms for different groups

## Quickstart

### Windows
1. Download the latest release
2. Extract files to any location
3. Run `server.exe`
4. Open the URLs shown in the popup window

### Mac/Linux
```bash
cd sources/app
pip install .
serve
```

## URLs

After starting the server, three websites are available:

- **Guest Page** (`guest.html`): Where guests submit their predictions
- **Display Screen** (`screen.html`): Shows on TV/projector for audience
- **Admin Panel** (`assistant.html`): Controls what appears on the display

## Setup

### Awards Configuration
Edit `data/awards.json` to configure:
- Award categories
- Nominees for each category
- Nominee images (place in `data/nominees/`)

### Backgrounds
Replace images in `data/Backgrounds/`:
- `bg-logo.png` - Welcome/logo screen background
- `bg-nominees.png` - Nominees display background
- `bg-leaderboard.png` - Scoreboard background

## How to Use

1. **Before the show**: Have guests visit the guest page and submit predictions
2. **Lock predictions**: Click "Lock Predictions" in admin panel when ready
3. **During the show**:
   - Select award categories to display nominees
   - Mark winners as they're announced
4. **Show leaderboard**: Display scores whenever you want

## Tech Stack

- **Backend**: Python with FastAPI
- **Database**: TinyDB (JSON files)
- **Frontend**: Vue.js + Vuetify (admin), vanilla JS (display)
- **Real-time**: WebSocket

## License

MIT License - See LICENSE.mit
