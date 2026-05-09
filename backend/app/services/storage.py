import uuid

import boto3
from botocore.exceptions import ClientError

from app.config import settings

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _s3():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        endpoint_url=f"https://s3.{settings.aws_region}.amazonaws.com",
    )


def generate_presigned_put(room_id: str, filename: str, content_type: str) -> tuple[str, str, str]:
    """Returns (upload_url, object_key, public_attachment_url)."""
    if content_type not in ALLOWED_MIME:
        raise ValueError("mime_not_allowed")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    key = f"rooms/{room_id}/{uuid.uuid4()}.{ext}"
    upload_url = _s3().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
        },
        ExpiresIn=settings.presigned_url_expiry,
    )
    public_url = (
        f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"
    )
    return upload_url, key, public_url


def delete_object(key: str) -> None:
    try:
        _s3().delete_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError:
        pass
