from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    app_name: str = 'SaaS Relatorio Mensal'
    database_url: str = 'postgresql+psycopg://postgres:postgres@localhost:5432/relatorio'
    jwt_secret_key: str = 'change_this_secret'
    jwt_algorithm: str = 'HS256'
    jwt_expires_minutes: int = 1440
    cors_origins: str = 'http://localhost:5173'
    cors_origin_regex: str = r'^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$'

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(',') if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
