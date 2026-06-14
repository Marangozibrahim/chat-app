async def test_register_returns_token(client):
    resp = await client.post(
        "/auth/register",
        json={"username": "alice", "email": "alice@example.com", "password": "pw123456"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


async def test_register_duplicate_username(client):
    payload = {"username": "bob", "email": "bob@example.com", "password": "pw123456"}
    first = await client.post("/auth/register", json=payload)
    assert first.status_code == 201
    dup = await client.post(
        "/auth/register",
        json={"username": "bob", "email": "bob2@example.com", "password": "pw123456"},
    )
    assert dup.status_code == 400
    assert dup.json()["detail"] == "Username taken"


async def test_login_success(client):
    await client.post(
        "/auth/register",
        json={"username": "carol", "email": "carol@example.com", "password": "pw123456"},
    )
    resp = await client.post(
        "/auth/login", json={"username": "carol", "password": "pw123456"}
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


async def test_login_wrong_password(client):
    await client.post(
        "/auth/register",
        json={"username": "dave", "email": "dave@example.com", "password": "pw123456"},
    )
    resp = await client.post(
        "/auth/login", json={"username": "dave", "password": "nope"}
    )
    assert resp.status_code == 401


async def test_login_unknown_user(client):
    resp = await client.post(
        "/auth/login", json={"username": "ghost", "password": "whatever"}
    )
    assert resp.status_code == 401
