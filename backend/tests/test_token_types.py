import uuid

from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    decode_token,
)


def test_access_token_not_valid_as_refresh():
    uid = uuid.uuid4()
    access = create_access_token(uid)
    assert decode_token(access) == uid
    assert decode_refresh_token(access) is None


def test_refresh_token_not_valid_as_access():
    uid = uuid.uuid4()
    refresh = create_refresh_token(uid)
    assert decode_refresh_token(refresh) == uid
    assert decode_token(refresh) is None


def test_refresh_round_trip():
    uid = uuid.uuid4()
    assert decode_refresh_token(create_refresh_token(uid)) == uid
