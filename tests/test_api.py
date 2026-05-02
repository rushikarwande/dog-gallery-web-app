from fastapi.testclient import TestClient

from app import app, init_db


client = TestClient(app)


def setup_module() -> None:
    init_db()


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_like_lifecycle() -> None:
    payload = {
        "image_url": "https://images.dog.ceo/breeds/test/demo.jpg",
        "breed": "hound",
        "image_index": 3,
    }
    created = client.post("/like", json=payload)
    assert created.status_code == 201
    assert created.json()["liked"] is True

    likes = client.get("/likes")
    assert likes.status_code == 200
    assert any(item["image_url"] == payload["image_url"] for item in likes.json()["likes"])

    deleted = client.request("DELETE", "/like", json={"image_url": payload["image_url"]})
    assert deleted.status_code == 200
    assert deleted.json()["liked"] is False


def test_recent_viewed_keeps_latest_five() -> None:
    for breed in ["hound", "akita", "beagle", "boxer", "collie", "dalmatian"]:
        response = client.post("/viewed", json={"breed": breed})
        assert response.status_code == 201

    viewed = client.get("/viewed")
    assert viewed.status_code == 200
    items = viewed.json()["viewed"]
    assert len(items) == 5
    assert items[0]["breed"] == "dalmatian"
