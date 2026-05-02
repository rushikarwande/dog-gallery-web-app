from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import urllib.error
import urllib.request
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "gallery.db"
DOG_API = "https://dog.ceo/api"
CACHE_TTL_SECONDS = 60 * 30
FALLBACK_BREEDS = {
    "akita": [],
    "beagle": [],
    "boxer": [],
    "collie": ["border"],
    "dalmatian": [],
    "germanshepherd": [],
    "hound": ["afghan", "basset"],
    "husky": [],
    "labrador": [],
    "poodle": ["standard", "toy"],
    "retriever": ["golden"],
    "samoyed": [],
    "shiba": [],
}
FALLBACK_IMAGES = {
    "hound/afghan": [
        "https://images.dog.ceo/breeds/hound-afghan/n02088094_1003.jpg",
        "https://images.dog.ceo/breeds/hound-afghan/n02088094_1007.jpg",
        "https://images.dog.ceo/breeds/hound-afghan/n02088094_1023.jpg",
    ],
    "retriever/golden": [
        "https://images.dog.ceo/breeds/retriever-golden/n02099601_100.jpg",
        "https://images.dog.ceo/breeds/retriever-golden/n02099601_1024.jpg",
        "https://images.dog.ceo/breeds/retriever-golden/n02099601_1100.jpg",
    ],
    "beagle": [
        "https://images.dog.ceo/breeds/beagle/n02088364_11136.jpg",
        "https://images.dog.ceo/breeds/beagle/n02088364_11231.jpg",
        "https://images.dog.ceo/breeds/beagle/n02088364_12131.jpg",
    ],
    "akita": [
        "https://images.dog.ceo/breeds/akita/Akita_Inu_dog.jpg",
        "https://images.dog.ceo/breeds/akita/512px-Ainu-Dog.jpg",
    ],
}

class LikePayload(BaseModel):
    image_url: str = Field(..., min_length=8)
    breed: str = Field(..., min_length=1)
    image_index: int | None = Field(default=None, ge=0)


class ViewedPayload(BaseModel):
    breed: str = Field(..., min_length=1)


breed_cache: dict[str, Any] = {"timestamp": 0.0, "items": []}
image_cache: dict[str, dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Advanced Dog Gallery",
    description="Dog CEO powered gallery with persistent likes and recent breed views.",
    version="1.0.0",
    lifespan=lifespan,
)


