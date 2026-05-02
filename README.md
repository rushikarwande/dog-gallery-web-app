# Advanced Dog Gallery Web App

A professional FastAPI + SQLite gallery app for the Dog CEO API. It lists dog breeds, opens shareable breed pages, paginates images, stores liked images, tracks recently viewed breeds, and provides a polished responsive UI with dark mode, loading states, retry states, toasts, and image zoom.

## Features

- Breed list fetched from `https://dog.ceo/api/breeds/list/all`
- Search, responsive grid layout, and load-more pagination
- Breed detail route at `/breed/{breed}` with image pagination
- Deep links such as `/breed/hound?img=3`
- Persistent liked images stored in SQLite
- Liked Images page at `/liked`
- Web Share API with clipboard fallback
- Recently viewed breeds persisted in SQLite, limited to latest 5
- Filters for all breeds, liked breeds, and recently viewed breeds
- Sorting A-Z, Z-A, and most liked images
- Loading skeletons, retry states, empty states, and toast notifications
- Dark mode toggle
- Image zoom modal
- FastAPI background task used to prefetch viewed breed images
- Basic endpoint tests

## Tech Stack

- Python 3.12
- FastAPI
- SQLite
- HTML, CSS, JavaScript
- Dog CEO API

## How to Run This Project

### 1. Open the project folder

```bash
cd "E:\Dog bread project"
```

If you downloaded this project from GitHub, first open the folder where you cloned or extracted it.

### 2. Create a virtual environment

```bash
python -m venv .venv
```

### 3. Activate the virtual environment

On Windows PowerShell:

```bash
.venv\Scripts\activate
```

After activation, your terminal should show `(.venv)` at the beginning of the line.

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Start the FastAPI server

```bash
uvicorn app:app --reload
```

If that command does not work, try:

```bash
python -m uvicorn app:app --reload
```

### 6. Open the app in your browser

```text
http://127.0.0.1:8000
```

The API documentation is available at:

```text
http://127.0.0.1:8000/docs
```

### 7. Stop the server

Press `Ctrl + C` in the terminal where the server is running.

### Troubleshooting

If `py` does not work on your machine, use `python` instead.

If PowerShell blocks virtual environment activation, run:

```bash
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then activate again:

```bash
.venv\Scripts\activate
```

## API Documentation

FastAPI automatically exposes interactive docs at:

```text
http://127.0.0.1:8000/docs
```

### Custom Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/breeds` | Fetches Dog CEO breeds and enriches them with like/recent metadata |
| `GET` | `/api/breed/{breed}/images?offset=0&limit=10` | Returns paginated breed images |
| `POST` | `/like` | Likes an image |
| `DELETE` | `/like` | Unlikes an image |
| `GET` | `/likes` | Fetches all liked images |
| `POST` | `/viewed` | Adds a breed to recent views |
| `GET` | `/viewed` | Returns last 5 viewed breeds |
| `GET` | `/health` | Health check |

### Example Like Payload

```json
{
  "image_url": "https://images.dog.ceo/breeds/hound-afghan/n02088094_1003.jpg",
  "breed": "hound/afghan",
  "image_index": 3
}
```

## Run Tests

```bash
pytest
```

## How to Deliver the Assignment

Submit these items:

- GitHub repository link containing this complete project
- Deployed live app link
- README file with setup steps, features, and API details

### Recommended GitHub Steps

```bash
git add .
git commit -m "Build advanced dog gallery web app"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with your repository URL.

### Recommended Deployment

You can deploy this project on Render, Railway, Fly.io, or any Python hosting platform.

For Render:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Runtime: Python 3

After deployment, test these links:

- Home page: `/`
- Liked page: `/liked`
- Breed detail page: `/breed/hound`
- API docs: `/docs`

## Deployment Notes

This app can be deployed to Render, Railway, Fly.io, or any Python host that supports ASGI apps.

Suggested start command:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

SQLite data is stored in `data/gallery.db`. For long-term production persistence, configure a persistent disk or switch to PostgreSQL.
