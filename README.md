# CivicFlow PBA

**AI-powered civic complaint prioritization and video analysis.**

Citizens submit complaints about civic problems (potholes, flooding, broken streetlights...).
CivicFlow scores each one from 0 to 100 using a documented formula, so the most urgent problems
rise to the top. Officers track complaints through *Pending → In progress → Resolved*, and can
upload incident videos that are analysed for real motion and people (see the honest limits below).

This is a brand-new project. It does not read, modify or depend on any older project.

## What you need installed

| Tool | Version | Check with |
|------|---------|-----------|
| Python | 3.11 or newer (built and tested on 3.13) | `python --version` |
| Node.js | 20 or newer (built and tested on 22) | `node --version` |

## Easiest way (Windows): double-click `RUN-CIVICFLOW.bat`

This runs the whole app (website and backend) in **one window** at http://127.0.0.1:8000. The website
is already built in `frontend\dist`. Keep the window open while you use the app; close it to stop.
It needs only Python and the backend packages (`pip install -r backend\requirements.txt`).
After you change website code, run `npm run build` inside `frontend` to rebuild it.

## Developer mode (Windows): double-click `start-civicflow.bat`

Open the `CivicFlow-PBA-New` folder and double-click **`start-civicflow.bat`**. It checks the
packages (installing them on the first run), opens two windows (backend and website) and then
your browser at http://localhost:5173. Keep the two windows open while you use the app; close
them to stop it. The manual steps below do the same thing by hand.

## Start the app by hand (Windows PowerShell)

You need **two PowerShell windows** open at the same time: one for the backend, one for the frontend.

### Window 1: backend (the server and database)

```powershell
cd CivicFlow-PBA-New\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If PowerShell says *"running scripts is disabled"*, run this once in that window and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Leave this window running. When it works you will see `Uvicorn running on http://127.0.0.1:8000`.

### Window 2: frontend (the website)

```powershell
cd CivicFlow-PBA-New\frontend
npm install
npm run dev
```

### Open it

| What | Address |
|------|---------|
| The website | http://localhost:5173 |
| API documentation (try every endpoint) | http://localhost:8000/docs |

To stop the app, press `Ctrl + C` in each window. Your data is kept: the database is the file
`backend\civicflow.db`, created automatically on first start.

## Run the tests

```powershell
# Window 1 (backend folder, virtual environment active)
pip install -r requirements-dev.txt
python -m pytest

# Window 2 (frontend folder)
npm test
```

## What you can do

- **Dashboard**: totals, priority distribution, categories and recent complaints, all read from the database.
- **Submit complaint**: validated form with a live priority preview and an optional photo.
- **Complaints**: search, filter by status / priority / category, sort, page through results.
- **Complaint details**: full score breakdown, photo, status history, status updates with notes, linked videos.
- **Video review**: upload a video, watch real upload and analysis progress, read the results.

## How the priority score works

Score range: **0 to 100**. The code is in `backend/app/services/priority.py` and has its own tests.

| Factor | Max points | Rule |
|--------|-----------:|------|
| Severity (1-5) | 30 | `30 x severity / 5` |
| People affected | 20 | log scale: 0 → 0, 100 → 10, 10,000 or more → 20 |
| Previous complaints | 10 | 2 points each, up to 5 |
| Near a school | 8 | 8 if yes |
| Near a hospital | 10 | 10 if yes |
| Traffic level | 10 | low 0, medium 5, high 10 |
| Location type | 12 | main road 12, public space 9, commercial 8, industrial 7, residential 6, other 4, rural 3 |

| Score | Level |
|------:|-------|
| 0 - 24.99 | Low |
| 25 - 49.99 | Medium |
| 50 - 74.99 | High |
| 75 - 100 | Critical |

Rules for bad input: severity is required and is never guessed. Optional fields that are missing
use a neutral default (shown as "default used" in the breakdown). Invalid values are rejected with a
clear message. Every result has the same shape (`score`, `level`, `max_score`, `breakdown`), and the
breakdown points always add up exactly to the score.

## Video analysis: what is real and what is not

The backend uses OpenCV to measure, from the actual video:

