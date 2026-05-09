from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    redis_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 60

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "eu-north-1"
    s3_bucket: str = ""
    max_upload_bytes: int = 52_428_800
    presigned_url_expiry: int = 3600


settings = Settings()
