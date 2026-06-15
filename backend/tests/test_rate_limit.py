import uuid


async def test_register_rate_limited(client, enable_rate_limit, redis_client):
    """The register route allows 5/minute per IP; the 6th attempt is blocked."""
    # redis_client fixture flushed the limiter's storage, so the window is fresh.
    statuses = []
    for _ in range(7):
        resp = await client.post(
            "/auth/register",
            json={
                "username": f"u{uuid.uuid4().hex[:10]}",
                "email": f"{uuid.uuid4().hex[:8]}@example.com",
                "password": "pw123456",
            },
        )
        statuses.append(resp.status_code)

    # The limit eventually trips, and no more than 5 registrations get through.
    assert 429 in statuses
    assert statuses.count(201) <= 5
