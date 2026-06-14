import uuid

from app.services.auth import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_round_trip():
    hashed = hash_password("hunter2")
    assert hashed != "hunter2"
    assert verify_password("hunter2", hashed)
    assert not verify_password("wrong", hashed)


def test_token_round_trip():
    user_id = uuid.uuid4()
    token = create_access_token(user_id)
    assert decode_token(token) == user_id


def test_decode_garbage_returns_none():
    assert decode_token("not.a.jwt") is None
