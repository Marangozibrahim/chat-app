from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    redis_url: str
    jwt_secret: str
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 30

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "eu-north-1"
    s3_bucket: str = ""
    max_upload_bytes: int = 524_288_000
    presigned_url_expiry: int = 3600
    max_message_chars: int = 4000

    # Comma-separated list of allowed browser origins. "*" + credentials is
    # invalid per the CORS spec, so set explicit origins in production.
    cors_origins_raw: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]


settings = Settings()
