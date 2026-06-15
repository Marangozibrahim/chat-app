import uuid

from app.config import settings


async def _auth_headers(client, username):
    reg = await client.post(
        "/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": "pw123456"},
    )
    return {"Authorization": f"Bearer {reg.json()['access_token']}"}


async def _make_room_with_message(client, headers):
    room = await client.post("/rooms", json={"name": f"room-{uuid.uuid4()}"}, headers=headers)
    room_id = room.json()["id"]
    # Seed a message directly so edit has a target. Use the WS-less path: a row
    # created via the model isn't exposed over REST, so instead post + edit flow
    # is exercised through the edit endpoint against a freshly created message.
    return room_id


async def test_edit_rejects_oversized_body(client):
    headers = await _auth_headers(client, "longmsg")
    room_id = await _make_room_with_message(client, headers)

    # PATCH validates body length via the schema regardless of whether the
    # message exists; an over-limit body is rejected with 422 before lookup.
    too_long = "x" * (settings.max_message_chars + 1)
    resp = await client.patch(
        f"/rooms/{room_id}/messages/{uuid.uuid4()}",
        json={"body": too_long},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_edit_rejects_empty_body(client):
    headers = await _auth_headers(client, "emptymsg")
    room_id = await _make_room_with_message(client, headers)

    resp = await client.patch(
        f"/rooms/{room_id}/messages/{uuid.uuid4()}",
        json={"body": ""},
        headers=headers,
    )
    assert resp.status_code == 422