@contextmanager
def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS likes (
                image_url TEXT PRIMARY KEY,
                breed TEXT NOT NULL,
                image_index INTEGER,
                created_at REAL NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS viewed_breeds (
                breed TEXT PRIMARY KEY,
                viewed_at REAL NOT NULL
            )
            """
        )


def request_json(url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Dog CEO API request failed: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Dog CEO API returned invalid JSON") from exc


def breed_label(breed: str) -> str:
    parts = breed.split("/")
    if len(parts) == 2:
        return f"{parts[1].replace('-', ' ').title()} {parts[0].replace('-', ' ').title()}"
    return breed.replace("-", " ").title()


def flatten_breeds(payload: dict[str, list[str]]) -> list[dict[str, str]]:
    breeds: list[dict[str, str]] = []
    for breed, sub_breeds in payload.items():
        if sub_breeds:
            for sub_breed in sub_breeds:
                value = f"{breed}/{sub_breed}"
                breeds.append({"name": value, "label": breed_label(value), "group": breed})
        else:
            breeds.append({"name": breed, "label": breed_label(breed), "group": breed})
    return sorted(breeds, key=lambda item: item["label"])


def liked_counts() -> dict[str, int]:
    with db() as connection:
        rows = connection.execute(
            "SELECT breed, COUNT(*) AS total FROM likes GROUP BY breed"
        ).fetchall()
    return {row["breed"]: row["total"] for row in rows}


async def get_breeds() -> list[dict[str, Any]]:
    now = time.time()
    if breed_cache["items"] and now - breed_cache["timestamp"] < CACHE_TTL_SECONDS:
        breeds = breed_cache["items"]
    else:
        try:
            data = await asyncio.to_thread(request_json, f"{DOG_API}/breeds/list/all")
            if data.get("status") != "success":
                raise HTTPException(status_code=502, detail="Dog CEO API did not return breeds")
            breeds = flatten_breeds(data["message"])
        except HTTPException:
            breeds = flatten_breeds(FALLBACK_BREEDS)
        breed_cache.update({"timestamp": now, "items": breeds})

    counts = liked_counts()
    recent = {item["breed"] for item in get_recent_views()}
    return [
        {
            **breed,
            "liked_count": counts.get(breed["name"], 0),
            "recently_viewed": breed["name"] in recent,
        }
        for breed in breeds
    ]


async def get_images_for_breed(breed: str) -> list[str]:
    now = time.time()
    cached = image_cache.get(breed)
    if cached and now - cached["timestamp"] < CACHE_TTL_SECONDS:
        return cached["items"]

    try:
        data = await asyncio.to_thread(request_json, f"{DOG_API}/breed/{breed}/images")
        if data.get("status") != "success":
            raise HTTPException(status_code=404, detail=f"No images found for {breed_label(breed)}")
        images = data.get("message", [])
    except HTTPException:
        images = FALLBACK_IMAGES.get(breed, FALLBACK_IMAGES["retriever/golden"])
    image_cache[breed] = {"timestamp": now, "items": images}
    return images


def get_recent_views() -> list[dict[str, Any]]:
    with db() as connection:
        rows = connection.execute(
            "SELECT breed, viewed_at FROM viewed_breeds ORDER BY viewed_at DESC LIMIT 5"
        ).fetchall()
    return [
        {"breed": row["breed"], "label": breed_label(row["breed"]), "viewed_at": row["viewed_at"]}
        for row in rows
    ]


async def prefetch_breed_images(breed: str) -> None:
    try:
        await get_images_for_breed(breed)
    except HTTPException:
        pass


@app.get("/api/breeds")
async def api_breeds() -> dict[str, Any]:
    return {"breeds": await get_breeds()}


@app.get("/api/breed/{breed:path}/images")
async def api_breed_images(
    breed: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=50),
) -> dict[str, Any]:
    images = await get_images_for_breed(breed)
    selected = images[offset : offset + limit]
    with db() as connection:
        liked_rows = connection.execute("SELECT image_url FROM likes").fetchall()
    liked = {row["image_url"] for row in liked_rows}
    return {
        "breed": breed,
        "label": breed_label(breed),
        "offset": offset,
        "limit": limit,
        "total": len(images),
        "images": [
            {
                "url": url,
                "index": offset + index,
                "liked": url in liked,
                "share_url": f"/breed/{breed}?img={offset + index}",
            }
            for index, url in enumerate(selected)
        ],
    }


@app.post("/like", status_code=201)
async def like_image(payload: LikePayload) -> dict[str, Any]:
    with db() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO likes (image_url, breed, image_index, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (payload.image_url, payload.breed, payload.image_index, time.time()),
        )
    return {"liked": True, "image_url": payload.image_url}


@app.delete("/like")
async def unlike_image(request: Request, image_url: str | None = None) -> dict[str, Any]:
    if image_url is None:
        try:
            body = await request.json()
            image_url = body.get("image_url")
        except json.JSONDecodeError:
            image_url = None
    if not image_url:
        raise HTTPException(status_code=422, detail="image_url is required")

    with db() as connection:
        connection.execute("DELETE FROM likes WHERE image_url = ?", (image_url,))
    return {"liked": False, "image_url": image_url}


@app.get("/likes")
async def likes() -> dict[str, Any]:
    with db() as connection:
        rows = connection.execute(
            "SELECT image_url, breed, image_index, created_at FROM likes ORDER BY created_at DESC"
        ).fetchall()
    return {
        "likes": [
            {
                "image_url": row["image_url"],
                "breed": row["breed"],
                "label": breed_label(row["breed"]),
                "image_index": row["image_index"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@app.post("/viewed", status_code=201)
async def add_viewed(payload: ViewedPayload, background_tasks: BackgroundTasks) -> dict[str, Any]:
    with db() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO viewed_breeds (breed, viewed_at) VALUES (?, ?)",
            (payload.breed, time.time()),
        )
        old_rows = connection.execute(
            """
            SELECT breed FROM viewed_breeds
            WHERE breed NOT IN (
                SELECT breed FROM viewed_breeds ORDER BY viewed_at DESC LIMIT 5
            )
            """
        ).fetchall()
        for row in old_rows:
            connection.execute("DELETE FROM viewed_breeds WHERE breed = ?", (row["breed"],))

    background_tasks.add_task(prefetch_breed_images, payload.breed)
    return {"viewed": get_recent_views()}


@app.get("/viewed")
async def viewed() -> dict[str, Any]:
    return {"viewed": get_recent_views()}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
@app.get("/liked")
@app.get("/breed/{breed:path}")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