- **Metadata**: duration, frame rate, resolution, frame count.
- **Motion activity**: how much of the picture changes between sampled frames, a timeline, and motion events with start and end times.
- **People presence**: OpenCV's built-in HOG pedestrian detector, run on up to 24 evenly spaced frames.

Limits, stated plainly:

- The HOG detector is a classical method. It can miss people and can raise false alarms. Counts are "detected", not exact headcounts.
- Motion also reacts to camera shake and lighting changes.
- **Behaviour recognition (fights, accidents, theft...) is not performed.** That needs a trained deep-learning model, which is not bundled. The app says so on screen instead of inventing results.
- Video analysis does **not** change a complaint's priority score. It is shown alongside it.
- OpenCV is pinned below version 5 (`<5`) because OpenCV 5 removed the HOG detector. With version 5 the app would report "people detection unavailable" instead of guessing.

Supported video types: `.mp4 .mov .avi .mkv .webm`, up to 100 MB. Photos: `.jpg .png .webp`, up to 5 MB.

## Project layout

```
CivicFlow-PBA-New/
├── README.md
├── start-civicflow.bat           double-click to start everything (Windows)
├── .gitignore
├── backend/
│   ├── requirements.txt          packages the app needs
│   ├── requirements-dev.txt      plus test tools
│   ├── .env.example              optional settings (copy to .env to change them)
│   ├── pytest.ini
│   ├── app/
│   │   ├── main.py               creates the FastAPI app, CORS, routes
│   │   ├── api/                  complaints.py, videos.py, meta.py (dashboard, options), deps.py
│   │   ├── core/                 config.py (settings), enums.py (fixed choices and labels)
│   │   ├── db/                   base.py (engine), models.py (tables), repository.py (all queries)
│   │   ├── schemas/              Pydantic request/response models
│   │   └── services/             priority.py, video_analysis.py, storage.py
│   └── tests/                    test_priority.py, test_api.py, test_video.py
└── frontend/
    ├── package.json
    ├── .env.example
    ├── index.html, vite.config.js
    └── src/
        ├── App.jsx, main.jsx, api.js, styles.css, utils.js, validation.js, hooks.js
        ├── components/           Layout, ui (badges, priority ruler...), VideoResult, OptionsContext
        ├── pages/                Dashboard, SubmitComplaint, Complaints, ComplaintDetail, VideoReview
        └── __tests__/
```

## Settings

Defaults work without any setup. To change them, copy `backend\.env.example` to `backend\.env`
and edit it. Settings are read from environment variables that start with `CIVICFLOW_`.
There are no passwords or API keys anywhere in this project.

The website talks to the backend through its own address (`/api/...`) and the Vite dev server
forwards those calls to `http://127.0.0.1:8000`. This avoids browser cross-site rules and
`localhost` name problems. If the backend runs on a different port, start the website with
the environment variable `VITE_PROXY_TARGET` set to its address
(PowerShell: `$env:VITE_PROXY_TARGET="http://127.0.0.1:8001"; npm run dev`).

Switching to another database later (for example PostgreSQL) means changing `CIVICFLOW_DATABASE_URL`
and installing that database's Python driver. All queries live in `backend/app/db/repository.py`.

## If something does not work

| What you see | What it means / what to do |
|---|---|
| Website says "Cannot reach the CivicFlow backend" | The backend window is closed or crashed. Start it again (it must say `Application startup complete`). |
| `http://localhost:8000/` shows JSON, `/docs` shows the API page | The backend is fine. Use http://localhost:5173 for the website. |
| `No module named 'app'` | You started the backend from the wrong folder. It must be run inside `CivicFlow-PBA-New\backend`. |
| `Address already in use` / port 8000 busy | Another program uses port 8000. Start the backend with `--port 8001` and the website with `VITE_PROXY_TARGET` (see Settings). |
| `python -m venv` seems stuck | It can take a minute or two on Windows. Wait and do not press Ctrl+C. |
| PowerShell blocks `Activate.ps1` | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first. |

## Known limitations

- There is no login. Anyone who can open the site can change complaint statuses. Add authentication before any real public use.
- Video analysis runs inside the server process. Large videos are fine for a single user, but a busy production system would need a proper job queue.
- Uploaded files are stored on local disk (`backend\uploads`).
- Tables are created automatically on start. There is no migration tool yet, so a future change to the table layout needs a migration step.
